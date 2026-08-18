/**
 * Chuẩn hóa số điện thoại về định dạng chuẩn Việt Nam (09xxxxxxxx)
 * Loại bỏ khoảng trắng, dấu chấm, dấu gạch ngang, tiền tố quốc tế +84 hoặc 84
 */
export function normalizePhoneNumber(phone: string): string {
  if (!phone) return '';
  // Loại bỏ toàn bộ ký tự không phải số
  let clean = phone.replace(/[^0-9]/g, '');
  
  // Nếu bắt đầu bằng 84 và có độ dài >= 11 số (ví dụ: 84935672467 -> 0935672467)
  if (clean.startsWith('84') && clean.length >= 11) {
    clean = '0' + clean.slice(2);
  }
  
  // Nếu chưa có số 0 ở đầu (ví dụ: 935672467 -> 0935672467)
  if (!clean.startsWith('0') && clean.length === 9) {
    clean = '0' + clean;
  }
  
  return clean;
}

/**
 * Định dạng số điện thoại hiển thị đẹp mắt (0935 672 467 hoặc 090 988 9603)
 */
export function formatPhoneDisplay(phone: string): string {
  const clean = normalizePhoneNumber(phone);
  if (!clean || clean.length < 10) return phone;
  
  if (clean.length === 10) {
    return `${clean.slice(0, 4)} ${clean.slice(4, 7)} ${clean.slice(7)}`;
  }
  return clean;
}
