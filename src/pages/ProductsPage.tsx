import { useCallback, useEffect, useState } from "react";
import { api } from "../api/tauri";
import { useBarcodeScanner } from "../hooks/useBarcodeScanner";
import { usePlatform } from "../hooks/usePlatform";
import type { Product, ProductInput } from "../../shared/types";

const emptyForm = (): ProductInput => ({
  barcode: "",
  name: "",
  price: 0,
  stock_qty: 0,
  active: true,
});

export function ProductsPage() {
  const { isMobile } = usePlatform();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState<ProductInput>(emptyForm());
  const [editingId, setEditingId] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const load = useCallback(async () => {
    try {
      setProducts(await api.listProducts(search || undefined));
    } catch (e) {
      setError(String(e));
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  useBarcodeScanner({
    enabled: !isMobile,
    onScan: (code) => {
      setForm((prev) => ({ ...prev, barcode: code }));
      setStatus(`Отсканирован штрихкод: ${code}`);
    },
  });

  const save = async () => {
    setError("");
    try {
      if (editingId) {
        await api.updateProduct(editingId, form);
        setStatus("Товар обновлён");
      } else {
        await api.createProduct(form);
        setStatus("Товар добавлен");
      }
      setForm(emptyForm());
      setEditingId(null);
      await load();
    } catch (e) {
      setError(String(e));
    }
  };

  const edit = (p: Product) => {
    setEditingId(p.id);
    setForm({
      barcode: p.barcode,
      name: p.name,
      price: p.price,
      stock_qty: p.stock_qty,
      active: p.active,
    });
  };

  const remove = async (id: number) => {
    if (!confirm("Удалить товар?")) return;
    await api.deleteProduct(id);
    await load();
  };

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      <header className="page-header">
        <h1>Товары</h1>
        <p>{isMobile ? "Список товаров" : "CRUD и быстрое добавление по штрихкоду"}</p>
      </header>

      <div className={isMobile ? "mobile-stack" : "two-col"}>
        {!isMobile && (
        <section className="panel">
          <h2>{editingId ? "Редактирование" : "Новый товар"}</h2>
          <div className="form-grid">
            <label>
              Штрихкод
              <input
                value={form.barcode}
                onChange={(e) => setForm({ ...form, barcode: e.target.value })}
              />
            </label>
            <label>
              Название
              <input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              Цена
              <input
                type="number"
                step="0.01"
                value={form.price}
                onChange={(e) =>
                  setForm({ ...form, price: Number(e.target.value) })
                }
              />
            </label>
            <label>
              Остаток
              <input
                type="number"
                value={form.stock_qty}
                onChange={(e) =>
                  setForm({ ...form, stock_qty: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <div className="actions">
            <button type="button" className="primary" onClick={() => void save()}>
              {editingId ? "Сохранить" : "Добавить"}
            </button>
            {editingId && (
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(emptyForm());
                }}
              >
                Отмена
              </button>
            )}
          </div>
        </section>
        )}

        <section className="panel">
          <div className="field-row">
            <input
              placeholder="Поиск по названию или штрихкоду"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="button" onClick={() => void load()}>
              Найти
            </button>
          </div>
          {isMobile ? (
            <ul className="product-cards">
              {products.map((p) => (
                <li key={p.id} className="product-card">
                  <strong>{p.name}</strong>
                  <div>
                    {p.price.toFixed(2)} ₽ · остаток {p.stock_qty}
                  </div>
                  <div className="muted">{p.barcode}</div>
                </li>
              ))}
            </ul>
          ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>Штрихкод</th>
                <th>Название</th>
                <th>Цена</th>
                <th>Остаток</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.barcode}</td>
                  <td>{p.name}</td>
                  <td>{p.price.toFixed(2)}</td>
                  <td>{p.stock_qty}</td>
                  <td>
                    <button type="button" className="link-btn" onClick={() => edit(p)}>
                      Изм.
                    </button>
                    <button type="button" className="link-btn danger" onClick={() => void remove(p.id)}>
                      Удал.
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
