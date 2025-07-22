// OpenCV.js is loaded via CDN in index.html
declare global {
  interface Window {
    cv: any;
    onOpenCvReady: () => void;
  }
}

let cv: any;
let isOpenCVReady = false;

// AI-detected road shape interface
interface DetectedRoadShape {
  id: string;
  shapeType: string;
  description: string;
  confidence: number;
  contour: any;
  boundingBox: { x: number; y: number; width: number; height: number };
  thumbnail: string;
  cleanThumbnail: string;
  area: number;
  complexity: number;
  aspectRatio: number;
  geometricProperties: {
    vertices: number;
    isConvex: boolean;
    solidity: number;
    extent: number;
    orientation: number;
  };
}

// Global function called when OpenCV is ready
window.onOpenCvReady = function () {
  cv = window.cv;
  isOpenCVReady = true;
  console.log("OpenCV.js is ready for AI shape detection");
};

// Initialize OpenCV
function initializeOpenCV() {
  return new Promise<void>((resolve) => {
    if (isOpenCVReady && cv) {
      resolve();
    } else {
      // Wait for OpenCV to be ready
      const checkReady = () => {
        if (isOpenCVReady && cv) {
          resolve();
        } else {
          setTimeout(checkReady, 100);
        }
      };
      checkReady();
    }
  });
}

async function loadOpenCV() {
  try {
    document.getElementById("model-status")!.innerText =
      "Loading AI shape detector...";

    await initializeOpenCV();

    document.getElementById("model-status")!.innerText =
      "✅ AI Shape Detector ready!";
    document.getElementById("result")!.innerText =
      "Upload a map image to find road shapes";
  } catch (error) {
    console.error("Error loading OpenCV:", error);
    document.getElementById("model-status")!.innerText =
      "❌ Failed to load AI detector!";
    document.getElementById("result")!.innerText =
      "AI detector loading failed. Please refresh the page.";
  }
}

// Enhanced road network extraction with better preprocessing
function extractRoadNetwork(src: any): any {
  const gray = new cv.Mat();
  const blurred = new cv.Mat();
  const binary = new cv.Mat();
  const cleaned = new cv.Mat();
  const enhanced = new cv.Mat();

  try {
    // Convert to grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Gaussian blur to reduce noise
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Adaptive thresholding with multiple methods for better road detection
    const binary1 = new cv.Mat();
    const binary2 = new cv.Mat();

    cv.adaptiveThreshold(
      blurred,
      binary1,
      255,
      cv.ADAPTIVE_THRESH_GAUSSIAN_C,
      cv.THRESH_BINARY_INV,
      11,
      2
    );
    cv.adaptiveThreshold(
      blurred,
      binary2,
      255,
      cv.ADAPTIVE_THRESH_MEAN_C,
      cv.THRESH_BINARY_INV,
      15,
      3
    );

    // Combine both thresholding results
    cv.bitwise_or(binary1, binary2, binary);

    // Morphological operations to connect road segments and remove noise
    const kernel1 = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(3, 3)
    );
    const kernel2 = cv.getStructuringElement(
      cv.MORPH_ELLIPSE,
      new cv.Size(5, 5)
    );

    // Close gaps in roads
    cv.morphologyEx(binary, cleaned, cv.MORPH_CLOSE, kernel2);
    // Remove small noise
    cv.morphologyEx(cleaned, enhanced, cv.MORPH_OPEN, kernel1);
    // Slightly dilate to strengthen road connections
    cv.morphologyEx(enhanced, enhanced, cv.MORPH_DILATE, kernel1);

    // Cleanup intermediate matrices
    gray.delete();
    blurred.delete();
    binary.delete();
    cleaned.delete();
    binary1.delete();
    binary2.delete();
    kernel1.delete();
    kernel2.delete();

    return enhanced;
  } catch (error) {
    console.error("Error in road extraction:", error);
    gray.delete();
    blurred.delete();
    binary.delete();
    cleaned.delete();
    enhanced.delete();
    return null;
  }
}

