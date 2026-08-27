const VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
const VIETNAM_OFFSET = '+07:00';

function asDate(value: Date | string | number = new Date()): Date {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error('VIETNAM_TIME_INPUT_INVALID');
  return date;
}

export function getVietnamDateString(value: Date | string | number = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: VIETNAM_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(asDate(value));
}

export function getVietnamMonthString(value: Date | string | number = new Date()): string {
  return getVietnamDateString(value).slice(0, 7);
}

export function getVietnamDayUtcRange(dateString: string): { startUtc: string; endUtc: string } {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) throw new Error('VIETNAM_DATE_INVALID');
  const start = new Date(`${dateString}T00:00:00.000${VIETNAM_OFFSET}`);
  if (Number.isNaN(start.getTime())) throw new Error('VIETNAM_DATE_INVALID');
  return {
    startUtc: start.toISOString(),
    endUtc: new Date(start.getTime() + 86_400_000 - 1).toISOString()
  };
}

export function getVietnamMonthUtcRange(monthString: string): { startUtc: string; endUtc: string } {
  const match = /^(\d{4})-(\d{2})$/.exec(monthString);
  if (!match) throw new Error('VIETNAM_MONTH_INVALID');
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new Error('VIETNAM_MONTH_INVALID');
  const start = new Date(`${monthString}-01T00:00:00.000${VIETNAM_OFFSET}`);
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  const next = new Date(`${nextYear}-${String(nextMonth).padStart(2, '0')}-01T00:00:00.000${VIETNAM_OFFSET}`);
  return { startUtc: start.toISOString(), endUtc: new Date(next.getTime() - 1).toISOString() };
}
