/**
 * Real OBD-II Bluetooth LE service using react-native-ble-plx.
 * Implements ELM327 AT command protocol and parses standard OBD-II PIDs.
 *
 * Key design decisions:
 *   - Separate write vs notify characteristic UUIDs (most ELM327 BLE adapters use different ones)
 *   - Known ELM327 BLE service/char UUID pairs for reliable auto-detection
 *   - Robust ELM327 init with adaptive timing, extended timeout, protocol detection & retry
 *   - Supports OBD-II / EOBD (ISO 15765-4 CAN, ISO 14230 KWP, ISO 9141, SAE J1850)
 *
 * On iOS: device.id is a UUID (system-assigned per app per device)
 * On Android: device.id is the MAC address
 */
import { BleManager } from 'react-native-ble-plx';
import { Platform, PermissionsAndroid } from 'react-native';
import { Buffer } from 'buffer';

// ── Standard Mode 01 OBD-II PIDs ──
const PIDS = {
    SUPPORTED_0:  '0100', // Supported PIDs [01-20] – used to verify ECU link
    RPM:          '010C', // Engine RPM
    SPEED:        '010D', // Vehicle speed km/h
    COOLANT_TEMP: '0105', // Engine coolant temperature °C
    MAF:          '0110', // Mass Air Flow g/s
    FUEL_LEVEL:   '012F', // Fuel tank level %
    FUEL_RATE:    '015E', // Engine fuel rate L/h (not all ECUs support this)
};

// ── Well-known ELM327 BLE service / characteristic UUID pairs ──
// Most cheap ELM327 BLE adapters (v1.5 / v2.1) expose one of these profiles.
// For each profile the write and notify chars are different UUIDs.
const KNOWN_PROFILES = [
    // Profile 1: FFF0 (very common on Chinese clones)
    {
        servicePrefix: 'fff0',
        writeCharPrefix: 'fff2',
        notifyCharPrefix: 'fff1',
    },
    // Profile 2: FFE0 (another common variant)
    {
        servicePrefix: 'ffe0',
        writeCharPrefix: 'ffe1',
        notifyCharPrefix: 'ffe1', // same char, both write+notify
    },
    // Profile 3: 18F0 (some Vgate iCar / Konnwei)
    {
        servicePrefix: '18f0',
        writeCharPrefix: '2af1', // approx, detected dynamically
        notifyCharPrefix: '2af0',
    },
    // Profile 4: E7810A71 (some newer adapters)
    {
        servicePrefix: 'e7810a71',
        writeCharPrefix: 'bef8d6c9',
        notifyCharPrefix: 'bef8d6c9',
    },
];

// OBD-II protocol numbers for explicit fallback (used with ATSP<n>)
// 0 = auto, 6 = ISO 15765-4 CAN 11bit 500k, 7 = ISO 15765-4 CAN 29bit 500k
// 8 = ISO 15765-4 CAN 11bit 250k, 9 = ISO 15765-4 CAN 29bit 250k
// 3 = ISO 9141-2, 4 = ISO 14230-4 KWP (5 baud), 5 = ISO 14230-4 KWP (fast)
const PROTOCOL_FALLBACK_ORDER = [0, 6, 7, 8, 9, 5, 4, 3];

class OBDService {
    constructor() {
        this.bleManager = new BleManager();
        this.device = null;
        this.serviceUUID = null;
        this.writeCharUUID = null;
        this.notifyCharUUID = null;
        this._useWriteWithResponse = false;
        this._polling = false;
        this._pollTimeout = null;
        this._dataListeners = [];
        this._stateListeners = [];
        this._scanning = false;
        this._responseBuffer = '';
        this._pendingResolve = null;
        // Granular connection status
        this.elmConnected = false;
        this.ecuConnected = false;
    }

    addDataListener(cb) { this._dataListeners.push(cb); }
    removeDataListener(cb) { this._dataListeners = this._dataListeners.filter(l => l !== cb); }
    addStateListener(cb) { this._stateListeners.push(cb); }
    removeStateListener(cb) { this._stateListeners = this._stateListeners.filter(l => l !== cb); }