// AI-powered shape analysis using geometric properties
function analyzeShapeGeometry(contour: any): any {
  try {
    const area = cv.contourArea(contour);
    const perimeter = cv.arcLength(contour, true);
    const hull = new cv.Mat();
    cv.convexHull(contour, hull);
    const hullArea = cv.contourArea(hull);

    // Approximate contour to get vertices
    const epsilon = 0.02 * perimeter;
    const approx = new cv.Mat();
    cv.approxPolyDP(contour, approx, epsilon, true);
    const vertices = approx.rows;

    // Get bounding rectangle and rotated rectangle
    const boundingRect = cv.boundingRect(contour);
    const rotatedRect = cv.minAreaRect(contour);

    // Calculate geometric properties
    const aspectRatio = boundingRect.width / boundingRect.height;
    const solidity = area / hullArea; // How "solid" vs "concave" the shape is
    const extent = area / (boundingRect.width * boundingRect.height); // How much of bounding box is filled
    const isConvex = cv.isContourConvex(contour);
    const complexity = 1 - solidity; // Higher = more complex/irregular

    // Cleanup
    hull.delete();
    approx.delete();

    return {
      area,
      perimeter,
      aspectRatio,
      solidity,
      extent,
      vertices,
      isConvex,
      complexity,
      orientation: rotatedRect.angle,
      boundingRect,
    };
  } catch (error) {
    console.error("Error in geometry analysis:", error);
    return null;
  }
}

// AI-powered shape classification based on geometric properties
function classifyShapeAI(geometry: any): {
  type: string;
  description: string;
  confidence: number;
} {
  const {
    aspectRatio,
    solidity,
    extent,
    vertices,
    isConvex,
    complexity,
    area,
  } = geometry;

  let shapeType = "Unknown";
  let description = "Irregular road formation";
  let confidence = 0.3;

  // AI-like decision tree based on geometric analysis
  if (vertices <= 4 && solidity > 0.85) {
    if (aspectRatio > 2.5) {
      shapeType = "Linear";
      description = "Long straight road segment";
      confidence = 0.9;
    } else if (Math.abs(aspectRatio - 1) < 0.3) {
      shapeType = "Square-like";
      description = "Square or rectangular block";
      confidence = 0.85;
    } else {
      shapeType = "Rectangular";
      description = "Rectangular road formation";
      confidence = 0.8;
    }
  } else if (
    vertices > 8 &&
    solidity > 0.8 &&
    Math.abs(aspectRatio - 1) < 0.4
  ) {
    shapeType = "Circular";
    description = "Circular or round road pattern";
    confidence = 0.9;
  } else if (complexity > 0.4 && vertices > 6) {
    if (aspectRatio > 1.5 && aspectRatio < 2.5) {
      shapeType = "Organic";
      description = "Natural, organic road shape";
      confidence = 0.75;
    } else if (aspectRatio > 0.6 && aspectRatio < 1.4) {
      shapeType = "Star-like";
      description = "Star or flower-like intersection";
      confidence = 0.8;
    } else {
      shapeType = "Complex";
      description = "Complex multi-branched formation";
      confidence = 0.7;
    }
  } else if (vertices >= 5 && vertices <= 8) {
    if (isConvex) {
      shapeType = "Polygon";
      description = `${vertices}-sided polygon formation`;
      confidence = 0.85;
    } else {
      shapeType = "Angular";
      description = "Angular road intersection";
      confidence = 0.75;
    }
  } else if (complexity > 0.6) {
    if (aspectRatio > 2.0) {
      shapeType = "Branch-like";
      description = "Tree or branch-like pattern";
      confidence = 0.8;
    } else {
      shapeType = "Irregular";
      description = "Irregular complex shape";
      confidence = 0.6;
    }
  } else if (extent > 0.8 && solidity > 0.7) {
    shapeType = "Filled";
    description = "Dense filled area formation";
    confidence = 0.7;
  }

  // Boost confidence for larger, more significant shapes
  if (area > 2000) {
    confidence = Math.min(1.0, confidence + 0.1);
  }

  return { type: shapeType, description, confidence };
}

