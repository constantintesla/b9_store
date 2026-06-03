use crate::citizen_search::{
    append_token_filters, build_search_text, display_group_name, ensure_schema,
    search_tokens, PASSPORT_GROUP,
};
use crate::db::{get_setting, set_meta, DbState};
use chrono::Utc;
use rusqlite::{params, params_from_iter, Connection, OptionalExtension, ToSql};
use std::path::PathBuf;
use tauri::{Manager, State};

use crate::models::{Citizen, CitizenManualInput};
use crate::qr::parse_qr_lookup;
use serde::Deserialize;

/// Номер для кассы и колонки «документ»: для паспортной группы — номер в паспорте, иначе номер с QR.
fn effective_passport_number(group: &str, number: &str, passport_raw: &str) -> String {
    let passport_raw = passport_raw.trim();
    let number = number.trim();
    if group.trim() == PASSPORT_GROUP && !passport_raw.is_empty() {
        passport_raw.to_string()
    } else if !number.is_empty() {
        number.to_string()
    } else if !passport_raw.is_empty() {
        passport_raw.to_string()
    } else {
        String::new()
    }
}

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

        let document_number =
            effective_passport_number(&group, &number, &passport_number);
        let group_label = display_group_name(&group);
        let search_text = build_search_text(
            qr_lookup.trim(),
            &nickname,
            &fio,
            &surname,
            &first_name,
            &number,
            &document_number,
        );

        tx.execute(
            "INSERT INTO citizens (qr_lookup, \"group\", nickname, fio, surname, first_name,
             birth_date, number, passport_number, position, rank, nationality, registration,
             search_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                qr_lookup.trim(),
                group_label,
                nickname,
                fio,
                surname,
                first_name,
                birth_date,
                number,
                document_number,
                position,
                rank,
                nationality,
                registration,
                search_text
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

#[derive(Deserialize)]
struct RemoteCitizensResponse {
    items: Vec<RemoteCitizenItem>,
}

#[derive(Deserialize)]
struct RemoteCitizenItem {
    qr_lookup: String,
    group: String,
    nickname: String,
    fio: String,
    surname: String,
    first_name: String,
    birth_date: String,
    number: String,
    passport_number: String,
    position: String,
    rank: String,
    nationality: String,
    registration: String,
}

fn import_from_remote_items(items: Vec<RemoteCitizenItem>, conn: &Connection) -> Result<i64, String> {
    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    tx.execute("DELETE FROM citizens", [])
        .map_err(|e| e.to_string())?;

    let mut count = 0i64;
    for item in items {
        let qr_lookup = item.qr_lookup.trim().to_string();
        if qr_lookup.is_empty() {
            continue;
        }
        let document_number = effective_passport_number(
            &item.group,
            &item.number,
            &item.passport_number,
        );
        let group_label = display_group_name(&item.group);
        let search_text = build_search_text(
            &qr_lookup,
            &item.nickname,
            &item.fio,
            &item.surname,
            &item.first_name,
            &item.number,
            &document_number,
        );
        tx.execute(
            "INSERT INTO citizens (qr_lookup, \"group\", nickname, fio, surname, first_name,
             birth_date, number, passport_number, position, rank, nationality, registration,
             search_text)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)",
            params![
                qr_lookup,
                group_label,
                item.nickname,
                item.fio,
                item.surname,
                item.first_name,
                item.birth_date,
                item.number,
                document_number,
                item.position,
                item.rank,
                item.nationality,
                item.registration,
                search_text
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn passport_group_uses_passport_field() {
        assert_eq!(
            effective_passport_number(PASSPORT_GROUP, "111", "AB 123456"),
            "AB 123456"
        );
    }

    #[test]
    fn other_groups_use_document_number() {
        assert_eq!(
            effective_passport_number("Группа 1", "5049468", ""),
            "5049468"
        );
    }
}

fn default_registry_candidates(app: &tauri::AppHandle) -> Vec<PathBuf> {
    let mut paths = Vec::<PathBuf>::new();

    if let Ok(raw) = std::env::var("B9_REGISTRY_DB_PATH") {
        let trimmed = raw.trim();
        if !trimmed.is_empty() {
            paths.push(PathBuf::from(trimmed));
        }
    }

    if let Ok(cwd) = std::env::current_dir() {
        paths.push(cwd.join("b9_docs").join("registry.db"));
    }
    paths.push(PathBuf::from("C:/projects/b9_docs/registry.db"));

    if let Ok(home) = app.path().home_dir() {
        paths.push(home.join("projects").join("b9_docs").join("registry.db"));
    }
    if let Ok(docs) = app.path().document_dir() {
        paths.push(docs.join("b9_docs").join("registry.db"));
    }

    let mut unique = Vec::<PathBuf>::new();
    for path in paths {
        if !unique.iter().any(|seen| seen == &path) {
            unique.push(path);
        }
    }
    unique
}

fn resolve_default_registry_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    for path in default_registry_candidates(app) {
        if path.is_file() {
            return Ok(path);
        }
    }

    Err(
        "Не найден registry.db. Проверьте путь C:/projects/b9_docs/registry.db или задайте B9_REGISTRY_DB_PATH."
            .into(),
    )
}

#[tauri::command]
pub fn parse_qr(input: String) -> Result<Option<String>, String> {
    Ok(parse_qr_lookup(&input))
}

const CITIZEN_SELECT: &str =
    "SELECT id, qr_lookup, \"group\", nickname, fio, surname, first_name, birth_date,
            number, passport_number, position, rank, nationality, registration
     FROM citizens";

const CITIZEN_ORDER: &str =
    " ORDER BY CASE WHEN trim(fio) != '' THEN fio ELSE trim(surname || ' ' || first_name) END
      COLLATE NOCASE";

#[tauri::command]
pub fn list_citizens(
    search: Option<String>,
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<Citizen>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    ensure_schema(&conn).map_err(|e| e.to_string())?;

    let q = search.unwrap_or_default().trim().to_string();
    let lim = limit.unwrap_or(200);

    if q.is_empty() {
        let sql = format!("{CITIZEN_SELECT} WHERE 1=1{CITIZEN_ORDER} LIMIT ?1");
        let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([lim], row_to_citizen)
            .map_err(|e| e.to_string())?;
        return rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string());
    }

    let mut tokens = search_tokens(&q);
    if tokens.is_empty() {
        tokens.push(format!("%{}%", q));
    }

    let mut sql = format!("{CITIZEN_SELECT} WHERE 1=1");
    append_token_filters(&mut sql, tokens.len());
    sql.push_str(CITIZEN_ORDER);
    sql.push_str(" LIMIT ?");

    let mut bind: Vec<&dyn ToSql> = tokens.iter().map(|t| t as &dyn ToSql).collect();
    bind.push(&lim);

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map(params_from_iter(bind), row_to_citizen)
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn create_citizen(
    input: CitizenManualInput,
    state: State<'_, DbState>,
) -> Result<Citizen, String> {
    let fio = input.fio.trim().to_string();
    let passport_number = input.passport_number.trim().to_string();

    if fio.is_empty() {
        return Err("Укажите ФИО".into());
    }
    if passport_number.is_empty() {
        return Err("Укажите номер паспорта".into());
    }

    let qr_lookup = passport_number.clone();
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let exists: bool = conn
        .query_row(
            "SELECT 1 FROM citizens WHERE qr_lookup = ?1 OR passport_number = ?1 LIMIT 1",
            [&qr_lookup],
            |_| Ok(true),
        )
        .optional()
        .map_err(|e| e.to_string())?
        .unwrap_or(false);

    if exists {
        return Err("Покупатель с таким номером паспорта уже есть".into());
    }

    let search_text = build_search_text(&qr_lookup, "", &fio, "", "", "", &passport_number);

    conn.execute(
        "INSERT INTO citizens (qr_lookup, \"group\", nickname, fio, surname, first_name,
         birth_date, number, passport_number, position, rank, nationality, registration,
         search_text)
         VALUES (?1, '', '', ?2, '', '', '', '', ?3, '', '', '', '', ?4)",
        params![qr_lookup, fio, passport_number, search_text],
    )
    .map_err(|e| e.to_string())?;

    let id = conn.last_insert_rowid();
    conn.query_row(
        "SELECT id, qr_lookup, \"group\", nickname, fio, surname, first_name, birth_date,
                number, passport_number, position, rank, nationality, registration
         FROM citizens WHERE id = ?1",
        [id],
        row_to_citizen,
    )
    .map_err(|e| e.to_string())
}

