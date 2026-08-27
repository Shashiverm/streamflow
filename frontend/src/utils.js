/**
 * StreamFlow — Security & Formatting Utilities
 */

/**
 * Escapes HTML characters to prevent XSS injection in innerHTML strings.
 */
export function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Validates a Stellar Public Key format (G... 56 characters, base32).
 */
export function isValidStellarAddress(address) {
  if (!address || typeof address !== 'string') return false;
  return /^G[A-Z2-7]{55}$/.test(address.trim());
}

/**
 * Validates a Stellar Secret Key format (S... 56 characters, base32).
 */
export function isValidStellarSecret(secret) {
  if (!secret || typeof secret !== 'string') return false;
  return /^S[A-Z2-7]{55}$/.test(secret.trim());
}
