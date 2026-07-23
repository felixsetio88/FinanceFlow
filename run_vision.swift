import Foundation
import Vision
import CoreImage

func recognizeText(in imagePath: String) -> [String: Any]? {
    let url = URL(fileURLWithPath: imagePath)
    guard let ciImage = CIImage(contentsOf: url, options: [.applyOrientationProperty: true]) else {
        return nil
    }

    var blocks: [[String: Any]] = []
    
    let group = DispatchGroup()
    group.enter()
    
    let request = VNRecognizeTextRequest { request, error in
        defer { group.leave() }
        if let error = error {
            print("Error: \(error)")
            return
        }
        
        let observations = (request.results as? [VNRecognizedTextObservation]) ?? []
        for obs in observations {
            guard let candidate = obs.topCandidates(1).first else { continue }
            let text = candidate.string
            let box = obs.boundingBox
            
            blocks.append([
                "text": text,
                "bbox": [
                    "x": Double(box.origin.x),
                    "y": Double(1.0 - box.origin.y - box.height),
                    "w": Double(box.width),
                    "h": Double(box.height)
                ]
            ])
        }
    }
    
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = true
    if #available(macOS 13.0, *) {
        request.automaticallyDetectsLanguage = true
    } else {
        request.recognitionLanguages = ["en", "id", "ms"]
    }
    
    let handler = VNImageRequestHandler(ciImage: ciImage, options: [:])
    do {
        try handler.perform([request])
    } catch {
        print("Error: \(error)")
        group.leave()
    }
    
    group.wait()
    return ["blocks": blocks]
}

let args = CommandLine.arguments
if args.count < 2 {
    print("Usage: swift run_vision.swift <image_path>")
    exit(1)
}

if let result = recognizeText(in: args[1]),
   let jsonData = try? JSONSerialization.data(withJSONObject: result, options: []),
   let jsonString = String(data: jsonData, encoding: .utf8) {
    print(jsonString)
} else {
    print("{}")
}
