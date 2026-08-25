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

function localDateFromInput(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

export function operationalDate(value: unknown): Date | null {
  const raw = toIsoDateTime(value, typeof value === 'string' ? value : '').trim();
  if (!raw) return null;

  const dateOnly = localDateFromInput(raw);
  if (dateOnly) return dateOnly;

  const normalized = raw.includes(' ') && !raw.includes('T') ? raw.replace(' ', 'T') : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfLocalDay(value: Date): Date {
  return new Date(value.getFullYear(), value.getMonth(), value.getDate());
}

function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setDate(next.getDate() + days);
  return next;
}

export function matchesDateFilter(value: unknown, filter: DateFilterValue, now = new Date()): boolean {
  if (filter.preset === 'all') return true;
  const date = operationalDate(value);
  if (!date) return false;

  const today = startOfLocalDay(now);
  let start: Date | null = null;
  let endExclusive: Date | null = null;

  if (filter.preset === 'today') {
    start = today;
    endExclusive = addDays(today, 1);
  } else if (filter.preset === 'this_week') {
    const mondayOffset = (today.getDay() + 6) % 7;
    start = addDays(today, -mondayOffset);
    endExclusive = addDays(start, 7);
  } else if (filter.preset === 'this_month') {
    start = new Date(today.getFullYear(), today.getMonth(), 1);
    endExclusive = new Date(today.getFullYear(), today.getMonth() + 1, 1);
  } else if (filter.preset === 'last_month') {
    start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    endExclusive = new Date(today.getFullYear(), today.getMonth(), 1);
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
