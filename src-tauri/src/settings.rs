use crate::db::{get_setting, set_setting, DbState};
use crate::models::AppSettings;
use tauri::State;

const DEFAULT_SERVER: &str = "https://preshevkadastr.ru";

fn normalize_checkout_mode(raw: &str) -> String {
    if raw.trim() == "menu" {
        "menu".to_string()
    } else {
        "scan".to_string()
    }
}

#[tauri::command]
pub fn get_settings(state: State<'_, DbState>) -> Result<AppSettings, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    Ok(AppSettings {
        server_url: get_setting(&conn, "server_url")
            .map_err(|e| e.to_string())?
            .unwrap_or_else(|| DEFAULT_SERVER.to_string()),
        device_token: get_setting(&conn, "device_token")
            .map_err(|e| e.to_string())?
            .unwrap_or_default(),
        auto_sync_minutes: get_setting(&conn, "auto_sync_minutes")
            .map_err(|e| e.to_string())?
            .and_then(|v| v.parse().ok())
            .unwrap_or(15),
        default_checkout_mode: get_setting(&conn, "default_checkout_mode")
            .map_err(|e| e.to_string())?
            .map(|v| normalize_checkout_mode(&v))
            .unwrap_or_else(|| "scan".to_string()),
    })
}

#[tauri::command]
pub fn save_settings(settings: AppSettings, state: State<'_, DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    set_setting(&conn, "server_url", settings.server_url.trim())
        .map_err(|e| e.to_string())?;
    set_setting(&conn, "device_token", settings.device_token.trim())
        .map_err(|e| e.to_string())?;
    set_setting(
        &conn,
        "auto_sync_minutes",
        &settings.auto_sync_minutes.to_string(),
    )
    .map_err(|e| e.to_string())?;
    set_setting(
        &conn,
        "default_checkout_mode",
        &normalize_checkout_mode(&settings.default_checkout_mode),
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}
