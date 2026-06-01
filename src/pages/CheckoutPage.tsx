import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/tauri";
import { SearchCombobox } from "../components/SearchCombobox";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { useCameraScan } from "../hooks/useCameraScan";
import { usePlatform } from "../hooks/usePlatform";
import type { Citizen, Product, SaleItemInput } from "../../shared/types";
import {
  citizenDisplayFio,
  citizenDisplayNationality,
} from "../utils/citizen";
import { normalizeScanCode } from "../utils/scan";

type CheckoutMode = "scan" | "menu";

const SUGGESTION_LIMIT = 15;

interface CartLine extends SaleItemInput {
  key: string;
  maxQty?: number;
}

async function resolveCitizen(raw: string) {
  const parsed = await api.parseQr(raw);
  return api.getCitizenByQr(parsed ?? raw);
}

export function CheckoutPage() {
  const { isMobile } = usePlatform();
  const { startScan, scanner } = useCameraScan();
  const [mode, setMode] = useState<CheckoutMode>("scan");
  const [buyer, setBuyer] = useState<Citizen | null>(null);
  const [cart, setCart] = useState<CartLine[]>([]);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const buyerInputRef = useRef<HTMLInputElement>(null);
  const productInputRef = useRef<HTMLInputElement>(null);
  const [manualBuyer, setManualBuyer] = useState("");
  const [manualProduct, setManualProduct] = useState("");

  const cartTotal = cart.reduce(
    (sum, line) => sum + line.unit_price * line.quantity,
    0,
  );

  const searchCitizens = useCallback(
    (query: string) => api.listCitizens(query, SUGGESTION_LIMIT),
    [],
  );

  const searchProducts = useCallback(
    (query: string) => api.listProducts(query, SUGGESTION_LIMIT, true),
    [],
  );

  const resolveBuyer = useCallback(async (raw: string) => {
    setError("");
    try {
      const citizen = await resolveCitizen(raw);
      if (!citizen) {
        setError(
          `Покупатель не найден (${raw}). Обновите реестр в разделе «Покупатели».`,
        );
        setBuyer(null);
        return;
      }
      setBuyer(citizen);
      setStatus(
        `Покупатель: ${citizenDisplayFio(citizen)}, ${citizenDisplayNationality(citizen)}`,
      );
      productInputRef.current?.focus();
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const addProductByBarcode = useCallback(
    async (barcode: string) => {
      setError("");
      if (!buyer) {
        setError("Сначала выберите покупателя");
        return;
      }
      try {
        const product = await api.getProductByBarcode(normalizeScanCode(barcode));
        if (!product) {
          setError(`Товар «${barcode}» не найден. Добавьте в разделе «Товары».`);
          return;
        }
        if (product.stock_qty <= 0) {
          setError(`«${product.name}» нет на складе`);
          return;
        }
        setCart((prev) => {
          const existing = prev.find((l) => l.product_id === product.id);
          if (existing) {
            const cap = existing.maxQty ?? product.stock_qty;
            if (existing.quantity >= cap) {
              setError(`Недостаточно «${product.name}» на складе`);
              return prev;
            }
            return prev.map((l) =>
              l.product_id === product.id
                ? { ...l, quantity: l.quantity + 1 }
                : l,
            );
          }
          return [
            ...prev,
            {
              key: `${product.id}-${Date.now()}`,
              product_id: product.id,
              barcode: product.barcode,
              name: product.name,
              quantity: 1,
              unit_price: product.price,
            },
          ];
        });
        setStatus(`Добавлено: ${product.name}`);
      } catch (e) {
        setError(String(e));
      }
    },
    [buyer],
  );

  const addProductFromList = (product: Product) => {
    setError("");
    if (!buyer) {
      setError("Сначала выберите покупателя");
      return;
    }
    if (product.stock_qty <= 0) {
      setError(`«${product.name}» нет на складе`);
      return;
    }
    setCart((prev) => {
      const existing = prev.find((l) => l.product_id === product.id);
      if (existing) {
        if (existing.quantity >= product.stock_qty) {
          setError(`Недостаточно «${product.name}» на складе`);
          return prev;
        }
        return prev.map((l) =>
          l.product_id === product.id
            ? { ...l, quantity: l.quantity + 1, maxQty: product.stock_qty }
            : l,
        );
      }
      return [
        ...prev,
        {
          key: `${product.id}-${Date.now()}`,
          product_id: product.id,
          barcode: product.barcode,
          name: product.name,
          quantity: 1,
          unit_price: product.price,
          maxQty: product.stock_qty,
        },
      ];
    });
    setStatus(`Добавлено: ${product.name}`);
  };

  useBarcodeScanner({
    enabled: mode === "scan",
    onScan: (code) => {
      if (!buyer) void resolveBuyer(code);
      else void addProductByBarcode(code);
    },
  });

  useEffect(() => {
    if (isMobile) return;
    const onKey = (e: KeyboardEvent) => {
      if (mode !== "scan") return;
      if (e.key === "F2") {
        e.preventDefault();
        buyerInputRef.current?.focus();
      }
      if (e.key === "F4") {
        e.preventDefault();
        productInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [isMobile, mode]);

  const changeQty = (key: string, delta: number) => {
    setError("");
    setCart((prev) => {
      const line = prev.find((l) => l.key === key);
      if (!line || line.maxQty == null) return prev;
      const next = line.quantity + delta;
      if (next < 1) return prev.filter((l) => l.key !== key);
      if (next > line.maxQty) {
        setError(`Максимум ${line.maxQty} шт. для «${line.name}»`);
        return prev;
      }
      return prev.map((l) =>
        l.key === key ? { ...l, quantity: next } : l,
      );
    });
  };

  const commitSale = async () => {
    if (!buyer || cart.length === 0) return;
    setBusy(true);
    setError("");
    try {
      await api.createSale({
        citizen_qr_lookup: buyer.qr_lookup,
        citizen_fio: citizenDisplayFio(buyer),
        citizen_group: buyer.group,
        items: cart.map(
          ({ product_id, barcode, name, quantity, unit_price }) => ({
            product_id,
            barcode,
            name,
            quantity,
            unit_price,
          }),
        ),
      });
      setCart([]);
      setBuyer(null);
      setManualBuyer("");
      setManualProduct("");
      setStatus("Продажа оформлена");
      buyerInputRef.current?.focus();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const removeLine = (key: string) => {
    setCart((prev) => prev.filter((l) => l.key !== key));
  };

  const clearCheckout = () => {
    setCart([]);
    setBuyer(null);
    setManualBuyer("");
    setManualProduct("");
    setStatus("");
    setError("");
  };

  const renderCartLines = () =>
    cart.map((line) => (
      <li key={line.key} className="cart-item">
        <div>
          <strong>{line.name}</strong>
          <div className="muted">
            {line.quantity} × {line.unit_price.toFixed(2)} ₽
          </div>
        </div>
        <div className="cart-item-actions">
          {mode === "menu" && line.maxQty != null && (
            <div className="qty-controls">
              <button
                type="button"
                className="qty-btn"
                onClick={() => changeQty(line.key, -1)}
                aria-label="Меньше"
              >
                −
              </button>
              <span className="qty-value">{line.quantity}</span>
              <button
                type="button"
                className="qty-btn"
                onClick={() => changeQty(line.key, 1)}
                aria-label="Больше"
              >
                +
              </button>
            </div>
          )}
          <span>{(line.unit_price * line.quantity).toFixed(2)}</span>
          <button
            type="button"
            className="link-btn"
            onClick={() => removeLine(line.key)}
          >
            ✕
          </button>
        </div>
      </li>
    ));

  return (
    <div className={`page checkout-page ${isMobile ? "mobile-page" : ""}`}>
      {scanner}

      <header className="page-header">
        <h1>Касса</h1>
        <p>
          {mode === "scan"
            ? isMobile
              ? "Сканируйте паспорт и товары"
              : "Сканер: QR паспорта (F2), штрихкоды (F4)"
            : "Выбор покупателя и товаров из списка"}
        </p>
      </header>

      <div className="checkout-mode-tabs chart-tabs">
        <button
          type="button"
          className={mode === "scan" ? "active" : ""}
          onClick={() => {
            setMode("scan");
            setError("");
          }}
        >
          Сканер
        </button>
        <button
          type="button"
          className={mode === "menu" ? "active" : ""}
          onClick={() => {
            setMode("menu");
            setError("");
          }}
        >
          Из списка
        </button>
      </div>

      {mode === "scan" ? (
        <div className="checkout-grid">
          <section className="panel buyer-panel">
            <h2>Покупатель</h2>
            {isMobile ? (
              <button
                type="button"
                className="primary scan-btn"
                onClick={() =>
                  startScan("QR паспорта", (code) => void resolveBuyer(code))
                }
              >
                Сканировать паспорт
              </button>
            ) : (
              <div className="field-row">
                <input
                  ref={buyerInputRef}
                  placeholder="QR паспорта или qr_lookup (F2)"
                  value={manualBuyer}
                  onChange={(e) => setManualBuyer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualBuyer.trim()) {
                      void resolveBuyer(manualBuyer.trim());
                    }
                  }}
                />
                <button
                  type="button"
                  onClick={() =>
                    manualBuyer.trim() && void resolveBuyer(manualBuyer.trim())
                  }
                >
                  Найти
                </button>
              </div>
            )}
            {buyer && (
              <div className="buyer-card">
                <strong>{citizenDisplayFio(buyer)}</strong>
                <div>Национальность: {citizenDisplayNationality(buyer)}</div>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setBuyer(null)}
                >
                  Сменить
                </button>
              </div>
            )}
          </section>

          <section className="panel scan-panel">
            <h2>Товар</h2>
            {isMobile ? (
              <button
                type="button"
                className="primary scan-btn"
                disabled={!buyer}
                onClick={() =>
                  startScan(
                    "Штрихкод товара",
                    (code) => void addProductByBarcode(code),
                    { continuous: true },
                  )
                }
              >
                Сканировать товар
              </button>
            ) : (
              <div className="field-row">
                <input
                  ref={productInputRef}
                  placeholder="Штрихкод (F4)"
                  value={manualProduct}
                  onChange={(e) => setManualProduct(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && manualProduct.trim()) {
                      void addProductByBarcode(manualProduct.trim());
                      setManualProduct("");
                    }
                  }}
                  disabled={!buyer}
                />
                <button
                  type="button"
                  disabled={!buyer || !manualProduct.trim()}
                  onClick={() => {
                    void addProductByBarcode(manualProduct.trim());
                    setManualProduct("");
                  }}
                >
                  Добавить
                </button>
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className={isMobile ? "mobile-stack" : "manual-sale-grid"}>
          <section className="panel">
            <h2>Покупатель</h2>
            {!buyer ? (
              <SearchCombobox<Citizen>
                placeholder="ФИО, паспорт, QR…"
                onSearch={searchCitizens}
                onSelect={(c) => {
                  setBuyer(c);
                  setError("");
                  setStatus(`Покупатель: ${citizenDisplayFio(c)}`);
                }}
                getOptionKey={(c) => c.id}
                getLabel={(c) => citizenDisplayFio(c)}
                getHint={(c) => c.passport_number || c.qr_lookup}
              />
            ) : (
              <div className="buyer-card selected-buyer">
                <strong>{citizenDisplayFio(buyer)}</strong>
                <div className="muted">
                  {citizenDisplayNationality(buyer)}
                  {buyer.passport_number && ` · ${buyer.passport_number}`}
                </div>
                <button
                  type="button"
                  className="link-btn"
                  onClick={() => setBuyer(null)}
                >
                  Сменить
                </button>
              </div>
            )}
          </section>

          <section className="panel">
            <h2>Товары</h2>
            {!buyer ? (
              <p className="muted">Сначала выберите покупателя</p>
            ) : (
              <SearchCombobox<Product>
                placeholder="Название или штрихкод…"
                onSearch={searchProducts}
                onSelect={(p) => addProductFromList(p)}
                getOptionKey={(p) => p.id}
                getLabel={(p) => p.name}
                getHint={(p) =>
                  `${p.price.toFixed(2)} ₽ · остаток ${p.stock_qty}`
                }
                isOptionDisabled={(p) => p.stock_qty <= 0}
              />
            )}
          </section>
        </div>
      )}

      <section className="panel cart-panel">
        <div className="cart-header">
          <h2>Корзина</h2>
          <span className="cart-total">{cartTotal.toFixed(2)} ₽</span>
        </div>
        {cart.length === 0 ? (
          <p className="muted">Корзина пуста</p>
        ) : isMobile ? (
          <ul className="cart-list">{renderCartLines()}</ul>
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Товар</th>
                <th>Штрихкод</th>
                <th>Цена</th>
                <th>Кол-во</th>
                <th>Сумма</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line) => (
                <tr key={line.key}>
                  <td>{line.name}</td>
                  <td>{line.barcode}</td>
                  <td>{line.unit_price.toFixed(2)}</td>
                  <td>
                    {mode === "menu" && line.maxQty != null ? (
                      <div className="qty-controls table-qty">
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => changeQty(line.key, -1)}
                        >
                          −
                        </button>
                        <span>{line.quantity}</span>
                        <button
                          type="button"
                          className="qty-btn"
                          onClick={() => changeQty(line.key, 1)}
                        >
                          +
                        </button>
                      </div>
                    ) : (
                      line.quantity
                    )}
                  </td>
                  <td>{(line.unit_price * line.quantity).toFixed(2)}</td>
                  <td>
                    <button
                      type="button"
                      className="link-btn"
                      onClick={() => removeLine(line.key)}
                    >
                      ✕
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {!isMobile && (
          <div className="actions">
            <button
              type="button"
              className="primary"
              disabled={!buyer || cart.length === 0 || busy}
              onClick={() => void commitSale()}
            >
              {busy ? "Оформление…" : "Оформить продажу"}
            </button>
            <button type="button" onClick={clearCheckout}>
              Очистить
            </button>
          </div>
        )}
      </section>

      {isMobile && (
        <footer className="checkout-footer">
          <div className="checkout-footer-total">
            <span>Итого</span>
            <strong>{cartTotal.toFixed(2)} ₽</strong>
          </div>
          <button
            type="button"
            className="primary checkout-commit"
            disabled={!buyer || cart.length === 0 || busy}
            onClick={() => void commitSale()}
          >
            {busy ? "Оформление…" : "Оформить"}
          </button>
        </footer>
      )}

      {status && <div className="status-msg">{status}</div>}
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
