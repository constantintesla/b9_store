const INTERNAL_BARCODE_PREFIX = "B9-";

/** Товар создан без реального штрихкода (внутренний код в БД). */
export function isInternalBarcode(barcode: string): boolean {
  return barcode.startsWith(INTERNAL_BARCODE_PREFIX);
}

export function formatProductBarcode(barcode: string): string {
  return isInternalBarcode(barcode) ? "—" : barcode;
}
