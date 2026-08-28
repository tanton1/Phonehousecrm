import { auth } from '../lib/firebase';

type EvidenceResourceType = 'CRM' | 'TECHNICAL' | 'ATTENDANCE';

export interface UploadedEvidenceRecord {
  id: string;
  url: string;
  resourceType: EvidenceResourceType;
  resourceId: string;
  branchId: string;
  contentType: string;
  size: number;
  createdAt: string;
}

async function evidenceRequest<T>(path: string, init: RequestInit): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('UNAUTHENTICATED: Vui lòng đăng nhập lại.');
  const token = await user.getIdToken(false);
  const response = await fetch(`/api/evidence/${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}`, ...(init.headers || {}) }
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) throw new Error(result.message || result.code || 'EVIDENCE_API_FAILED');
  return result.data as T;
}

const SAME_ORIGIN_UPLOAD_LIMIT = 3 * 1024 * 1024;
const ATTENDANCE_INLINE_UPLOAD_LIMIT = 400 * 1024;

async function compressEvidenceImage(file: File, maxBytes = SAME_ORIGIN_UPLOAD_LIMIT): Promise<File> {
  if (file.size <= maxBytes) return file;

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('CHECKIN_PHOTO_DECODE_FAILED: Không đọc được ảnh. Hãy chụp lại bằng camera.'));
      element.src = objectUrl;
    });

    const attempts = [
      { maxDimension: 2_048, quality: 0.82 },
      { maxDimension: 1_600, quality: 0.72 },
      { maxDimension: 1_280, quality: 0.64 },
      { maxDimension: 1_024, quality: 0.56 },
      { maxDimension: 800, quality: 0.5 }
    ];

    for (const attempt of attempts) {
      const scale = Math.min(1, attempt.maxDimension / Math.max(image.naturalWidth, image.naturalHeight));
      const width = Math.max(1, Math.round(image.naturalWidth * scale));
      const height = Math.max(1, Math.round(image.naturalHeight * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('CHECKIN_PHOTO_PROCESS_FAILED: Không thể xử lý ảnh trên thiết bị này.');
      context.drawImage(image, 0, 0, width, height);
      const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', attempt.quality));
      if (blob && blob.size <= maxBytes) {
        return new File([blob], `${file.name.replace(/\.[^.]+$/, '') || 'evidence'}.jpg`, {
          type: 'image/jpeg',
          lastModified: Date.now()
        });
      }
    }
  } finally {
    URL.revokeObjectURL(objectUrl);
  }

  throw new Error('CHECKIN_PHOTO_TOO_LARGE: Ảnh vẫn quá lớn sau khi tối ưu. Hãy chụp lại ở chất lượng thường.');
}

async function uploadEvidenceContent(sessionId: string, uploadUrl: string, file: File): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('UNAUTHENTICATED: Vui lòng đăng nhập lại.');
  const token = await user.getIdToken(false);
  let response: Response;
  try {
    response = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': file.type || 'image/jpeg',
        Authorization: `Bearer ${token}`
      },
      body: file
    });
  } catch {
    throw new Error('EVIDENCE_UPLOAD_NETWORK_FAILED: Không tải được ảnh lên máy chủ. Hãy kiểm tra mạng và thử lại.');
  }
  const result = await response.json().catch(() => ({}));
  if (!response.ok || !result.success) {
    throw new Error(result.message || result.code || `EVIDENCE_UPLOAD_FAILED_${response.status}`);
  }
  if (String(result.data?.sessionId || sessionId) !== sessionId) {
    throw new Error('EVIDENCE_UPLOAD_SESSION_MISMATCH');
  }
}

export async function uploadEvidenceRecordViaServer(input: {
  resourceType: EvidenceResourceType;
  resourceId: string;
  contextId?: string;
  branchId?: string;
  file: File;
}): Promise<UploadedEvidenceRecord> {
  const preparedFile = await compressEvidenceImage(
    input.file,
    input.resourceType === 'ATTENDANCE' ? ATTENDANCE_INLINE_UPLOAD_LIMIT : SAME_ORIGIN_UPLOAD_LIMIT
  );
  const session = await evidenceRequest<{ sessionId: string; uploadUrl: string; contentUploadUrl?: string; headers: Record<string, string> }>('upload-sessions', {
    method: 'POST',
    body: JSON.stringify({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      contextId: input.contextId,
      branchId: input.branchId,
      contentType: preparedFile.type || 'image/jpeg',
      size: preparedFile.size
    })
  });
  const sameOriginUrl = session.contentUploadUrl || `/api/evidence/upload-sessions/${encodeURIComponent(session.sessionId)}/content`;
  await uploadEvidenceContent(session.sessionId, sameOriginUrl, preparedFile);
  return evidenceRequest<UploadedEvidenceRecord>(`upload-sessions/${encodeURIComponent(session.sessionId)}/complete`, { method: 'POST', body: '{}' });
}

export async function uploadEvidenceViaServer(input: {
  resourceType: EvidenceResourceType;
  resourceId: string;
  contextId?: string;
  branchId?: string;
  file: File;
}): Promise<string> {
  const record = await uploadEvidenceRecordViaServer(input);
  return record.url;
}
