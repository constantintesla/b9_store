import { invoke } from "@tauri-apps/api/core";
import type {
  AnalyticsOverview,
  AppSettings,
  Citizen,
  CitizenManualInput,
  InventoryLine,
  InventorySession,
  MonthlySales,
  Product,
  ProductInput,
  Sale,
  SaleInput,
  SyncResult,
  TopBuyer,
  TopProduct,
} from "../../shared/types";

export const api = {
  listProducts: (search?: string) =>
    invoke<Product[]>("list_products", { search }),

  getProductByBarcode: (barcode: string) =>
    invoke<Product | null>("get_product_by_barcode", { barcode }),

  createProduct: (input: ProductInput) =>
    invoke<Product>("create_product", { input }),

  updateProduct: (id: number, input: ProductInput) =>
    invoke<Product>("update_product", { id, input }),

  deleteProduct: (id: number) => invoke<void>("delete_product", { id }),

  parseQr: (input: string) =>
    invoke<string | null>("parse_qr", { input }),

  listCitizens: (search?: string, limit?: number) =>
    invoke<Citizen[]>("list_citizens", { search, limit }),

  createCitizen: (input: CitizenManualInput) =>
    invoke<Citizen>("create_citizen", { input }),

  getCitizenByQr: (qrLookup: string) =>
    invoke<Citizen | null>("get_citizen_by_qr", { qrLookup }),

  importCitizensFromRegistry: (path: string) =>
    invoke<number>("import_citizens_from_registry", { path }),

  importCitizensFromBytes: (data: number[]) =>
    invoke<number>("import_citizens_from_bytes", { data }),

  getCitizensImportInfo: () =>
    invoke<string | null>("get_citizens_import_info"),

  getCitizensCount: () => invoke<number>("get_citizens_count"),

  createSale: (input: SaleInput) => invoke<Sale>("create_sale", { input }),

  listSales: (limit?: number) => invoke<Sale[]>("list_sales", { limit }),

  getUnsyncedCount: () => invoke<number>("get_unsynced_count"),

  startInventorySession: (note?: string) =>
    invoke<InventorySession>("start_inventory_session", { note }),

  getActiveInventorySession: () =>
    invoke<InventorySession | null>("get_active_inventory_session"),

  scanInventoryBarcode: (sessionId: number, barcode: string) =>
    invoke<InventoryLine>("scan_inventory_barcode", { sessionId, barcode }),

  completeInventorySession: (sessionId: number, applyAdjustments: boolean) =>
    invoke<InventorySession>("complete_inventory_session", {
      sessionId,
      applyAdjustments,
    }),

  listInventorySessions: (limit?: number) =>
    invoke<InventorySession[]>("list_inventory_sessions", { limit }),

  analyticsOverview: () =>
    invoke<AnalyticsOverview>("analytics_overview"),

  analyticsTopProducts: (limit?: number) =>
    invoke<TopProduct[]>("analytics_top_products", { limit }),

  analyticsTopBuyers: (limit?: number) =>
    invoke<TopBuyer[]>("analytics_top_buyers", { limit }),

  analyticsMonthlySales: () =>
    invoke<MonthlySales[]>("analytics_monthly_sales"),

  getSettings: () => invoke<AppSettings>("get_settings"),

  saveSettings: (settings: AppSettings) =>
    invoke<void>("save_settings", { settings }),

  syncPendingSales: () => invoke<SyncResult>("sync_pending_sales"),
};
