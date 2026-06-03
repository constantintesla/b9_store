import type { Citizen } from "../../shared/types";

const PASSPORT_GROUP = "Паспорта липа";
const PASSPORT_GROUP_DISPLAY = "Местные";

/** Группа для UI: «Паспорта липа» → «Местные» (как в b9_docs). */
export function displayGroupLabel(group: string): string {
  const g = group.trim();
  if (g === PASSPORT_GROUP || g === PASSPORT_GROUP_DISPLAY) {
    return PASSPORT_GROUP_DISPLAY;
  }
  return g || "—";
}

export function citizenDisplayGroup(c: Citizen): string {
  return displayGroupLabel(c.group);
}

/** ФИО для отображения: фио → фамилия + имя → позывной */
export function citizenDisplayFio(c: Citizen): string {
  const fio = c.fio.trim();
  if (fio) return fio;

  const parts = [c.surname.trim(), c.first_name.trim()].filter(Boolean);
  if (parts.length) return parts.join(" ");

  return c.nickname.trim() || "—";
}

export function citizenDisplayNationality(c: Citizen): string {
  return c.nationality.trim() || "—";
}

/** Номер документа / паспорта (как на user_card и в QR). */
export function citizenDisplayDocumentNumber(c: Citizen): string {
  const doc = c.passport_number.trim() || c.number.trim();
  return doc || c.qr_lookup.trim() || "—";
}
