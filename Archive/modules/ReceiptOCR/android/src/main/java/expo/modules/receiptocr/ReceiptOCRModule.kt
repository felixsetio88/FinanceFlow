package expo.modules.receiptocr

import android.graphics.BitmapFactory
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.math.max
import kotlin.math.min

class ReceiptOCRModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOCRModule")

    AsyncFunction("recognizeText") { imageUri: String, promise: Promise ->
      try {
        val cleanUri = imageUri.replace("file://", "")
        val file = File(cleanUri)
        if (!file.exists()) {
          promise.reject("ERR_IMAGE", "File does not exist: $imageUri", null)
          return@AsyncFunction
        }
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(cleanUri, options)
        val imgWidth = max(1, options.outWidth)
        val imgHeight = max(1, options.outHeight)

        val image = InputImage.fromFilePath(context, Uri.fromFile(file))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            val blocks = mutableListOf<Map<String, Any?>>()
            for (block in visionText.textBlocks) {
              for (line in block.lines) {
                val box = line.boundingBox
                val bbox = if (box != null) {
                  mapOf(
                    "x" to box.left.toDouble() / imgWidth,
                    "y" to box.top.toDouble() / imgHeight,
                    "w" to box.width().toDouble() / imgWidth,
                    "h" to box.height().toDouble() / imgHeight
                  )
                } else {
                  mapOf("x" to 0.0, "y" to 0.0, "w" to 0.0, "h" to 0.0)
                }
                blocks.add(mapOf(
                  "text" to line.text,
                  "confidence" to 1.0,
                  "bbox" to bbox
                ))
              }
            }
            promise.resolve(mapOf("blocks" to blocks))
          }
          .addOnFailureListener { e ->
            promise.reject("ERR_OCR", e.localizedMessage, e)
          }
      } catch (e: Exception) {
        promise.reject("ERR_OCR", e.localizedMessage, e)
      }
    }

    AsyncFunction("detectRectangle") { imageUri: String, promise: Promise ->
      try {
        val cleanUri = imageUri.replace("file://", "")
        val file = File(cleanUri)
        if (!file.exists()) {
          promise.reject("ERR_IMAGE", "File does not exist: $imageUri", null)
          return@AsyncFunction
        }
        val options = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(cleanUri, options)
        val imgWidth = max(1, options.outWidth)
        val imgHeight = max(1, options.outHeight)

        val image = InputImage.fromFilePath(context, Uri.fromFile(file))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            var minX = 1.0
            var minY = 1.0
            var maxX = 0.0
            var maxY = 0.0
            var found = false

            for (block in visionText.textBlocks) {
              val box = block.boundingBox ?: continue
              found = true
              val l = box.left.toDouble() / imgWidth
              val t = box.top.toDouble() / imgHeight
              val r = box.right.toDouble() / imgWidth
              val b = box.bottom.toDouble() / imgHeight

              minX = min(minX, l)
              minY = min(minY, t)
              maxX = max(maxX, r)
              maxY = max(maxY, b)
            }

            if (found && minX < maxX && minY < maxY) {
              val pad = 0.025
              minX = max(0.01, minX - pad)
              minY = max(0.01, minY - pad)
              maxX = min(0.99, maxX + pad)
              maxY = min(0.99, maxY + pad)

              promise.resolve(mapOf(
                "topLeft" to mapOf("x" to minX, "y" to minY),
                "topRight" to mapOf("x" to maxX, "y" to minY),
                "bottomRight" to mapOf("x" to maxX, "y" to maxY),
                "bottomLeft" to mapOf("x" to minX, "y" to maxY)
              ))
            } else {
              promise.resolve(null)
            }
          }
          .addOnFailureListener { e ->
            promise.reject("ERR_DETECT", e.localizedMessage, e)
          }
      } catch (e: Exception) {
        promise.reject("ERR_DETECT", e.localizedMessage, e)
      }
    }
  }

  private val context: android.content.Context
    get() = appContext.reactContext ?: throw IllegalStateException("ReactContext is null")
}
