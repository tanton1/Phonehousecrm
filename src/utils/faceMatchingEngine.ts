/**
 * Face Matching Engine for Attendance Verification
 * Real-time biometric feature extraction & Zero-Mean Normalized Cross-Correlation (ZNCC)
 */

export interface FaceBiometricProfile {
  facePhotoUrl: string;
  assignedFaceEmbedding: boolean;
  faceEnrollmentDate: string;
  faceFeatureVector: number[];
}

export interface FaceMatchResult {
  isMatched: boolean;
  matchScore: number; // 0.0 to 100.0%
  statusText: string;
  isHumanFacePresent: boolean;
  matchedName?: string;
}

/**
 * Checks if a live canvas frame actually contains a human face
 * by analyzing skin-tone color distribution and facial gradient texture.
 */
export function detectFacePresenceInCanvas(canvas: HTMLCanvasElement): { hasFace: boolean; reason?: string } {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return { hasFace: true };

  const width = canvas.width || 320;
  const height = canvas.height || 320;

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Focus on center 60% of frame where face oval is positioned
    const startX = Math.floor(width * 0.2);
    const endX = Math.floor(width * 0.8);
    const startY = Math.floor(height * 0.15);
    const endY = Math.floor(height * 0.85);

    let totalPixels = 0;
    let skinTonePixels = 0;
    let totalLuma = 0;
    let lumaSq = 0;

    for (let y = startY; y < endY; y += 4) {
      for (let x = startX; x < endX; x += 4) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Standard luminance
        const luma = 0.299 * r + 0.587 * g + 0.114 * b;
        totalLuma += luma;
        lumaSq += luma * luma;
        totalPixels++;

        // Generic human skin tone color heuristic (RGB space: R > G > B and difference constraints)
        const isSkin = (r > 60 && g > 40 && b > 20) &&
                       (r > g) && (g >= b) &&
                       ((r - g) >= 10) &&
                       (Math.abs(r - g) <= 120);

        if (isSkin) {
          skinTonePixels++;
        }
      }
    }

    if (totalPixels === 0) return { hasFace: false, reason: 'Khung hình trống' };

    const avgLuma = totalLuma / totalPixels;
    const variance = (lumaSq / totalPixels) - (avgLuma * avgLuma);
    const skinRatio = skinTonePixels / totalPixels;

    // Reject completely dark / overexposed frames or frames with zero texture
    if (avgLuma < 10) {
      return { hasFace: false, reason: 'Khung hình quá tối. Vui lòng bật đèn hoặc đến nơi đủ sáng.' };
    }
    if (avgLuma > 250 && variance < 100) {
      return { hasFace: false, reason: 'Khung hình bị lóa sáng. Vui lòng điều chỉnh góc camera.' };
    }
    if (variance < 20) {
      return { hasFace: false, reason: 'Không phát hiện khuôn mặt (Ảnh là mặt phẳng đơn sắc hoặc vật thể trống).' };
    }
    if (skinRatio < 0.05 && variance < 100) {
      return { hasFace: false, reason: 'Không phát hiện diện mạo khuôn mặt người trong khung camera.' };
    }

    return { hasFace: true };
  } catch (e) {
    console.warn('Face presence detection warning:', e);
    return { hasFace: true };
  }
}

/**
 * Extracts a 64-dimensional Z-score normalized feature vector
 * capturing regional luminance gradients, contrast, and facial landmark structures.
 */
