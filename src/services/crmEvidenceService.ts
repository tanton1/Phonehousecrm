import { uploadEvidenceViaServer } from './evidenceApiClient';

const MAX_CRM_EVIDENCE_BYTES = 8 * 1024 * 1024;

export async function uploadCrmEvidence(leadId: string, file: File): Promise<string> {
  if (!leadId) throw new Error('CRM_EVIDENCE_LEAD_REQUIRED');
  if (!file.type.startsWith('image/')) throw new Error('CRM_EVIDENCE_IMAGE_ONLY: Chỉ hỗ trợ ảnh bằng chứng.');
  if (file.size <= 0 || file.size > MAX_CRM_EVIDENCE_BYTES) throw new Error('CRM_EVIDENCE_FILE_TOO_LARGE: Ảnh tối đa 8MB.');
  return uploadEvidenceViaServer({ resourceType: 'CRM', resourceId: leadId, contextId: 'CARE_ACTIVITY', file });
}
