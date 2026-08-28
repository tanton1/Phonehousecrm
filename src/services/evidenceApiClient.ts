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
export async function uploadEvidenceRecordViaServer(input: {
  resourceType: EvidenceResourceType;
  resourceId: string;
  contextId?: string;
  branchId?: string;
  file: File;
}): Promise<UploadedEvidenceRecord> {
  const session = await evidenceRequest<{ sessionId: string; uploadUrl: string; headers: Record<string, string> }>('upload-sessions', {
    method: 'POST',
    body: JSON.stringify({
      resourceType: input.resourceType,
      resourceId: input.resourceId,
      contextId: input.contextId,
      branchId: input.branchId,
      contentType: input.file.type || 'image/jpeg',
      size: input.file.size
    })
  });
  const upload = await fetch(session.uploadUrl, { method: 'PUT', headers: session.headers, body: input.file });
  if (!upload.ok) throw new Error(`EVIDENCE_UPLOAD_FAILED_${upload.status}`);
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
