import type { Citizen } from "../../shared/types";

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
