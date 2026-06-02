import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../api/tauri";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useCameraScan } from "../hooks/useCameraScan";
import { usePlatform } from "../hooks/usePlatform";
import type { Product } from "../../shared/types";
import {
  looksLikeUrlOrCitizenQr,
  normalizeScanCode,
} from "../utils/scan";
import { formatProductBarcode } from "../utils/product";

type AddMode = "scan" | "manual";

interface PendingScan {
  code: string;
  existing: Product | null;
}

export function AddProductsPage() {
  const { isMobile } = usePlatform();
  const { startScan, scanner } = useCameraScan();
  const [mode, setMode] = useState<AddMode>("scan");
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [manualQty, setManualQty] = useState("1");
  const [scans, setScans] = useState<string[]>([]);
  const [manualCode, setManualCode] = useState("");
  const [pending, setPending] = useState<PendingScan | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [scanInputActive, setScanInputActive] = useState(true);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const lookupSeqRef = useRef(0);
  const addToListRef = useRef<HTMLButtonElement>(null);

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
      const seq = ++lookupSeqRef.current;
      setError("");
      setLookupBusy(true);
      try {
        const code = await resolveRawCode(raw);
        if (seq !== lookupSeqRef.current) return;

        if (!code) {
          setError("Не удалось распознать код");
          setPending(null);
          return;
        }

        const existing = await api.getProductByBarcode(code);
        if (seq !== lookupSeqRef.current) return;

        setPending({ code, existing });
        if (existing) {
          setStatus(`Найден: ${existing.name}`);
        } else {
          setStatus(`Код ${code} — новый товар`);
        }
      } catch (e) {
        if (seq !== lookupSeqRef.current) return;
        setError(String(e));
        setPending(null);
      } finally {
        if (seq === lookupSeqRef.current) {
          setLookupBusy(false);
        }
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

  useEffect(() => {
    if (pending && !lookupBusy) {
      addToListRef.current?.focus();
    }
  }, [pending, lookupBusy]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || !pending || lookupBusy) return;
      const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
      if (tag === "textarea") return;
      if (tag === "input" && e.target !== addToListRef.current) return;
      e.preventDefault();
      addPendingToList();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, lookupBusy, addPendingToList]);

  useBarcodeScanner({
    enabled: mode === "scan" && scanInputActive && !lookupBusy,
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

  const submitManual = async () => {
    setError("");
    const productName = name.trim();
    const productPrice = Number(price);
    const qty = Math.floor(Number(manualQty));

    if (!productName) {
      setError("Введите название товара");
      return;
    }
    if (!Number.isFinite(productPrice) || productPrice < 0) {
      setError("Укажите корректную цену");
      return;
    }
    if (!Number.isFinite(qty) || qty < 1) {
      setError("Укажите количество не меньше 1");
      return;
    }

    setBusy(true);
    try {
      await api.createProduct({
        barcode: "",
        name: productName,
        price: productPrice,
        stock_qty: qty,
        active: true,
      });
      setName("");
      setPrice("");
      setManualQty("1");
      setStatus(`Добавлено на склад: «${productName}» × ${qty} (без штрихкода)`);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
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

  const pauseScanForForm = () => setScanInputActive(false);
  const resumeScanForForm = () => setScanInputActive(true);

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      {scanner}
      <header className="page-header">
        <h1>Добавление товаров</h1>
        <p>
          {mode === "scan"
            ? "Сканируйте код → проверьте результат → «Добавить в список» → «Сохранить на склад»."
            : "Товар без штрихкода — укажите название, цену и количество. На кассе выбирайте «Из списка»."}
        </p>
      </header>

      <div className="checkout-mode-tabs chart-tabs add-mode-tabs">
        <button
          type="button"
          className={mode === "scan" ? "active" : ""}
          onClick={() => {
            setMode("scan");
            setError("");
          }}
        >
          По штрихкоду
        </button>
        <button
          type="button"
          className={mode === "manual" ? "active" : ""}
          onClick={() => {
            setMode("manual");
            setPending(null);
            setError("");
          }}
        >
          Без штрихкода
        </button>
      </div>

      {mode === "manual" ? (
        <section className="panel">
          <h2>Товар без штрихкода</h2>
          <div className="form-grid single-col">
            <label>
              Название
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Например: Хлеб белый"
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
            <label>
              Количество на склад
              <input
                type="number"
                min="1"
                step="1"
                value={manualQty}
                onChange={(e) => setManualQty(e.target.value)}
              />
            </label>
          </div>
          <p className="muted">
            Штрихкод не нужен — товар появится в списке на кассе (вкладка «Из
            списка»).
          </p>
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void submitManual()}
            >
              {busy ? "Сохранение…" : "Сохранить на склад"}
            </button>
          </div>
        </section>
      ) : (
        <>
      <section
        className={`panel scan-preview ${pending ? "scan-preview-active" : ""}`}
        tabIndex={-1}
      >
        <h2>Результат сканирования</h2>
        {lookupBusy && <p className="muted">Поиск…</p>}
        {!lookupBusy && !pending && (
          <p className="muted">
            Наведите USB-сканер или камеру на штрихкод — здесь появится карточка
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
                <strong className="scan-preview-title">
                  {pending.existing.name}
                </strong>
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
                  В список: +1 к остатку (при совпадении названия и цены)
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
                ref={addToListRef}
                type="button"
                className="primary scan-preview-add-btn"
                onClick={addPendingToList}
              >
                Добавить в список
              </button>
              <button type="button" onClick={() => setPending(null)}>
                Отмена
              </button>
            </div>
            <p className="muted scan-preview-enter-hint">
              Enter — добавить в список
            </p>
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
                onFocus={pauseScanForForm}
                onBlur={resumeScanForForm}
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
                onFocus={pauseScanForForm}
                onBlur={resumeScanForForm}
                placeholder="0.00"
              />
            </label>
          </div>

          <h2>Сканирование</h2>
          <p className="muted scan-usb-hint">
            USB-сканер активен, когда курсор не в полях названия и цены
          </p>
          {isMobile && (
            <button
              type="button"
              className="primary scan-btn"
              disabled={lookupBusy}
              onClick={() =>
                startScan("Штрихкод", (code) => void lookupCode(code), {
                  scanProfile: "barcode",
                })
              }
            >
              Сканировать камерой
            </button>
          )}
          <div className="field-row">
            <input
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Штрихкод вручную"
              onFocus={pauseScanForForm}
              onBlur={resumeScanForForm}
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
                      <code>{formatProductBarcode(code)}</code>
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
        </>
      )}

      {status && <div className="status-msg">{status}</div>}
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
