package com.financeflow.app

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Matrix
import android.media.ExifInterface
import android.util.Log
import java.net.URLDecoder
import com.facebook.react.bridge.*
import org.opencv.android.OpenCVLoader
import org.opencv.android.Utils
import org.opencv.core.*
import org.opencv.imgproc.Imgproc
import java.io.File
import java.io.FileOutputStream
import java.util.UUID
import kotlin.math.max

class DocumentScannerModule(private val reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    init {
        if (!OpenCVLoader.initDebug()) {
            Log.e("DocumentScanner", "OpenCV initialization failed")
        } else {
            Log.d("DocumentScanner", "OpenCV initialization succeeded")
        }
    }

    override fun getName(): String = "DocumentScannerModule"

    @ReactMethod
    fun detectRectangle(imagePath: String, promise: Promise) {
        Thread {
            try {
                val bitmap = loadBitmap(imagePath)
                val corners = findDocumentCornersOpenCV(bitmap)
                bitmap.recycle()

                val result = Arguments.createMap()
                val keys = listOf("topLeft", "topRight", "bottomRight", "bottomLeft")
                keys.forEachIndexed { i, key ->
                    val pt = Arguments.createMap()
                    pt.putDouble("x", corners[i].x)
                    pt.putDouble("y", corners[i].y)
                    result.putMap(key, pt)
                }
                promise.resolve(result)
            } catch (e: Exception) {
                Log.w("DocumentScanner", "detectRectangle failed, using defaults: ${e.message}")
                promise.resolve(defaultCorners())
            }
        }.start()
    }

    @ReactMethod
    fun perspectiveCorrect(imagePath: String, corners: ReadableMap, promise: Promise) {
        Thread {
            try {
                val bitmap = loadBitmap(imagePath)
                val corrected = applyPerspectiveCorrectionOpenCV(bitmap, corners)
                bitmap.recycle()

                val tempFile = File(reactContext.cacheDir, "ff_corrected_${UUID.randomUUID()}.jpg")
                FileOutputStream(tempFile).use { out ->
                    corrected.compress(Bitmap.CompressFormat.JPEG, 92, out)
                }
                val w = corrected.width
                val h = corrected.height
                corrected.recycle()

                val result = Arguments.createMap()
                result.putString("uri", "file://${tempFile.absolutePath}")
                result.putString("path", tempFile.absolutePath)
                result.putInt("width", w)
                result.putInt("height", h)
                promise.resolve(result)
            } catch (e: Exception) {
                Log.e("DocumentScanner", "perspectiveCorrect failed: ${e.message}", e)
                promise.reject("perspective_error", e.message ?: "Perspective correction failed", e)
            }
        }.start()
    }

    private fun findDocumentCornersOpenCV(bitmap: Bitmap): List<Point> {
        val mat = Mat()
        Utils.bitmapToMat(bitmap, mat)

        // Downscale to speed up processing
        val maxDim = 800.0
        val scale = if (mat.width() > mat.height()) maxDim / mat.width() else maxDim / mat.height()
        val downscaled = Mat()
        Imgproc.resize(mat, downscaled, Size(), scale, scale, Imgproc.INTER_AREA)

        val gray = Mat()
        Imgproc.cvtColor(downscaled, gray, Imgproc.COLOR_BGR2GRAY)
        Imgproc.GaussianBlur(gray, gray, Size(5.0, 5.0), 0.0)

        val edges = Mat()
        Imgproc.Canny(gray, edges, 75.0, 200.0)

        val contours = ArrayList<MatOfPoint>()
        val hierarchy = Mat()
        Imgproc.findContours(edges, contours, hierarchy, Imgproc.RETR_LIST, Imgproc.CHAIN_APPROX_SIMPLE)

        contours.sortByDescending { Imgproc.contourArea(it) }

        var largestQuad: MatOfPoint2f? = null

        for (contour in contours) {
            val contour2f = MatOfPoint2f(*contour.toArray())
            val peri = Imgproc.arcLength(contour2f, true)
            val approx = MatOfPoint2f()
            Imgproc.approxPolyDP(contour2f, approx, 0.02 * peri, true)

            if (approx.total() == 4L) {
                val area = Imgproc.contourArea(approx)
                if (area > (downscaled.rows() * downscaled.cols() * 0.1)) {
                    largestQuad = approx
                    break
                }
            }
        }

        val originalCorners = ArrayList<Point>()
        if (largestQuad != null) {
            val points = largestQuad.toArray()
            // Scale back to original resolution and normalize 0-1
            for (p in points) {
                originalCorners.add(Point((p.x / scale) / mat.cols(), (p.y / scale) / mat.rows()))
            }
        } else {
            // Default corners
            originalCorners.add(Point(0.05, 0.05))
            originalCorners.add(Point(0.95, 0.05))
            originalCorners.add(Point(0.95, 0.95))
            originalCorners.add(Point(0.05, 0.95))
        }

        // Sort points: TL, TR, BR, BL
        val sorted = sortCorners(originalCorners)

        gray.release()
        edges.release()
        downscaled.release()
        mat.release()
        hierarchy.release()

        return sorted
    }

    private fun sortCorners(corners: List<Point>): List<Point> {
        val center = Point(
            corners.map { it.x }.average(),
            corners.map { it.y }.average()
        )
        // Sort by angle from center to determine order: TL, TR, BR, BL
        return corners.sortedBy { p ->
            Math.atan2(p.y - center.y, p.x - center.x)
        }.let {
            // atan2 goes from -PI to PI.
            // Depending on coordinate system (y grows down), the order is:
            // Top-Left (x-, y-): negative angle, top-right (x+, y-): negative angle closer to 0
            // Bottom-Right (x+, y+): positive angle, bottom-left (x-, y+): positive angle closer to PI
            // It's safer to use sum and diff of coordinates
            val tl = corners.minByOrNull { it.x + it.y }!!
            val br = corners.maxByOrNull { it.x + it.y }!!
            val tr = corners.maxByOrNull { it.x - it.y }!!
            val bl = corners.minByOrNull { it.x - it.y }!!
            listOf(tl, tr, br, bl)
        }
    }

    private fun applyPerspectiveCorrectionOpenCV(bitmap: Bitmap, corners: ReadableMap): Bitmap {
        val mat = Mat()
        Utils.bitmapToMat(bitmap, mat)

        fun pt(key: String): Point {
            val m = corners.getMap(key) ?: return Point(0.0, 0.0)
            return Point(m.getDouble("x") * mat.cols(), m.getDouble("y") * mat.rows())
        }

        val tl = pt("topLeft")
        val tr = pt("topRight")
        val bl = pt("bottomLeft")
        val br = pt("bottomRight")

        val widthA = Math.sqrt(Math.pow(br.x - bl.x, 2.0) + Math.pow(br.y - bl.y, 2.0))
        val widthB = Math.sqrt(Math.pow(tr.x - tl.x, 2.0) + Math.pow(tr.y - tl.y, 2.0))
        val maxWidth = max(widthA, widthB).toInt()

        val heightA = Math.sqrt(Math.pow(tr.x - br.x, 2.0) + Math.pow(tr.y - br.y, 2.0))
        val heightB = Math.sqrt(Math.pow(tl.x - bl.x, 2.0) + Math.pow(tl.y - bl.y, 2.0))
        val maxHeight = max(heightA, heightB).toInt()

        val srcPts = MatOfPoint2f(tl, tr, br, bl)
        val dstPts = MatOfPoint2f(
            Point(0.0, 0.0),
            Point(maxWidth.toDouble() - 1, 0.0),
            Point(maxWidth.toDouble() - 1, maxHeight.toDouble() - 1),
            Point(0.0, maxHeight.toDouble() - 1)
        )

        val perspectiveTransform = Imgproc.getPerspectiveTransform(srcPts, dstPts)
        val warpedMat = Mat()
        Imgproc.warpPerspective(mat, warpedMat, perspectiveTransform, Size(maxWidth.toDouble(), maxHeight.toDouble()))

        val outputBitmap = Bitmap.createBitmap(warpedMat.cols(), warpedMat.rows(), Bitmap.Config.ARGB_8888)
        Utils.matToBitmap(warpedMat, outputBitmap)

        mat.release()
        warpedMat.release()
        srcPts.release()
        dstPts.release()
        perspectiveTransform.release()

        return outputBitmap
    }

    private fun loadBitmap(imagePath: String): Bitmap {
        val path = URLDecoder.decode(imagePath.removePrefix("file://"), "UTF-8")
        val opts = BitmapFactory.Options().apply { inPreferredConfig = Bitmap.Config.ARGB_8888 }
        val bitmap = BitmapFactory.decodeFile(path, opts)
            ?: throw RuntimeException("Cannot decode image at: $path")

        try {
            val exif = ExifInterface(path)
            val orientation = exif.getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL)
            val matrix = Matrix()
            when (orientation) {
                ExifInterface.ORIENTATION_ROTATE_90 -> matrix.postRotate(90f)
                ExifInterface.ORIENTATION_ROTATE_180 -> matrix.postRotate(180f)
                ExifInterface.ORIENTATION_ROTATE_270 -> matrix.postRotate(270f)
            }
            if (!matrix.isIdentity) {
                val rotated = Bitmap.createBitmap(bitmap, 0, 0, bitmap.width, bitmap.height, matrix, true)
                bitmap.recycle()
                return rotated
            }
        } catch (e: Exception) {
            Log.e("DocumentScanner", "Failed to read Exif", e)
        }
        return bitmap
    }

    private fun defaultCorners(): WritableMap {
        val result = Arguments.createMap()
        listOf(
            "topLeft"     to doubleArrayOf(0.05, 0.05),
            "topRight"    to doubleArrayOf(0.95, 0.05),
            "bottomRight" to doubleArrayOf(0.95, 0.95),
            "bottomLeft"  to doubleArrayOf(0.05, 0.95),
        ).forEach { (key, coords) ->
            val pt = Arguments.createMap()
            pt.putDouble("x", coords[0])
            pt.putDouble("y", coords[1])
            result.putMap(key, pt)
        }
        return result
    }
}
