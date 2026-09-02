import crypto from 'node:crypto';
import { GoogleGenAI } from '@google/genai';
import type { Firestore } from 'firebase-admin/firestore';
import { adminBucket } from '../firebaseAdmin';
import { isOpenAiCompatible, resolveBaseUrl } from './telegramAiAssistant';
import { loadTelegramConfig } from './telegramService';

const PROMOTION_CATEGORIES = new Set(['GENERAL', 'DEVICE', 'REPAIR', 'ACCESSORY', 'LOYALTY']);
const PROMOTION_TONES = new Set(['SELLING', 'FRIENDLY', 'PREMIUM', 'DIRECT']);
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export interface PromotionAiBrief {
  brief: string;
  category: string;
  tone: string;
  targetAudience: string;
  offer: string;
  voucherCode: string;
  existingTitle: string;
  existingSummary: string;
}

export interface PromotionAiContent {
  title: string;
  summary: string;
  details: string;
  category: string;
  ctaLabel: string;
  conditions: string[];
  hashtags: string[];
  imagePrompt: string;
}

function cleanText(value: unknown, max: number): string {
  return String(value || '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim()
    .slice(0, max);
}

function cleanList(value: unknown, maxItems: number, maxLength: number): string[] {
  const values = Array.isArray(value) ? value : [];
  return [...new Set(values.map(item => cleanText(item, maxLength)).filter(Boolean))].slice(0, maxItems);
}

function stripJsonFence(value: string): string {
  const trimmed = String(value || '').trim();
  const unfenced = trimmed.startsWith('```')
    ? trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim()
    : trimmed;
  const first = unfenced.indexOf('{');
  const last = unfenced.lastIndexOf('}');
  return first >= 0 && last > first ? unfenced.slice(first, last + 1) : unfenced;
}

export function normalizePromotionAiBrief(input: any): PromotionAiBrief {
  const category = cleanText(input?.category, 30).toUpperCase();
  const tone = cleanText(input?.tone, 30).toUpperCase();
  return {
    brief: cleanText(input?.brief, 2_000),
    category: PROMOTION_CATEGORIES.has(category) ? category : 'GENERAL',
    tone: PROMOTION_TONES.has(tone) ? tone : 'SELLING',
    targetAudience: cleanText(input?.targetAudience, 500),
    offer: cleanText(input?.offer, 500),
    voucherCode: cleanText(input?.voucherCode, 80).toUpperCase(),
    existingTitle: cleanText(input?.existingTitle, 200),
    existingSummary: cleanText(input?.existingSummary, 500)
  };
}

export function normalizePromotionAiContent(input: unknown, fallbackCategory = 'GENERAL'): PromotionAiContent {
  const source = input && typeof input === 'object' ? input as Record<string, any> : {};
  const requestedCategory = cleanText(source.category, 30).toUpperCase();
  const category = PROMOTION_CATEGORIES.has(requestedCategory)
    ? requestedCategory
    : (PROMOTION_CATEGORIES.has(fallbackCategory) ? fallbackCategory : 'GENERAL');
  return {
    title: cleanText(source.title, 200),
    summary: cleanText(source.summary, 500),
    details: cleanText(source.details, 5_000),
    category,
    ctaLabel: cleanText(source.ctaLabel, 80) || 'Xem chi tiết',
    conditions: cleanList(source.conditions, 20, 500),
    hashtags: cleanList(source.hashtags, 12, 80).map(tag => tag.startsWith('#') ? tag : `#${tag.replace(/\s+/g, '')}`),
    imagePrompt: cleanText(source.imagePrompt, 1_500)
  };
}

export function parsePromotionAiContent(value: string, fallbackCategory = 'GENERAL'): PromotionAiContent {
  try {
    return normalizePromotionAiContent(JSON.parse(stripJsonFence(value)), fallbackCategory);
  } catch {
    throw new Error('PROMOTION_AI_RESPONSE_INVALID');
  }
}

export function promotionContentPrompt(input: PromotionAiBrief): string {
  const toneLabels: Record<string, string> = {
    SELLING: 'thuyết phục, rõ lợi ích, không cường điệu',
    FRIENDLY: 'gần gũi, tự nhiên như nhân viên tư vấn giỏi',
    PREMIUM: 'tinh gọn, cao cấp, nhấn mạnh trải nghiệm',
    DIRECT: 'ngắn, trực tiếp, tập trung hành động'
  };
  return `Bạn là biên tập viên nội dung cho PhoneHouse, chuỗi bán lẻ iPhone, phụ kiện và sửa chữa tại Việt Nam.
Hãy soạn một bài đăng dùng trên Mini App PhoneHouse Care. Chỉ trả về JSON hợp lệ, không markdown, theo cấu trúc:
{"title":"","summary":"","details":"","category":"${input.category}","ctaLabel":"","conditions":[],"hashtags":[],"imagePrompt":""}

Yêu cầu bắt buộc:
- Viết tiếng Việt tự nhiên; tiêu đề dưới 90 ký tự, summary dưới 220 ký tự.
- Giọng điệu: ${toneLabels[input.tone] || toneLabels.SELLING}.
- Không tự bịa giá, quà tặng, thời hạn, bảo hành hoặc điều kiện chưa có trong brief.
- Nếu brief thiếu con số/diều kiện thì viết trung tính, không suy đoán.
- details dễ đọc trên điện thoại, tối đa 3 đoạn ngắn; conditions chỉ gồm điều kiện đã được nêu.
- imagePrompt mô tả banner ngang 16:9, phong cách bán lẻ công nghệ cao cấp, tông cam-đen-trắng; không chèn chữ, số, watermark hay logo vào ảnh.

Brief: ${input.brief}
Nhóm nội dung: ${input.category}
Đối tượng: ${input.targetAudience || 'Khách hàng quan tâm sản phẩm/dịch vụ PhoneHouse'}
Ưu đãi/thông tin chính: ${input.offer || 'Không có thông tin bổ sung'}
Mã voucher đã xác nhận: ${input.voucherCode || 'Không có'}
Nội dung hiện có cần cải biên: ${[input.existingTitle, input.existingSummary].filter(Boolean).join(' | ') || 'Không có'}`;
}

function aiResponseText(body: any): string {
  const content = body?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.map(item => item?.text || '').join('');
  return '';
}

function providerMessage(status: number, raw: string): string {
  const compact = cleanText(raw, 300);
  if (status === 401 || status === 403) return 'PROMOTION_AI_KEY_REJECTED';
  if (status === 429) return 'PROMOTION_AI_RATE_LIMITED';
  return `PROMOTION_AI_PROVIDER_ERROR_${status}${compact ? `: ${compact}` : ''}`;
}

async function sharedAiConfiguration(db: Firestore) {
  const config = await loadTelegramConfig(db);
  const apiKey = cleanText(config.geminiApiKey || process.env.GEMINI_API_KEY, 500);
  if (!apiKey) throw new Error('PROMOTION_AI_NOT_CONFIGURED');
  const baseUrl = cleanText(config.geminiBaseUrl || process.env.GEMINI_BASE_URL, 1_000);
  const model = cleanText(config.aiModel || process.env.GEMINI_MODEL || 'gemini-2.5-flash', 120);
  return { config, apiKey, baseUrl, model, openAiCompatible: isOpenAiCompatible(apiKey, baseUrl) };
}

export async function generatePromotionContent(db: Firestore, rawInput: any) {
  const input = normalizePromotionAiBrief(rawInput);
  if (input.brief.length < 8 && !input.existingTitle && !input.existingSummary) throw new Error('PROMOTION_AI_BRIEF_REQUIRED');
  const shared = await sharedAiConfiguration(db);
  const prompt = promotionContentPrompt(input);
  let responseText = '';

  if (shared.openAiCompatible) {
    const response = await fetch(`${resolveBaseUrl(shared.baseUrl)}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shared.apiKey}` },
      body: JSON.stringify({
        model: shared.model,
        messages: [
          { role: 'system', content: 'Chỉ trả về JSON hợp lệ. Không markdown, không giải thích.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.65
      }),
      signal: AbortSignal.timeout(60_000)
    });
    if (!response.ok) throw new Error(providerMessage(response.status, await response.text().catch(() => '')));
    responseText = aiResponseText(await response.json());
  } else {
    const ai = new GoogleGenAI({ apiKey: shared.apiKey });
    const response = await ai.models.generateContent({
      model: shared.model,
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      config: { temperature: 0.65, responseMimeType: 'application/json' }
    });
    responseText = String(response.text || '');
  }

  const content = parsePromotionAiContent(responseText, input.category);
  if (!content.title || !content.summary || !content.details || !content.imagePrompt) throw new Error('PROMOTION_AI_RESPONSE_INCOMPLETE');
  return { content, provider: shared.openAiCompatible ? 'OPENAI_COMPATIBLE' : 'GOOGLE_GEMINI', model: shared.model };
}

function extractNativeImage(response: any): { bytes: Buffer; mimeType: string } | null {
  for (const candidate of response?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      const inline = part?.inlineData || part?.inline_data;
      const encoded = cleanText(inline?.data, 20_000_000);
      if (encoded) return { bytes: Buffer.from(encoded, 'base64'), mimeType: cleanText(inline?.mimeType || inline?.mime_type || 'image/png', 100) };
    }
  }
  return null;
}

