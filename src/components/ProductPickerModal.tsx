import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/tauri";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { usePlatform } from "../hooks/usePlatform";
import type { Product } from "../../shared/types";
import { formatProductBarcode } from "../utils/product";

const LIST_LIMIT = 150;

interface ProductPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (product: Product) => void;
}

export function ProductPickerModal({
  open,
  onClose,
  onSelect,
}: ProductPickerModalProps) {
  const { isMobile } = usePlatform();
  const [query, setQuery] = useState("");
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const debouncedQuery = useDebouncedValue(query, 300);

  const load = useCallback(async (q: string) => {
    setLoading(true);
    try {
      const trimmed = q.trim();
      const list = await api.listProducts(
        trimmed || undefined,
        LIST_LIMIT,
        true,
      );
      setProducts(list);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    void load("");
    const timer = window.setTimeout(() => searchRef.current?.focus(), 50);
    return () => window.clearTimeout(timer);
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    void load(debouncedQuery);
  }, [debouncedQuery, open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className={`picker-overlay${isMobile ? " picker-overlay--mobile" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="product-picker-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="picker-modal">
        <header className="picker-header">
          <h2 id="product-picker-title">Выбор товара</h2>
          <button
            type="button"
            className="picker-close"
            onClick={onClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </header>
        <div className="picker-search">
          <input
            ref={searchRef}
            type="search"
            placeholder="Название или штрихкод…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoComplete="off"
          />
        </div>
        <div className="picker-body">
          {loading && <p className="combobox-message">Загрузка…</p>}
          {!loading && products.length === 0 && (
            <p className="combobox-message">Ничего не найдено</p>
          )}
          {!loading && products.length > 0 && (
            <ul className="pick-list picker-list">
              {products.map((p) => {
                const outOfStock = p.stock_qty <= 0;
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      className="pick-item"
                      disabled={outOfStock}
                      onClick={() => onSelect(p)}
                    >
                      <strong>{p.name}</strong>
                      <small className="muted">
                        {p.price.toFixed(2)} ₽
                        {p.barcode
                          ? ` · ${formatProductBarcode(p.barcode)}`
                          : ""}
                        {` · остаток ${p.stock_qty}`}
                      </small>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <footer className="picker-footer">
          <button type="button" onClick={onClose}>
            Готово
          </button>
        </footer>
      </div>
    </div>
  );
}
