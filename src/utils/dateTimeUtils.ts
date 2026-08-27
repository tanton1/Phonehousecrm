/**
 * PhoneHouse Vietnam Timezone (Asia/Ho_Chi_Minh - UTC+7) Utilities
 */

/**
 * Returns current Vietnam date in YYYY-MM-DD format (avoids UTC offset shifts)
 */
export function getVietnamDateString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);
}

/** Returns Vietnam month in YYYY-MM format. */
export function getVietnamMonthString(d: Date = new Date()): string {
  return getVietnamDateString(d).slice(0, 7);
}

/** Returns a Vietnam calendar date offset by the requested number of days. */
export function getVietnamRelativeDateString(days: number, d: Date = new Date()): string {
  return getVietnamDateString(new Date(d.getTime() + days * 86_400_000));
}

/** Returns the calendar month immediately before the current Vietnam month. */
export function getPreviousVietnamMonthString(d: Date = new Date()): string {
  const [year, month] = getVietnamMonthString(d).split('-').map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
}

/**
 * Returns current Vietnam time in HH:mm format
 */
export function getVietnamTimeString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Returns current Vietnam time in HH:mm:ss format
 */
export function getVietnamTimeWithSecondsString(d: Date = new Date()): string {
  return new Intl.DateTimeFormat('vi-VN', { 
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false
  }).format(d);
}

/**
 * Returns current Vietnam date & time formatted string
 */
export function getVietnamDateTimeString(d: Date = new Date()): string {
  return `${getVietnamDateString(d)} ${getVietnamTimeWithSecondsString(d)}`;
}

/**
 * Computes dynamic week days (Monday -> Sunday) in Vietnam timezone
 */
export function getVietnamWeekRange(targetDate: Date = new Date()): {
  weekStart: string; // YYYY-MM-DD (Monday)
  weekEnd: string;   // YYYY-MM-DD (Sunday)
  days: Array<{
    dateStr: string;
    dayOfWeek: string;
    dayOfMonth: number;
    month: number;
    year: number;
    isToday: boolean;
  }>;
} {
  const vnDateStr = getVietnamDateString(targetDate);
  const [y, m, d] = vnDateStr.split('-').map(Number);
  
  // Create reference date in local construct
  const refDate = new Date(y, m - 1, d, 12, 0, 0);
  const dayOfWeekIndex = refDate.getDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday
  
  // Distance from Monday (0 for Monday, -1 for Tuesday, ..., 6 for Sunday)
  const diffToMonday = dayOfWeekIndex === 0 ? -6 : 1 - dayOfWeekIndex;
  
  const monday = new Date(refDate);
  monday.setDate(refDate.getDate() + diffToMonday);

  const days: Array<{
    dateStr: string;
    dayOfWeek: string;
    dayOfMonth: number;
    month: number;
    year: number;
    isToday: boolean;
  }> = [];

  const dayNames = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ Nhật'];

  for (let i = 0; i < 7; i++) {
    const current = new Date(monday);
    current.setDate(monday.getDate() + i);
    const dateStr = getVietnamDateString(current);
    days.push({
      dateStr,
      dayOfWeek: dayNames[i],
      dayOfMonth: current.getDate(),
      month: current.getMonth() + 1,
      year: current.getFullYear(),
      isToday: dateStr === vnDateStr
    });
  }

  return {
    weekStart: days[0].dateStr,
    weekEnd: days[6].dateStr,
    days
  };
}
