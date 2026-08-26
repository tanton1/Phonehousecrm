import { uploadEvidenceViaServer } from './evidenceApiClient';

// Mobile cameras frequently create HEIC files and may omit File.type.  Keep
// the picker permissive for known image extensions, then explicitly supply a
// correct content type to Storage so its rules can validate the upload.
export const MAX_TECHNICAL_EVIDENCE_BYTES = 20 * 1024 * 1024;

const extensionMimeTypes: Record<string, string> = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  heic: 'image/heic', heif: 'image/heif', gif: 'image/gif', avif: 'image/avif'
};

function fileExtension(file: File): string {
  const name = String(file.name || '');
  return name.includes('.') ? name.split('.').pop()!.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 8) : '';
}

export function technicalImageContentType(file: File): string | null {
  const mime = String(file.type || '').trim().toLowerCase();
  if (mime.startsWith('image/')) return mime;
  return extensionMimeTypes[fileExtension(file)] || null;
}

export function isTechnicalImageFile(file: File): boolean {
  return Boolean(technicalImageContentType(file));
}

export async function uploadTechnicalEvidence(workOrderId: string, lineId: string, files: File[], branchId?: string): Promise<string[]> {
  if (files.length === 0) return [];
  if (files.length > 8) throw new Error('Mỗi lần chỉ được tải tối đa 8 ảnh bằng chứng.');
  const uploaded: string[] = [];
  for (const file of files) {
    const contentType = technicalImageContentType(file);
    if (!contentType) throw new Error(`Tệp "${file.name || 'đã chọn'}" không phải hình ảnh được hỗ trợ.`);
    if (file.size > MAX_TECHNICAL_EVIDENCE_BYTES) throw new Error(`Ảnh "${file.name || 'đã chọn'}" vượt quá 20MB.`);
    try {
      uploaded.push(await uploadEvidenceViaServer({ resourceType: 'TECHNICAL', resourceId: workOrderId, contextId: lineId, branchId, file }));
    } catch (cause: any) {
      const code = String(cause?.code || '');
      if (code.includes('unauthorized')) throw new Error('Không có quyền tải ảnh. Hãy đăng nhập lại rồi thử lại.');
      if (code.includes('retry-limit-exceeded')) throw new Error('Kết nối tải ảnh bị gián đoạn. Hãy kiểm tra mạng và thử lại.');
      throw new Error(`Không thể tải ảnh "${file.name || 'đã chọn'}". Bạn vẫn có thể tiếp tục không kèm ảnh.`);
    }
  }
  return uploaded;
}
