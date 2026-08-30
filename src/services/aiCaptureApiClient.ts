import { apiJson } from './apiClient';

export type AiCaptureSourceType = 'SALES_SLIP' | 'CONVERSATION' | 'PURCHASE_RECEIPT' | 'REPAIR_INTAKE';

export interface SalesSlipExtraction {
  sourceType: 'SALES_SLIP';
  confidence: number;
  fieldsToReview: string[];
  transcript: string;
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

export interface PurchaseReceiptExtraction {
  sourceType: 'PURCHASE_RECEIPT';
  confidence: number;
  fieldsToReview: string[];
  transcript: string;
  supplier: { name: string; phone: string; taxCode: string };
  documentCode: string | null;
  purchaseDate: string | null;
  paymentMethod: string | null;
  discountAmount: number | null;
  totalAmount: number | null;
  notes: string;
  items: SalesSlipExtraction['items'];
}

export interface RepairIntakeExtraction {
  sourceType: 'REPAIR_INTAKE';
  confidence: number;
  fieldsToReview: string[];
  transcript: string;
  customer: { name: string; phone: string };
  imei: string | null;
  model: string;
  issueType: string;
  faultDescription: string;
  deviceAppearance: string;
  accessoriesIncluded: string;
  estimatedCost: number | null;
  expectedReturnDate: string | null;
  notes: string;
}

export type AiCaptureExtraction = SalesSlipExtraction | ConversationExtraction | PurchaseReceiptExtraction | RepairIntakeExtraction;

export interface AiCaptureStatus {
  configured: boolean;
  provider: 'GOOGLE_GEMINI' | 'OPENAI_COMPATIBLE';
  model: string;
  source: 'SHARED_DATABASE' | 'ENVIRONMENT';
}

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
  aiConfiguration: AiCaptureStatus['source'];
  aiProvider: AiCaptureStatus['provider'];
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
  const supported = sourceType === 'CONVERSATION'
    ? file.type.startsWith('audio/')
    : file.type.startsWith('image/') || file.type.startsWith('audio/');
  if (!supported) throw new Error(sourceType === 'CONVERSATION' ? 'Vui lòng chọn tệp ghi âm.' : 'Vui lòng chọn ảnh hoặc tệp ghi âm.');
  const data = await readAsBase64(file);
  const response = await apiJson<{ success: boolean; data: AiCaptureResult }>('/api/ai/capture/extract', {
    method: 'POST',
    body: JSON.stringify({ sourceType, mimeType: file.type, data }),
    timeoutMs: file.type.startsWith('audio/') ? 180_000 : 90_000
  });
  if (!response?.success || !response.data) throw new Error('AI_CAPTURE_FAILED');
  return response.data;
}

export async function getAiCaptureStatus(): Promise<AiCaptureStatus> {
  const response = await apiJson<{ success: boolean; data: AiCaptureStatus }>('/api/ai/capture/status', { timeoutMs: 15_000 });
  if (!response?.success || !response.data) throw new Error('Không thể kiểm tra cấu hình AI dùng chung.');
  return response.data;
}

export async function reExtractAiCaptureDraft(draftId: string, transcript: string): Promise<AiCaptureExtraction> {
  const response = await apiJson<{ success: boolean; data: { extraction: AiCaptureExtraction } }>(`/api/ai/capture/drafts/${encodeURIComponent(draftId)}/re-extract`, {
    method: 'POST',
    body: JSON.stringify({ transcript }),
    timeoutMs: 90_000
  });
  if (!response?.success || !response.data?.extraction) throw new Error('Không thể ánh xạ lại dữ liệu từ bản chép lời.');
  return response.data.extraction;
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

export async function createLeadFromAiCaptureDraft(draftId: string): Promise<{ leadId: string; idempotentReplay?: boolean }> {
  const response = await apiJson<{ success: boolean; data: { leadId: string; idempotentReplay?: boolean } }>(`/api/ai/capture/drafts/${encodeURIComponent(draftId)}/create-lead`, {
    method: 'POST',
    body: JSON.stringify({}),
    timeoutMs: 20_000
  });
  if (!response?.success || !response.data) throw new Error('AI_CAPTURE_CREATE_LEAD_FAILED');
  return response.data;
}