async function extractCompatibleImage(body: any): Promise<{ bytes: Buffer; mimeType: string } | null> {
  const encoded = cleanText(body?.data?.[0]?.b64_json || body?.data?.[0]?.b64Json, 20_000_000);
  if (encoded) return { bytes: Buffer.from(encoded, 'base64'), mimeType: 'image/png' };

  // OpenAI-compatible providers may return a short-lived URL instead of
  // inline base64. Fetch it server-side so the browser never needs provider
  // credentials and the resulting file still goes through our size checks.
  const imageUrl = cleanText(body?.data?.[0]?.url, 2_000);
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return null;
  const response = await fetch(imageUrl, { signal: AbortSignal.timeout(120_000) });
  if (!response.ok) return null;
  const contentLength = Number(response.headers.get('content-length') || 0);
  if (contentLength > MAX_IMAGE_BYTES) throw new Error('PROMOTION_AI_IMAGE_TOO_LARGE');
  const bytes = Buffer.from(await response.arrayBuffer());
  return { bytes, mimeType: response.headers.get('content-type') || 'image/png' };
}

function validateGeneratedImage(image: { bytes: Buffer; mimeType: string } | null) {
  if (!image?.bytes.length) throw new Error('PROMOTION_AI_IMAGE_EMPTY');
  if (image.bytes.length > MAX_IMAGE_BYTES) throw new Error('PROMOTION_AI_IMAGE_TOO_LARGE');
  const mimeType = ['image/png', 'image/jpeg', 'image/webp'].includes(image.mimeType) ? image.mimeType : 'image/png';
  return { bytes: image.bytes, mimeType };
}

