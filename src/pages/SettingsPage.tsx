import { useCallback, useEffect, useState } from "react";
import { api } from "../api/tauri";
import { usePlatform } from "../hooks/usePlatform";
import type { AppSettings } from "../../shared/types";

interface SettingsPageProps {
  onSyncChange?: () => void;
}

export function SettingsPage({ onSyncChange }: SettingsPageProps) {
  const { isMobile } = usePlatform();
  const [settings, setSettings] = useState<AppSettings>({
    server_url: "https://preshevkadastr.ru",
    device_token: "",
    auto_sync_minutes: 15,
  });
  const [unsynced, setUnsynced] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [s, count] = await Promise.all([
        api.getSettings(),
        api.getUnsyncedCount(),
      ]);
      setSettings(s);
      setUnsynced(count);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (settings.auto_sync_minutes <= 0) return;
    const ms = settings.auto_sync_minutes * 60 * 1000;
    const timer = window.setInterval(() => {
      if (settings.device_token.trim()) {
        void api.syncPendingSales().then(() => load());
      }
    }, ms);
    return () => window.clearInterval(timer);
  }, [settings.auto_sync_minutes, settings.device_token, load]);

  const save = async () => {
    setError("");
    try {
      await api.saveSettings(settings);
      setStatus("Настройки сохранены");
    } catch (e) {
      setError(String(e));
    }
  };

  const syncNow = async () => {
    setBusy(true);
    setError("");
    try {
      const result = await api.syncPendingSales();
      setStatus(`Выгружено чеков: ${result.synced}`);
      await load();
      onSyncChange?.();
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`page ${isMobile ? "mobile-page" : ""}`}>
      <header className="page-header">
        <h1>Настройки</h1>
        <p>Синхронизация с preshevkadastr.ru/store</p>
      </header>

      <section className="panel form-panel">
        <div className="form-grid">
          <label>
            URL сервера
            <input
              value={settings.server_url}
              onChange={(e) =>
                setSettings({ ...settings, server_url: e.target.value })
              }
            />
          </label>
          <label>
            Device token
            <input
              value={settings.device_token}
              onChange={(e) =>
                setSettings({ ...settings, device_token: e.target.value })
              }
              placeholder="Создайте на /store → Устройства"
            />
          </label>
          <label>
            Авто-синхронизация (мин, 0 = выкл)
            <input
              type="number"
              value={settings.auto_sync_minutes}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  auto_sync_minutes: Number(e.target.value),
                })
              }
            />
          </label>
        </div>
        <div className="actions">
          <button type="button" className="primary" onClick={() => void save()}>
            Сохранить
          </button>
          <button type="button" disabled={busy} onClick={() => void syncNow()}>
            {busy ? "Выгрузка…" : `Выгрузить продажи (${unsynced})`}
          </button>
        </div>
      </section>

      {status && <div className="status-msg">{status}</div>}
      {error && <div className="error-msg">{error}</div>}
    </div>
  );
}
