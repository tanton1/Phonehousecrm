import { apiJson } from './apiClient';

export type AiCaptureSourceType = 'SALES_SLIP' | 'CONVERSATION';

export interface SalesSlipExtraction {
  sourceType: 'SALES_SLIP';
  confidence: number;
  fieldsToReview: string[];
  customer: { name: string; phone: string };
  saleDate: string | null;
  paymentMethod: string | null;
  discountAmount: number | null;
  totalAmount: number | null;
  notes: string;
  items: Array<{
    name: string;
    sku: string | null;
    imei: string | null;
    quantity: number;
    unitPrice: number | null;
    totalPrice: number | null;
    confidence: number;
  }>;
}

export interface ConversationExtraction {
  sourceType: 'CONVERSATION';
  confidence: number;
  fieldsToReview: string[];
  transcript: string;
  summary: string;
  customer: { name: string; phone: string };
  interestedModel: string | null;
  budget: number | null;
  depositAmount: number | null;
  appointmentAt: string | null;
  nextActions: string[];
}

export type AiCaptureExtraction = SalesSlipExtraction | ConversationExtraction;

export interface AiCaptureResult {
  draftId: string;
  sha256: string;
  objectPath: string | null;
  storageSaved: boolean;
  sourceType: AiCaptureSourceType;
  mimeType: string;
  extraction: AiCaptureExtraction;
  reviewRequired: true;
  aiModel: string;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Không thể đọc tệp trên thiết bị.'));
    reader.onload = () => {
      const value = String(reader.result || '');
      const comma = value.indexOf(',');
      resolve(comma >= 0 ? value.slice(comma + 1) : value);
    };
    reader.readAsDataURL(file);
  });
}

export async function requestAiCapture(file: File, sourceType: AiCaptureSourceType): Promise<AiCaptureResult> {
  const maxBytes = 3 * 1024 * 1024;
  if (!file.size || file.size > maxBytes) {
    throw new Error(`Tệp vượt giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB.`);
  }
  const supported = sourceType === 'SALES_SLIP' ? file.type.startsWith('image/') : file.type.startsWith('audio/');
  if (!supported) throw new Error(sourceType === 'SALES_SLIP' ? 'Vui lòng chọn tệp ảnh.' : 'Vui lòng chọn tệp ghi âm.');
  const data = await readAsBase64(file);
  const response = await apiJson<{ success: boolean; data: AiCaptureResult }>('/api/ai/capture/extract', {
    method: 'POST',
    body: JSON.stringify({ sourceType, mimeType: file.type, data }),
    timeoutMs: 90_000
  });
  if (!response?.success || !response.data) throw new Error('AI_CAPTURE_FAILED');
  return response.data;
}

export async function confirmAiCaptureDraft(draftId: string, extraction?: AiCaptureExtraction): Promise<{ draftId: string; status: string; idempotentReplay?: boolean }> {
  const response = await apiJson<{ success: boolean; data: { draftId: string; status: string; idempotentReplay?: boolean } }>(`/api/ai/capture/drafts/${encodeURIComponent(draftId)}/confirm`, {
    method: 'POST',
    body: JSON.stringify({ extraction }),
    timeoutMs: 15_000
  });
  if (!response?.success || !response.data) throw new Error('AI_CAPTURE_CONFIRM_FAILED');
  return response.data;
}
