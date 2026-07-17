import { writable, derived } from "svelte/store";
import { getStorage, setStorage } from "../../lib/storage/chrome-storage.js";
import { generateId } from "../../lib/uuid.js";

export const providers = writable([]);
export const activeProviderId = writable(null);
export const loading = writable(false);

export const activeProvider = derived(
  [providers, activeProviderId],
  ([$providers, $activeProviderId]) => {
    return $providers.find((p) => p.id === $activeProviderId) || null;
  }
);

export async function loadProviders() {
  loading.set(true);
  try {
    const data = await getStorage("providers");
    providers.set(Array.isArray(data) ? data : []);
    
    const activeId = await getStorage("active_provider_id");
    if (activeId) {
      activeProviderId.set(activeId);
    }
  } catch (err) {
    console.error("Failed to load providers:", err);
    providers.set([]);
  } finally {
    loading.set(false);
  }
}

export async function saveProviders(newProviders) {
  providers.set(newProviders);
  await setStorage("providers", newProviders);
}

export async function addProvider(provider) {
  const current = [];
  providers.subscribe((p) => current.push(...p))();
  const maxIndex = current.reduce((max, p) => Math.max(max, p.sortIndex || 0), -1);

  const newProvider = {
    id: generateId(),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    sortIndex: maxIndex + 1,
    ...provider,
  };
  
  const updated = [...current, newProvider];
  await saveProviders(updated);
  
  if (current.length === 0) {
    await setActiveProvider(newProvider.id);
  }
  
  return newProvider;
}

export async function updateProvider(id, updates) {
  const current = [];
  providers.subscribe((p) => current.push(...p))();
  
  const updated = current.map((p) =>
    p.id === id ? { ...p, ...updates, updatedAt: Date.now() } : p
  );
  
  await saveProviders(updated);
}

export async function deleteProvider(id) {
  const current = [];
  providers.subscribe((p) => current.push(...p))();
  
  const updated = current.filter((p) => p.id !== id);
  await saveProviders(updated);
  
  const activeId = await getStorage("active_provider_id");
  if (activeId === id && updated.length > 0) {
    await setActiveProvider(updated[0].id);
  } else if (updated.length === 0) {
    await setStorage("active_provider_id", null);
    activeProviderId.set(null);
  }
}

export async function setActiveProvider(id) {
  activeProviderId.set(id);
  await setStorage("active_provider_id", id);
}

export async function reorderProviders(orderedIds) {
  const current = [];
  providers.subscribe((p) => current.push(...p))();
  
  const providerMap = new Map(current.map((p) => [p.id, p]));
  const reordered = orderedIds
    .map((id, index) => {
      const provider = providerMap.get(id);
      if (provider) {
        return { ...provider, sortIndex: index };
      }
      return null;
    })
    .filter(Boolean);
  
  await saveProviders(reordered);
}

export async function healthCheckProvider(id, timeoutMs = 15000) {
  const current = [];
  providers.subscribe((p) => current.push(...p))();
  const provider = current.find((p) => p.id === id);
  if (!provider) return;

  await updateProvider(id, {
    healthCheck: { status: "testing", lastCheck: Date.now() },
  });

  const startTime = Date.now();
  const requestId = "health-" + id + "-" + Date.now();

  try {
    const result = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("请求超时")), timeoutMs);

      chrome.runtime.sendMessage(
        {
          type: "API_REQUEST",
          requestId,
          provider: {
            type: provider.type,
            baseUrl: provider.baseUrl,
            apiKey: provider.apiKey,
            defaultModel: provider.defaultModel || provider.models?.[0]?.id || "gpt-4o-mini",
            headers: provider.headers || {},
            fullUrl: provider.fullUrl || false,
          },
          messages: [{ role: "user", content: "一根0.1mm绳子对折42次后有多长？只回答结果。" }],
          options: { stream: false, maxTokens: 10, timeout: timeoutMs },
        },
        (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          }
        }
      );

      function listener(message) {
        if (message.requestId !== requestId) return;
        if (message.type === "API_RESPONSE") {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          resolve(message);
        }
        if (message.type === "API_ERROR") {
          clearTimeout(timeout);
          chrome.runtime.onMessage.removeListener(listener);
          reject(new Error(message.error?.message || "连接失败"));
        }
      }
      chrome.runtime.onMessage.addListener(listener);
    });

    const latency = Date.now() - startTime;
    await updateProvider(id, {
      healthCheck: { status: "ok", latency, lastCheck: Date.now() },
    });
    return { status: "ok", latency };
  } catch (err) {
    const latency = Date.now() - startTime;
    await updateProvider(id, {
      healthCheck: { status: "error", latency, error: err.message, lastCheck: Date.now() },
    });
    return { status: "error", latency, error: err.message };
  }
}
