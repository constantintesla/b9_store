use crate::db::DbState;
use crate::models::{Product, ProductInput};
use rusqlite::{params, OptionalExtension};
use tauri::State;
use uuid::Uuid;

const INTERNAL_BARCODE_PREFIX: &str = "B9-";

fn normalize_barcode(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}

fn generate_internal_barcode() -> String {
    format!("{}{}", INTERNAL_BARCODE_PREFIX, Uuid::new_v4().simple())
}

fn resolve_barcode_for_create(input: &str) -> String {
    let barcode = normalize_barcode(input);
    if barcode.is_empty() {
        generate_internal_barcode()
    } else {
        barcode
    }
}

fn barcode_lookup_variants(code: &str) -> Vec<String> {
    let mut variants = Vec::new();
    let mut push = |s: String| {
        if !s.is_empty() && !variants.contains(&s) {
            variants.push(s);
        }
    };

    push(code.to_string());

    let digits: String = code.chars().filter(|c| c.is_ascii_digit()).collect();
    if digits.is_empty() {
        return variants;
    }

    push(digits.clone());
    if digits.len() <= 13 {
        push(format!("{:0>13}", digits));
    }
    let trimmed = digits.trim_start_matches('0').to_string();
    if !trimmed.is_empty() && trimmed != digits {
        push(trimmed.clone());
        if trimmed.len() <= 13 {
            push(format!("{:0>13}", trimmed));
        }
    }

    variants
}

fn find_product_by_barcode_variants(
    conn: &rusqlite::Connection,
    code: &str,
) -> Result<Option<Product>, String> {
    for variant in barcode_lookup_variants(code) {
        if let Ok(product) = conn.query_row(
            "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE barcode = ?1 AND active = 1",
            [&variant],
            row_to_product,
        ) {
            return Ok(Some(product));
        }
    }
    Ok(None)
}

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
    limit: Option<i64>,
    active_only: Option<bool>,
    state: State<'_, DbState>,
) -> Result<Vec<Product>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let q = search.unwrap_or_default().trim().to_lowercase();

    let mut sql = String::from(
        "SELECT id, barcode, name, price, stock_qty, active, created_at FROM products WHERE 1=1",
    );
    if active_only.unwrap_or(false) {
        sql.push_str(" AND active = 1");
    }
    if !q.is_empty() {
        sql.push_str(" AND (lower(name) LIKE ?1 OR lower(barcode) LIKE ?1)");
    }
    sql.push_str(" ORDER BY name COLLATE NOCASE");
    if limit.is_some() {
        sql.push_str(" LIMIT ?");
    }

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = match (q.is_empty(), limit) {
        (true, Some(lim)) => stmt.query_map([lim], row_to_product),
        (true, None) => stmt.query_map([], row_to_product),
        (false, Some(lim)) => {
            let pattern = format!("%{}%", q);
            stmt.query_map((pattern, lim), row_to_product)
        }
        (false, None) => {
            let pattern = format!("%{}%", q);
            stmt.query_map([pattern], row_to_product)
        }
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
    let code = normalize_barcode(&barcode);
    if code.is_empty() {
        return Ok(None);
    }
    find_product_by_barcode_variants(&conn, &code)
}

#[tauri::command]
pub fn create_product(
    input: ProductInput,
    state: State<'_, DbState>,
) -> Result<Product, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let barcode = resolve_barcode_for_create(&input.barcode);
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

    let existing_barcode: String = conn
        .query_row(
            "SELECT barcode FROM products WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())?;

    let barcode = {
        let normalized = normalize_barcode(&input.barcode);
        if normalized.is_empty() {
            existing_barcode
        } else {
            normalized
        }
    };

    conn.execute(
        "UPDATE products SET barcode = ?1, name = ?2, price = ?3, stock_qty = ?4, active = ?5 WHERE id = ?6",
        params![
            barcode,
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
