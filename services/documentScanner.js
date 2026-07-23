import { NativeModules, Platform } from 'react-native';

const { ReceiptOCRModule, DocumentScannerModule } = NativeModules;

export const isDocumentScannerAvailable = () => {
    if (Platform.OS === 'ios') return !!ReceiptOCRModule?.detectRectangle;
    if (Platform.OS === 'android') return !!DocumentScannerModule?.detectRectangle;
    return false;
};

export const detectRectangle = async (imageUri) => {
    try {
        if (Platform.OS === 'ios' && ReceiptOCRModule?.detectRectangle) {
            return await ReceiptOCRModule.detectRectangle(imageUri);
        } else if (Platform.OS === 'android' && DocumentScannerModule?.detectRectangle) {
            return await DocumentScannerModule.detectRectangle(imageUri);
        }
    } catch (e) {
        console.warn("detectRectangle failed natively", e);
    }
    return {
        topLeft:     { x: 0.05, y: 0.05 },
        topRight:    { x: 0.95, y: 0.05 },
        bottomRight: { x: 0.95, y: 0.95 },
        bottomLeft:  { x: 0.05, y: 0.95 }
    };
};

export const perspectiveCorrect = async (imageUri, corners) => {
    try {
        if (Platform.OS === 'ios' && ReceiptOCRModule?.perspectiveCorrect) {
            return await ReceiptOCRModule.perspectiveCorrect(imageUri, corners);
        } else if (Platform.OS === 'android' && DocumentScannerModule?.perspectiveCorrect) {
            return await DocumentScannerModule.perspectiveCorrect(imageUri, corners);
        }
        console.warn("No native perspectiveCorrect module found for platform", Platform.OS);
        return { uri: imageUri };
    } catch (e) {
        console.error("perspectiveCorrect failed natively", e);
        throw e; // throw so the UI can show an alert instead of silently returning uncropped image
    }
};