    _emitData(data) { this._dataListeners.forEach(cb => cb(data)); }
    _emitState(st) { this._stateListeners.forEach(cb => cb(st)); }

    get connected() { return this.device !== null; }

    async requestPermissions() {
        if (Platform.OS !== 'android') return true;
        try {
            if (Platform.Version >= 31) {
                const result = await PermissionsAndroid.requestMultiple([
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
                    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
                    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
                ]);
                return (
                    result['android.permission.BLUETOOTH_SCAN'] === 'granted' &&
                    result['android.permission.BLUETOOTH_CONNECT'] === 'granted' &&
                    result['android.permission.ACCESS_FINE_LOCATION'] === 'granted'
                );
            } else {
                const r = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
                return r === 'granted';
            }
        } catch (e) {
            console.error('[OBD] Permission error:', e);
            return false;
        }
    }

    async scanForDevices(onDeviceFound, durationMs = 12000) {
        if (this._scanning) return;

        const hasPermission = await this.requestPermissions();
        if (!hasPermission) throw new Error('Bluetooth permissions not granted. Please grant access in Settings.');

        const btState = await this.bleManager.state();
        if (btState !== 'PoweredOn') throw new Error('Bluetooth is turned off. Please enable Bluetooth and try again.');

        this._scanning = true;
        const seen = new Set();

        this.bleManager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
            if (error) {
                console.error('[OBD] Scan error:', error);
                return;
            }
            if (device && device.name && !seen.has(device.id)) {
                seen.add(device.id);
                onDeviceFound({ id: device.id, name: device.name, rssi: device.rssi });
            }
        });

        return new Promise(resolve => {
            setTimeout(() => {
                this.stopScan();
                resolve();
            }, durationMs);
        });
    }

    stopScan() {
        if (this._scanning) {
            this.bleManager.stopDeviceScan();
            this._scanning = false;
        }
    }

    // ── Characteristic discovery ──
    // Tries known ELM327 BLE profiles first, then falls back to heuristic discovery.
    async _discoverCharacteristics(dev) {
        const services = await dev.services();

        // 1. Try known ELM327 BLE profiles
        for (const profile of KNOWN_PROFILES) {
            for (const svc of services) {
                const svcLower = svc.uuid.toLowerCase();
                if (!svcLower.includes(profile.servicePrefix)) continue;

                const chars = await svc.characteristics();
                let writeChar = null;
                let notifyChar = null;

                for (const ch of chars) {
                    const chLower = ch.uuid.toLowerCase();
                    if (chLower.includes(profile.writeCharPrefix) && (ch.isWritableWithResponse || ch.isWritableWithoutResponse)) {
                        writeChar = ch;
                    }
                    if (chLower.includes(profile.notifyCharPrefix) && (ch.isNotifiable || ch.isIndicatable)) {
                        notifyChar = ch;
                    }
                }

                if (writeChar && notifyChar) {
                    console.log(`[OBD] Matched known profile: service=${svcLower}, write=${writeChar.uuid}, notify=${notifyChar.uuid}`);
                    return {
                        serviceUUID: svc.uuid,
                        writeCharUUID: writeChar.uuid,
                        notifyCharUUID: notifyChar.uuid,
                        useWriteWithResponse: writeChar.isWritableWithResponse,
                    };
                }
            }
        }

        // 2. Heuristic fallback: find any service with both a writable and a notifiable char
        for (const svc of services) {
            const chars = await svc.characteristics();
            let writeChar = null;
            let notifyChar = null;

            for (const ch of chars) {
                if (!writeChar && (ch.isWritableWithResponse || ch.isWritableWithoutResponse)) {
                    writeChar = ch;
                }
                if (!notifyChar && (ch.isNotifiable || ch.isIndicatable)) {
                    notifyChar = ch;
                }
            }

            if (writeChar && notifyChar) {
                console.log(`[OBD] Heuristic discovery: service=${svc.uuid}, write=${writeChar.uuid}, notify=${notifyChar.uuid}`);
                return {
                    serviceUUID: svc.uuid,
                    writeCharUUID: writeChar.uuid,
                    notifyCharUUID: notifyChar.uuid,
                    useWriteWithResponse: writeChar.isWritableWithResponse,
                };
            }
        }

        // 3. Last resort: find any writable char (same UUID for both, like old code)
        for (const svc of services) {
            const chars = await svc.characteristics();
            for (const ch of chars) {
                if (ch.isWritableWithResponse || ch.isWritableWithoutResponse) {
                    console.log(`[OBD] Last-resort discovery: service=${svc.uuid}, char=${ch.uuid} (write+notify same)`);
                    return {
                        serviceUUID: svc.uuid,
                        writeCharUUID: ch.uuid,
                        notifyCharUUID: ch.uuid,
                        useWriteWithResponse: ch.isWritableWithResponse,
                    };
                }
            }
        }

        throw new Error('No writable/notifiable characteristic found on this device.');
    }

    async connectToDevice(deviceInfo) {
        // Overall 30-second connection timeout
        let _timeoutReached = false;
        const connectionTimeoutPromise = new Promise((_, reject) => {
            setTimeout(() => {
                _timeoutReached = true;
                reject(new Error('Connection timed out after 30 seconds. Make sure the OBD scanner is plugged in and Bluetooth is on.'));
            }, 30000);
        });

        const doConnect = async () => {
            if (this.device) await this.disconnect();
            this.stopScan();

            console.log('[OBD] Connecting to:', deviceInfo.name, deviceInfo.id);
            this._emitState({ status: 'connecting', deviceName: deviceInfo.name, elmConnected: false, ecuConnected: false });

            const dev = await this.bleManager.connectToDevice(deviceInfo.id, { timeout: 15000 });
            await dev.discoverAllServicesAndCharacteristics();

            // Discover write + notify characteristics properly
            const disc = await this._discoverCharacteristics(dev);
            this.device = dev;
            this.serviceUUID = disc.serviceUUID;
            this.writeCharUUID = disc.writeCharUUID;
            this.notifyCharUUID = disc.notifyCharUUID;
            this._useWriteWithResponse = disc.useWriteWithResponse;

            console.log(`[OBD] Using service=${disc.serviceUUID}, write=${disc.writeCharUUID}, notify=${disc.notifyCharUUID}, writeWithResponse=${disc.useWriteWithResponse}`);

            // Subscribe to notifications on the NOTIFY characteristic
            dev.monitorCharacteristicForService(this.serviceUUID, this.notifyCharUUID, (err, characteristic) => {
                if (err) {
                    console.error('[OBD] Notification error:', err.message);
                    return;
                }
                if (!characteristic?.value) return;
                const chunk = Buffer.from(characteristic.value, 'base64').toString('utf-8');
                this._responseBuffer += chunk;
                if (this._responseBuffer.includes('>') && this._pendingResolve) {
                    const response = this._responseBuffer;
                    this._responseBuffer = '';
                    const resolve = this._pendingResolve;
                    this._pendingResolve = null;
                    resolve(response);
                }
            });

            // ELM327 is reachable at this point (BLE connected)
            this.elmConnected = true;
            this._emitState({ status: 'connecting', deviceName: deviceInfo.name, elmConnected: true, ecuConnected: false });

            // Initialize ELM327 and try to connect to ECU
            console.log('[OBD] Initializing ELM327...');
            const ecuReady = await this._initELM327();
            this.ecuConnected = ecuReady;

            if (!ecuReady) {
                // ELM is connected but ECU didn't respond — still mark as connected so user can see status
                console.warn('[OBD] ELM connected but ECU did not respond. Engine may be off.');
                this._emitState({
                    status: 'connected',
                    deviceName: deviceInfo.name,
                    deviceId: deviceInfo.id,
                    elmConnected: true,
                    ecuConnected: false,
                    warning: 'ELM327 connected. ECU not responding — check ignition is ON.',
                });
            } else {
                this._emitState({
                    status: 'connected',
                    deviceName: deviceInfo.name,
                    deviceId: deviceInfo.id,
                    elmConnected: true,
                    ecuConnected: true,
                });
            }

            this._startPolling();
            return true;
        };

        try {
            return await Promise.race([doConnect(), connectionTimeoutPromise]);
        } catch (error) {
            console.error('[OBD] Connection failed:', error.message);
            // Clean up device if we managed to connect before timeout
            if (this.device) {
                try { await this.bleManager.cancelDeviceConnection(this.device.id); } catch (_) {}
            }
            this.device = null;
            this.elmConnected = false;
            this.ecuConnected = false;
            this._emitState({ status: 'disconnected', error: error.message, elmConnected: false, ecuConnected: false });
            return false;
        }
    }

    // ── ELM327 Initialization with protocol detection ──
    async _initELM327() {
        // Reset
        await this._sendCommand('ATZ', 2500);   // Reset ELM327
        await this._delay(500);                   // Give it time to boot
        await this._sendCommand('ATE0', 800);    // Echo off
        await this._sendCommand('ATL0', 800);    // Linefeeds off
        await this._sendCommand('ATS0', 800);    // Spaces off
        await this._sendCommand('ATH0', 800);    // Headers off
        await this._sendCommand('ATAT1', 800);   // Adaptive timing auto 1 (faster responses)
        await this._sendCommand('ATSTFF', 800);  // Set timeout to max (~1020ms) for slow ECUs

        // Try protocol detection in order
        for (const proto of PROTOCOL_FALLBACK_ORDER) {
            console.log(`[OBD] Trying protocol ${proto}...`);
            await this._sendCommand(`ATSP${proto}`, 1000);

            // Verify ECU communication by requesting supported PIDs
            const testRes = await this._sendCommand(PIDS.SUPPORTED_0, 3000);
            const clean = testRes.replace(/[\r\n\s>]/g, '').toUpperCase();
            console.log(`[OBD] Protocol ${proto} response: "${clean}"`);

            // Valid response should contain "4100" followed by hex data
            if (clean.includes('4100') && !clean.includes('NODATA') && !clean.includes('ERROR') && !clean.includes('UNABLE') && !clean.includes('STOPPED')) {
                console.log(`[OBD] ✅ ECU responding on protocol ${proto}`);

                // Now reduce timeout for normal polling (faster updates)
                await this._sendCommand('ATST32', 800); // ~200ms timeout for normal queries
                return true;
            }
        }

        console.warn('[OBD] ❌ No protocol could reach the ECU.');
        return false;
    }

    _delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async _sendCommand(command, timeoutMs = 1500) {
        if (!this.device) return '';
        this._responseBuffer = '';

        return new Promise(async (resolve) => {
            this._pendingResolve = resolve;
            const timer = setTimeout(() => {
                if (this._pendingResolve) {
                    this._pendingResolve = null;
                    console.warn(`[OBD] Command "${command}" timed out after ${timeoutMs}ms`);
                    resolve('');
                }
            }, timeoutMs);

            try {
                const b64 = Buffer.from(command + '\r').toString('base64');
                if (this._useWriteWithResponse) {
                    await this.device.writeCharacteristicWithResponseForService(
                        this.serviceUUID, this.writeCharUUID, b64
                    );
                } else {
                    await this.device.writeCharacteristicWithoutResponseForService(
                        this.serviceUUID, this.writeCharUUID, b64
                    );
                }
            } catch (e) {
                console.error(`[OBD] Write error for "${command}":`, e.message);
                clearTimeout(timer);
                this._pendingResolve = null;
                resolve('');
            }
        });
    }

    _parseHex(response, pid) {
        const clean = response.replace(/[\r\n\s>]/g, '').toUpperCase();
        // Build expected prefix: mode 01 PID 0C → response prefix "410C"
        const prefix = '4' + pid.substring(1, 2) + pid.substring(2);
        const idx = clean.indexOf(prefix);
        if (idx === -1) return null;
        return clean.substring(idx + prefix.length);
    }

    _parseRPM(res) {
        const h = this._parseHex(res, PIDS.RPM);
        if (!h || h.length < 4) return null;
        return ((parseInt(h.substring(0, 2), 16) * 256) + parseInt(h.substring(2, 4), 16)) / 4;
    }

    _parseSpeed(res) {
        const h = this._parseHex(res, PIDS.SPEED);
        if (!h || h.length < 2) return null;
        return parseInt(h.substring(0, 2), 16);
    }

    _parseCoolantTemp(res) {
        const h = this._parseHex(res, PIDS.COOLANT_TEMP);
        if (!h || h.length < 2) return null;
        return parseInt(h.substring(0, 2), 16) - 40; // offset by -40 per OBD-II spec
    }

    _parseMAF(res) {
        const h = this._parseHex(res, PIDS.MAF);
        if (!h || h.length < 4) return null;
        return ((parseInt(h.substring(0, 2), 16) * 256) + parseInt(h.substring(2, 4), 16)) / 100;
    }

    _parseFuelLevel(res) {
        const h = this._parseHex(res, PIDS.FUEL_LEVEL);
        if (!h || h.length < 2) return null;
        return (parseInt(h.substring(0, 2), 16) * 100) / 255;
    }

    _parseFuelRate(res) {
        const h = this._parseHex(res, PIDS.FUEL_RATE);
        if (!h || h.length < 4) return null;
        return ((parseInt(h.substring(0, 2), 16) * 256) + parseInt(h.substring(2, 4), 16)) * 0.05;
    }

    _parseVoltage(res) {
        // ATRV returns something like "12.4V\r\n>" or "12.4\r\n>"
        const clean = res.replace(/[\r\n>]/g, '').trim();
        const match = clean.match(/([\d]+\.?[\d]*)/);
        if (!match) return null;
        return parseFloat(match[1]);
    }

    _startPolling() {
        this._polling = true;
        this._pollLoop();
    }

    async _pollLoop() {
        if (!this._polling || !this.device) return;

        try {
            const rpmRes = await this._sendCommand(PIDS.RPM, 1200);
            const rpm = this._parseRPM(rpmRes) ?? 0;

            const speedRes = await this._sendCommand(PIDS.SPEED, 1200);
            const speed = this._parseSpeed(speedRes) ?? 0;

            const coolantRes = await this._sendCommand(PIDS.COOLANT_TEMP, 1200);
            const coolantTemp = this._parseCoolantTemp(coolantRes);

            const mafRes = await this._sendCommand(PIDS.MAF, 1200);
            const maf = this._parseMAF(mafRes) ?? 0;

            // Battery voltage via ELM327 AT command
            const voltRes = await this._sendCommand('ATRV', 1000);
            const voltage = this._parseVoltage(voltRes);

            // Try direct fuel rate PID (optional — many cars don't support it)
            let fuelRate = null;
            if (rpm > 0) {
                const frRes = await this._sendCommand(PIDS.FUEL_RATE, 1000);
                fuelRate = this._parseFuelRate(frRes);
            }

            // Fallback: calculate from MAF
            // maf (g/s) / (stoich_afr × petrol_density_g/L) × 3600s/hr
            if (fuelRate == null && maf > 0) {
                fuelRate = (maf / (14.7 * 744)) * 3600;
            }
            fuelRate = fuelRate ?? 0;

            const fuelLvlRes = await this._sendCommand(PIDS.FUEL_LEVEL, 1000);
            const fuelLevel = this._parseFuelLevel(fuelLvlRes);

            this._emitData({ rpm, speed, coolantTemp, maf, fuelRate, fuelLevel, voltage });
        } catch (e) {
            console.error('[OBD] Poll loop error:', e);
        }

        if (this._polling && this.device) {
            this._pollTimeout = setTimeout(() => this._pollLoop(), 1200);
        }
    }

    _stopPolling() {
        this._polling = false;
        if (this._pollTimeout) {
            clearTimeout(this._pollTimeout);
            this._pollTimeout = null;
        }
    }

    async disconnect() {
        this._stopPolling();
        const dev = this.device;
        this.device = null;
        this.serviceUUID = null;
        this.writeCharUUID = null;
        this.notifyCharUUID = null;
        this.elmConnected = false;
        this.ecuConnected = false;
        if (dev) {
            try { await this.bleManager.cancelDeviceConnection(dev.id); } catch (_) {}
        }
        this._emitState({ status: 'disconnected', elmConnected: false, ecuConnected: false });
    }
}

export const obdService = new OBDService();
