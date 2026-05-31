use crate::db::DbState;
use crate::models::{Sale, SaleInput, SaleItem};
use rusqlite::params;
use tauri::State;
use uuid::Uuid;

fn row_to_sale(row: &rusqlite::Row) -> rusqlite::Result<Sale> {
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
}

fn load_sale_items(conn: &rusqlite::Connection, sale_id: i64) -> Result<Vec<SaleItem>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, sale_id, product_id, barcode, name, quantity, unit_price
             FROM sale_items WHERE sale_id = ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([sale_id], |row| {
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

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_sale(input: SaleInput, state: State<'_, DbState>) -> Result<Sale, String> {
    if input.citizen_qr_lookup.trim().is_empty() {
        return Err("Сначала отсканируйте QR паспорта покупателя".into());
    }
    if input.items.is_empty() {
        return Err("Добавьте хотя бы один товар".into());
    }

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    for item in &input.items {
        if let Some(pid) = item.product_id {
            let stock: i64 = tx
                .query_row(
                    "SELECT stock_qty FROM products WHERE id = ?1 AND active = 1",
                    [pid],
                    |r| r.get(0),
                )
                .map_err(|_| format!("Товар «{}» не найден", item.name))?;

            if stock < item.quantity {
                return Err(format!(
                    "Недостаточно «{}» на складе (есть {stock}, нужно {})",
                    item.name, item.quantity
                ));
            }
        }
    }

    let total: f64 = input
        .items
        .iter()
        .map(|i| i.unit_price * i.quantity as f64)
        .sum();

    let sale_uuid = Uuid::new_v4().to_string();
    tx.execute(
        "INSERT INTO sales (sale_uuid, citizen_qr_lookup, citizen_fio, citizen_group, total)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            sale_uuid,
            input.citizen_qr_lookup.trim(),
            input.citizen_fio,
            input.citizen_group,
            total
        ],
    )
    .map_err(|e| e.to_string())?;

    let sale_id = tx.last_insert_rowid();

    for item in &input.items {
        tx.execute(
            "INSERT INTO sale_items (sale_id, product_id, barcode, name, quantity, unit_price)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
            params![
                sale_id,
                item.product_id,
                item.barcode,
                item.name,
                item.quantity,
                item.unit_price
            ],
        )
        .map_err(|e| e.to_string())?;

        if let Some(pid) = item.product_id {
            tx.execute(
                "UPDATE products SET stock_qty = stock_qty - ?1 WHERE id = ?2",
                params![item.quantity, pid],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    tx.commit().map_err(|e| e.to_string())?;

    let mut sale = conn
        .query_row(
            "SELECT id, sale_uuid, citizen_qr_lookup, citizen_fio, citizen_group, total, created_at, synced_at
             FROM sales WHERE id = ?1",
            [sale_id],
            row_to_sale,
        )
        .map_err(|e| e.to_string())?;
    sale.items = load_sale_items(&conn, sale_id)?;
    Ok(sale)
}

#[tauri::command]
pub fn list_sales(
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Sale>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(100);

    let mut stmt = conn
        .prepare(
            "SELECT id, sale_uuid, citizen_qr_lookup, citizen_fio, citizen_group, total, created_at, synced_at
             FROM sales ORDER BY created_at DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([lim], row_to_sale)
        .map_err(|e| e.to_string())?;

    let mut sales = Vec::new();
    for row in rows {
        let mut sale = row.map_err(|e| e.to_string())?;
        sale.items = load_sale_items(&conn, sale.id)?;
        sales.push(sale);
    }
    Ok(sales)
}

#[tauri::command]
pub fn get_unsynced_count(state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT COUNT(*) FROM sales WHERE synced_at IS NULL",
        [],
        |r| r.get(0),
    )
    .map_err(|e| e.to_string())
}