// Create high-quality, clear thumbnails showing the actual road shape
function createClearShapeThumbnail(
  contour: any,
  boundingRect: any,
  originalMask: any,
  originalImage: any
): { thumbnail: string; cleanThumbnail: string } {
  try {
    const thumbSize = 120; // Larger for better clarity

    // Create original thumbnail (roads only)
    const roi = originalMask.roi(boundingRect);
    const canvas1 = document.createElement("canvas");
    canvas1.width = thumbSize;
    canvas1.height = thumbSize;
    const ctx1 = canvas1.getContext("2d")!;

    // White background
    ctx1.fillStyle = "white";
    ctx1.fillRect(0, 0, thumbSize, thumbSize);

    // Calculate scaling
    const scale =
      Math.min(
        thumbSize / boundingRect.width,
        thumbSize / boundingRect.height
      ) * 0.85;
    const scaledWidth = boundingRect.width * scale;
    const scaledHeight = boundingRect.height * scale;
    const offsetX = (thumbSize - scaledWidth) / 2;
    const offsetY = (thumbSize - scaledHeight) / 2;

    // Draw roads in black
    const imageData1 = ctx1.createImageData(scaledWidth, scaledHeight);
    for (let y = 0; y < Math.min(boundingRect.height, roi.rows); y++) {
      for (let x = 0; x < Math.min(boundingRect.width, roi.cols); x++) {
        const pixel = roi.ucharPtr(y, x)[0];
        const destY = Math.floor(y * scale);
        const destX = Math.floor(x * scale);

        if (destX < scaledWidth && destY < scaledHeight) {
          const destIndex = (destY * scaledWidth + destX) * 4;
          const color = pixel > 0 ? 0 : 255; // Black roads on white
          imageData1.data[destIndex] = color;
          imageData1.data[destIndex + 1] = color;
          imageData1.data[destIndex + 2] = color;
          imageData1.data[destIndex + 3] = 255;
        }
      }
    }
    ctx1.putImageData(imageData1, offsetX, offsetY);

    // Create clean version with original image context
    const originalRoi = originalImage.roi(boundingRect);
    const canvas2 = document.createElement("canvas");
    canvas2.width = thumbSize;
    canvas2.height = thumbSize;
    const ctx2 = canvas2.getContext("2d")!;

    // Light gray background
    ctx2.fillStyle = "#f5f5f5";
    ctx2.fillRect(0, 0, thumbSize, thumbSize);

    // Draw original image section
    const imageData2 = ctx2.createImageData(scaledWidth, scaledHeight);
    for (let y = 0; y < Math.min(boundingRect.height, originalRoi.rows); y++) {
      for (let x = 0; x < Math.min(boundingRect.width, originalRoi.cols); x++) {
        const destY = Math.floor(y * scale);
        const destX = Math.floor(x * scale);

        if (destX < scaledWidth && destY < scaledHeight) {
          const destIndex = (destY * scaledWidth + destX) * 4;

          // Get original pixel (RGBA)
          const srcPixel = originalRoi.ucharPtr(y, x);
          imageData2.data[destIndex] = srcPixel[0]; // R
          imageData2.data[destIndex + 1] = srcPixel[1]; // G
          imageData2.data[destIndex + 2] = srcPixel[2]; // B
          imageData2.data[destIndex + 3] = 255; // A
        }
      }
    }
    ctx2.putImageData(imageData2, offsetX, offsetY);

    // Add subtle border to highlight the detected shape
    ctx2.strokeStyle = "#4CAF50";
    ctx2.lineWidth = 2;
    ctx2.strokeRect(
      offsetX - 1,
      offsetY - 1,
      scaledWidth + 2,
      scaledHeight + 2
    );

    // Cleanup
    roi.delete();
    originalRoi.delete();

    return {
      thumbnail: canvas1.toDataURL(),
      cleanThumbnail: canvas2.toDataURL(),
    };
  } catch (error) {
    console.error("Error creating thumbnail:", error);
    return { thumbnail: "", cleanThumbnail: "" };
  }
}

