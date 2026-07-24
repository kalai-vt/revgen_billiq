export const INDIA_COUNTRY_CODE = '+91';

export function stripCountryCode(phone: string): string {
  const trimmed = phone.trim();
  return trimmed.startsWith(INDIA_COUNTRY_CODE) ? trimmed.slice(INDIA_COUNTRY_CODE.length).trim() : trimmed;
}

export function withCountryCode(number: string): string {
  return `${INDIA_COUNTRY_CODE}${number.replace(/\D/g, '')}`;
}
