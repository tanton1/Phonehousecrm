import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';
import { FieldValue, Firestore } from 'firebase-admin/firestore';
import { adminBucket } from '../firebaseAdmin';
import { authenticateFirebase } from '../middleware/authenticateFirebase';
import { requireRole } from '../middleware/requireRole';
import { createRateLimit } from '../middleware/security';
import { processCreateCrmLead } from '../services/crmOperationsService';
import { loadTelegramConfig } from '../services/telegramService';
import { isOpenAiCompatible, resolveBaseUrl } from '../services/telegramAiAssistant';

export type AiCaptureSourceType = 'SALES_SLIP' | 'CONVERSATION' | 'PURCHASE_RECEIPT' | 'REPAIR_INTAKE';

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

export interface PurchaseReceiptExtraction {
  sourceType: 'PURCHASE_RECEIPT'; confidence: number; fieldsToReview: string[];
  supplier: { name: string; phone: string; taxCode: string };
  documentCode: string | null; purchaseDate: string | null; paymentMethod: string | null;
  discountAmount: number | null; totalAmount: number | null; notes: string;
  items: SalesSlipExtraction['items'];
}

export interface RepairIntakeExtraction {
  sourceType: 'REPAIR_INTAKE'; confidence: number; fieldsToReview: string[];
  transcript: string; customer: { name: string; phone: string };
  imei: string | null; model: string; issueType: string; faultDescription: string;
  deviceAppearance: string; accessoriesIncluded: string; estimatedCost: number | null;
  expectedReturnDate: string | null; notes: string;
}

export type AiCaptureExtraction = SalesSlipExtraction | ConversationExtraction | PurchaseReceiptExtraction | RepairIntakeExtraction;

