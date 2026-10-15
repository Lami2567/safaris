/**
 * Generates all common format variants for a phone number in Uganda.
 * Allows users to register as 0772123456 and login as +256772123456, +256 772 123456, or 0772123456.
 */
export function getUgandaPhoneVariants(phone: string): string[] {
  if (!phone || typeof phone !== 'string') return [];
  const trimmed = phone.trim();
  const digitsOnly = trimmed.replace(/\D/g, '');
  if (!digitsOnly) return [trimmed];

  const national = digitsOnly.length >= 9 ? digitsOnly.slice(-9) : digitsOnly;
  const prefix3 = national.substring(0, 3);
  const rest = national.substring(3);

  const set = new Set<string>([
    trimmed,
    `+256${national}`,
    `+256 ${prefix3} ${rest}`,
    `+256 ${national}`,
    `0${national}`,
    `256${national}`,
    national,
  ]);

  return Array.from(set);
}

export function normalizeUgandaPhone(phone: string): string {
  if (!phone || typeof phone !== 'string') return '';
  const digitsOnly = phone.replace(/\D/g, '');
  if (digitsOnly.length >= 9) {
    const national = digitsOnly.slice(-9);
    return `+256 ${national.substring(0, 3)} ${national.substring(3)}`;
  }
  return phone.trim();
}
