use crate::db::{set_meta, DbState};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{Manager, State};

use crate::models::Citizen;
use crate::qr::parse_qr_lookup;

fn row_to_citizen(row: &rusqlite::Row) -> rusqlite::Result<Citizen> {
    Ok(Citizen {
        id: row.get(0)?,
        qr_lookup: row.get(1)?,
        group: row.get(2)?,
        nickname: row.get(3)?,
        fio: row.get(4)?,
        surname: row.get(5)?,
        first_name: row.get(6)?,
        birth_date: row.get(7)?,
        number: row.get(8)?,
        passport_number: row.get(9)?,
        position: row.get(10)?,
        rank: row.get(11)?,
        nationality: row.get(12)?,
        registration: row.get(13)?,
    })
}

fn import_from_registry_connection(
    registry: &Connection,
    conn: &Connection,
) -> Result<i64, String> {
    let mut stmt = registry
        .prepare(
            "SELECT qr_lookup, \"group\", позывной, фио, фамилия, имя, др, номер,
                    номер_в_паспорт, должность, звание, национальность, регистрация
             FROM citizens",
        )
        .map_err(|e| format!("Неверная схема registry.db: {e}"))?;

    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, String>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, String>(9)?,
                row.get::<_, String>(10)?,
                row.get::<_, String>(11)?,
                row.get::<_, String>(12)?,
            ))
        })
        .map_err(|e| e.to_string())?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM citizens", [])
        .map_err(|e| e.to_string())?;

    let mut count = 0i64;
    for row in rows {
        let (
            qr_lookup,
            group,
            nickname,
            fio,
            surname,
            first_name,
            birth_date,
            number,
            passport_number,
            position,
            rank,
            nationality,
            registration,
        ) = row.map_err(|e| e.to_string())?;

        if qr_lookup.trim().is_empty() {
            continue;
        }

        tx.execute(
            "INSERT INTO citizens (qr_lookup, \"group\", nickname, fio, surname, first_name,
             birth_date, number, passport_number, position, rank, nationality, registration)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)",
            params![
                qr_lookup.trim(),
                group,
                nickname,
                fio,
                surname,
                first_name,
                birth_date,
                number,
                passport_number,
                position,
                rank,
                nationality,
                registration
            ],
        )
        .map_err(|e| e.to_string())?;
        count += 1;
    }

    tx.commit().map_err(|e| e.to_string())?;
    set_meta(
        conn,
        "citizens_imported_at",
        &Utc::now().format("%Y-%m-%d %H:%M:%S").to_string(),
    )
    .map_err(|e| e.to_string())?;

    Ok(count)
}

#[tauri::command]
pub fn parse_qr(input: String) -> Result<Option<String>, String> {
    Ok(parse_qr_lookup(&input))
}

#[tauri::command]
pub fn list_citizens(
    search: Option<String>,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Citizen>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let q = search.unwrap_or_default().trim().to_lowercase();
    let lim = limit.unwrap_or(200);

    let mut sql = String::from(
        "SELECT id, qr_lookup, \"group\", nickname, fio, surname, first_name, birth_date,
                number, passport_number, position, rank, nationality, registration
         FROM citizens WHERE 1=1",
    );
    if !q.is_empty() {
        sql.push_str(
            " AND (lower(qr_lookup) LIKE ?1 OR lower(fio) LIKE ?1 OR lower(nickname) LIKE ?1
                 OR lower(number) LIKE ?1 OR lower(passport_number) LIKE ?1)",
        );
        sql.push_str(" ORDER BY fio COLLATE NOCASE LIMIT ?2");

        let pattern = format!("%{}%", q);
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map((pattern, lim), row_to_citizen)
            .map_err(|e| e.to_string())?;
        return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
    }

    sql.push_str(" ORDER BY fio COLLATE NOCASE LIMIT ?1");

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([lim], row_to_citizen)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_citizen_by_qr(
    qr_lookup: String,
    state: State<'_, DbState>,
) -> Result<Option<Citizen>, String> {
    let lookup = parse_qr_lookup(&qr_lookup).ok_or_else(|| "Некорректный QR-код".to_string())?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row(
        "SELECT id, qr_lookup, \"group\", nickname, fio, surname, first_name, birth_date,
                number, passport_number, position, rank, nationality, registration
         FROM citizens WHERE qr_lookup = ?1",
        [lookup],
        row_to_citizen,
    )
    .optional()
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn import_citizens_from_registry(
    path: String,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let registry =
        Connection::open(&path).map_err(|e| format!("Не удалось открыть registry.db: {e}"))?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    import_from_registry_connection(&registry, &conn)
}

#[tauri::command]
pub fn import_citizens_from_bytes(
    data: Vec<u8>,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let tmp_dir = std::env::temp_dir().join("b9_store_import");
    std::fs::create_dir_all(&tmp_dir).map_err(|e| e.to_string())?;
    let tmp_path = tmp_dir.join(format!("registry_{}.db", uuid::Uuid::new_v4()));
    std::fs::write(&tmp_path, &data).map_err(|e| format!("Не удалось сохранить файл: {e}"))?;

    let result = (|| {
        let registry = Connection::open(&tmp_path)
            .map_err(|e| format!("Не удалось открыть registry.db: {e}"))?;
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        import_from_registry_connection(&registry, &conn)
    })();

    let _ = std::fs::remove_file(&tmp_path);
    result
}

#[tauri::command]
pub fn import_citizens_to_sandbox_and_import(
    source_path: String,
    app: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let bytes = std::fs::read(&source_path).map_err(|e| {
        if source_path.starts_with("content://") || source_path.starts_with("file://") {
            format!(
                "Не удалось прочитать файл напрямую ({source_path}). Используйте import_citizens_from_bytes."
            )
        } else {
            format!("Не удалось прочитать {source_path}: {e}")
        }
    })?;

    let dest = app
        .path()
        .app_data_dir()
        .map_err(|e| e.to_string())?
        .join("registry_import.db");
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    std::fs::write(&dest, &bytes).map_err(|e| e.to_string())?;

    let registry = Connection::open(&dest)
        .map_err(|e| format!("Не удалось открыть registry.db: {e}"))?;
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    import_from_registry_connection(&registry, &conn)
}

#[tauri::command]
pub fn get_citizens_import_info(state: State<'_, DbState>) -> Result<Option<String>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    crate::db::get_meta(&conn, "citizens_imported_at").map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_citizens_count(state: State<'_, DbState>) -> Result<i64, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.query_row("SELECT COUNT(*) FROM citizens", [], |r| r.get(0))
        .map_err(|e| e.to_string())
}
