import { writable } from "svelte/store";
import { getStorage, setStorage } from "../../lib/storage/chrome-storage.js";

const DEFAULT_SETTINGS = {
  defaultApiType: "openai",
  autoTitle: true,
  maxChatHistory: 100,
  sessionExpireDays: 30,
  requestTimeout: 15,
  streamByDefault: true,
  showTokenCount: true,
  showTiming: true,
  confirmDelete: true,
  exportVersion: 1,
};

export const settings = writable({ ...DEFAULT_SETTINGS });
export const loading = writable(false);

export async function loadSettings() {
  loading.set(true);
  try {
    const data = await getStorage("settings");
    if (data && typeof data === "object") {
      settings.set({ ...DEFAULT_SETTINGS, ...data });
    } else {
      settings.set({ ...DEFAULT_SETTINGS });
    }
  } catch (err) {
    console.error("Failed to load settings:", err);
    settings.set({ ...DEFAULT_SETTINGS });
  } finally {
    loading.set(false);
  }
}

export async function updateSetting(key, value) {
  settings.update((current) => {
    const updated = { ...current, [key]: value };
    setStorage("settings", updated).catch((err) => {
      console.error("Failed to save settings:", err);
    });
    return updated;
  });
}

export async function updateSettings(updates) {
  settings.update((current) => {
    const updated = { ...current, ...updates };
    setStorage("settings", updated).catch((err) => {
      console.error("Failed to save settings:", err);
    });
    return updated;
  });
}

export async function resetSettings() {
  settings.set({ ...DEFAULT_SETTINGS });
  await setStorage("settings", DEFAULT_SETTINGS);
}
