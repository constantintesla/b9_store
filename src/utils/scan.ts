/** Нормализация штрихкода / QR после сканера или ручного ввода. */
export function normalizeScanCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/** Типичный линейный штрихкод (EAN/UPC), не паспортный QR. */
export function isLikelyProductBarcode(raw: string): boolean {
  const code = normalizeScanCode(raw);
  return /^\d{8,14}$/.test(code);
}

/** Нужно ли прогонять через parse_qr (паспорт / URL), а не сохранять как штрихкод. */
export function looksLikeUrlOrCitizenQr(raw: string): boolean {
  if (isLikelyProductBarcode(raw)) return false;
  const t = raw.trim();
  return t.includes("://") || t.includes("/v/");
}
