/**
 * OBD Manager — sits between obdService (raw BLE) and the UI.
 * Calculates derived metrics: average speed, fuel consumption, cost, distance, time.
 * Persists accumulated trip data to the vehicles DB when engine off or disconnected.
 * Data is NOT reset when user leaves the live data page.
 */
import { obdService } from './obdService';
import { getAllVehicles, updateVehicle } from './database';

// Default fuel price in local currency per litre
// In production this could be fetched from a fuel price API
const DEFAULT_FUEL_PRICE_PER_LITRE = 2.20;

class OBDManager {
    constructor() {
        this._listeners = [];
        this._currentVehicle = null;
        this._fuelPricePerLitre = DEFAULT_FUEL_PRICE_PER_LITRE;
        this._initialized = false;
        this._engineOffTimer = null;

        // Accumulated trip metrics
        this.metrics = this._resetMetrics();
        this.connectedDeviceName = null;
        this.connectedDeviceId = null;
        this.status = 'disconnected'; // 'disconnected' | 'connecting' | 'connected'
        this.elmConnected = false;
        this.ecuConnected = false;
        this.connectionWarning = null;
    }

    _resetMetrics() {
        return {
            currentSpeed: 0,
            averageSpeed: 0,
            realtimeFuelRate: 0,   // L/h
            avgFuelConsumption: 0,  // L/100km
            distanceTraveled: 0,   // km
            drivingTime: 0,        // seconds
            totalFuelConsumed: 0,  // L
            cost: 0,               // currency
            fuelLevel: null,       // %
            rpm: 0,
            coolantTemp: null,     // °C
            voltage: null,         // V (battery/alternator)
        };
    }

    addListener(cb) { this._listeners.push(cb); }
    removeListener(cb) { this._listeners = this._listeners.filter(l => l !== cb); }
    _notify() { this._listeners.forEach(cb => cb({ ...this.metrics, status: this.status, connectedDeviceName: this.connectedDeviceName, connectedDeviceId: this.connectedDeviceId, elmConnected: this.elmConnected, ecuConnected: this.ecuConnected, connectionWarning: this.connectionWarning })); }

    get currentVehicle() { return this._currentVehicle; }
    set currentVehicle(v) { this._currentVehicle = v; }

    get fuelPricePerLitre() { return this._fuelPricePerLitre; }
    set fuelPricePerLitre(p) { this._fuelPricePerLitre = p; }

    async init() {
        if (this._initialized) return;
        this._initialized = true;

        obdService.addDataListener(this._onData.bind(this));
        obdService.addStateListener(this._onState.bind(this));

        // Auto-reconnect: try to connect to default vehicle's saved OBD scanner
        setTimeout(async () => {
            try {
                const vehicles = await getAllVehicles();
                const defaultVehicle = vehicles.find(v => v.isDefault === 1 && v.obdMacAddress);
                if (defaultVehicle) {
                    this._currentVehicle = defaultVehicle;
                    // Resume accumulated data from DB
                    this.metrics.distanceTraveled = defaultVehicle.totalDistance || 0;
                    this.metrics.drivingTime = defaultVehicle.totalDrivingTime || 0;
                    this.metrics.totalFuelConsumed = defaultVehicle.totalFuelConsumed || 0;
                    console.log('[OBDManager] Auto-connecting to saved scanner...');
                    await obdService.connectToDevice({
                        id: defaultVehicle.obdMacAddress,
                        name: 'OBD Scanner',
                    });
                }
            } catch (e) {
                console.error('[OBDManager] Auto-connect error:', e);
            }
        }, 3000);
    }

    _POLL_INTERVAL = 1.5; // seconds (matches obdService poll rate)

