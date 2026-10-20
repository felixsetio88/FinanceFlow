import ExpoModulesCore
import Vision
import CoreImage
import UIKit

public class ReceiptOCRModule: Module {
  public func definition() -> ModuleDefinition {
    Name("ReceiptOCRModule")

    AsyncFunction("recognizeText") { (imageUri: String, promise: Promise) in
      guard let image = Self.loadCIImage(uri: imageUri) else {
        promise.reject("ERR_IMAGE", "Failed to load image from URI")
        return
      }
      let request = VNRecognizeTextRequest { req, error in
        if let error = error { promise.reject("ERR_OCR", error.localizedDescription); return }
        guard let obs = req.results as? [VNRecognizedTextObservation] else {
          promise.resolve(["blocks": []]); return
        }
        var blocks: [[String: Any]] = []
        for o in obs {
          guard let top = o.topCandidates(1).first else { continue }
          let bb = o.boundingBox
          blocks.append([
            "text": top.string,
            "confidence": top.confidence,
            "bbox": ["x": bb.origin.x, "y": 1.0 - bb.origin.y - bb.height, "w": bb.width, "h": bb.height]
          ])
        }
        promise.resolve(["blocks": blocks])
      }
      request.recognitionLevel = .accurate
      request.usesLanguageCorrection = true
      DispatchQueue.global(qos: .userInitiated).async {
        do { try VNImageRequestHandler(ciImage: image, options: [:]).perform([request]) }
        catch { promise.reject("ERR_OCR", error.localizedDescription) }
      }
    }

    AsyncFunction("detectRectangle") { (imageUri: String, promise: Promise) in
      guard let image = Self.loadCIImage(uri: imageUri) else {
        promise.reject("ERR_IMAGE", "Failed to load image from URI")
        return
      }
      DispatchQueue.global(qos: .userInitiated).async {
        // Strategy 1: Document Segmentation (iOS 15+)
        if #available(iOS 15.0, *) {
          let req = VNDetectDocumentSegmentationRequest()
          if let _ = try? VNImageRequestHandler(ciImage: image, options: [:]).perform([req]),
             let result = req.results?.first {
            promise.resolve(Self.rectToDict(result))
            return
          }
        }
        // Strategy 2: Rectangle Detection
        let req = VNDetectRectanglesRequest()
        req.minimumConfidence = 0.4
        req.minimumAspectRatio = 0.1
        req.maximumObservations = 5
        if let _ = try? VNImageRequestHandler(ciImage: image, options: [:]).perform([req]),
           let result = (req.results as? [VNRectangleObservation])?.first {
          promise.resolve(Self.rectToDict(result))
          return
        }
        promise.resolve(nil)
      }
    }
  }

  private static func loadCIImage(uri: String) -> CIImage? {
    let clean = uri.replacingOccurrences(of: "file://", with: "")
    return CIImage(contentsOf: URL(fileURLWithPath: clean))
  }

  private static func rectToDict(_ rect: VNRectangleObservation) -> [String: Any] {
    return [
      "topLeft":     ["x": rect.topLeft.x,     "y": 1.0 - rect.topLeft.y],
      "topRight":    ["x": rect.topRight.x,    "y": 1.0 - rect.topRight.y],
      "bottomRight": ["x": rect.bottomRight.x, "y": 1.0 - rect.bottomRight.y],
      "bottomLeft":  ["x": rect.bottomLeft.x,  "y": 1.0 - rect.bottomLeft.y]
    ]
  }
}
