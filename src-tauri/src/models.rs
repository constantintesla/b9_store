use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Product {
    pub id: i64,
    pub barcode: String,
    pub name: String,
    pub price: f64,
    pub stock_qty: i64,
    pub active: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProductInput {
    pub barcode: String,
    pub name: String,
    pub price: f64,
    pub stock_qty: i64,
    pub active: Option<bool>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CitizenManualInput {
    pub fio: String,
    pub passport_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Citizen {
    pub id: i64,
    pub qr_lookup: String,
    pub group: String,
    pub nickname: String,
    pub fio: String,
    pub surname: String,
    pub first_name: String,
    pub birth_date: String,
    pub number: String,
    pub passport_number: String,
    pub position: String,
    pub rank: String,
    pub nationality: String,
    pub registration: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleItemInput {
    pub product_id: Option<i64>,
    pub barcode: String,
    pub name: String,
    pub quantity: i64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleInput {
    pub citizen_qr_lookup: String,
    pub citizen_fio: String,
    pub citizen_group: String,
    pub items: Vec<SaleItemInput>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Sale {
    pub id: i64,
    pub sale_uuid: String,
    pub citizen_qr_lookup: String,
    pub citizen_fio: String,
    pub citizen_group: String,
    pub total: f64,
    pub created_at: String,
    pub synced_at: Option<String>,
    pub items: Vec<SaleItem>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SaleItem {
    pub id: i64,
    pub sale_id: i64,
    pub product_id: Option<i64>,
    pub barcode: String,
    pub name: String,
    pub quantity: i64,
    pub unit_price: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventorySession {
    pub id: i64,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub note: String,
    pub lines: Vec<InventoryLine>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InventoryLine {
    pub id: i64,
    pub session_id: i64,
    pub product_id: i64,
    pub barcode: String,
    pub name: String,
    pub expected_qty: i64,
    pub counted_qty: i64,
    pub delta: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnalyticsOverview {
    pub total_revenue: f64,
    pub sale_count: i64,
    pub unsynced_count: i64,
    pub product_count: i64,
    pub citizen_count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopProduct {
    pub product_id: Option<i64>,
    pub name: String,
    pub barcode: String,
    pub quantity: i64,
    pub revenue: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopBuyer {
    pub citizen_qr_lookup: String,
    pub citizen_fio: String,
    pub citizen_group: String,
    pub purchase_count: i64,
    pub total_spent: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MonthlySales {
    pub month: String,
    pub revenue: f64,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub synced: i64,
    pub failed: i64,
    pub errors: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppSettings {
    pub server_url: String,
    pub device_token: String,
    pub auto_sync_minutes: i64,
    pub default_checkout_mode: String,
}
