import { apiJson } from './apiClient';

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

export interface PromotionAiContentResult {
  content: PromotionAiContent;
  provider: 'GOOGLE_GEMINI' | 'OPENAI_COMPATIBLE';
  model: string;
}

export interface PromotionAiImageResult {
  imageUrl: string;
  objectPath: string;
  provider: 'GOOGLE_GEMINI' | 'OPENAI_COMPATIBLE';
  model: string;
  generatedAt: string;
}

export async function requestPromotionAiContent(input: {
  brief: string;
  category: string;
  tone: string;
  targetAudience?: string;
  offer?: string;
  voucherCode?: string;
  existingTitle?: string;
  existingSummary?: string;
}): Promise<PromotionAiContentResult> {
  const response = await apiJson<{ success: boolean; data: PromotionAiContentResult }>('/api/customer-portal/staff/promotions/ai/content', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 90_000
  });
  if (!response?.success || !response.data?.content) throw new Error('PROMOTION_AI_RESPONSE_INVALID');
  return response.data;
}

export async function requestPromotionAiImage(input: { imagePrompt: string }): Promise<PromotionAiImageResult> {
  const response = await apiJson<{ success: boolean; data: PromotionAiImageResult }>('/api/customer-portal/staff/promotions/ai/image', {
    method: 'POST',
    body: JSON.stringify(input),
    timeoutMs: 180_000
  });
  if (!response?.success || !response.data?.imageUrl) throw new Error('PROMOTION_AI_IMAGE_EMPTY');
  return response.data;
}
