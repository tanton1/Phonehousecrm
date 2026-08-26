import { Firestore } from 'firebase-admin/firestore';

export interface VerifyBiometricParams {
  staffUid: string;
  liveEmbedding?: number[];
  liveCaptureBase64?: string;
  threshold?: number; // Defaults to 0.85 (85% cosine similarity)
}

export interface BiometricVerificationResult {
  verified: boolean;
  similarity?: number;
  score?: number;
  reason?: string;
  enrolledAt?: string;
  approvedAt?: string;
}

/**
 * Calculates Cosine Similarity between two face embedding vectors
 */
export function cosineSimilarity(vecA: number[], vecB: number[]): number {
  if (!vecA || !vecB || vecA.length === 0 || vecB.length === 0 || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Authoritative Biometric Face Verification against staffFaceProfiles/{staffUid}
 * - Single source of truth (Eliminated legacy staff doc fallback)
 * - Requires enrollmentStatus === 'APPROVED' and revokedAt == null
 */
export async function verifyFaceBiometric(
  db: Firestore | null,
  params: VerifyBiometricParams
): Promise<BiometricVerificationResult> {
  const { staffUid } = params;

  if (!staffUid) {
    return { verified: false, reason: 'MISSING_STAFF_UID' };
  }

  if (!db) return { verified: false, reason: 'BIOMETRIC_SUPPLEMENTARY_ONLY' };

  try {
    const profileDoc = await db.collection('staffFaceProfiles').doc(staffUid).get();
    if (!profileDoc.exists) {
      return { verified: false, reason: 'PROFILE_NOT_ENROLLED: Nhân viên chưa đăng ký hồ sơ khuôn mặt.' };
    }

    const pData = profileDoc.data()!;

    // Check approval & revocation
    if (pData.enrollmentStatus !== 'APPROVED') {
      return { 
        verified: false, 
        reason: `PROFILE_PENDING_APPROVAL: Hồ sơ khuôn mặt đang ở trạng thái "${pData.enrollmentStatus || 'PENDING'}", chưa được Quản lý phê duyệt.` 
      };
    }

    if (pData.revokedAt) {
      return { verified: false, reason: `PROFILE_REVOKED: Hồ sơ khuôn mặt đã bị thu hồi vào ngày ${pData.revokedAt}.` };
    }

    return {
      verified: false,
      reason: 'BIOMETRIC_SUPPLEMENTARY_ONLY: Ảnh khuôn mặt chỉ được lưu làm bằng chứng để quản lý đối chiếu.',
      enrolledAt: pData.enrolledAt,
      approvedAt: pData.approvedAt
    };
  } catch (err: any) {
    console.error('[Biometric Verification Error]:', err);
    return { verified: false, reason: err.message || 'Lỗi kiểm tra sinh trắc học.' };
  }
}
