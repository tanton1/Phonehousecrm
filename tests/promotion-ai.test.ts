import { describe, expect, it } from 'vitest';
import {
  normalizePromotionAiBrief,
  normalizePromotionAiContent,
  parsePromotionAiContent,
  promotionContentPrompt
} from '../server/services/promotionAiService';

describe('promotion AI studio', () => {
  it('normalizes the brief and rejects unsupported categories by falling back safely', () => {
    const brief = normalizePromotionAiBrief({
      brief: '  Cuối tuần ưu đãi phụ kiện  ',
      category: 'unknown',
      tone: 'unknown',
      targetAudience: 'Khách VIP',
      voucherCode: ' vip 10 '
    });
    expect(brief).toMatchObject({ category: 'GENERAL', tone: 'SELLING', voucherCode: 'VIP 10' });
    expect(promotionContentPrompt(brief)).toContain('Cuối tuần ưu đãi phụ kiện');
  });

  it('parses fenced JSON and bounds content before it reaches the editor', () => {
    const content = parsePromotionAiContent('```json\n' + JSON.stringify({
      title: '  Ưu đãi iPhone 16  ',
      summary: 'Mua máy nhận quà',
      details: 'Chi tiết chương trình',
      category: 'DEVICE',
      conditions: ['Áp dụng tại cửa hàng', 'Áp dụng tại cửa hàng'],
      hashtags: ['iphone', '#phonehouse'],
      imagePrompt: 'Banner iPhone màu cam'
    }) + '\n```');
    expect(content).toMatchObject({ title: 'Ưu đãi iPhone 16', category: 'DEVICE', hashtags: ['#iphone', '#phonehouse'] });
    expect(content.conditions).toEqual(['Áp dụng tại cửa hàng']);
  });

  it('fails closed when the provider does not return JSON', () => {
    expect(() => parsePromotionAiContent('Không có JSON')).toThrow('PROMOTION_AI_RESPONSE_INVALID');
    const content = normalizePromotionAiContent({ category: 'DEVICE', hashtags: ['a b', 'a b'] });
    expect(content.title).toBe('');
    expect(content.hashtags).toEqual(['#ab']);
  });
});
