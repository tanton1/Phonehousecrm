import { getDownloadURL, ref, uploadBytes } from 'firebase/storage';
import { storage } from '../lib/firebase';

const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;

function safeSegment(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
}

export async function uploadTechnicalEvidence(workOrderId: string, lineId: string, files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  if (files.length > 8) throw new Error('Mỗi lần chỉ được tải tối đa 8 ảnh bằng chứng.');
  const uploaded: string[] = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) throw new Error(`Tệp "${file.name}" không phải hình ảnh.`);
    if (file.size > MAX_EVIDENCE_BYTES) throw new Error(`Ảnh "${file.name}" vượt quá 10MB.`);
    const extension = file.name.includes('.') ? file.name.split('.').pop()!.replace(/[^A-Za-z0-9]/g, '').slice(0, 8) : 'jpg';
    const objectId = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    const objectRef = ref(storage, `technical-evidence/${safeSegment(workOrderId)}/${safeSegment(lineId)}/${safeSegment(objectId)}.${extension}`);
    await uploadBytes(objectRef, file, { contentType: file.type, customMetadata: { workOrderId, lineId } });
    uploaded.push(await getDownloadURL(objectRef));
  }
  return uploaded;
}