// Find and analyze road shapes using AI
function findRoadShapesAI(
  roadMask: any,
  originalImage: any
): DetectedRoadShape[] {
  const contours = new cv.MatVector();
  const hierarchy = new cv.Mat();
  const detectedShapes: DetectedRoadShape[] = [];

  try {
    // Find contours
    cv.findContours(
      roadMask,
      contours,
      hierarchy,
      cv.RETR_EXTERNAL,
      cv.CHAIN_APPROX_SIMPLE
    );

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);

      // Analyze geometry
      const geometry = analyzeShapeGeometry(contour);
      if (!geometry) continue;

      // Filter by area and complexity (avoid tiny segments and overly large areas)
      if (geometry.area < 800 || geometry.area > 80000) {
        continue;
      }

      // Skip very small bounding boxes
      if (
        geometry.boundingRect.width < 40 ||
        geometry.boundingRect.height < 40
      ) {
        continue;
      }

      // AI classification
      const classification = classifyShapeAI(geometry);

      // Only keep shapes with reasonable confidence
      if (classification.confidence < 0.5) {
        continue;
      }

      // Create thumbnails
      const thumbnails = createClearShapeThumbnail(
        contour,
        geometry.boundingRect,
        roadMask,
        originalImage
      );

      detectedShapes.push({
        id: `ai_shape_${i}`,
        shapeType: classification.type,
        description: classification.description,
        confidence: classification.confidence,
        contour: contour,
        boundingBox: geometry.boundingRect,
        thumbnail: thumbnails.thumbnail,
        cleanThumbnail: thumbnails.cleanThumbnail,
        area: geometry.area,
        complexity: geometry.complexity,
        aspectRatio: geometry.aspectRatio,
        geometricProperties: {
          vertices: geometry.vertices,
          isConvex: geometry.isConvex,
          solidity: geometry.solidity,
          extent: geometry.extent,
          orientation: geometry.orientation,
        },
      });
    }

    // Cleanup
    contours.delete();
    hierarchy.delete();

    return detectedShapes;
  } catch (error) {
    console.error("Error in AI shape detection:", error);
    contours.delete();
    hierarchy.delete();
    return [];
  }
}

// Main AI shape detection function
function detectRoadShapesAI(imageData: string): Promise<DetectedRoadShape[]> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        // Create canvas and get image data
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d")!;
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);

        // Convert to OpenCV Mat
        const src = cv.imread(canvas);

        // Extract road network with enhanced preprocessing
        const roadMask = extractRoadNetwork(src);

        if (!roadMask) {
          src.delete();
          resolve([]);
          return;
        }

        // Find shapes using AI analysis
        const detectedShapes = findRoadShapesAI(roadMask, src);

        // Sort by confidence and area (prioritize confident, larger shapes)
        detectedShapes.sort((a, b) => {
          const scoreA = a.confidence * 0.7 + (a.area / 10000) * 0.3;
          const scoreB = b.confidence * 0.7 + (b.area / 10000) * 0.3;
          return scoreB - scoreA;
        });

        // Cleanup
        src.delete();
        roadMask.delete();

        resolve(detectedShapes);
      } catch (error) {
        reject(error);
      }
    };
    img.src = imageData;
  });
}

// Display AI-detected shapes with enhanced visualization
function displayAIDetectedShapes(
  shapes: DetectedRoadShape[],
  originalImage: string
): void {
  const imageContainer = document.getElementById("image-container")!;
  imageContainer.innerHTML = "";

  // Original image
  const originalWrapper = document.createElement("div");
  originalWrapper.className = "image-wrapper";
  const originalTitle = document.createElement("h4");
  originalTitle.textContent = "Original Map";
  originalWrapper.appendChild(originalTitle);

  const img = document.createElement("img");
  img.src = originalImage;
  img.style.maxWidth = "500px";
  originalWrapper.appendChild(img);
  imageContainer.appendChild(originalWrapper);

  // Results
  const resultElement = document.getElementById("result")!;

  if (shapes.length === 0) {
    resultElement.innerHTML = `
      <h3>🤖 AI Shape Detection Results</h3>
      <p style="color: #666; font-style: italic;">
        No significant road shapes detected. Try uploading a map with more defined road patterns or distinctive formations.
      </p>
      <div class="tips">
        <h4>💡 Tips for better AI detection:</h4>
        <ul>
          <li>Use maps with clear satellite/street view images with visible roads</li>
          <li>Choose areas with interesting intersections or unique layouts</li>
          <li>Ensure good contrast between roads and background</li>
          <li>Medium zoom level works best (showing 4-10 city blocks)</li>
          <li>Avoid highway-only or rural road maps</li>
        </ul>
      </div>
    `;
    return;
  }

  resultElement.innerHTML = `
    <h3>🤖 AI Shape Detection Results</h3>
    <p>Found <strong>${shapes.length}</strong> distinctive road shape${
    shapes.length > 1 ? "s" : ""
  } using AI analysis!</p>
    <div class="shapes-grid"></div>
  `;

  const shapesGrid = resultElement.querySelector(".shapes-grid")!;

  shapes.forEach((shape, index) => {
    const confidenceColor =
      shape.confidence > 0.8
        ? "#4CAF50"
        : shape.confidence > 0.6
        ? "#FF9800"
        : "#666";

    const shapeCard = document.createElement("div");
    shapeCard.className = "shape-card";
    shapeCard.innerHTML = `
      <div class="shape-thumbnails">
        <div class="thumbnail-pair">
          <div class="thumbnail-item">
            <h5>Road Shape</h5>
            <img src="${shape.thumbnail}" alt="${
      shape.shapeType
    } shape" title="Extracted road pattern" />
          </div>
          <div class="thumbnail-item">
            <h5>In Context</h5>
            <img src="${shape.cleanThumbnail}" alt="${
      shape.shapeType
    } in context" title="Shape in original map context" />
          </div>
        </div>
      </div>
      <div class="shape-info">
        <h4>🔍 ${shape.shapeType}</h4>
        <p class="description">${shape.description}</p>
        <div class="metrics">
          <p class="confidence">Confidence: <span style="color: ${confidenceColor}">${(
      shape.confidence * 100
    ).toFixed(1)}%</span></p>
          <p class="area">Area: ${shape.area.toFixed(0)} px²</p>
          <p class="complexity">Complexity: ${(shape.complexity * 100).toFixed(
            0
          )}%</p>
          <p class="vertices">Vertices: ${
            shape.geometricProperties.vertices
          }</p>
        </div>
      </div>
    `;
    shapesGrid.appendChild(shapeCard);
  });
}