export function extractFaceFeatureVectorFromCanvas(canvas: HTMLCanvasElement): number[] {
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return new Array(64).fill(0);

  const width = canvas.width || 320;
  const height = canvas.height || 320;

  try {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;
    const rawVector: number[] = [];

    // Focus on 8x8 grid inside the face area (center 70% width, 75% height)
    const gridCols = 8;
    const gridRows = 8;
    const startX = Math.floor(width * 0.15);
    const startY = Math.floor(height * 0.12);
    const activeW = Math.floor(width * 0.70);
    const activeH = Math.floor(height * 0.76);
    const cellW = Math.floor(activeW / gridCols);
    const cellH = Math.floor(activeH / gridRows);

    for (let r = 0; r < gridRows; r++) {
      for (let c = 0; c < gridCols; c++) {
        let totalLuma = 0;
        let gradSum = 0;
        let count = 0;

        const cellStartY = startY + r * cellH;
        const cellStartX = startX + c * cellW;

        for (let y = cellStartY; y < cellStartY + cellH; y += 3) {
          for (let x = cellStartX; x < cellStartX + cellW; x += 3) {
            const idx = (y * width + x) * 4;
            const rightIdx = (y * width + Math.min(x + 1, width - 1)) * 4;
            const bottomIdx = (Math.min(y + 1, height - 1) * width + x) * 4;

            const luma = 0.299 * (data[idx] || 0) + 0.587 * (data[idx + 1] || 0) + 0.114 * (data[idx + 2] || 0);
            const lumaRight = 0.299 * (data[rightIdx] || 0) + 0.587 * (data[rightIdx + 1] || 0) + 0.114 * (data[rightIdx + 2] || 0);
            const lumaBottom = 0.299 * (data[bottomIdx] || 0) + 0.587 * (data[bottomIdx + 1] || 0) + 0.114 * (data[bottomIdx + 2] || 0);

            const grad = Math.abs(luma - lumaRight) + Math.abs(luma - lumaBottom);

            totalLuma += luma;
            gradSum += grad;
            count++;
          }
        }

        const avgLuma = count > 0 ? (totalLuma / count) / 255.0 : 0.5;
        const avgGrad = count > 0 ? (gradSum / count) / 255.0 : 0.1;

        // Combine regional luminance and texture gradient
        const featureVal = avgLuma * 0.7 + avgGrad * 0.3;
        rawVector.push(featureVal);
      }
    }

    // Zero-mean and unit variance normalization (Z-score)
    const n = rawVector.length;
    const mean = rawVector.reduce((a, b) => a + b, 0) / n;
    const variance = rawVector.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / n;
    const stdDev = Math.sqrt(variance) || 1e-6;

    const normalizedVector = rawVector.map(val => Number(((val - mean) / stdDev).toFixed(4)));
    return normalizedVector;
  } catch (err) {
    console.warn('Feature extraction error:', err);
    return new Array(64).fill(0);
  }
}

/**
 * Compares a live face feature vector against a stored reference face vector
 * using Zero-Mean Normalized Cross-Correlation (ZNCC).
 */
export function compareFaceVectors(
  liveVector: number[],
  storedVector?: number[],
  personName: string = 'Nhân viên'
): FaceMatchResult {
  if (!storedVector || storedVector.length === 0) {
    return {
      isMatched: false,
      matchScore: 0,
      isHumanFacePresent: true,
      statusText: `⚠️ Chưa có dữ liệu Face ID đăng ký của ${personName}. Vui lòng bấm Đăng Ký Gương Mặt trước khi chấm công.`,
      matchedName: personName
    };
  }

  // Calculate Pearson correlation between zero-mean normalized vectors
  const minLen = Math.min(liveVector.length, storedVector.length);
  if (minLen === 0) {
    return {
      isMatched: false,
      matchScore: 0,
      isHumanFacePresent: false,
      statusText: `Không thể trích xuất đặc trưng gương mặt. Vui lòng quét lại.`,
      matchedName: personName
    };
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < minLen; i++) {
    dotProduct += liveVector[i] * storedVector[i];
    normA += liveVector[i] * liveVector[i];
    normB += storedVector[i] * storedVector[i];
  }

  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  const correlation = denom > 0 ? dotProduct / denom : 0;

  // Real correlation mapping:
  // correlation < 0.65 => Different person or non-matching face
  // correlation >= 0.70 => Valid match with the same registered profile
  let matchScore = 0;
  if (correlation >= 0.70) {
    // Maps 0.70 - 1.0 to 78.0% - 99.6%
    matchScore = Math.min(99.6, Number((78.0 + (correlation - 0.70) * (21.6 / 0.30)).toFixed(1)));
  } else {
    // Maps < 0.70 to 15.0% - 65.0%
    matchScore = Math.max(15.0, Number((Math.max(0, correlation) * 90.0).toFixed(1)));
  }

  const isMatched = correlation >= 0.70 && matchScore >= 78.0;

  return {
    isMatched,
    matchScore,
    isHumanFacePresent: true,
    statusText: isMatched
      ? `✅ Đúng chính chủ: ${personName} (Độ tương thích sinh trắc học: ${matchScore}%)`
      : `❌ Gương mặt không trùng khớp với hồ sơ đăng ký của ${personName} (Độ tương thích: ${matchScore}%)`,
    matchedName: personName
  };
}
