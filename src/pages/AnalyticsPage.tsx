import { useEffect, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api } from "../api/tauri";
import { displayGroupLabel } from "../utils/citizen";
import { usePlatform } from "../hooks/usePlatform";
import type {
  AnalyticsOverview,
  MonthlySales,
  TopBuyer,
  TopProduct,
} from "../../shared/types";

export function AnalyticsPage() {
  const { isMobile } = usePlatform();
  const [chartTab, setChartTab] = useState<"monthly" | "products">("monthly");
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [topProducts, setTopProducts] = useState<TopProduct[]>([]);
  const [topBuyers, setTopBuyers] = useState<TopBuyer[]>([]);
  const [monthly, setMonthly] = useState<MonthlySales[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    void (async () => {
      try {
        const [o, tp, tb, m] = await Promise.all([
          api.analyticsOverview(),
          api.analyticsTopProducts(5),
          api.analyticsTopBuyers(5),
          api.analyticsMonthlySales(),
        ]);
        setOverview(o);
        setTopProducts(tp);
        setTopBuyers(tb);
        setMonthly(m);
      } catch (e) {
        setError(String(e));
      }
    })();
  }, []);

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      <header className="page-header">
        <h1>Аналитика</h1>
        <p>Локальная статистика продаж</p>
      </header>

      {overview && (
        <div className="kpi-grid">
          <div className="kpi-card">
            <span>Выручка</span>
            <strong>{overview.total_revenue.toFixed(2)} ₽</strong>
          </div>
          <div className="kpi-card">
            <span>Чеков</span>
            <strong>{overview.sale_count}</strong>
          </div>
          <div className="kpi-card">
            <span>Товаров</span>
            <strong>{overview.product_count}</strong>
          </div>
          <div className="kpi-card">
            <span>Покупателей</span>
            <strong>{overview.citizen_count}</strong>
          </div>
          <div className="kpi-card warn">
            <span>Не выгружено</span>
            <strong>{overview.unsynced_count}</strong>
          </div>
        </div>
      )}

      <div className={`charts-grid ${isMobile ? "mobile-charts" : ""}`}>
        {isMobile && (
          <div className="chart-tabs">
            <button
              type="button"
              className={chartTab === "monthly" ? "active" : ""}
              onClick={() => setChartTab("monthly")}
            >
              По месяцам
            </button>
            <button
              type="button"
              className={chartTab === "products" ? "active" : ""}
              onClick={() => setChartTab("products")}
            >
              Топ товаров
            </button>
          </div>
        )}
        {(!isMobile || chartTab === "monthly") && (
        <section className="panel chart-panel">
          <h2>Продажи по месяцам</h2>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
            <LineChart data={monthly}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Line type="monotone" dataKey="revenue" stroke="#2563eb" name="Выручка" />
            </LineChart>
          </ResponsiveContainer>
        </section>
        )}

        {(!isMobile || chartTab === "products") && (
        <section className="panel chart-panel">
          <h2>Топ товаров</h2>
          <ResponsiveContainer width="100%" height={isMobile ? 220 : 260}>
            <BarChart data={topProducts}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" hide />
              <YAxis />
              <Tooltip />
              <Bar dataKey="quantity" fill="#16a34a" name="Кол-во" />
            </BarChart>
          </ResponsiveContainer>
          <ul className="legend-list">
            {topProducts.map((p) => (
              <li key={p.barcode}>
                {p.name} — {p.quantity} шт. ({p.revenue.toFixed(2)} ₽)
              </li>
            ))}
          </ul>
        </section>
        )}
      </div>

      <section className="panel">
        <h2>Топ покупателей</h2>
        <table className="data-table">
          <thead>
            <tr>
              <th>ФИО</th>
              <th>Группа</th>
              <th>Покупок</th>
              <th>Сумма</th>
            </tr>
          </thead>
          <tbody>
            {topBuyers.map((b) => (
              <tr key={b.citizen_qr_lookup}>
                <td>{b.citizen_fio}</td>
                <td>{displayGroupLabel(b.citizen_group)}</td>
                <td>{b.purchase_count}</td>
                <td>{b.total_spent.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
