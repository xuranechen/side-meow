const STORAGE_PREFIX = "api_sider_";

export async function getStorage(key) {
  const fullKey = STORAGE_PREFIX + key;
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(fullKey, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve(result[fullKey] ?? null);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function setStorage(key, value) {
  const fullKey = STORAGE_PREFIX + key;
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.set({ [fullKey]: value }, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function removeStorage(key) {
  const fullKey = STORAGE_PREFIX + key;
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.remove(fullKey, () => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function getAllStorage() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.get(null, (result) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          const filtered = {};
          for (const [key, value] of Object.entries(result)) {
            if (key.startsWith(STORAGE_PREFIX)) {
              const shortKey = key.slice(STORAGE_PREFIX.length);
              filtered[shortKey] = value;
            }
          }
          resolve(filtered);
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export async function clearAllStorage() {
  return new Promise((resolve, reject) => {
    try {
      chrome.storage.local.clear(() => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else {
          resolve();
        }
      });
    } catch (err) {
      reject(err);
    }
  });
}

export function onStorageChange(callback) {
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== "local") return;
    
    const filtered = {};
    for (const [key, { oldValue, newValue }] of Object.entries(changes)) {
      if (key.startsWith(STORAGE_PREFIX)) {
        const shortKey = key.slice(STORAGE_PREFIX.length);
        filtered[shortKey] = { oldValue, newValue };
      }
    }
    
    if (Object.keys(filtered).length > 0) {
      callback(filtered);
    }
  });
}

export async function getStorageSize() {
  return new Promise((resolve) => {
    chrome.storage.local.getBytesInUse(null, (bytes) => {
      resolve(bytes);
    });
  });
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}