const MAX_IMAGE_BYTES = 3 * 1024 * 1024;
// Keep the base64 request below common serverless request limits (roughly
// 4.5 MB after encoding) while still covering normal short voice notes.
const MAX_AUDIO_BYTES = 3 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARS = 20_000;
const DEFAULT_CAPTURE_MODEL = String(process.env.GEMINI_CAPTURE_MODEL || process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim();
const IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const AUDIO_MIME_TYPES = ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/x-wav', 'audio/ogg', 'audio/webm', 'audio/mp4', 'audio/aac', 'audio/x-m4a'];

const ALLOWED_MIME: Record<AiCaptureSourceType, string[]> = {
  SALES_SLIP: [...IMAGE_MIME_TYPES, ...AUDIO_MIME_TYPES],
  CONVERSATION: AUDIO_MIME_TYPES,
  PURCHASE_RECEIPT: [...IMAGE_MIME_TYPES, ...AUDIO_MIME_TYPES],
  REPAIR_INTAKE: [...IMAGE_MIME_TYPES, ...AUDIO_MIME_TYPES]
};

const captureRateLimit = createRateLimit({ prefix: 'ai-capture', windowMs: 60_000, maxRequests: 12 });

type CaptureAiProvider = 'GOOGLE_GEMINI' | 'OPENAI_COMPATIBLE';
type CaptureAiConfigurationSource = 'SHARED_DATABASE' | 'ENVIRONMENT';

export function selectCaptureAiConfig(
  shared: { geminiApiKey?: string; geminiBaseUrl?: string; aiModel?: string; source?: string } | null,
  environment: NodeJS.ProcessEnv = process.env
) {
  const apiKey = String(shared?.geminiApiKey || environment.GEMINI_API_KEY || '').trim();
  const baseUrl = String(shared?.geminiBaseUrl || environment.GEMINI_BASE_URL || '').trim();
  const model = String(environment.GEMINI_CAPTURE_MODEL || shared?.aiModel || environment.GEMINI_MODEL || DEFAULT_CAPTURE_MODEL).trim();
  const source: CaptureAiConfigurationSource = shared?.source === 'DATABASE' && Boolean(shared.geminiApiKey)
    ? 'SHARED_DATABASE'
    : 'ENVIRONMENT';
  const provider: CaptureAiProvider = isOpenAiCompatible(apiKey, baseUrl) ? 'OPENAI_COMPATIBLE' : 'GOOGLE_GEMINI';
  return { apiKey, baseUrl, model, source, provider };
}

async function resolveSharedAiConfig(db: Firestore | null) {
  const shared = await loadTelegramConfig(db).catch(error => {
    console.warn('[AI Capture] Shared AI configuration could not be loaded; using environment fallback:', error instanceof Error ? error.message : error);
    return null;
  });
  return selectCaptureAiConfig(shared);
}

function stripJsonFence(value: string): string {
  const trimmed = String(value || '').trim();
  if (!trimmed.startsWith('```')) return trimmed;
  return trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
}

export function parseAiCaptureJson<T>(value: string, fallback: T): T {
  try {
    const parsed = JSON.parse(stripJsonFence(value));
    return parsed as T;
  } catch {
    return fallback;
  }
}

function cleanText(value: unknown, max = 500): string {
  return String(value || '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, max);
}

function cleanPhone(value: unknown): string {
  return cleanText(value, 40).replace(/[^\d+(). -]/g, '').slice(0, 25);
}

function safeMoney(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(String(value).replace(/[^\d-]/g, ''));
  return Number.isSafeInteger(numeric) && numeric >= 0 && numeric <= 100_000_000_000 ? numeric : null;
}

function safeConfidence(value: unknown): number {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? Math.max(0, Math.min(1, numeric > 1 ? numeric / 100 : numeric)) : 0;
}

export function normalizeSalesSlipExtraction(input: unknown): SalesSlipExtraction {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const rawItems = Array.isArray(source.items) ? source.items : [];
  const items = rawItems.slice(0, 100).map((item: any) => ({
    name: cleanText(item?.name || item?.model, 180),
    sku: cleanText(item?.sku, 100) || null,
    imei: cleanText(item?.imei, 40).replace(/[^\d]/g, '').slice(0, 20) || null,
    quantity: Number.isSafeInteger(Number(item?.quantity)) && Number(item.quantity) > 0 ? Math.min(100, Number(item.quantity)) : 1,
    unitPrice: safeMoney(item?.unitPrice ?? item?.price),
    totalPrice: safeMoney(item?.totalPrice ?? item?.lineTotal),
    confidence: safeConfidence(item?.confidence)
  })).filter(item => item.name || item.imei || item.sku);
  return {
    sourceType: 'SALES_SLIP',
    confidence: safeConfidence(source.confidence),
    fieldsToReview: Array.isArray(source.fieldsToReview) ? source.fieldsToReview.map(value => cleanText(value, 120)).filter(Boolean).slice(0, 20) : [],
    customer: {
      name: cleanText(source.customer?.name || source.customerName, 160),
      phone: cleanPhone(source.customer?.phone || source.customerPhone)
    },
    saleDate: cleanText(source.saleDate || source.date, 40) || null,
    paymentMethod: cleanText(source.paymentMethod, 100) || null,
    discountAmount: safeMoney(source.discountAmount),
    totalAmount: safeMoney(source.totalAmount || source.grandTotal),
    notes: cleanText(source.notes, 2_000),
    items
  };
}

export function normalizeConversationExtraction(input: unknown): ConversationExtraction {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const actions = Array.isArray(source.nextActions) ? source.nextActions : [];
  return {
    sourceType: 'CONVERSATION',
    confidence: safeConfidence(source.confidence),
    fieldsToReview: Array.isArray(source.fieldsToReview) ? source.fieldsToReview.map(value => cleanText(value, 120)).filter(Boolean).slice(0, 20) : [],
    transcript: cleanText(source.transcript, MAX_TRANSCRIPT_CHARS),
    summary: cleanText(source.summary, 2_000),
    customer: {
      name: cleanText(source.customer?.name || source.customerName, 160),
      phone: cleanPhone(source.customer?.phone || source.customerPhone)
    },
    interestedModel: cleanText(source.interestedModel || source.model, 180) || null,
    budget: safeMoney(source.budget),
    depositAmount: safeMoney(source.depositAmount || source.deposit),
    appointmentAt: cleanText(source.appointmentAt, 80) || null,
    nextActions: actions.map(value => cleanText(value, 300)).filter(Boolean).slice(0, 20)
  };
}

export function normalizePurchaseReceiptExtraction(input: unknown): PurchaseReceiptExtraction {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  const salesLines = normalizeSalesSlipExtraction({ items: source.items });
  return {
    sourceType: 'PURCHASE_RECEIPT', confidence: safeConfidence(source.confidence),
    fieldsToReview: Array.isArray(source.fieldsToReview) ? source.fieldsToReview.map(value => cleanText(value, 120)).filter(Boolean).slice(0, 20) : [],
    supplier: { name: cleanText(source.supplier?.name || source.supplierName, 180), phone: cleanPhone(source.supplier?.phone), taxCode: cleanText(source.supplier?.taxCode || source.taxCode, 30) },
    documentCode: cleanText(source.documentCode || source.invoiceCode, 100) || null,
    purchaseDate: cleanText(source.purchaseDate || source.date, 40) || null,
    paymentMethod: cleanText(source.paymentMethod, 100) || null,
    discountAmount: safeMoney(source.discountAmount), totalAmount: safeMoney(source.totalAmount || source.grandTotal),
    notes: cleanText(source.notes, 2_000), items: salesLines.items
  };
}

export function normalizeRepairIntakeExtraction(input: unknown): RepairIntakeExtraction {
  const source = (input && typeof input === 'object' ? input : {}) as Record<string, any>;
  return {
    sourceType: 'REPAIR_INTAKE', confidence: safeConfidence(source.confidence),
    fieldsToReview: Array.isArray(source.fieldsToReview) ? source.fieldsToReview.map(value => cleanText(value, 120)).filter(Boolean).slice(0, 20) : [],
    transcript: cleanText(source.transcript, MAX_TRANSCRIPT_CHARS),
    customer: { name: cleanText(source.customer?.name || source.customerName, 160), phone: cleanPhone(source.customer?.phone || source.customerPhone) },
    imei: cleanText(source.imei, 40).replace(/\D/g, '').slice(0, 20) || null,
    model: cleanText(source.model, 180), issueType: cleanText(source.issueType, 100) || 'Khác',
    faultDescription: cleanText(source.faultDescription || source.issueDescription, 3_000),
    deviceAppearance: cleanText(source.deviceAppearance, 1_000), accessoriesIncluded: cleanText(source.accessoriesIncluded, 1_000),
    estimatedCost: safeMoney(source.estimatedCost), expectedReturnDate: cleanText(source.expectedReturnDate, 80) || null,
    notes: cleanText(source.notes, 2_000)
  };
}

function defaultSalesSlip(): SalesSlipExtraction {
  return normalizeSalesSlipExtraction({ fieldsToReview: ['Không đọc được nội dung phiếu'], confidence: 0 });
}

function defaultConversation(): ConversationExtraction {
  return normalizeConversationExtraction({ fieldsToReview: ['Không chép được nội dung ghi âm'], confidence: 0 });
}

function defaultPurchaseReceipt(): PurchaseReceiptExtraction {
  return normalizePurchaseReceiptExtraction({ fieldsToReview: ['Không đọc được phiếu nhập hàng'], confidence: 0 });
}

function defaultRepairIntake(): RepairIntakeExtraction {
  return normalizeRepairIntakeExtraction({ fieldsToReview: ['Không nhận dạng được thông tin tiếp nhận sửa chữa'], confidence: 0 });
}

function extractionPrompt(sourceType: AiCaptureSourceType): string {
  if (sourceType === 'SALES_SLIP') {
    return `Bạn là bộ máy nhập liệu phiếu bán hàng PhoneHouse. File có thể là ảnh phiếu hoặc ghi âm nhân viên đọc thông tin bán hàng. Chỉ trả về JSON hợp lệ, không markdown, theo đúng cấu trúc:
{"sourceType":"SALES_SLIP","confidence":0.0,"fieldsToReview":[],"customer":{"name":"","phone":""},"saleDate":null,"paymentMethod":null,"discountAmount":null,"totalAmount":null,"notes":"","items":[{"name":"","sku":null,"imei":null,"quantity":1,"unitPrice":null,"totalPrice":null,"confidence":0.0}]}
Quy tắc: số tiền là số nguyên VNĐ; không đoán dữ liệu bị mờ; thêm tên trường vào fieldsToReview khi không chắc; chuẩn hóa IMEI chỉ gồm số; confidence từ 0 đến 1.`;
  }
  if (sourceType === 'CONVERSATION') return `Bạn là bộ máy nhập liệu hội thoại bán hàng PhoneHouse. Nghe audio tiếng Việt và chỉ trả về JSON hợp lệ, không markdown, theo đúng cấu trúc:
{"sourceType":"CONVERSATION","confidence":0.0,"fieldsToReview":[],"transcript":"","summary":"","customer":{"name":"","phone":""},"interestedModel":null,"budget":null,"depositAmount":null,"appointmentAt":null,"nextActions":[]}
Quy tắc: chép đúng lời nói, không bịa; số tiền là số nguyên VNĐ; nếu không nghe rõ hoặc thiếu dữ liệu thì để rỗng/null và thêm fieldsToReview; confidence từ 0 đến 1.`;
  if (sourceType === 'PURCHASE_RECEIPT') return `Bạn là bộ máy nhập liệu phiếu nhập hàng/hóa đơn nhà cung cấp PhoneHouse. File có thể là ảnh chứng từ hoặc ghi âm nhân viên đọc thông tin nhập hàng. Chỉ trả JSON hợp lệ, không markdown:
{"sourceType":"PURCHASE_RECEIPT","confidence":0.0,"fieldsToReview":[],"supplier":{"name":"","phone":"","taxCode":""},"documentCode":null,"purchaseDate":null,"paymentMethod":null,"discountAmount":null,"totalAmount":null,"notes":"","items":[{"name":"","sku":null,"imei":null,"quantity":1,"unitPrice":null,"totalPrice":null,"confidence":0.0}]}
Không đoán IMEI/giá bị mờ; tiền là số nguyên VNĐ; một IMEI một dòng; trường không chắc phải vào fieldsToReview.`;
  return `Bạn là bộ máy nhập liệu tiếp nhận sửa chữa iPhone PhoneHouse. File có thể là ảnh máy/phiếu hoặc ghi âm mô tả lỗi. Chỉ trả JSON hợp lệ:
{"sourceType":"REPAIR_INTAKE","confidence":0.0,"fieldsToReview":[],"transcript":"","customer":{"name":"","phone":""},"imei":null,"model":"","issueType":"Khác","faultDescription":"","deviceAppearance":"","accessoriesIncluded":"","estimatedCost":null,"expectedReturnDate":null,"notes":""}
issueType chỉ chọn gần nhất trong: Nguồn / Mất Nguồn, Màn Hình / Cảm Ứng, Pin / Phù Pin, Face ID / Camera, Sóng / Wifi, Loa / Mic, Ép Kính / Thay Lưng, Mainboard / IC Sạc, Khác. Không bịa IMEI, mật khẩu hay tình trạng iCloud.`;
}

function providerErrorMessage(code: string): string {
  if (code === 'AI_NOT_CONFIGURED') return 'AI chưa có API key dùng chung. Hãy lưu API key tại Cài đặt → Telegram & AI hoặc cấu hình GEMINI_API_KEY trên máy chủ.';
  if (code === 'AI_PROVIDER_HTTP_401' || code === 'AI_PROVIDER_HTTP_403') return 'API key AI dùng chung đã bị nhà cung cấp từ chối. Hãy kiểm tra lại key trong Cài đặt → Telegram & AI.';
  if (code === 'AI_PROVIDER_HTTP_404') return 'Không tìm thấy endpoint hoặc model AI dùng chung đã cấu hình.';
  if (code === 'AI_PROVIDER_HTTP_429') return 'API AI dùng chung đang hết hạn mức hoặc bị giới hạn tần suất. Vui lòng thử lại sau.';
  return 'Nhà cung cấp AI không thể phân tích tệp. Vui lòng thử lại hoặc nhập thủ công.';
}

async function generateExtraction(db: Firestore | null, sourceType: AiCaptureSourceType, mimeType: string, base64: string): Promise<{ extraction: AiCaptureExtraction; model: string; configurationSource: CaptureAiConfigurationSource; provider: CaptureAiProvider }> {
  const config = await resolveSharedAiConfig(db);
  if (!config.apiKey) throw new Error('AI_NOT_CONFIGURED');
  let rawText = '';
  if (config.provider === 'OPENAI_COMPATIBLE') {
    const isAudio = mimeType.startsWith('audio/');
    const content: any[] = [{ type: 'text', text: extractionPrompt(sourceType) }];
    const audioFormat = mimeType.includes('wav') ? 'wav'
      : mimeType.includes('mpeg') || mimeType.includes('mp3') ? 'mp3'
        : mimeType.includes('m4a') || mimeType.includes('mp4') ? 'm4a'
          : mimeType.includes('ogg') ? 'ogg'
            : mimeType.includes('webm') ? 'webm'
              : 'aac';
    content.push(isAudio
      ? { type: 'input_audio', input_audio: { data: base64, format: audioFormat } }
      : { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } });
    const response = await fetch(`${resolveBaseUrl(config.baseUrl)}/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model: config.model, messages: [{ role: 'user', content }], temperature: 0, response_format: { type: 'json_object' } }),
      signal: AbortSignal.timeout(80_000)
    });
    if (!response.ok) throw new Error(`AI_PROVIDER_HTTP_${response.status}`);
    const body: any = await response.json();
    rawText = String(body?.choices?.[0]?.message?.content || '');
  } else {
    const ai = new GoogleGenAI({ apiKey: config.apiKey, httpOptions: { headers: { 'User-Agent': 'phonehouse-crm-ai-capture' } } });
    const response = await ai.models.generateContent({
      model: config.model, contents: [{ role: 'user', parts: [{ inlineData: { mimeType, data: base64 } }, { text: extractionPrompt(sourceType) }] }],
      config: { temperature: 0, responseMimeType: 'application/json' }
    });
    rawText = String(response.text || '').trim();
  }
  const metadata = { model: config.model, configurationSource: config.source, provider: config.provider };
  if (sourceType === 'SALES_SLIP') return { extraction: normalizeSalesSlipExtraction(parseAiCaptureJson(rawText, defaultSalesSlip())), ...metadata };
  if (sourceType === 'CONVERSATION') return { extraction: normalizeConversationExtraction(parseAiCaptureJson(rawText, defaultConversation())), ...metadata };
  if (sourceType === 'PURCHASE_RECEIPT') return { extraction: normalizePurchaseReceiptExtraction(parseAiCaptureJson(rawText, defaultPurchaseReceipt())), ...metadata };
  return { extraction: normalizeRepairIntakeExtraction(parseAiCaptureJson(rawText, defaultRepairIntake())), ...metadata };
}

function extensionForMime(mimeType: string): string {
  const ext = mimeType.split('/')[1]?.split('+')[0]?.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return ext === 'jpeg' ? 'jpg' : (ext || 'bin').slice(0, 8);
}

async function persistCapture(db: Firestore | null, sourceType: AiCaptureSourceType, mimeType: string, bytes: Buffer, extraction: AiCaptureExtraction, actor: NonNullable<Request['user']>) {
  const draftId = `AICAP-${crypto.randomUUID()}`;
  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  const objectPath = `ai-captures/${actor.uid}/${draftId}.${extensionForMime(mimeType)}`;
  let storageSaved = false;
  try {
    await adminBucket.file(objectPath).save(bytes, {
      resumable: false,
      validation: 'crc32c',
      metadata: { contentType: mimeType, cacheControl: 'private, max-age=0, no-store' }
    });
    storageSaved = true;
  } catch (error) {
    console.warn('[AI Capture] Original file was not persisted:', error instanceof Error ? error.message : error);
  }
  const record = {
    id: draftId,
    sourceType,
    mimeType,
    size: bytes.length,
    sha256,
    objectPath: storageSaved ? objectPath : '',
    storageSaved,
    extraction,
    status: 'DRAFT',
    createdByUid: actor.uid,
    createdByName: actor.name || actor.email || actor.uid,
    branchId: actor.branchId || '',
    createdAt: new Date().toISOString(),
    createdAtServer: FieldValue.serverTimestamp()
  };
  if (db) {
    try {
      await db.collection('aiCaptureDrafts').doc(draftId).set(record);
    } catch (error) {
      console.warn('[AI Capture] Draft metadata was not persisted:', error instanceof Error ? error.message : error);
    }
  }
  return { draftId, sha256, objectPath: storageSaved ? objectPath : null, storageSaved };
}

export function createAiCaptureRouter(db: Firestore | null): Router {
  const router = Router();
  const captureRoles = requireRole(
    'ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE',
    'CUSTOMER_CARE', 'CSKH', 'CASHIER', 'ACCOUNTANT', 'INVENTORY_MANAGER', 'WAREHOUSE',
    'TECHNICIAN', 'TECH', 'TECH_LEAD'
  );

  router.get('/status', authenticateFirebase, captureRoles, async (_req: Request, res: Response) => {
    const config = await resolveSharedAiConfig(db);
    return res.json({
      success: true,
      data: {
        configured: Boolean(config.apiKey),
        provider: config.provider,
        model: config.model,
        source: config.source
      }
    });
  });

  router.post('/extract', captureRateLimit, authenticateFirebase, captureRoles, async (req: Request, res: Response) => {
    const sourceType = String(req.body?.sourceType || '').trim().toUpperCase() as AiCaptureSourceType;
    const mimeType = String(req.body?.mimeType || '').trim().toLowerCase();
    const rawBase64 = String(req.body?.data || '').replace(/^data:[^;]+;base64,/i, '').replace(/\s/g, '');
    if (!ALLOWED_MIME[sourceType] || !ALLOWED_MIME[sourceType].includes(mimeType)) {
      return res.status(400).json({ success: false, code: 'AI_CAPTURE_MIME_NOT_ALLOWED', message: 'Định dạng tệp chưa được hỗ trợ.' });
    }
    if (!rawBase64 || !/^[A-Za-z0-9+/]+={0,2}$/.test(rawBase64)) {
      return res.status(400).json({ success: false, code: 'AI_CAPTURE_DATA_INVALID', message: 'Dữ liệu tệp không hợp lệ.' });
    }
    const maxBytes = mimeType.startsWith('image/') ? MAX_IMAGE_BYTES : MAX_AUDIO_BYTES;
    const estimatedBytes = Math.floor(rawBase64.length * 3 / 4);
    if (estimatedBytes <= 0 || estimatedBytes > maxBytes) {
      return res.status(413).json({ success: false, code: 'AI_CAPTURE_FILE_TOO_LARGE', message: `Tệp vượt giới hạn ${Math.round(maxBytes / 1024 / 1024)} MB.` });
    }
    try {
      const bytes = Buffer.from(rawBase64, 'base64');
      if (!bytes.length || bytes.length > maxBytes) throw new Error('AI_CAPTURE_FILE_TOO_LARGE');
      const generated = await generateExtraction(db, sourceType, mimeType, rawBase64);
      const persistence = await persistCapture(db, sourceType, mimeType, bytes, generated.extraction, req.user!);
      return res.json({ success: true, data: { ...persistence, sourceType, mimeType, extraction: generated.extraction, reviewRequired: true, aiModel: generated.model, aiConfiguration: generated.configurationSource, aiProvider: generated.provider } });
    } catch (error: any) {
      const code = String(error?.message || 'AI_CAPTURE_FAILED').split(':')[0];
      const status = code === 'AI_NOT_CONFIGURED' ? 503 : code === 'AI_CAPTURE_FILE_TOO_LARGE' ? 413 : 502;
      console.error('[AI Capture Error]', { requestId: req.requestId, code, providerCode: error?.code });
      return res.status(status).json({ success: false, code, message: providerErrorMessage(code) });
    }
  });

  router.post('/drafts/:draftId/confirm', authenticateFirebase, captureRoles, async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    const ref = db.collection('aiCaptureDrafts').doc(String(req.params.draftId || ''));
    try {
      const snapshot = await ref.get();
      if (!snapshot.exists) return res.status(404).json({ success: false, code: 'AI_CAPTURE_DRAFT_NOT_FOUND' });
      const draft = snapshot.data()!;
      if (draft.createdByUid !== req.user!.uid && req.user!.role !== 'ADMIN' && req.user!.role !== 'MANAGER') return res.status(403).json({ success: false, code: 'AI_CAPTURE_DRAFT_FORBIDDEN' });
      if (draft.status === 'CONFIRMED') return res.json({ success: true, data: { draftId: ref.id, status: 'CONFIRMED', idempotentReplay: true } });
      const reviewedExtraction = draft.sourceType === 'SALES_SLIP' ? normalizeSalesSlipExtraction(req.body?.extraction || draft.extraction)
        : draft.sourceType === 'CONVERSATION' ? normalizeConversationExtraction(req.body?.extraction || draft.extraction)
          : draft.sourceType === 'PURCHASE_RECEIPT' ? normalizePurchaseReceiptExtraction(req.body?.extraction || draft.extraction)
            : normalizeRepairIntakeExtraction(req.body?.extraction || draft.extraction);
      await ref.update({ status: 'CONFIRMED', reviewedExtraction, confirmedAt: FieldValue.serverTimestamp(), confirmedByUid: req.user!.uid });
      return res.json({ success: true, data: { draftId: ref.id, status: 'CONFIRMED' } });
    } catch (error: any) {
      return res.status(400).json({ success: false, code: String(error?.message || 'AI_CAPTURE_CONFIRM_FAILED').split(':')[0] });
    }
  });

  router.post('/drafts/:draftId/create-lead', authenticateFirebase, requireRole('ADMIN', 'REGIONAL_MANAGER', 'MANAGER', 'STORE_MANAGER', 'SALES', 'SALE', 'SALE_ONLINE', 'CUSTOMER_CARE', 'CSKH', 'CASHIER'), async (req: Request, res: Response) => {
    if (!db) return res.status(503).json({ success: false, code: 'DATABASE_UNAVAILABLE' });
    const ref = db.collection('aiCaptureDrafts').doc(String(req.params.draftId || ''));
    try {
      const snapshot = await ref.get();
      if (!snapshot.exists) return res.status(404).json({ success: false, code: 'AI_CAPTURE_DRAFT_NOT_FOUND' });
      const draft = snapshot.data()!;
      if (draft.sourceType !== 'CONVERSATION') return res.status(400).json({ success: false, code: 'AI_CAPTURE_LEAD_SOURCE_INVALID' });
      if (draft.status !== 'CONFIRMED') return res.status(409).json({ success: false, code: 'AI_CAPTURE_CONFIRM_REQUIRED', message: 'Hãy xác nhận bản nháp trước khi tạo lead CRM.' });
      if (draft.createdByUid !== req.user!.uid && req.user!.role !== 'ADMIN' && req.user!.role !== 'MANAGER') return res.status(403).json({ success: false, code: 'AI_CAPTURE_DRAFT_FORBIDDEN' });
      if (draft.crmLeadId) return res.json({ success: true, data: { leadId: draft.crmLeadId, idempotentReplay: true } });
      const extraction = normalizeConversationExtraction(draft.reviewedExtraction || draft.extraction);
      if (!extraction.customer.name || !/^0\d{9}$/.test(extraction.customer.phone.replace(/\D/g, ''))) {
        return res.status(400).json({ success: false, code: 'AI_CAPTURE_LEAD_CONTACT_REQUIRED', message: 'Cần bổ sung tên và số điện thoại 10 số trước khi tạo lead CRM.' });
      }
      const created = await processCreateCrmLead(db, {
        branchId: req.user!.branchId || '',
        name: extraction.customer.name,
        phone: extraction.customer.phone.replace(/\D/g, ''),
        source: 'AI_CAPTURE_CONVERSATION',
        interestedModel: extraction.interestedModel || '',
        budget: extraction.budget || 0,
        notes: [extraction.summary, extraction.transcript ? `Bản chép lời: ${extraction.transcript}` : ''].filter(Boolean).join('\n\n').slice(0, 6_000),
        nextActionType: extraction.appointmentAt ? 'APPOINTMENT' : 'CALL',
        nextActionAt: extraction.appointmentAt || undefined,
        operationKey: `AICAP_LEAD_${ref.id}`
      } as any, {
        uid: req.user!.uid,
        role: req.user!.role,
        branchId: req.user!.branchId,
        assignedBranchIds: req.user!.assignedBranchIds,
        name: req.user!.name || req.user!.email || req.user!.uid
      });
      const leadId = String((created as any)?.lead?.id || '');
      await ref.update({ crmLeadId: leadId, crmCreatedAt: FieldValue.serverTimestamp(), crmCreatedByUid: req.user!.uid });
      return res.json({ success: true, data: { leadId, lead: (created as any)?.lead || null, task: (created as any)?.task || null, idempotentReplay: Boolean((created as any)?.idempotentReplay) } });
    } catch (error: any) {
      const code = String(error?.message || 'AI_CAPTURE_CREATE_LEAD_FAILED').split(':')[0];
      const status = /FORBIDDEN/.test(code) ? 403 : /INVALID|REQUIRED/.test(code) ? 400 : 409;
      return res.status(status).json({ success: false, code, message: 'Không thể tạo lead CRM từ bản nháp AI.' });
    }
  });

  return router;
}
