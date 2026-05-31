use crate::db::DbState;
use crate::models::{Product, ProductInput};
use rusqlite::{params, OptionalExtension};
use tauri::State;

fn row_to_product(row: &rusqlite::Row) -> rusqlite::Result<Product> {
    Ok(Product {
        id: row.get(0)?,
        barcode: row.get(1)?,
        name: row.get(2)?,
        price: row.get(3)?,
        stock_qty: row.get(4)?,
        active: row.get::<_, i64>(5)? != 0,
        created_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn list_products(
    search: Option<String>,
    state: State<'_, DbState>,
) -> Result<Vec<Product>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let q = search.unwrap_or_default().trim().to_lowercase();

    let mut sql = String::from(
        "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE 1=1",
    );
    if !q.is_empty() {
        sql.push_str(" AND (lower(name) LIKE ?1 OR lower(barcode) LIKE ?1)");
    }
    sql.push_str(" ORDER BY name COLLATE NOCASE");

    let pattern = format!("%{}%", q);
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = if q.is_empty() {
        stmt.query_map([], row_to_product)
    } else {
        stmt.query_map([pattern], row_to_product)
    }
    .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_product_by_barcode(
    barcode: String,
    state: State<'_, DbState>,
) -> Result<Option<Product>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE barcode = ?1 AND active = 1",
        [barcode.trim()],
        row_to_product,
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_product(
    input: ProductInput,
    state: State<'_, DbState>,
) -> Result<Product, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let barcode = input.barcode.trim().to_string();
    if barcode.is_empty() {
        return Err("Штрихкод обязателен".into());
    }
    if input.name.trim().is_empty() {
        return Err("Название обязательно".into());
    }
    let active = if input.active.unwrap_or(true) { 1 } else { 0 };

    conn.execute(
        "INSERT INTO products (barcode, name, price, stock_qty, active) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![barcode, input.name.trim(), input.price, input.stock_qty, active],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE id = ?1",
        [id],
        row_to_product,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn update_product(
    id: i64,
    input: ProductInput,
    state: State<'_, DbState>,
) -> Result<Product, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let active = if input.active.unwrap_or(true) { 1 } else { 0 };

    conn.execute(
        "UPDATE products SET barcode = ?1, name = ?2, price = ?3, stock_qty = ?4, active = ?5 WHERE id = ?6",
        params![
            input.barcode.trim(),
            input.name.trim(),
            input.price,
            input.stock_qty,
            active,
            id
        ],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE id = ?1",
        [id],
        row_to_product,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn delete_product(id: i64, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM products WHERE id = ?1", [id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub fn adjust_stock(
    product_id: i64,
    delta: i64,
    state: State<'_, DbState>,
) -> Result<Product, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "UPDATE products SET stock_qty = stock_qty + ?1 WHERE id = ?2",
        params![delta, product_id],
    )
    .map_err(|e| e.to_string())?;

    conn.query_row(
        "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE id = ?1",
        [product_id],
        row_to_product,
    )
    .map_err(|e| e.to_string())
}