fn find_citizen_local(conn: &Connection, lookup: &str) -> Result<Option<Citizen>, String> {
    ensure_schema(conn).map_err(|e| e.to_string())?;

    let trimmed = lookup.trim();
    if trimmed.is_empty() {
        return Ok(None);
    }

    if let Some(citizen) = conn
        .query_row(
            &format!("{CITIZEN_SELECT} WHERE qr_lookup = ?1 OR passport_number = ?1 OR number = ?1 LIMIT 1"),
            [trimmed],
            row_to_citizen,
        )
        .optional()
        .map_err(|e| e.to_string())?
    {
        return Ok(Some(citizen));
    }

    let tokens = search_tokens(trimmed);
    if tokens.is_empty() {
        return Ok(None);
    }

    let mut sql = format!("{CITIZEN_SELECT} WHERE 1=1");
    append_token_filters(&mut sql, tokens.len());
    sql.push_str(" LIMIT 1");

    let bind: Vec<&dyn ToSql> = tokens.iter().map(|t| t as &dyn ToSql).collect();
    conn.query_row(&sql, params_from_iter(bind), row_to_citizen)
        .optional()
        .map_err(|e| e.to_string())
}

fn upsert_citizen(conn: &Connection, item: &RemoteCitizenItem) -> Result<Citizen, String> {
    let qr_lookup = item.qr_lookup.trim().to_string();
    let document_number =
        effective_passport_number(&item.group, &item.number, &item.passport_number);
    let group_label = display_group_name(&item.group);
    let search_text = build_search_text(
        &qr_lookup,
        &item.nickname,
        &item.fio,
        &item.surname,
        &item.first_name,
        &item.number,
        &document_number,
    );

    conn.execute(
        "INSERT INTO citizens (qr_lookup, \"group\", nickname, fio, surname, first_name,
         birth_date, number, passport_number, position, rank, nationality, registration,
         search_text)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14)
         ON CONFLICT(qr_lookup) DO UPDATE SET
           \"group\" = excluded.\"group\",
           nickname = excluded.nickname,
           fio = excluded.fio,
           surname = excluded.surname,
           first_name = excluded.first_name,
           birth_date = excluded.birth_date,
           number = excluded.number,
           passport_number = excluded.passport_number,
           position = excluded.position,
           rank = excluded.rank,
           nationality = excluded.nationality,
           registration = excluded.registration,
           search_text = excluded.search_text",
        params![
            qr_lookup,
            group_label,
            item.nickname,
            item.fio,
            item.surname,
            item.first_name,
            item.birth_date,
            item.number,
            document_number,
            item.position,
            item.rank,
            item.nationality,
            item.registration,
            search_text
        ],
    )
    .map_err(|e| e.to_string())?;

    find_citizen_local(conn, &qr_lookup)?
        .ok_or_else(|| "Не удалось сохранить покупателя".into())
}

