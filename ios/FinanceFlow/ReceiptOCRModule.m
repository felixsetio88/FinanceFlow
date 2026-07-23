#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE (ReceiptOCRModule, NSObject)

RCT_EXTERN_METHOD(recognizeText : (NSString *)imagePath resolve : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(detectRectangle : (NSString *)imagePath resolve : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(perspectiveCorrect : (NSString *)imagePath corners : (NSDictionary *)corners resolve : (
    RCTPromiseResolveBlock)resolve rejecter : (RCTPromiseRejectBlock)reject)

@end
