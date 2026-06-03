import type { PageId } from "../../shared/types";
import { usePlatform } from "../hooks/usePlatform";
import { MobileLayout } from "./MobileLayout";

const NAV: { id: PageId; label: string; hint: string }[] = [
  { id: "checkout", label: "Касса", hint: "Сканер или выбор из списка" },
  { id: "products", label: "Товары", hint: "Сканируйте для добавления" },
  { id: "add-products", label: "Добавление", hint: "Название, коды, цена" },
  { id: "citizens", label: "Покупатели", hint: "Реестр из b9_docs" },
  { id: "analytics", label: "Аналитика", hint: "Продажи и KPI" },
  { id: "settings", label: "Настройки", hint: "Синхронизация" },
];

interface LayoutProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  unsyncedCount: number;
  children: React.ReactNode;
}

function DesktopLayout({
  page,
  onNavigate,
  unsyncedCount,
  children,
}: LayoutProps) {
  return (
    <div className="app-shell desktop-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-title">B9 Store</span>
          <span className="brand-sub">POS терминал</span>
        </div>
        <nav className="nav">
          {NAV.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`nav-item ${page === item.id ? "active" : ""}`}
              onClick={() => onNavigate(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </nav>
        {unsyncedCount > 0 && (
          <div className="sync-badge">
            Не выгружено: {unsyncedCount} чек(ов)
          </div>
        )}
        <div className="app-footer">
          <a
            className="app-footer__link"
            href="https://t.me/constantintesla"
            target="_blank"
            rel="noopener noreferrer"
            title="Telegram"
          >
            preshevdev
          </a>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}

export function Layout(props: LayoutProps) {
  const { isMobile } = usePlatform();

  if (isMobile) {
    return <MobileLayout {...props} />;
  }

  return <DesktopLayout {...props} />;
}