// Process uploaded file
async function processFile(file: File) {
  if (!isOpenCVReady) {
    document.getElementById("result")!.innerText =
      "AI detector not ready yet. Please wait...";
    return;
  }

  document.getElementById("result")!.innerText =
    "🤖 AI analyzing map for road shapes...";

  try {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const imgData = e.target?.result as string;

      try {
        document.getElementById("result")!.innerText =
          "🔍 Extracting roads and analyzing geometry...";

        const detectedShapes = await detectRoadShapesAI(imgData);
        displayAIDetectedShapes(detectedShapes, imgData);
      } catch (analysisError) {
        console.error("AI shape detection error:", analysisError);
        document.getElementById("result")!.innerText =
          "Error in AI analysis. Please try a clearer map image with visible road networks.";
      }
    };

    reader.readAsDataURL(file);
  } catch (error) {
    console.error("File reading error:", error);
    document.getElementById("result")!.innerText =
      "Error reading file: " + error;
  }
}

// Initialize when DOM is loaded
document.addEventListener("DOMContentLoaded", async () => {
  await loadOpenCV();

  const uploadInput = document.getElementById(
    "upload-input"
  ) as HTMLInputElement;
  const uploadArea = document.querySelector(".upload-area") as HTMLElement;

  uploadInput.addEventListener("change", async (e) => {
    const files = (e.target as HTMLInputElement).files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  });

  uploadArea.addEventListener("click", (e) => {
    e.stopPropagation();
    uploadInput.click();
  });

  uploadArea.addEventListener("dragover", (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = "#667eea";
    uploadArea.style.backgroundColor = "#f7fafc";
  });

  uploadArea.addEventListener("dragleave", (e) => {
    e.preventDefault();
    uploadArea.style.borderColor = "#cbd5e0";
    uploadArea.style.backgroundColor = "transparent";
  });

  uploadArea.addEventListener("drop", async (e: DragEvent) => {
    e.preventDefault();
    uploadArea.style.borderColor = "#cbd5e0";
    uploadArea.style.backgroundColor = "transparent";

    const files = e.dataTransfer?.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  });

  // Add tips specific to AI shape detection
  const tipsContainer = document.querySelector(".container");
  if (tipsContainer) {
    const tips = document.createElement("div");
    tips.className = "tips";
    tips.innerHTML = `
      <h3>🤖 AI Shape Detection Tips:</h3>
      <ul>
        <li><strong>AI-Powered:</strong> Uses advanced geometric analysis to identify ANY road shape</li>
        <li><strong>Best maps:</strong> Clear satellite/street view images with visible roads</li>
        <li><strong>Dual thumbnails:</strong> See both the isolated road shape AND in original context</li>
        <li><strong>Smart analysis:</strong> Automatically detects circular, angular, linear, complex patterns</li>
        <li><strong>Zoom level:</strong> Medium zoom showing interesting intersections works best</li>
        <li><strong>No templates:</strong> AI discovers shapes dynamically - no predefined limits!</li>
      </ul>
    `;
    tipsContainer.appendChild(tips);
  }
});
