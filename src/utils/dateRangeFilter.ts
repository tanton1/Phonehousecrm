import { toIsoDateTime } from './dateValue';

export type DateFilterPreset = 'all' | 'today' | 'this_week' | 'this_month' | 'last_month' | 'custom';

export interface DateFilterValue {
  preset: DateFilterPreset;
  from: string;
  to: string;
}

export const DEFAULT_DATE_FILTER: DateFilterValue = {
  preset: 'all',
  from: '',
  to: ''
};

// PhoneHouse vận hành theo múi giờ Việt Nam. Dùng biên ngày cố định UTC+7 để
// kết quả lọc không thay đổi giữa trình duyệt, Vercel và GitHub Actions (UTC).
const OPERATIONAL_TIMEZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function operationalParts(value: Date) {
  const shifted = new Date(value.getTime() + OPERATIONAL_TIMEZONE_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    dayOfWeek: shifted.getUTCDay(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
    second: shifted.getUTCSeconds(),
    millisecond: shifted.getUTCMilliseconds()
  };
}

function operationalDateFromParts(
  year: number,
  month: number,
  day: number,
  hour = 0,
  minute = 0,
  second = 0,
  millisecond = 0
): Date | null {
  const normalizedMonth = new Date(Date.UTC(year, month - 1, 1));
  const normalizedYearValue = normalizedMonth.getUTCFullYear();
  const normalizedMonthValue = normalizedMonth.getUTCMonth() + 1;
  const date = new Date(
    Date.UTC(normalizedYearValue, normalizedMonthValue - 1, day, hour, minute, second, millisecond)
      - OPERATIONAL_TIMEZONE_OFFSET_MS
  );
  const parts = operationalParts(date);
  const isExact = parts.year === normalizedYearValue
    && parts.month === normalizedMonthValue
    && parts.day === day
    && parts.hour === hour
    && parts.minute === minute
    && parts.second === second
    && parts.millisecond === millisecond;
  return isExact ? date : null;
}

function localDateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  return operationalDateFromParts(Number(match[1]), Number(match[2]), Number(match[3]));
}

export function operationalDate(value: unknown): Date | null {
  const raw = toIsoDateTime(value, typeof value === 'string' ? value : '').trim();
  if (!raw) return null;

  const dateOnly = localDateFromInput(raw);
  if (dateOnly) return dateOnly;

  const localDateTime = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(raw);
  if (localDateTime) {
    return operationalDateFromParts(
      Number(localDateTime[1]),
      Number(localDateTime[2]),
      Number(localDateTime[3]),
      Number(localDateTime[4]),
      Number(localDateTime[5]),
      Number(localDateTime[6] || 0),
      Number((localDateTime[7] || '').padEnd(3, '0') || 0)
    );
  }

  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfOperationalDay(value: Date): Date {
  const parts = operationalParts(value);
  return operationalDateFromParts(parts.year, parts.month, parts.day) as Date;
}

function addDays(value: Date, days: number): Date {
  return new Date(value.getTime() + days * DAY_MS);
}

export function matchesDateFilter(value: unknown, filter: DateFilterValue, now = new Date()): boolean {
  if (filter.preset === 'all') return true;
  const date = operationalDate(value);
  if (!date) return false;

  const today = startOfOperationalDay(now);
  const todayParts = operationalParts(today);
  let start: Date | null = null;
  let endExclusive: Date | null = null;

  if (filter.preset === 'today') {
    start = today;
    endExclusive = addDays(today, 1);
  } else if (filter.preset === 'this_week') {
    const mondayOffset = (todayParts.dayOfWeek + 6) % 7;
    start = addDays(today, -mondayOffset);
    endExclusive = addDays(start, 7);
  } else if (filter.preset === 'this_month') {
    start = operationalDateFromParts(todayParts.year, todayParts.month, 1);
    endExclusive = operationalDateFromParts(todayParts.year, todayParts.month + 1, 1);
  } else if (filter.preset === 'last_month') {
    start = operationalDateFromParts(todayParts.year, todayParts.month - 1, 1);
    endExclusive = operationalDateFromParts(todayParts.year, todayParts.month, 1);
  } else {
    start = filter.from ? localDateFromInput(filter.from) : null;
    const customEnd = filter.to ? localDateFromInput(filter.to) : null;
    endExclusive = customEnd ? addDays(customEnd, 1) : null;
  }

  const timestamp = date.getTime();
  if (start && timestamp < start.getTime()) return false;
  if (endExclusive && timestamp >= endExclusive.getTime()) return false;
  return true;
}
