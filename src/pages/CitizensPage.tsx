import { useCallback, useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";
import { api } from "../api/tauri";
import type { Citizen } from "../../shared/types";
import { citizenDisplayFio, citizenDisplayNationality } from "../utils/citizen";
import { isMobilePlatform, usePlatform } from "../hooks/usePlatform";

const emptyManual = { fio: "", passport_number: "" };

export function CitizensPage() {
  const { isMobile } = usePlatform();
  const [citizens, setCitizens] = useState<Citizen[]>([]);
  const [search, setSearch] = useState("");
  const [count, setCount] = useState(0);
  const [importedAt, setImportedAt] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [manual, setManual] = useState(emptyManual);

  const load = useCallback(async () => {
    try {
      const [list, total, imported] = await Promise.all([
        api.listCitizens(search || undefined, 500),
        api.getCitizensCount(),
        api.getCitizensImportInfo(),
      ]);
      setCitizens(list);
      setCount(total);
      setImportedAt(imported);
    } catch (e) {
      setError(String(e));
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const importRegistry = async () => {
    setError("");
    const path = await open({
      title: "Выберите registry.db из b9_docs",
      filters: [{ name: "SQLite", extensions: ["db"] }],
      multiple: false,
    });
    if (!path || typeof path !== "string") return;

    setBusy(true);
    try {
      const mobile = await isMobilePlatform();
      const imported = mobile
        ? await api.importCitizensFromBytes(
            Array.from(await readFile(path)),
          )
        : await api.importCitizensFromRegistry(path);
      setStatus(`Импортировано записей: ${imported}`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const addManual = async () => {
    setError("");
    setStatus("");
    setBusy(true);
    try {
      const created = await api.createCitizen(manual);
      setManual(emptyManual);
      setStatus(`Добавлен: ${created.fio}`);
      await load();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      <header className="page-header">
        <h1>Покупатели</h1>
        <p>
          Реестр и ручное добавление · всего: {count}
          {importedAt && ` · импорт: ${importedAt}`}
        </p>
      </header>

      <section className="panel form-panel">
        <h2>Добавить вручную</h2>
        <div className={`form-grid ${isMobile ? "single-col" : ""}`}>
          <label>
            ФИО
            <input
              value={manual.fio}
              onChange={(e) => setManual({ ...manual, fio: e.target.value })}
              placeholder="Иванов Иван Иванович"
            />
          </label>
          <label>
            Номер паспорта
            <input
              value={manual.passport_number}
              onChange={(e) =>
                setManual({ ...manual, passport_number: e.target.value })
              }
              placeholder="1234 567890"
            />
          </label>
        </div>
        <div className="actions">
          <button
            type="button"
            className="primary"
            disabled={busy}
            onClick={() => void addManual()}
          >
            {busy ? "Сохранение…" : "Добавить покупателя"}
          </button>
        </div>
        <p className="muted" style={{ marginTop: "0.5rem" }}>
          На кассе можно ввести номер паспорта вместо QR.
        </p>
      </section>

      <div className="actions top-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => void importRegistry()}
        >
          {busy ? "Импорт…" : "Импорт registry.db"}
        </button>
        <input
          placeholder="Поиск: ФИО, позывной, номер, паспорт, QR"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <button type="button" onClick={() => void load()}>
          Найти
        </button>
      </div>

      <section className="panel">
        {isMobile ? (
          <ul className="citizen-list">
            {citizens.map((c) => (
              <li key={c.id} className="citizen-card">
                <strong>{citizenDisplayFio(c)}</strong>
                <div>{citizenDisplayNationality(c)}</div>
                <div className="muted">
                  паспорт: {c.passport_number || "—"} · {c.group || "—"} ·{" "}
                  {c.qr_lookup}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>ФИО</th>
                <th>Паспорт</th>
                <th>Национальность</th>
                <th>Позывной</th>
                <th>Группа</th>
                <th>QR</th>
              </tr>
            </thead>
            <tbody>
              {citizens.map((c) => (
                <tr key={c.id}>
                  <td>{citizenDisplayFio(c)}</td>
                  <td>{c.passport_number || "—"}</td>
                  <td>{citizenDisplayNationality(c)}</td>
                  <td>{c.nickname}</td>
                  <td>{c.group}</td>
                  <td>{c.qr_lookup}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {status && <div className="status-msg">{status}</div>}
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
