import Foundation
import React
import Vision
import UIKit

// MARK: - Orientation mapping (UIImage -> CGImagePropertyOrientation)
extension CGImagePropertyOrientation {
  init(_ uiOrientation: UIImage.Orientation) {
    switch uiOrientation {
    case .up:            self = .up
    case .down:          self = .down
    case .left:          self = .left
    case .right:         self = .right
    case .upMirrored:    self = .upMirrored
    case .downMirrored:  self = .downMirrored
    case .leftMirrored:  self = .leftMirrored
    case .rightMirrored: self = .rightMirrored
    @unknown default:    self = .up
    }
  }
}

@objc(ReceiptOCRModule)
final class ReceiptOCRModule: NSObject {

  // MARK: - React Native Bridge
  @objc static func requiresMainQueueSetup() -> Bool { return false }

  // MARK: - OCR
  @objc(recognizeText:resolve:rejecter:)
  func recognizeText(
    _ imagePath: String,
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let imageInfo = loadImage(from: imagePath) else {
      reject("no_image", "Cannot load image at path: \(imagePath)", nil)
      return
    }

    let request = VNRecognizeTextRequest { request, error in
      if let error = error {
        reject("ocr_error", "Vision OCR failed: \(error.localizedDescription)", error)
        return
      }

      let raw = (request.results as? [VNRecognizedTextObservation]) ?? []
      let observations = raw.sorted { $0.boundingBox.midY > $1.boundingBox.midY }

      var blocks: [[String: Any]] = []
      var fullTextLines: [String] = []

      for obs in observations {
        guard let candidate = obs.topCandidates(1).first else { continue }
        let text = candidate.string
        let conf = candidate.confidence
        let box = obs.boundingBox

        let imgW = CGFloat(imageInfo.width)
        let imgH = CGFloat(imageInfo.height)

        let block: [String: Any] = [
          "text": text,
          "confidence": Double(conf),
          "bbox": [
            "x": Double(box.origin.x),
            "y": Double(1.0 - box.origin.y - box.height),
            "w": Double(box.width),
            "h": Double(box.height),
            "midY": Double(box.midY),
            "pixelX": Int(box.origin.x * imgW),
            "pixelY": Int((1.0 - box.origin.y - box.height) * imgH),
            "pixelW": Int(box.width * imgW),
            "pixelH": Int(box.height * imgH),
          ]
        ]
        blocks.append(block)
        fullTextLines.append(text)
      }

      let result: [String: Any] = [
        "blocks": blocks,
        "fullText": fullTextLines.joined(separator: "\n"),
        "width": imageInfo.width,
        "height": imageInfo.height,
      ]

      resolve(result)
    }

    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(iOS 16.0, *) {
      request.automaticallyDetectsLanguage = true
    } else {
      request.recognitionLanguages = ["en", "id", "ms", "zh-Hans", "zh-Hant", "ja", "ko"]
    }

    let orientation = CGImagePropertyOrientation(imageInfo.image.imageOrientation)
    let handler = VNImageRequestHandler(
      cgImage: imageInfo.cgImage,
      orientation: orientation,
      options: [:]
    )

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        reject("ocr_error", "Vision request failed: \(error.localizedDescription)", error)
      }
    }
  }

  // MARK: - Document Corner Detection (Vision framework VNDetectRectanglesRequest)
  //
  // Vision's VNDetectRectanglesRequest is far more accurate than CIDetector for
  // real-world receipts. Corners are reported in Vision's bottom-left normalised
  // space (0-1); we flip Y so the caller receives top-left coords matching RN.
  @objc(detectRectangle:resolve:rejecter:)
  func detectRectangle(
    _ imagePath: String,
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let imageInfo = loadImage(from: imagePath) else {
      reject("no_image", "Cannot load image at path: \(imagePath)", nil)
      return
    }

    let defaultResult: [String: [String: Double]] = [
      "topLeft":     ["x": 0.05, "y": 0.05],
      "topRight":    ["x": 0.95, "y": 0.05],
      "bottomRight": ["x": 0.95, "y": 0.95],
      "bottomLeft":  ["x": 0.05, "y": 0.95],
    ]

    let request = VNDetectRectanglesRequest { req, error in
      if let error = error {
        print("[ReceiptOCR] detectRectangle error: \(error)")
        resolve(defaultResult)
        return
      }
      guard let results = req.results as? [VNRectangleObservation],
            let best = results.max(by: { $0.confidence < $1.confidence }) else {
        resolve(defaultResult)
        return
      }

      // Vision bottom-left → flip Y → React Native top-left
      let result: [String: [String: Double]] = [
        "topLeft":     ["x": Double(best.topLeft.x),     "y": 1.0 - Double(best.topLeft.y)],
        "topRight":    ["x": Double(best.topRight.x),    "y": 1.0 - Double(best.topRight.y)],
        "bottomRight": ["x": Double(best.bottomRight.x), "y": 1.0 - Double(best.bottomRight.y)],
        "bottomLeft":  ["x": Double(best.bottomLeft.x),  "y": 1.0 - Double(best.bottomLeft.y)],
      ]
      resolve(result)
    }

    // Permissive settings to catch receipts in all orientations / partial crops
    request.minimumAspectRatio  = 0.2   // allows tall narrow receipts
    request.maximumAspectRatio  = 1.0
    request.minimumSize         = 0.1   // as small as 10% of image dimension
    request.maximumObservations = 1
    request.minimumConfidence   = 0.3   // accept lower-confidence detections

    let orientation = CGImagePropertyOrientation(imageInfo.image.imageOrientation)
    let handler = VNImageRequestHandler(
      cgImage: imageInfo.cgImage,
      orientation: orientation,
      options: [:]
    )

    DispatchQueue.global(qos: .userInitiated).async {
      do {
        try handler.perform([request])
      } catch {
        print("[ReceiptOCR] VNDetectRectanglesRequest perform error: \(error)")
        resolve(defaultResult)
      }
    }
  }

  // MARK: - Perspective Correction
  @objc(perspectiveCorrect:corners:resolve:rejecter:)
  func perspectiveCorrect(
    _ imagePath: String,
    corners: NSDictionary,
    resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let imageInfo = loadImage(from: imagePath) else {
      reject("no_image", "Cannot load image at path: \(imagePath)", nil)
      return
    }

    DispatchQueue.global(qos: .userInitiated).async {
      // corners arrive as {topLeft, topRight, bottomRight, bottomLeft} in top-left normalised space.
      let tl = corners["topLeft"]     as? [String: Double] ?? ["x": 0.0, "y": 0.0]
      let tr = corners["topRight"]    as? [String: Double] ?? ["x": 1.0, "y": 0.0]
      let br = corners["bottomRight"] as? [String: Double] ?? ["x": 1.0, "y": 1.0]
      let bl = corners["bottomLeft"]  as? [String: Double] ?? ["x": 0.0, "y": 1.0]
      // Order expected by OpenCVScanner: TL, TR, BR, BL
      let cornersArray: [[String: Double]] = [tl, tr, br, bl]

      let correctedImage = OpenCVScanner.perspectiveCorrect(imageInfo.image, corners: cornersArray)

      let tempDir = NSTemporaryDirectory()
      let fileName = "ff_corrected_\(UUID().uuidString).jpg"
      let outputPath = (tempDir as NSString).appendingPathComponent(fileName)

      guard let jpegData = correctedImage.jpegData(compressionQuality: 0.92) else {
        reject("encode_error", "Failed to encode corrected image", nil)
        return
      }

      do {
        try jpegData.write(to: URL(fileURLWithPath: outputPath))
        resolve([
          "uri":    "file://\(outputPath)",
          "path":   outputPath,
          "width":  correctedImage.size.width,
          "height": correctedImage.size.height,
        ])
      } catch {
        reject("write_error", "Failed to save corrected image: \(error.localizedDescription)", error)
      }
    }
  }

  // MARK: - Image Loading (always returns orientation-normalised image)
  private struct ImageInfo {
    let image: UIImage
    let cgImage: CGImage
    let width: Int
    let height: Int
  }

  private func loadImage(from path: String) -> ImageInfo? {
    var cleanPath = path
    if cleanPath.hasPrefix("file://") {
      cleanPath = String(cleanPath.dropFirst(7))
    }
    if let decoded = cleanPath.removingPercentEncoding {
      cleanPath = decoded
    }

    guard let originalImage = UIImage(contentsOfFile: cleanPath) else {
      return nil
    }

    // Normalise orientation so raw CGImage pixels are always upright
    var image = originalImage
    if image.imageOrientation != .up {
      UIGraphicsBeginImageContextWithOptions(image.size, false, image.scale)
      image.draw(in: CGRect(origin: .zero, size: image.size))
      if let normalizedImage = UIGraphicsGetImageFromCurrentImageContext() {
        image = normalizedImage
      }
      UIGraphicsEndImageContext()
    }

    guard let cgImage = image.cgImage else {
      return nil
    }

    return ImageInfo(
      image: image,
      cgImage: cgImage,
      width: cgImage.width,
      height: cgImage.height
    )
  }
}
