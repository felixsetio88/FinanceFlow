#import "OpenCVScanner.h"
#import <CoreImage/CoreImage.h>
#import <CoreGraphics/CoreGraphics.h>

// ────────────────────────────────────────────────────────────────────────────
// Bilinear sample a source RGBA buffer at normalised (u,v) in [0,1].
// ────────────────────────────────────────────────────────────────────────────
static void sampleBilinear(const uint8_t *src, int sw, int sh, double u, double v, uint8_t *out) {
    double px = u * (sw - 1);
    double py = v * (sh - 1);
    int x0 = (int)px,           y0 = (int)py;
    int x1 = MIN(x0 + 1, sw-1), y1 = MIN(y0 + 1, sh-1);
    double fx = px - x0, fy = py - y0;
    double w00 = (1-fx)*(1-fy), w10 = fx*(1-fy), w01 = (1-fx)*fy, w11 = fx*fy;
    for (int c = 0; c < 4; c++) {
        out[c] = (uint8_t)(
            src[(y0*sw+x0)*4+c] * w00 +
            src[(y0*sw+x1)*4+c] * w10 +
            src[(y1*sw+x0)*4+c] * w01 +
            src[(y1*sw+x1)*4+c] * w11
        );
    }
}

@implementation OpenCVScanner

// ────────────────────────────────────────────────────────────────────────────
// Detect rectangle.
// Returns 4 corners in TOP-LEFT (React Native) coordinate space, normalised 0-1.
// CIDetector uses bottom-left origin so we flip Y before returning.
// ────────────────────────────────────────────────────────────────────────────
+ (NSArray<NSDictionary *> *)detectRectangle:(UIImage *)image {
    if (!image) return [self defaultCorners];

    CGImageRef cgImage = image.CGImage;
    if (!cgImage) return [self defaultCorners];

    CIImage *ciImage = [[CIImage alloc] initWithCGImage:cgImage];
    if (!ciImage) return [self defaultCorners];

    CIDetector *detector = [CIDetector detectorOfType:CIDetectorTypeRectangle
                                              context:nil
                                              options:@{ CIDetectorAccuracy : CIDetectorAccuracyHigh }];
    if (!detector) return [self defaultCorners];

    NSArray<CIRectangleFeature *> *features = [detector featuresInImage:ciImage];
    CIRectangleFeature *bestFeature = nil;
    CGFloat bestArea = 0.0;

    for (CIRectangleFeature *feature in features) {
        CGFloat wA = hypot(feature.topRight.x  - feature.topLeft.x,  feature.topRight.y  - feature.topLeft.y);
        CGFloat wB = hypot(feature.bottomRight.x - feature.bottomLeft.x, feature.bottomRight.y - feature.bottomLeft.y);
        CGFloat hA = hypot(feature.topRight.x  - feature.bottomRight.x, feature.topRight.y  - feature.bottomRight.y);
        CGFloat hB = hypot(feature.topLeft.x   - feature.bottomLeft.x,  feature.topLeft.y   - feature.bottomLeft.y);
        CGFloat area = MAX(wA, wB) * MAX(hA, hB);
        if (area > bestArea) { bestArea = area; bestFeature = feature; }
    }

    if (!bestFeature) return [self defaultCorners];

    CGFloat W = (CGFloat)CGImageGetWidth(cgImage);
    CGFloat H = (CGFloat)CGImageGetHeight(cgImage);

    // CIDetector bottom-left → flip Y → top-left
    NSArray<NSDictionary *> *corners = @[
        @{ @"x": @(bestFeature.topLeft.x     / W), @"y": @(1.0 - bestFeature.topLeft.y     / H) },
        @{ @"x": @(bestFeature.topRight.x    / W), @"y": @(1.0 - bestFeature.topRight.y    / H) },
        @{ @"x": @(bestFeature.bottomRight.x / W), @"y": @(1.0 - bestFeature.bottomRight.y / H) },
        @{ @"x": @(bestFeature.bottomLeft.x  / W), @"y": @(1.0 - bestFeature.bottomLeft.y  / H) },
    ];

    return [self sortCorners:corners];
}

