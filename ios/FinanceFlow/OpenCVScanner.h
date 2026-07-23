#import <Foundation/Foundation.h>
#import <UIKit/UIKit.h>

NS_ASSUME_NONNULL_BEGIN

@interface OpenCVScanner : NSObject

/**
 * Detects the 4 corners of a document in the given image.
 * Returns an array of dictionaries representing the normalized (0-1) coordinates:
 * @[ @{"x": @(x), "y": @(y)}, ... ] (order: TL, TR, BR, BL)
 * If no document is found, returns a default 5% inset rectangle.
 */
+ (NSArray<NSDictionary *> *)detectRectangle:(UIImage *)image;

/**
 * Applies a perspective warp correction based on the given 4 normalized corners.
 * Corners array order should be: TL, TR, BR, BL.
 */
+ (UIImage *)perspectiveCorrect:(UIImage *)image corners:(NSArray<NSDictionary *> *)corners;

@end

NS_ASSUME_NONNULL_END
