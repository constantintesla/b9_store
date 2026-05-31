import { useCallback, useEffect, useState } from "react";
import { Layout } from "./components/Layout";
import { api } from "./api/tauri";
import { AnalyticsPage } from "./pages/AnalyticsPage";
import { CheckoutPage } from "./pages/CheckoutPage";
import { CitizensPage } from "./pages/CitizensPage";
import { AddProductsPage } from "./pages/AddProductsPage";
import { ProductsPage } from "./pages/ProductsPage";
import { SettingsPage } from "./pages/SettingsPage";
import type { PageId } from "../shared/types";
import "./App.css";

function App() {
  const [page, setPage] = useState<PageId>("checkout");
  const [unsyncedCount, setUnsyncedCount] = useState(0);

  const refreshUnsynced = useCallback(async () => {
    try {
      setUnsyncedCount(await api.getUnsyncedCount());
    } catch {
      /* ignore on startup */
    }
  }, []);

  useEffect(() => {
    void refreshUnsynced();
    const timer = window.setInterval(() => void refreshUnsynced(), 30000);
    return () => window.clearInterval(timer);
  }, [refreshUnsynced]);

  const renderPage = () => {
    switch (page) {
      case "checkout":
        return <CheckoutPage />;
      case "products":
        return <ProductsPage />;
      case "add-products":
        return <AddProductsPage />;
      case "citizens":
        return <CitizensPage />;
      case "analytics":
        return <AnalyticsPage />;
      case "settings":
        return <SettingsPage onSyncChange={refreshUnsynced} />;
      default:
        return null;
    }
  };

  return (
    <Layout page={page} onNavigate={setPage} unsyncedCount={unsyncedCount}>
      {renderPage()}
    </Layout>
  );
}

export default App;
