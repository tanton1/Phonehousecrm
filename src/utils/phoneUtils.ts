/**
 * Utility helper to normalize and validate Vietnamese phone numbers consistently across PhoneHouse CRM & ERP
 * 
 * Normalization Rules:
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
 * Vietnam Mobile Network Prefixes (Viettel, Vinaphone, Mobifone, Vietnamobile, Gmobile, Itelecom, Wintel)
 * - Viettel: 086, 096, 097, 098, 032, 033, 034, 035, 036, 037, 038, 039
 * - Mobifone: 089, 090, 093, 070, 079, 077, 076, 078
 * - Vinaphone: 088, 091, 094, 083, 084, 085, 081, 082
 * - Vietnamobile: 092, 056, 058, 052
 * - Gmobile: 099, 059
 * - Itelecom / Wintel / MVNO: 087, 055
 */
const VIETNAM_MOBILE_PREFIX_REGEX = /^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])[0-9]{7}$/;

/**
 * Strictly validates if a string is a legitimate 10-digit Vietnamese mobile phone number.
 */
export function isValidVietnamPhone(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const normalized = normalizeVietnamPhone(phone);
  return VIETNAM_MOBILE_PREFIX_REGEX.test(normalized);
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