function imageExtension(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/webp') return 'webp';
  return 'png';
}

export async function generatePromotionImage(db: Firestore, rawInput: any, actor: { uid: string }) {
  const prompt = cleanText(rawInput?.imagePrompt || rawInput?.prompt, 1_500);
  if (prompt.length < 12) throw new Error('PROMOTION_AI_IMAGE_PROMPT_REQUIRED');
  const shared = await sharedAiConfiguration(db);
  const imageModel = cleanText(process.env.PROMOTION_IMAGE_MODEL || process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image', 120);
  const guardedPrompt = `${prompt}\n\nRàng buộc: banner ngang 16:9; không chèn chữ, số, giá, watermark, logo hay giao diện giả; không tạo thông tin khuyến mãi không có trong mô tả.`;
  let generated: { bytes: Buffer; mimeType: string } | null = null;

  if (shared.openAiCompatible) {
    const response = await fetch(`${resolveBaseUrl(shared.baseUrl)}/images/generations`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${shared.apiKey}` },
      body: JSON.stringify({ model: imageModel, prompt: guardedPrompt, n: 1, size: '1536x1024', response_format: 'b64_json' }),
      signal: AbortSignal.timeout(120_000)
    });
    if (!response.ok) throw new Error(providerMessage(response.status, await response.text().catch(() => '')));
    generated = await extractCompatibleImage(await response.json());
  } else {
    const ai = new GoogleGenAI({ apiKey: shared.apiKey });
    const response = await ai.models.generateContent({
      model: imageModel,
      contents: [{ role: 'user', parts: [{ text: guardedPrompt }] }],
      config: { responseModalities: ['IMAGE'] as any }
    });
    generated = extractNativeImage(response);
  }

  const image = validateGeneratedImage(generated);
  const token = crypto.randomUUID();
  const generatedAt = new Date();
  const safeUid = cleanText(actor.uid, 128).replace(/[^A-Za-z0-9_-]/g, '_') || 'staff';
  const objectPath = `promotion-ai/${generatedAt.toISOString().slice(0, 10)}/${safeUid}/${crypto.randomUUID()}.${imageExtension(image.mimeType)}`;
  await adminBucket.file(objectPath).save(image.bytes, {
    resumable: false,
    validation: 'crc32c',
    metadata: {
      contentType: image.mimeType,
      cacheControl: 'public, max-age=31536000, immutable',
      metadata: {
        firebaseStorageDownloadTokens: token,
        generatedByUid: safeUid,
        generatedBy: 'promotion-ai',
        promptSha256: crypto.createHash('sha256').update(prompt).digest('hex')
      }
    }
  });
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(adminBucket.name)}/o/${encodeURIComponent(objectPath)}?alt=media&token=${encodeURIComponent(token)}`;
  return {
    imageUrl,
    objectPath,
    provider: shared.openAiCompatible ? 'OPENAI_COMPATIBLE' : 'GOOGLE_GEMINI',
    model: imageModel,
    generatedAt: generatedAt.toISOString()
  };
}
