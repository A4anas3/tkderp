/**
 * Utility functions for Indian phone/mobile number normalization and validation.
 */

/**
 * Strips all non-digit characters from the input, normalizes common prefixes (+91 or leading 0),
 * and caps the string at 10 digits.
 *
 * @param {string} raw - Input string
 * @returns {string} - Clean numeric string (0 to 10 digits)
 */
export function cleanMobileInput(raw) {
  if (!raw) return '';
  let digits = String(raw).replace(/\D/g, '');

  // If user pasted with country code +91 or 91 (12 digits), strip country code
  if (digits.startsWith('91') && digits.length === 12) {
    digits = digits.slice(2);
  }
  // If user entered with leading 0 (11 digits), strip 0
  else if (digits.startsWith('0') && digits.length === 11) {
    digits = digits.slice(1);
  }

  // Cap at 10 numeric digits
  return digits.slice(0, 10);
}

/**
 * Returns true if the given mobile number is valid:
 * - If not required and empty, returns true.
 * - Otherwise, must be strictly 10 numeric digits.
 *
 * @param {string} mobile
 * @param {boolean} required
 * @returns {boolean}
 */
export function isValid10DigitMobile(mobile, required = false) {
  if (!mobile || !String(mobile).trim()) {
    return !required;
  }
  const clean = cleanMobileInput(mobile);
  return clean.length === 10 && /^\d{10}$/.test(clean);
}

/**
 * Formats a 10-digit mobile number for display (e.g., "98707 66580").
 *
 * @param {string} mobile
 * @returns {string}
 */
export function formatMobileDisplay(mobile) {
  if (!mobile) return '';
  const clean = cleanMobileInput(mobile);
  if (clean.length === 10) {
    return `${clean.slice(0, 5)} ${clean.slice(5)}`;
  }
  return clean;
}
