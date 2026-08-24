import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebase';

const MAX_CRM_EVIDENCE_BYTES = 8 * 1024 * 1024;

function safeName(name: string) {
  return name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^A-Za-z0-9._-]/g, '_').slice(-100);
}

export async function uploadCrmEvidence(leadId: string, file: File): Promise<string> {
  if (!leadId) throw new Error('CRM_EVIDENCE_LEAD_REQUIRED');
  if (!file.type.startsWith('image/')) throw new Error('CRM_EVIDENCE_IMAGE_ONLY: Chỉ hỗ trợ ảnh bằng chứng.');
  if (file.size <= 0 || file.size > MAX_CRM_EVIDENCE_BYTES) throw new Error('CRM_EVIDENCE_FILE_TOO_LARGE: Ảnh tối đa 8MB.');
  const objectRef = ref(storage, `crm-evidence/${leadId}/${Date.now()}_${safeName(file.name || 'evidence.jpg')}`);
  await uploadBytes(objectRef, file, {
    contentType: file.type,
    customMetadata: { leadId }
  });
  return getDownloadURL(objectRef);
}

