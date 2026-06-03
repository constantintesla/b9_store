import { useState } from "react";
import type { PageId } from "../../shared/types";

type TabId = "checkout" | "add-products" | "products" | "more";

const TABS: { id: TabId; label: string }[] = [
  { id: "checkout", label: "Касса" },
  { id: "add-products", label: "Добавить" },
  { id: "products", label: "Товары" },
  { id: "more", label: "Ещё" },
];

const MORE_ITEMS: { id: PageId; label: string }[] = [
  { id: "citizens", label: "Покупатели" },
  { id: "analytics", label: "Аналитика" },
  { id: "settings", label: "Настройки" },
];

interface MobileLayoutProps {
  page: PageId;
  onNavigate: (page: PageId) => void;
  unsyncedCount: number;
  children: React.ReactNode;
}

function tabForPage(page: PageId): TabId {
  if (page === "checkout") return "checkout";
  if (page === "add-products") return "add-products";
  if (page === "products") return "products";
  return "more";
}

export function MobileLayout({
  page,
  onNavigate,
  unsyncedCount,
  children,
}: MobileLayoutProps) {
  const [moreOpen, setMoreOpen] = useState(false);
  const activeTab = tabForPage(page);

  const selectTab = (tab: TabId) => {
    if (tab === "more") {
      setMoreOpen(true);
      return;
    }
    setMoreOpen(false);
    onNavigate(tab);
  };

  const selectMorePage = (id: PageId) => {
    setMoreOpen(false);
    onNavigate(id);
  };

  return (
    <div className="app-shell mobile-shell">
      <header className="mobile-header">
        <div>
          <strong>B9 Store</strong>
          {unsyncedCount > 0 && (
            <span className="mobile-sync-badge">↑{unsyncedCount}</span>
          )}
        </div>
      </header>

      <main className="main mobile-main">{children}</main>

      <div className="app-footer app-footer--mobile">
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

      <nav className="bottom-nav">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`bottom-nav-item ${
              tab.id === "more"
                ? moreOpen || activeTab === "more"
                  ? "active"
                  : ""
                : activeTab === tab.id
                  ? "active"
                  : ""
            }`}
            onClick={() => selectTab(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      {moreOpen && (
        <div className="more-overlay" onClick={() => setMoreOpen(false)}>
          <div className="more-sheet" onClick={(e) => e.stopPropagation()}>
            <h3>Меню</h3>
            {MORE_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`more-item ${page === item.id ? "active" : ""}`}
                onClick={() => selectMorePage(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
