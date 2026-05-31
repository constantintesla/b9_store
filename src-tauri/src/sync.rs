use crate::db::{get_setting, DbState};
use crate::models::{Sale, SaleItem, SyncResult};
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Serialize)]
struct SyncSalePayload {
    sale_uuid: String,
    citizen_qr_lookup: String,
    citizen_fio: String,
    citizen_group: String,
    total: f64,
    created_at: String,
    items: Vec<SyncItemPayload>,
}

#[derive(Serialize)]
struct SyncItemPayload {
    product_id: Option<i64>,
    barcode: String,
    name: String,
    quantity: i64,
    unit_price: f64,
}

#[derive(Serialize)]
struct SyncRequest {
    sales: Vec<SyncSalePayload>,
}

fn load_unsynced_sales(conn: &rusqlite::Connection) -> Result<Vec<Sale>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, sale_uuid, citizen_qr_lookup, citizen_fio, citizen_group, total, created_at, synced_at
             FROM sales WHERE synced_at IS NULL ORDER BY created_at",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(Sale {
                id: row.get(0)?,
                sale_uuid: row.get(1)?,
                citizen_qr_lookup: row.get(2)?,
                citizen_fio: row.get(3)?,
                citizen_group: row.get(4)?,
                total: row.get(5)?,
                created_at: row.get(6)?,
                synced_at: row.get(7)?,
                items: vec![],
            })
        })
        .map_err(|e| e.to_string())?;

    let mut sales = Vec::new();
    for row in rows {
        let mut sale = row.map_err(|e| e.to_string())?;
        let mut item_stmt = conn
            .prepare(
                "SELECT id, sale_id, product_id, barcode, name, quantity, unit_price
                 FROM sale_items WHERE sale_id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let item_rows = item_stmt
            .query_map([sale.id], |row| {
                Ok(SaleItem {
                    id: row.get(0)?,
                    sale_id: row.get(1)?,
                    product_id: row.get(2)?,
                    barcode: row.get(3)?,
                    name: row.get(4)?,
                    quantity: row.get(5)?,
                    unit_price: row.get(6)?,
                })
            })
            .map_err(|e| e.to_string())?;
        sale.items = item_rows
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        sales.push(sale);
    }
    Ok(sales)
}

#[tauri::command]
pub async fn sync_pending_sales(state: State<'_, DbState>) -> Result<SyncResult, String> {
    let (server_url, device_token, sales) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let server_url = get_setting(&conn, "server_url")
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "https://preshevkadastr.ru".to_string());
        let device_token = get_setting(&conn, "device_token")
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        let sales = load_unsynced_sales(&conn)?;
        (server_url, device_token, sales)
    };

    if device_token.trim().is_empty() {
        return Err("Укажите device-token в настройках (создайте на preshevkadastr.ru/store)".into());
    }
    if sales.is_empty() {
        return Ok(SyncResult {
            synced: 0,
            failed: 0,
            errors: vec![],
        });
    }

    let base = server_url.trim_end_matches('/');
    let url = format!("{base}/store/api/sync/sales");

    let payload = SyncRequest {
        sales: sales
            .iter()
            .map(|s| SyncSalePayload {
                sale_uuid: s.sale_uuid.clone(),
                citizen_qr_lookup: s.citizen_qr_lookup.clone(),
                citizen_fio: s.citizen_fio.clone(),
                citizen_group: s.citizen_group.clone(),
                total: s.total,
                created_at: s.created_at.clone(),
                items: s
                    .items
                    .iter()
                    .map(|i| SyncItemPayload {
                        product_id: i.product_id,
                        barcode: i.barcode.clone(),
                        name: i.name.clone(),
                        quantity: i.quantity,
                        unit_price: i.unit_price,
                    })
                    .collect(),
            })
            .collect(),
    };

    let client = reqwest::Client::new();
    let response = client
        .post(&url)
        .header("x-device-token", device_token.trim())
        .json(&payload)
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {e}"))?;

    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Сервер вернул {status}: {body}"));
    }

    #[derive(serde::Deserialize)]
    struct SyncResponse {
        accepted_uuids: Vec<String>,
    }

    let body: SyncResponse = response
        .json()
        .await
        .map_err(|e| format!("Неверный ответ сервера: {e}"))?;

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let now = chrono::Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    let mut synced = 0i64;
    for uuid in &body.accepted_uuids {
        let n = conn
            .execute(
                "UPDATE sales SET synced_at = ?1 WHERE sale_uuid = ?2",
                params![now, uuid],
            )
            .map_err(|e| e.to_string())?;
        synced += n as i64;
    }

    Ok(SyncResult {
        synced,
        failed: (sales.len() as i64) - synced,
        errors: vec![],
    })
}
