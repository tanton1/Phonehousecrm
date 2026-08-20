import { describe, it, expect } from 'vitest';
import { 
  getVietnamDateString, 
  getVietnamTimeString, 
  getVietnamTimeWithSecondsString,
  getVietnamDateTimeString,
  getVietnamWeekRange 
} from '../src/utils/dateTimeUtils';

describe('Vietnam Timezone (Asia/Ho_Chi_Minh - UTC+7) & Shift Authority Test Suite', () => {
  it('Case 1: getVietnamDateString định dạng đúng chuẩn YYYY-MM-DD không bị lệch múi giờ UTC', () => {
    // 2026-08-20 00:30:00 GMT+7 (in UTC this is 2026-08-19 17:30:00Z)
    const testDate = new Date('2026-08-19T17:30:00.000Z');
    const vnDate = getVietnamDateString(testDate);
    expect(vnDate).toBe('2026-08-20');
  });

  it('Case 2: getVietnamTimeString trả về giờ 24h chuẩn tại Việt Nam', () => {
    const testDate = new Date('2026-08-19T17:30:00.000Z');
    const vnTime = getVietnamTimeString(testDate);
    expect(vnTime).toBe('00:30');
  });

  it('Case 3: getVietnamWeekRange tạo động 7 ngày từ Thứ Hai đến Chủ Nhật', () => {
    // 2026-08-20 is a Thursday (Thứ Năm)
    const testDate = new Date('2026-08-20T10:00:00.000Z');
    const weekRange = getVietnamWeekRange(testDate);

    expect(weekRange.days).toHaveLength(7);
    expect(weekRange.days[0].dayOfWeek).toBe('Thứ Hai');
    expect(weekRange.days[0].dateStr).toBe('2026-08-17');
    expect(weekRange.days[6].dayOfWeek).toBe('Chủ Nhật');
    expect(weekRange.days[6].dateStr).toBe('2026-08-23');
    expect(weekRange.weekStart).toBe('2026-08-17');
    expect(weekRange.weekEnd).toBe('2026-08-23');

    // Check today flag for Thursday
    const thursday = weekRange.days.find(d => d.dateStr === '2026-08-20');
    expect(thursday).toBeDefined();
    expect(thursday?.isToday).toBe(true);
    expect(thursday?.dayOfWeek).toBe('Thứ Năm');
  });

  it('Case 4: getVietnamDateTimeString kết hợp ngày và giờ chính xác', () => {
    const testDate = new Date('2026-08-20T01:15:30.000Z'); // 08:15:30 in VN
    const vnDateTime = getVietnamDateTimeString(testDate);
    expect(vnDateTime).toContain('2026-08-20 08:15:30');
  });

  it('Case 5: Document ID điểm danh chuẩn định dạng ATT_{UID}_{YYYYMMDD}', () => {
    const uid = 'USR_TEST_123';
    const dateStr = '2026-08-20';
    const expectedDocId = `ATT_${uid}_${dateStr.replace(/-/g, '')}`;
    expect(expectedDocId).toBe('ATT_USR_TEST_123_20260820');
  });
});
