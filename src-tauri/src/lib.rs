mod analytics;
mod citizens;
mod db;
mod inventory;
mod models;
mod products;
mod qr;
mod sales;
mod settings;
mod sync;

use db::{open_connection, DbState};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .setup(|app| {
            let conn = open_connection(&app.handle()).expect("failed to open database");
            app.manage(DbState(std::sync::Mutex::new(conn)));
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            products::list_products,
            products::get_product_by_barcode,
            products::create_product,
            products::update_product,
            products::delete_product,
            products::adjust_stock,
            citizens::parse_qr,
            citizens::list_citizens,
            citizens::create_citizen,
            citizens::get_citizen_by_qr,
            citizens::import_citizens_from_registry,
            citizens::import_citizens_from_bytes,
            citizens::import_citizens_to_sandbox_and_import,
            citizens::get_citizens_import_info,
            citizens::get_citizens_count,
            sales::create_sale,
            sales::list_sales,
            sales::get_unsynced_count,
            inventory::start_inventory_session,
            inventory::get_active_inventory_session,
            inventory::scan_inventory_barcode,
            inventory::complete_inventory_session,
            inventory::list_inventory_sessions,
            analytics::analytics_overview,
            analytics::analytics_top_products,
            analytics::analytics_top_buyers,
            analytics::analytics_monthly_sales,
            settings::get_settings,
            settings::save_settings,
            sync::sync_pending_sales,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
