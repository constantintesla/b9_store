import { useCallback, useMemo, useState } from "react";
import { api } from "../api/tauri";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useCameraScan } from "../hooks/useCameraScan";
import { usePlatform } from "../hooks/usePlatform";
import type { Product } from "../../shared/types";
import {
  looksLikeUrlOrCitizenQr,
  normalizeScanCode,
} from "../utils/scan";

interface PendingScan {
  code: string;
  existing: Product | null;
}

export function AddProductsPage() {
  const { isMobile } = usePlatform();
  const { startScan, scanner } = useCameraScan();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [scans, setScans] = useState<string[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const codeCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const code of scans) {
      map.set(code, (map.get(code) ?? 0) + 1);
    }
    return [...map.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [scans]);

  const totalQty = scans.length;

  const resolveRawCode = useCallback(async (raw: string): Promise<string | null> => {
    let code = normalizeScanCode(raw);
    if (!code) return null;

    if (looksLikeUrlOrCitizenQr(raw)) {
      try {
        const parsed = await api.parseQr(raw.trim());
        if (parsed) code = normalizeScanCode(parsed);
      } catch {
        /* штрихкод как есть */
      }
    }
    return code;
  }, []);

  const lookupCode = useCallback(
    async (raw: string) => {
      setError("");
      setLookupBusy(true);
      try {
        const code = await resolveRawCode(raw);
        if (!code) {
          setError("Не удалось распознать код");
          setPending(null);
          return;
        }

        const existing = await api.getProductByBarcode(code);
        setPending({ code, existing });
        if (existing) {
          setStatus(`Найден: ${existing.name}`);
        } else {
          setStatus(`Код ${code} — новый товар`);
        }
      } catch (e) {
        setError(String(e));
        setPending(null);
      } finally {
        setLookupBusy(false);
      }
    },
    [resolveRawCode],
  );

  const addPendingToList = useCallback(() => {
    if (!pending) return;
    setScans((prev) => [...prev, pending.code]);
    setStatus(`В списке: ${pending.code}`);
    setPending(null);
    setManualCode("");
  }, [pending]);

  useBarcodeScanner({
    enabled: !lookupBusy,
    onScan: (code) => {
      void lookupCode(code);
    },
  });

  const removeCode = (code: string) => {
    setScans((prev) => {
      const idx = prev.indexOf(code);
      if (idx === -1) return prev;
      return [...prev.slice(0, idx), ...prev.slice(idx + 1)];
    });
  };

  const clearScans = () => {
    setScans([]);
    setPending(null);
    setStatus("");
  };

  const submit = async () => {
    setError("");
    const productName = name.trim();
    const productPrice = Number(price);

    if (!productName) {
      setError("Введите название товара");
      return;
    }
    if (!Number.isFinite(productPrice) || productPrice < 0) {
      setError("Укажите корректную цену");
      return;
    }
    if (codeCounts.length === 0) {
      setError("Добавьте в список хотя бы один штрихкод");
      return;
    }

    setBusy(true);
    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    try {
      for (const [barcode, qty] of codeCounts) {
        const existing = await api.getProductByBarcode(barcode);
        if (existing) {
          if (existing.name === productName && existing.price === productPrice) {
            await api.updateProduct(existing.id, {
              barcode: existing.barcode,
              name: productName,
              price: productPrice,
              stock_qty: existing.stock_qty + qty,
              active: true,
            });
            updated += 1;
          } else {
            errors.push(
              `«${barcode}» уже занят товаром «${existing.name}»`,
            );
          }
          continue;
        }

        await api.createProduct({
          barcode,
          name: productName,
          price: productPrice,
          stock_qty: qty,
          active: true,
        });
        created += 1;
      }

      if (created === 0 && updated === 0 && errors.length > 0) {
        setError(errors.join("; "));
        return;
      }

      setName("");
      setPrice("");
      setScans([]);
      setManualCode("");
      setPending(null);
      const parts = [];
      if (created) parts.push(`добавлено: ${created}`);
      if (updated) parts.push(`остаток увеличен: ${updated}`);
      setStatus(`Готово (${parts.join(", ")})`);
      if (errors.length) {
        setError(errors.join("; "));
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const nameMismatch =
    pending?.existing &&
    name.trim() &&
    pending.existing.name !== name.trim();

  const priceMismatch =
    pending?.existing &&
    price !== "" &&
    Number.isFinite(Number(price)) &&
    pending.existing.price !== Number(price);

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      {scanner}
      <header className="page-header">
        <h1>Добавление товаров</h1>
        <p>
          Сканируйте код → проверьте результат → нажмите «Добавить в список».
          В конце — «Сохранить на склад».
        </p>
      </header>

      <section className={`panel scan-preview ${pending ? "scan-preview-active" : ""}`}>
        <h2>Результат сканирования</h2>
        {lookupBusy && <p className="muted">Поиск…</p>}
        {!lookupBusy && !pending && (
          <p className="muted">
            Наведите сканер на штрихкод или QR — здесь появится карточка товара
          </p>
        )}
        {pending && !lookupBusy && (
          <>
            <div className="scan-preview-code">
              <span className="muted">Код</span>
              <code>{pending.code}</code>
            </div>
            {pending.existing ? (
              <div className="scan-preview-found">
                <span className="scan-preview-badge found">В базе</span>
                <strong>{pending.existing.name}</strong>
                <div className="muted">
                  Цена: {pending.existing.price.toFixed(2)} ₽ · на складе:{" "}
                  {pending.existing.stock_qty}
                </div>
                {(nameMismatch || priceMismatch) && (
                  <p className="scan-preview-warn">
                    Название или цена в форме не совпадают с товаром в базе —
                    при сохранении код может быть отклонён.
                  </p>
                )}
                <p className="muted">
                  В список: +1 к остатку этого товара (при совпадении названия и
                  цены)
                </p>
              </div>
            ) : (
              <div className="scan-preview-found">
                <span className="scan-preview-badge new">Новый</span>
                <p>
                  Товара с таким кодом нет — будет создан с названием и ценой из
                  формы ниже
                </p>
              </div>
            )}
            <div className="actions scan-preview-actions">
              <button
                type="button"
                className="primary"
                onClick={addPendingToList}
              >
                Добавить в список
              </button>
              <button type="button" onClick={() => setPending(null)}>
                Отмена
              </button>
            </div>
          </>
        )}
      </section>

      <div className="two-col">
        <section className="panel">
          <h2>Параметры</h2>
          <div className="form-grid single-col">
            <label>
              Название
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Чай пакетик"
              />
            </label>
            <label>
              Цена
              <input
                type="number"
                step="0.01"
                min="0"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>

          <h2>Сканирование</h2>
          {isMobile && (
            <button
              type="button"
              className="primary scan-btn"
              disabled={lookupBusy}
              onClick={() =>
                startScan("Штрихкод / QR", (code) => void lookupCode(code))
              }
            >
              Сканировать камерой
            </button>
          )}
          <div className="field-row">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Штрихкод / QR вручную"
              onKeyDown={(e) => {
                if (e.key === "Enter" && manualCode.trim()) {
                  void lookupCode(manualCode.trim());
                }
              }}
            />
            <button
              type="button"
              disabled={lookupBusy || !manualCode.trim()}
              onClick={() => void lookupCode(manualCode.trim())}
            >
              Найти
            </button>
          </div>

          <div className="scan-summary">
            В списке: <strong>{totalQty}</strong> шт. · уникальных кодов:{" "}
            <strong>{codeCounts.length}</strong>
          </div>

          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy || codeCounts.length === 0}
              onClick={() => void submit()}
            >
              {busy ? "Сохранение…" : "Сохранить на склад"}
            </button>
            <button
              type="button"
              disabled={busy || (scans.length === 0 && !pending)}
              onClick={clearScans}
            >
              Очистить
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Список к сохранению</h2>
          {codeCounts.length === 0 ? (
            <p className="muted">Пока пусто — подтвердите сканы кнопкой выше</p>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Код</th>
                  <th>Кол-во</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {codeCounts.map(([code, qty]) => (
                  <tr key={code}>
                    <td>
                      <code>{code}</code>
                    </td>
                    <td>{qty}</td>
                    <td>
                      <button
                        type="button"
                        className="link-btn"
                        onClick={() => removeCode(code)}
                      >
                        −1
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>

      {status && <div className="status-msg">{status}</div>}
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
