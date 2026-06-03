use rusqlite::{Connection, OptionalExtension};

/// Как `passport_group` в b9_docs `config.yaml`.
pub const PASSPORT_GROUP: &str = "Паспорта липа";
pub const PASSPORT_GROUP_DISPLAY: &str = "Местные";

/// Публичное имя группы (как на user_card).
pub fn display_group_name(group: &str) -> String {
    let g = group.trim();
    if g == PASSPORT_GROUP || g == PASSPORT_GROUP_DISPLAY {
        PASSPORT_GROUP_DISPLAY.to_string()
    } else {
        g.to_string()
    }
}

/// SQLite `lower()` не переводит кириллицу в регистр — делаем в Rust.
pub fn normalize_search(s: &str) -> String {
    s.chars().flat_map(char::to_lowercase).collect()
}

pub fn build_search_text(
    qr_lookup: &str,
    nickname: &str,
    fio: &str,
    surname: &str,
    first_name: &str,
    number: &str,
    passport_number: &str,
) -> String {
    let display_fio = if !fio.trim().is_empty() {
        fio.trim().to_string()
    } else {
        [surname.trim(), first_name.trim()]
            .iter()
            .filter(|p| !p.is_empty())
            .copied()
            .collect::<Vec<_>>()
            .join(" ")
    };

    let blob = [
        qr_lookup,
        nickname,
        fio,
        surname,
        first_name,
        &display_fio,
        number,
        passport_number,
    ]
    .join(" ");

    normalize_search(&blob)
}

pub fn search_tokens(query: &str) -> Vec<String> {
    normalize_search(query)
        .split_whitespace()
        .map(|t| format!("%{t}%"))
        .collect()
}

pub fn ensure_schema(conn: &Connection) -> rusqlite::Result<()> {
    let has_col: bool = conn
        .query_row(
            "SELECT 1 FROM pragma_table_info('citizens') WHERE name = 'search_text' LIMIT 1",
            [],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if !has_col {
        conn.execute(
            "ALTER TABLE citizens ADD COLUMN search_text TEXT NOT NULL DEFAULT ''",
            [],
        )?;
    }

    let needs_backfill: bool = conn
        .query_row(
            "SELECT 1 FROM citizens WHERE trim(search_text) = '' LIMIT 1",
            [],
            |_| Ok(true),
        )
        .optional()?
        .unwrap_or(false);

    if needs_backfill {
        rebuild_all_search_text(conn).map_err(|e| {
            rusqlite::Error::ToSqlConversionFailure(Box::new(std::io::Error::new(
                std::io::ErrorKind::Other,
                e,
            )))
        })?;
    }

    conn.execute(
        "UPDATE citizens SET \"group\" = ?1 WHERE trim(\"group\") = ?2",
        [PASSPORT_GROUP_DISPLAY, PASSPORT_GROUP],
    )?;

    Ok(())
}

pub fn rebuild_all_search_text(conn: &Connection) -> Result<(), String> {
    let mut stmt = conn
        .prepare(
            "SELECT id, qr_lookup, nickname, fio, surname, first_name, number, passport_number
             FROM citizens",
        )
        .map_err(|e| e.to_string())?;

    let rows: Vec<(i64, String, String, String, String, String, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
            ))
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    let tx = conn.unchecked_transaction().map_err(|e| e.to_string())?;
    for (id, qr, nick, fio, sur, first, num, pass) in rows {
        let st = build_search_text(&qr, &nick, &fio, &sur, &first, &num, &pass);
        tx.execute("UPDATE citizens SET search_text = ?1 WHERE id = ?2", (st, id))
            .map_err(|e| e.to_string())?;
    }
    tx.commit().map_err(|e| e.to_string())?;
    Ok(())
}

/// Условие поиска: каждое слово запроса должно встретиться в `search_text`.
pub fn append_token_filters(sql: &mut String, token_count: usize) {
    for _ in 0..token_count {
        sql.push_str(" AND search_text LIKE ?");
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_passport_group_display() {
        assert_eq!(display_group_name(PASSPORT_GROUP), PASSPORT_GROUP_DISPLAY);
        assert_eq!(display_group_name("СБГ"), "СБГ");
    }

    #[test]
    fn normalizes_cyrillic() {
        assert_eq!(normalize_search("Иванов"), "иванов");
    }

    #[test]
    fn build_includes_surname_parts() {
        let s = build_search_text("123", "", "", "Петров", "Иван", "123", "");
        assert!(s.contains("петров"));
        assert!(s.contains("иван"));
    }
}
