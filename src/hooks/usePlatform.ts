import { useEffect, useState } from "react";

export type PlatformKind = "desktop" | "mobile";

let cachedPlatform: PlatformKind | null = null;

async function detectPlatform(): Promise<PlatformKind> {
  if (cachedPlatform) return cachedPlatform;

  try {
    const osPlugin = await import("@tauri-apps/plugin-os");
    const os = osPlugin.type();
    if (os === "android" || os === "ios") {
      cachedPlatform = "mobile";
      return "mobile";
    }
  } catch {
    /* not in tauri or plugin unavailable */
  }

  if (window.matchMedia("(max-width: 768px)").matches) {
    cachedPlatform = "mobile";
    return "mobile";
  }

  cachedPlatform = "desktop";
  return "desktop";
}

export function usePlatform() {
  const [platform, setPlatform] = useState<PlatformKind>("desktop");

  useEffect(() => {
    void detectPlatform().then(setPlatform);
  }, []);

  return {
    platform,
    isMobile: platform === "mobile",
    isDesktop: platform === "desktop",
  };
}

export async function isMobilePlatform(): Promise<boolean> {
  return (await detectPlatform()) === "mobile";
}
