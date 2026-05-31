import { useCallback, useMemo, useState } from "react";
import { api } from "../api/tauri";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useCameraScan } from "../hooks/useCameraScan";
import { usePlatform } from "../hooks/usePlatform";

function normalizeCode(raw: string): string {
  return raw.trim();
}

export function AddProductsPage() {
  const { isMobile } = usePlatform();
  const { startScan, scanner } = useCameraScan();
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [scans, setScans] = useState<string[]>([]);
  const [manualCode, setManualCode] = useState("");
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

  const addCode = useCallback(async (raw: string) => {
    const trimmed = normalizeCode(raw);
    if (!trimmed) return;

    let code = trimmed;
    try {
      const parsed = await api.parseQr(trimmed);
      if (parsed) code = parsed;
    } catch {
      /* use raw */
    }

    setScans((prev) => [...prev, code]);
    setStatus(`Отсканировано: ${code}`);
    setError("");
  }, []);

  useBarcodeScanner({
    enabled: !isMobile,
    onScan: (code) => {
      void addCode(code);
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
      setError("Отсканируйте хотя бы один штрихкод или QR");
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

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      {scanner}
      <header className="page-header">
        <h1>Добавление товаров</h1>
        <p>
          Название и цена — затем сканируйте штрихкоды или QR. Повторный скан
          увеличивает количество.
        </p>
      </header>

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
              onClick={() =>
                startScan("Штрихкод / QR", (code) => void addCode(code))
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
                  void addCode(manualCode.trim());
                  setManualCode("");
                }
              }}
            />
            <button
              type="button"
              onClick={() => {
                if (manualCode.trim()) {
                  void addCode(manualCode.trim());
                  setManualCode("");
                }
              }}
            >
              Добавить код
            </button>
          </div>

          <div className="scan-summary">
            Отсканировано: <strong>{totalQty}</strong> · уникальных кодов:{" "}
            <strong>{codeCounts.length}</strong>
          </div>

          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={busy}
              onClick={() => void submit()}
            >
              {busy ? "Сохранение…" : "Добавить товар"}
            </button>
            <button type="button" disabled={busy || scans.length === 0} onClick={clearScans}>
              Очистить коды
            </button>
          </div>
        </section>

        <section className="panel">
          <h2>Отсканированные коды</h2>
          {codeCounts.length === 0 ? (
            <p className="muted">Наведите сканер на штрихкод или QR</p>
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
