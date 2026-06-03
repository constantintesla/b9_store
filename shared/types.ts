export interface Product {
  id: number;
  barcode: string;
  name: string;
  price: number;
  stock_qty: number;
  active: boolean;
  created_at: string;
}

export interface ProductInput {
  barcode: string;
  name: string;
  price: number;
  stock_qty: number;
  active?: boolean;
}

export interface CitizenManualInput {
  fio: string;
  passport_number: string;
}

export interface Citizen {
  id: number;
  qr_lookup: string;
  group: string;
  nickname: string;
  fio: string;
  surname: string;
  first_name: string;
  birth_date: string;
  number: string;
  passport_number: string;
  position: string;
  rank: string;
  nationality: string;
  registration: string;
}

export interface SaleItemInput {
  product_id?: number | null;
  barcode: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface SaleInput {
  citizen_qr_lookup: string;
  citizen_fio: string;
  citizen_group: string;
  items: SaleItemInput[];
}

export interface SaleItem {
  id: number;
  sale_id: number;
  product_id?: number | null;
  barcode: string;
  name: string;
  quantity: number;
  unit_price: number;
}

export interface Sale {
  id: number;
  sale_uuid: string;
  citizen_qr_lookup: string;
  citizen_fio: string;
  citizen_group: string;
  total: number;
  created_at: string;
  synced_at?: string | null;
  items: SaleItem[];
}

export interface InventoryLine {
  id: number;
  session_id: number;
  product_id: number;
  barcode: string;
  name: string;
  expected_qty: number;
  counted_qty: number;
  delta: number;
}

export interface InventorySession {
  id: number;
  started_at: string;
  completed_at?: string | null;
  note: string;
  lines: InventoryLine[];
}

export interface AnalyticsOverview {
  total_revenue: number;
  sale_count: number;
  unsynced_count: number;
  product_count: number;
  citizen_count: number;
}

export interface TopProduct {
  product_id?: number | null;
  name: string;
  barcode: string;
  quantity: number;
  revenue: number;
}

export interface TopBuyer {
  citizen_qr_lookup: string;
  citizen_fio: string;
  citizen_group: string;
  purchase_count: number;
  total_spent: number;
}

export interface MonthlySales {
  month: string;
  revenue: number;
  count: number;
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

export type CheckoutMode = "scan" | "menu";

export interface AppSettings {
  server_url: string;
  device_token: string;
  auto_sync_minutes: number;
  default_checkout_mode: CheckoutMode;
}

export type PageId =
  | "checkout"
  | "products"
  | "add-products"
  | "citizens"
  | "analytics"
  | "settings";
