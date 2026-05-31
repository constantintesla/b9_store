use crate::db::DbState;
use crate::models::{InventoryLine, InventorySession};
use chrono::Utc;
use rusqlite::{params, OptionalExtension};
use tauri::State;

fn load_session_lines(
    conn: &rusqlite::Connection,
    session_id: i64,
) -> Result<Vec<InventoryLine>, String> {
    let mut stmt = conn
        .prepare(
            "SELECT il.id, il.session_id, il.product_id, p.barcode, p.name,
                    il.expected_qty, il.counted_qty, il.delta
             FROM inventory_lines il
             JOIN products p ON p.id = il.product_id
             WHERE il.session_id = ?1
             ORDER BY p.name",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([session_id], |row| {
            Ok(InventoryLine {
                id: row.get(0)?,
                session_id: row.get(1)?,
                product_id: row.get(2)?,
                barcode: row.get(3)?,
                name: row.get(4)?,
                expected_qty: row.get(5)?,
                counted_qty: row.get(6)?,
                delta: row.get(7)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn start_inventory_session(
    note: Option<String>,
    state: State<'_, DbState>,
) -> Result<InventorySession, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let note_text = note.clone().unwrap_or_default();
    conn.execute(
        "INSERT INTO inventory_sessions (note) VALUES (?1)",
        [&note_text],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    Ok(InventorySession {
        id,
        started_at: Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
        completed_at: None,
        note: note.unwrap_or_default(),
        lines: vec![],
    })
}

#[tauri::command]
pub fn get_active_inventory_session(
    state: State<'_, DbState>,
) -> Result<Option<InventorySession>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let row = conn
        .query_row(
            "SELECT id, started_at, completed_at, note FROM inventory_sessions
             WHERE completed_at IS NULL ORDER BY id DESC LIMIT 1",
            [],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((id, started_at, completed_at, note)) = row {
        let lines = load_session_lines(&conn, id)?;
        Ok(Some(InventorySession {
            id,
            started_at,
            completed_at,
            note,
            lines,
        }))
    } else {
        Ok(None)
    }
}

#[tauri::command]
pub fn scan_inventory_barcode(
    session_id: i64,
    barcode: String,
    state: State<'_, DbState>,
) -> Result<InventoryLine, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let product = conn
        .query_row(
            "SELECT id, stock_qty, name, barcode FROM products WHERE barcode = ?1",
            [barcode.trim()],
            |row| {
                Ok((
                    row.get::<_, i64>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, String>(2)?,
                    row.get::<_, String>(3)?,
                ))
            },
        )
        .optional()
        .map_err(|e| e.to_string())?
        .ok_or_else(|| format!("Товар со штрихкодом «{}» не найден", barcode))?;

    let (product_id, expected_qty, name, _bc) = product;

    let existing: Option<(i64, i64)> = conn
        .query_row(
            "SELECT id, counted_qty FROM inventory_lines WHERE session_id = ?1 AND product_id = ?2",
            params![session_id, product_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()
        .map_err(|e| e.to_string())?;

    if let Some((line_id, counted)) = existing {
        let new_counted = counted + 1;
        let delta = new_counted - expected_qty;
        conn.execute(
            "UPDATE inventory_lines SET counted_qty = ?1, delta = ?2 WHERE id = ?3",
            params![new_counted, delta, line_id],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let counted_qty = 1i64;
        let delta = counted_qty - expected_qty;
        conn.execute(
            "INSERT INTO inventory_lines (session_id, product_id, expected_qty, counted_qty, delta)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![session_id, product_id, expected_qty, counted_qty, delta],
        )
        .map_err(|e| e.to_string())?;
    }

    load_session_lines(&conn, session_id)?
        .into_iter()
        .find(|l| l.product_id == product_id)
        .ok_or_else(|| format!("Строка инвентаризации не найдена для {}", name))
}

#[tauri::command]
pub fn complete_inventory_session(
    session_id: i64,
    apply_adjustments: bool,
    state: State<'_, DbState>,
) -> Result<InventorySession, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;

    if apply_adjustments {
        let mut stmt = tx
            .prepare(
                "SELECT product_id, counted_qty FROM inventory_lines WHERE session_id = ?1",
            )
            .map_err(|e| e.to_string())?;

        let rows = stmt
            .query_map([session_id], |row| Ok((row.get::<_, i64>(0)?, row.get::<_, i64>(1)?)))
            .map_err(|e| e.to_string())?;

        for row in rows {
            let (product_id, counted_qty) = row.map_err(|e| e.to_string())?;
            tx.execute(
                "UPDATE products SET stock_qty = ?1 WHERE id = ?2",
                params![counted_qty, product_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }

    let completed_at = Utc::now().format("%Y-%m-%d %H:%M:%S").to_string();
    tx.execute(
        "UPDATE inventory_sessions SET completed_at = ?1 WHERE id = ?2",
        params![completed_at, session_id],
    )
    .map_err(|e| e.to_string())?;

    tx.commit().map_err(|e| e.to_string())?;

    let (id, started_at, note): (i64, String, String) = conn
        .query_row(
            "SELECT id, started_at, note FROM inventory_sessions WHERE id = ?1",
            [session_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| e.to_string())?;

    let lines = load_session_lines(&conn, session_id)?;
    Ok(InventorySession {
        id,
        started_at,
        completed_at: Some(completed_at),
        note,
        lines,
    })
}

#[tauri::command]
pub fn list_inventory_sessions(
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<InventorySession>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(20);

    let mut stmt = conn
        .prepare(
            "SELECT id, started_at, completed_at, note FROM inventory_sessions
             ORDER BY id DESC LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([lim], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, Option<String>>(2)?,
                row.get::<_, String>(3)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let mut sessions = Vec::new();
    for row in rows {
        let (id, started_at, completed_at, note) = row.map_err(|e| e.to_string())?;
        let lines = load_session_lines(&conn, id)?;
        sessions.push(InventorySession {
            id,
            started_at,
            completed_at,
            note,
            lines,
        });
    }
    Ok(sessions)
}