async fn fetch_citizen_from_registry_api(
    server_url: &str,
    lookup: &str,
) -> Result<Option<RemoteCitizenItem>, String> {
    let base = server_url.trim_end_matches('/');
    let encoded = urlencoding::encode(lookup);
    let url = format!("{base}/api/registry/by-qr/{encoded}");
    let response = reqwest::Client::new()
        .get(&url)
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {e}"))?;

    if response.status().as_u16() == 404 {
        return Ok(None);
    }
    if !response.status().is_success() {
        let status = response.status();
        let body = response.text().await.unwrap_or_default();
        return Err(format!("Реестр вернул {status}: {body}"));
    }

    response
        .json::<RemoteCitizenItem>()
        .await
        .map(Some)
        .map_err(|e| format!("Неверный ответ реестра: {e}"))
}

#[tauri::command]
pub async fn get_citizen_by_qr(
    qr_lookup: String,
    state: State<'_, DbState>,
) -> Result<Option<Citizen>, String> {
    let lookup = parse_qr_lookup(&qr_lookup)
        .unwrap_or_else(|| qr_lookup.trim().to_string());
    if lookup.is_empty() {
        return Err("Некорректный QR-код".into());
    }

    {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        if let Some(citizen) = find_citizen_local(&conn, &lookup)? {
            return Ok(Some(citizen));
        }
    }

    let server_url = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        get_setting(&conn, "server_url")
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "https://preshevkadastr.ru".to_string())
    };

    if let Some(item) = fetch_citizen_from_registry_api(&server_url, &lookup).await? {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        return upsert_citizen(&conn, &item).map(Some);
    }

    Ok(None)
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
pub async fn sync_citizens_from_default_registry(
    app: tauri::AppHandle,
    state: State<'_, DbState>,
) -> Result<i64, String> {
    let (server_url, device_token) = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let server_url = get_setting(&conn, "server_url")
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| "https://preshevkadastr.ru".to_string());
        let device_token = get_setting(&conn, "device_token")
            .map_err(|e| e.to_string())?
            .unwrap_or_default();
        (server_url, device_token)
    };

    if device_token.trim().is_empty() {
        return Err("Укажите device-token в настройках (создайте на preshevkadastr.ru/store)".into());
    }

    let base = server_url.trim_end_matches('/');
    let url = format!("{base}/store/api/sync/citizens");
    let response = reqwest::Client::new()
        .get(&url)
        .header("x-device-token", device_token.trim())
        .send()
        .await
        .map_err(|e| format!("Ошибка сети: {e}"))?;

    if response.status().is_success() {
        let body: RemoteCitizensResponse = response
            .json()
            .await
            .map_err(|e| format!("Неверный ответ сервера: {e}"))?;
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        return import_from_remote_items(body.items, &conn);
    }

    let status = response.status();
    let body = response.text().await.unwrap_or_default();
    if status.as_u16() != 404 {
        return Err(format!("Сервер вернул {status}: {body}"));
    }

    // Обратная совместимость: если endpoint еще не развернут на сервере,
    // используем локальный registry.db как временный fallback.
    let path = resolve_default_registry_path(&app)?;
    let registry = Connection::open(&path)
        .map_err(|e| format!("Не удалось открыть registry.db ({}): {e}", path.display()))?;
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
