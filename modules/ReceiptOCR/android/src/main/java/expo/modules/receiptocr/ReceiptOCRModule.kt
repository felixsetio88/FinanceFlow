package expo.modules.receiptocr

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Matrix
import android.graphics.Paint
import android.net.Uri
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sqrt

class ReceiptOCRModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("ReceiptOCRModule")

    // ─── recognizeText ────────────────────────────────────────────────────────
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

    // ─── detectRectangle ─────────────────────────────────────────────────────
    AsyncFunction("detectRectangle") { imageUri: String, promise: Promise ->
      try {
        val cleanUri = imageUri.replace("file://", "")
        val file = File(cleanUri)
        if (!file.exists()) {
          promise.reject("ERR_IMAGE", "File does not exist: $imageUri", null)
          return@AsyncFunction
        }
        val dimOpts = BitmapFactory.Options().apply { inJustDecodeBounds = true }
        BitmapFactory.decodeFile(cleanUri, dimOpts)
        val imgWidth = max(1, dimOpts.outWidth)
        val imgHeight = max(1, dimOpts.outHeight)

        val image = InputImage.fromFilePath(context, Uri.fromFile(file))
        val recognizer = TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)

        recognizer.process(image)
          .addOnSuccessListener { visionText ->
            data class NormBox(val l: Double, val t: Double, val r: Double, val b: Double)
            val boxes = mutableListOf<NormBox>()

            for (block in visionText.textBlocks) {
              val box = block.boundingBox ?: continue
              val bw = box.width().toDouble() / imgWidth
              val bh = box.height().toDouble() / imgHeight
              if (bw < 0.003 || bh < 0.003) continue
              boxes.add(NormBox(
                box.left.toDouble() / imgWidth,
                box.top.toDouble() / imgHeight,
                box.right.toDouble() / imgWidth,
                box.bottom.toDouble() / imgHeight
              ))
            }

            if (boxes.isEmpty()) {
              promise.resolve(null)
              return@addOnSuccessListener
            }

            val lefts   = boxes.map { it.l }.sorted()
            val tops    = boxes.map { it.t }.sorted()
            val rights  = boxes.map { it.r }.sorted()
            val bottoms = boxes.map { it.b }.sorted()

            fun <T : Comparable<T>> List<T>.pct(p: Double): T =
              this[(size * p).toInt().coerceIn(0, size - 1)]

            val rawMinX = lefts.pct(0.05)
            val rawMaxX = rights.pct(0.95)
            val rawMinY = tops.pct(0.03)
            val rawMaxY = bottoms.pct(0.97)

            if (rawMinX >= rawMaxX || rawMinY >= rawMaxY) {
              promise.resolve(null)
              return@addOnSuccessListener
            }

            // Asymmetric paper margin: 6% horizontal, 8% vertical
            val padX = 0.06
            val padY = 0.08
            val minX = max(0.01, rawMinX - padX)
            val minY = max(0.01, rawMinY - padY)
            val maxX = min(0.99, rawMaxX + padX)
            val maxY = min(0.99, rawMaxY + padY)

            promise.resolve(mapOf(
              "topLeft"     to mapOf("x" to minX, "y" to minY),
              "topRight"    to mapOf("x" to maxX, "y" to minY),
              "bottomRight" to mapOf("x" to maxX, "y" to maxY),
              "bottomLeft"  to mapOf("x" to minX, "y" to maxY)
            ))
          }
          .addOnFailureListener { e ->
            promise.reject("ERR_DETECT", e.localizedMessage, e)
          }
      } catch (e: Exception) {
        promise.reject("ERR_DETECT", e.localizedMessage, e)
      }
    }

    // ─── perspectiveCorrect ───────────────────────────────────────────────────
    // True 4-point perspective warp using android.graphics.Matrix.setPolyToPoly.
    // Maps the user-defined quadrilateral to a flat, axis-aligned rectangle.
    AsyncFunction("perspectiveCorrect") { imageUri: String, corners: Map<String, Map<String, Double>>, promise: Promise ->
      try {
        val cleanUri = imageUri.replace("file://", "")
        val file = File(cleanUri)
        if (!file.exists()) {
          promise.reject("ERR_IMAGE", "File does not exist: $imageUri", null)
          return@AsyncFunction
        }

        // Decode full bitmap (handles EXIF via InputImage on device but BitmapFactory is fine
        // here since we've already EXIF-normalised the URI in JS before calling this)
        val srcBitmap = BitmapFactory.decodeFile(cleanUri)
          ?: run { promise.reject("ERR_IMAGE", "Failed to decode bitmap", null); return@AsyncFunction }

        val imgW = srcBitmap.width.toFloat()
        val imgH = srcBitmap.height.toFloat()

        val tl = corners["topLeft"]     ?: emptyMap()
        val tr = corners["topRight"]    ?: emptyMap()
        val br = corners["bottomRight"] ?: emptyMap()
        val bl = corners["bottomLeft"]  ?: emptyMap()

        fun cx(m: Map<String, Double>) = ((m["x"] ?: 0.0) * imgW).toFloat()
        fun cy(m: Map<String, Double>) = ((m["y"] ?: 0.0) * imgH).toFloat()
        fun dist(ax: Float, ay: Float, bx: Float, by: Float) =
          sqrt(((bx - ax) * (bx - ax) + (by - ay) * (by - ay)).toDouble()).toFloat()

        val tlX = cx(tl); val tlY = cy(tl)
        val trX = cx(tr); val trY = cy(tr)
        val brX = cx(br); val brY = cy(br)
        val blX = cx(bl); val blY = cy(bl)

        // Output size: use the lengths of the actual quad edges so the receipt fills
        // the output without black bars from aspect mismatch
        val topW  = dist(tlX, tlY, trX, trY)
        val botW  = dist(blX, blY, brX, brY)
        val leftH = dist(tlX, tlY, blX, blY)
        val rightH = dist(trX, trY, brX, brY)

        val outW = max(topW, botW).toInt().coerceAtLeast(1)
        val outH = max(leftH, rightH).toInt().coerceAtLeast(1)

        // Source quad → destination rectangle (perspective warp)
        val srcPts = floatArrayOf(tlX, tlY, trX, trY, brX, brY, blX, blY)
        val dstPts = floatArrayOf(
          0f, 0f,
          outW.toFloat(), 0f,
          outW.toFloat(), outH.toFloat(),
          0f, outH.toFloat()
        )

        val matrix = Matrix()
        val ok = matrix.setPolyToPoly(srcPts, 0, dstPts, 0, 4)
        if (!ok) {
          srcBitmap.recycle()
          promise.reject("ERR_WARP", "setPolyToPoly failed — degenerate quad", null)
          return@AsyncFunction
        }

        val result = Bitmap.createBitmap(outW, outH, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(result)
        canvas.drawBitmap(srcBitmap, matrix, Paint(Paint.ANTI_ALIAS_FLAG or Paint.FILTER_BITMAP_FLAG))
        srcBitmap.recycle()

        val tempFile = File(context.cacheDir, "warp_${UUID.randomUUID()}.jpg")
        FileOutputStream(tempFile).use { out ->
          result.compress(Bitmap.CompressFormat.JPEG, 95, out)
        }
        result.recycle()

        promise.resolve(mapOf(
          "uri"    to "file://${tempFile.absolutePath}",
          "width"  to outW,
          "height" to outH
        ))
      } catch (e: Exception) {
        promise.reject("ERR_WARP", e.localizedMessage, e)
      }
    }
  }

  private val context: android.content.Context
    get() = appContext.reactContext ?: throw IllegalStateException("ReactContext is null")
}
