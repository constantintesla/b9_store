/** Нормализация штрихкода / QR после сканера или ручного ввода. */
export function normalizeScanCode(raw: string): string {
  return raw.trim().replace(/\s+/g, "");
}

/** Нужно ли прогонять через parse_qr (паспорт / URL), а не сохранять как штрихкод. */
export function looksLikeUrlOrCitizenQr(raw: string): boolean {
  const t = raw.trim();
  return t.includes("://") || t.includes("/v/");
}