    _onData(raw) {
        const { rpm, speed, fuelRate, fuelLevel, coolantTemp, voltage } = raw;

        // Accumulate metrics each poll tick
        const dt = this._POLL_INTERVAL; // seconds since last update

        this.metrics.rpm = rpm;
        this.metrics.currentSpeed = speed;
        this.metrics.realtimeFuelRate = parseFloat(fuelRate.toFixed(2));
        if (fuelLevel !== null) this.metrics.fuelLevel = parseFloat(fuelLevel.toFixed(1));
        if (coolantTemp !== null && coolantTemp !== undefined) this.metrics.coolantTemp = coolantTemp;
        if (voltage !== null && voltage !== undefined) this.metrics.voltage = parseFloat(voltage.toFixed(1));

        // Accumulate time and distance only if moving
        if (speed > 0 || rpm > 0) {
            this.metrics.drivingTime += dt;
            const distDelta = speed * (dt / 3600); // km
            this.metrics.distanceTraveled += distDelta;
        }

        // Accumulate fuel
        const fuelDelta = fuelRate * (dt / 3600); // L
        this.metrics.totalFuelConsumed += fuelDelta;

        // Averages
        const timeHours = this.metrics.drivingTime / 3600;
        if (timeHours > 0) {
            this.metrics.averageSpeed = this.metrics.distanceTraveled / timeHours;
        }
        if (this.metrics.distanceTraveled > 0.1) {
            this.metrics.avgFuelConsumption = (this.metrics.totalFuelConsumed / this.metrics.distanceTraveled) * 100;
        }

        this.metrics.cost = this.metrics.totalFuelConsumed * this._fuelPricePerLitre;

        // Engine-off detection: if RPM is 0 for 10 seconds, auto-save
        if (rpm === 0) {
            if (!this._engineOffTimer) {
                this._engineOffTimer = setTimeout(async () => {
                    console.log('[OBDManager] Engine off detected — saving trip data.');
                    await this._saveTrip();
                }, 10000);
            }
        } else {
            if (this._engineOffTimer) {
                clearTimeout(this._engineOffTimer);
                this._engineOffTimer = null;
            }
        }

        this._notify();
    }

    _onState(state) {
        this.status = state.status;
        this.elmConnected = state.elmConnected ?? false;
        this.ecuConnected = state.ecuConnected ?? false;
        this.connectionWarning = state.warning ?? null;
        if (state.status === 'connected') {
            this.connectedDeviceName = state.deviceName;
            this.connectedDeviceId = state.deviceId;
        } else if (state.status === 'disconnected') {
            this.connectedDeviceName = null;
            this.connectedDeviceId = null;
            // Save trip on unexpected disconnect
            this._saveTrip();
        }
        this._notify();
    }

    async _saveTrip() {
        if (!this._currentVehicle) return;
        try {
            const updated = {
                ...this._currentVehicle,
                totalDistance: parseFloat(this.metrics.distanceTraveled.toFixed(2)),
                totalDrivingTime: Math.round(this.metrics.drivingTime),
                totalFuelConsumed: parseFloat(this.metrics.totalFuelConsumed.toFixed(3)),
            };
            await updateVehicle(updated);
            this._currentVehicle = updated;
            console.log('[OBDManager] Trip saved:', updated);
        } catch (e) {
            console.error('[OBDManager] Save trip error:', e);
        }
    }

    async connectToVehicle(vehicle, deviceInfo) {
        this._currentVehicle = vehicle;
        // Resume accumulated data if any
        this.metrics.distanceTraveled = vehicle.totalDistance || 0;
        this.metrics.drivingTime = vehicle.totalDrivingTime || 0;
        this.metrics.totalFuelConsumed = vehicle.totalFuelConsumed || 0;

        const success = await obdService.connectToDevice(deviceInfo);
        return success;
    }

    async disconnect() {
        if (this._engineOffTimer) {
            clearTimeout(this._engineOffTimer);
            this._engineOffTimer = null;
        }
        await this._saveTrip();
        await obdService.disconnect();
    }

    resetTripData() {
        this.metrics = this._resetMetrics();
        this._notify();
    }
}

export const obdManager = new OBDManager();