// ────────────────────────────────────────────────────────────────────────────
// Perspective-correct the image.
//
// `corners` = TL, TR, BR, BL in TOP-LEFT normalised (0-1) space.
// We use Core Graphics (also top-left) and an inverse homography (DLT).
// No Y-flipping is ever needed here.
// ────────────────────────────────────────────────────────────────────────────
+ (UIImage *)perspectiveCorrect:(UIImage *)image corners:(NSArray<NSDictionary *> *)corners {
    if (!image || corners.count != 4) return image;

    CGImageRef cgImage = image.CGImage;
    if (!cgImage) return image;

    int sw = (int)CGImageGetWidth(cgImage);
    int sh = (int)CGImageGetHeight(cgImage);

    // ── Rasterise source to RGBA ──────────────────────────────────────────
    size_t srcBPR = (size_t)sw * 4;
    uint8_t *srcBuf = (uint8_t *)malloc((size_t)sh * srcBPR);
    if (!srcBuf) return image;

    CGColorSpaceRef cs  = CGColorSpaceCreateDeviceRGB();
    CGContextRef    bmp = CGBitmapContextCreate(srcBuf, sw, sh, 8, srcBPR, cs,
                                                kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(cs);
    if (!bmp) { free(srcBuf); return image; }

    // Core Graphics is top-left, just draw the normalised image into it.
    CGContextDrawImage(bmp, CGRectMake(0, 0, sw, sh), cgImage);
    CGContextRelease(bmp);

    // ── Unpack corners (top-left normalised → pixel) ──────────────────────
    // corners[0]=TL, [1]=TR, [2]=BR, [3]=BL
    double tlX = [corners[0][@"x"] doubleValue] * sw,  tlY = [corners[0][@"y"] doubleValue] * sh;
    double trX = [corners[1][@"x"] doubleValue] * sw,  trY = [corners[1][@"y"] doubleValue] * sh;
    double brX = [corners[2][@"x"] doubleValue] * sw,  brY = [corners[2][@"y"] doubleValue] * sh;
    double blX = [corners[3][@"x"] doubleValue] * sw,  blY = [corners[3][@"y"] doubleValue] * sh;

    // ── Output size ───────────────────────────────────────────────────────
    int dw = (int)MAX(hypot(trX-tlX, trY-tlY), hypot(brX-blX, brY-blY));
    int dh = (int)MAX(hypot(blX-tlX, blY-tlY), hypot(brX-trX, brY-trY));
    if (dw < 1 || dh < 1) { free(srcBuf); return image; }

    // ── Compute INVERSE homography: destination pixel → source pixel ───────
    // dst corners:  (0,0)  (dw-1,0)  (dw-1,dh-1)  (0,dh-1)
    // src corners:  TL     TR        BR             BL
    double sx4[4] = {tlX, trX, brX, blX};
    double sy4[4] = {tlY, trY, brY, blY};
    double dx4[4] = {0,   (double)(dw-1), (double)(dw-1), 0};
    double dy4[4] = {0,   0,              (double)(dh-1),  (double)(dh-1)};

    // Build 8×8 linear system A·h = b  (DLT)
    double A[64] = {0}, bv[8] = {0};
    for (int i = 0; i < 4; i++) {
        double xi = dx4[i], yi = dy4[i], ui = sx4[i], vi = sy4[i];
        int r = i * 2;
        A[r*8+0]=xi; A[r*8+1]=yi; A[r*8+2]=1; A[r*8+3]=0;  A[r*8+4]=0;  A[r*8+5]=0;  A[r*8+6]=-xi*ui; A[r*8+7]=-yi*ui; bv[r]=ui;
        r++;
        A[r*8+0]=0;  A[r*8+1]=0;  A[r*8+2]=0; A[r*8+3]=xi; A[r*8+4]=yi; A[r*8+5]=1;  A[r*8+6]=-xi*vi; A[r*8+7]=-yi*vi; bv[r]=vi;
    }
    // Gaussian elimination with partial pivoting
    for (int col = 0; col < 8; col++) {
        int pivRow = col;
        double pivMax = fabs(A[col*8+col]);
        for (int row = col+1; row < 8; row++) {
            if (fabs(A[row*8+col]) > pivMax) { pivMax = fabs(A[row*8+col]); pivRow = row; }
        }
        if (pivRow != col) {
            for (int k = 0; k < 8; k++) { double tmp=A[col*8+k]; A[col*8+k]=A[pivRow*8+k]; A[pivRow*8+k]=tmp; }
            double tmp=bv[col]; bv[col]=bv[pivRow]; bv[pivRow]=tmp;
        }
        double piv = A[col*8+col];
        if (fabs(piv) < 1e-10) continue;
        for (int row = col+1; row < 8; row++) {
            double f = A[row*8+col] / piv;
            for (int k = col; k < 8; k++) A[row*8+k] -= f * A[col*8+k];
            bv[row] -= f * bv[col];
        }
    }
    double h[9];
    for (int row = 7; row >= 0; row--) {
        h[row] = bv[row];
        for (int k = row+1; k < 8; k++) h[row] -= A[row*8+k] * h[k];
        if (fabs(A[row*8+row]) > 1e-10) h[row] /= A[row*8+row];
    }
    h[8] = 1.0;

    // ── Warp pixels ───────────────────────────────────────────────────────
    size_t dstBPR = (size_t)dw * 4;
    uint8_t *dstBuf = (uint8_t *)calloc((size_t)dh * dstBPR, 1);
    if (!dstBuf) { free(srcBuf); return image; }

    for (int dy = 0; dy < dh; dy++) {
        for (int ddx = 0; ddx < dw; ddx++) {
            double denom = h[6]*ddx + h[7]*dy + h[8];
            if (fabs(denom) < 1e-10) continue;
            double srcX = (h[0]*ddx + h[1]*dy + h[2]) / denom;
            double srcY = (h[3]*ddx + h[4]*dy + h[5]) / denom;
            if (srcX < 0 || srcX >= sw || srcY < 0 || srcY >= sh) continue;
            sampleBilinear(srcBuf, sw, sh, srcX/(sw-1), srcY/(sh-1), &dstBuf[(dy*dw+ddx)*4]);
        }
    }
    free(srcBuf);

    // ── Build output UIImage ──────────────────────────────────────────────
    CGColorSpaceRef outCS  = CGColorSpaceCreateDeviceRGB();
    CGContextRef    outCtx = CGBitmapContextCreate(dstBuf, dw, dh, 8, dstBPR, outCS,
                                                   kCGImageAlphaPremultipliedLast | kCGBitmapByteOrder32Big);
    CGColorSpaceRelease(outCS);

    UIImage *result = image;
    if (outCtx) {
        CGImageRef outCG = CGBitmapContextCreateImage(outCtx);
        if (outCG) {
            result = [UIImage imageWithCGImage:outCG scale:image.scale orientation:UIImageOrientationUp];
            CGImageRelease(outCG);
        }
        CGContextRelease(outCtx);
    }
    free(dstBuf);
    return result;
}

+ (NSArray<NSDictionary *> *)defaultCorners {
    return @[
        @{@"x": @0.05, @"y": @0.05},
        @{@"x": @0.95, @"y": @0.05},
        @{@"x": @0.95, @"y": @0.95},
        @{@"x": @0.05, @"y": @0.95},
    ];
}

+ (NSArray<NSDictionary *> *)sortCorners:(NSArray<NSDictionary *> *)corners {
    NSDictionary *tl = corners[0], *br = corners[0], *tr = corners[0], *bl = corners[0];
    double minSum = 10.0, maxSum = -10.0, minDiff = 10.0, maxDiff = -10.0;
    for (NSDictionary *pt in corners) {
        double x = [pt[@"x"] doubleValue], y = [pt[@"y"] doubleValue];
        if (x + y < minSum)  { minSum  = x + y; tl = pt; }
        if (x + y > maxSum)  { maxSum  = x + y; br = pt; }
        if (x - y < minDiff) { minDiff = x - y; bl = pt; }
        if (x - y > maxDiff) { maxDiff = x - y; tr = pt; }
    }
    return @[tl, tr, br, bl];
}

@end
