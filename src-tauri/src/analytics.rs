use crate::db::DbState;
use crate::models::{AnalyticsOverview, MonthlySales, TopBuyer, TopProduct};
use tauri::State;

#[tauri::command]
pub fn analytics_overview(state: State<'_, DbState>) -> Result<AnalyticsOverview, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let total_revenue: f64 = conn
        .query_row("SELECT COALESCE(SUM(total), 0) FROM sales", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let sale_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM sales", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let unsynced_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM sales WHERE synced_at IS NULL",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;

    let product_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM products WHERE active = 1", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    let citizen_count: i64 = conn
        .query_row("SELECT COUNT(*) FROM citizens", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;

    Ok(AnalyticsOverview {
        total_revenue,
        sale_count,
        unsynced_count,
        product_count,
        citizen_count,
    })
}

#[tauri::command]
pub fn analytics_top_products(
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<TopProduct>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(5);

    let mut stmt = conn
        .prepare(
            "SELECT si.product_id, si.name, si.barcode,
                    SUM(si.quantity) as qty,
                    SUM(si.quantity * si.unit_price) as revenue
             FROM sale_items si
             GROUP BY si.product_id, si.name, si.barcode
             ORDER BY qty DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([lim], |row| {
            Ok(TopProduct {
                product_id: row.get(0)?,
                name: row.get(1)?,
                barcode: row.get(2)?,
                quantity: row.get(3)?,
                revenue: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn analytics_top_buyers(
    limit: Option<i64>,
    state: State<'_, DbState>,
) -> Result<Vec<TopBuyer>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    let lim = limit.unwrap_or(5);

    let mut stmt = conn
        .prepare(
            "SELECT citizen_qr_lookup, citizen_fio, citizen_group,
                    COUNT(*) as purchase_count,
                    SUM(total) as total_spent
             FROM sales
             GROUP BY citizen_qr_lookup, citizen_fio, citizen_group
             ORDER BY total_spent DESC
             LIMIT ?1",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([lim], |row| {
            Ok(TopBuyer {
                citizen_qr_lookup: row.get(0)?,
                citizen_fio: row.get(1)?,
                citizen_group: row.get(2)?,
                purchase_count: row.get(3)?,
                total_spent: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn analytics_monthly_sales(state: State<'_, DbState>) -> Result<Vec<MonthlySales>, String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT strftime('%Y-%m', created_at) as month,
                    SUM(total) as revenue,
                    COUNT(*) as cnt
             FROM sales
             GROUP BY month
             ORDER BY month",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(MonthlySales {
                month: row.get(0)?,
                revenue: row.get(1)?,
                count: row.get(2)?,
            })
        })
        .map_err(|e| e.to_string())?;

    rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())
}
