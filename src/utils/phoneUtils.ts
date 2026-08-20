/**
 * Utility helper to normalize Vietnamese phone numbers consistently across PhoneHouse CRM & ERP
 * 
 * Rules:
 * - Strips all non-digit characters (spaces, dashes, dots, parentheses, +)
 * - Converts +84 / 84 prefix to standard domestic 0 prefix
 * - Standardizes to 10-digit format (e.g. 0905123456)
 */
export function normalizeVietnamPhone(phone: string | null | undefined): string {
  if (!phone) return '';
  
  let cleaned = phone.replace(/\D/g, '');
  
  if (cleaned.startsWith('84') && cleaned.length >= 11) {
    cleaned = '0' + cleaned.slice(2);
  } else if (!cleaned.startsWith('0') && cleaned.length === 9) {
    cleaned = '0' + cleaned;
  }
  
  return cleaned;
}

/**
 * Format a normalized 10-digit phone number into readable display format (e.g. 0905 123 456)
 */
export function formatDisplayPhone(phone: string | null | undefined): string {
  const norm = normalizeVietnamPhone(phone);
  if (!norm || norm.length < 10) return phone || '';
  return `${norm.slice(0, 4)} ${norm.slice(4, 7)} ${norm.slice(7)}`;
}

// Aliases for backward compatibility
export const normalizePhoneNumber = normalizeVietnamPhone;
export const formatPhoneDisplay = formatDisplayPhone;
