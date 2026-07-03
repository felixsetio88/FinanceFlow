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
      // Sort top-to-bottom (Vision uses bottom-left origin, so higher midY = higher on image)
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
            "y": Double(1.0 - box.origin.y - box.height), // Convert from bottom-left to top-left origin
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

  // MARK: - Image Loading
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
    // URL-decode the path
    if let decoded = cleanPath.removingPercentEncoding {
      cleanPath = decoded
    }

    guard let image = UIImage(contentsOfFile: cleanPath),
          let cgImage = image.cgImage else {
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
