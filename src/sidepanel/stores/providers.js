import { writable, derived } from "svelte/store";
import { getStorage, setStorage } from "../../lib/storage/chrome-storage.js";
import { generateId } from "../../lib/uuid.js";
import { sanitizeApiKey } from "../../lib/api/api-key.js";

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
    const storedProviders = Array.isArray(data) ? data : [];
    const sanitizedProviders = storedProviders.map(sanitizeProvider);
    providers.set(sanitizedProviders);
    if (sanitizedProviders.some((provider, index) => provider.apiKey !== storedProviders[index]?.apiKey)) {
      await setStorage("providers", sanitizedProviders);
    }
    
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

function sanitizeProvider(provider) {
  return {
    ...provider,
    apiKey: sanitizeApiKey(provider.apiKey),
  };
}

export async function saveProviders(newProviders) {
  const sanitizedProviders = newProviders.map(sanitizeProvider);
  providers.set(sanitizedProviders);
  await setStorage("providers", sanitizedProviders);
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

  const modelIds = (provider.models || []).map((m) => m.id).filter(Boolean);
  const candidates = modelIds.length > 0 ? modelIds : [provider.defaultModel || "gpt-4o-mini"];
  if (provider.defaultModel) {
    const idx = candidates.indexOf(provider.defaultModel);
    if (idx !== -1) {
      const [first] = candidates.splice(idx, 1);
      candidates.unshift(first);
    }
  }

  const baseProvider = {
    type: provider.type,
    baseUrl: provider.baseUrl,
    apiKey: provider.apiKey,
    headers: provider.headers || {},
    fullUrl: provider.fullUrl || false,
    tools: provider.tools || null,
    endpoint: provider.endpoint || "auto",
  };

  const modelResults = [];
  let firstOk = null;
  const startAll = Date.now();

  for (let i = 0; i < candidates.length; i++) {
    const modelId = candidates[i];
    const attemptId = "health-" + id + "-" + Date.now() + "-" + i;
    try {
      const latency = await testSingleRequest(attemptId, baseProvider, modelId, timeoutMs);
      const result = { model: modelId, status: "ok", latency };
      modelResults.push(result);
      if (!firstOk) firstOk = result;
    } catch (err) {
      modelResults.push({ model: modelId, status: "error", error: err.message });
    }
  }

  const okCount = modelResults.filter((r) => r.status === "ok").length;
  const total = modelResults.length;

  if (okCount > 0) {
    const result = {
      status: "ok",
      latency: firstOk?.latency,
      okCount,
      total,
      modelResults,
    };
    await updateProvider(id, {
      healthCheck: { ...result, lastCheck: Date.now() },
    });
    return result;
  } else {
    const firstErr = modelResults.find((r) => r.status === "error");
    const result = {
      status: "error",
      latency: Date.now() - startAll,
      error: firstErr?.error || "所有模型均连接失败",
      okCount,
      total,
      modelResults,
    };
    await updateProvider(id, {
      healthCheck: { ...result, lastCheck: Date.now() },
    });
    return result;
  }
}

function testSingleRequest(requestId, provider, modelId, timeoutMs) {
  const startedAt = Date.now();
  return new Promise((resolve, reject) => {
    let settled = false;
    let timeout;
    const successTypes = new Set([
      "API_RESPONSE",
      "API_STREAM_STARTED",
      "API_STREAM_CHUNK",
      "API_THINKING_CHUNK",
      "API_THINKING_DONE",
      "API_TOOL_CALLS",
      "API_WEB_SEARCH_CALLS",
      "API_STREAM_DONE",
    ]);

    function cleanup() {
      clearTimeout(timeout);
      chrome.runtime.onMessage.removeListener(listener);
    }

    function cancelRequest() {
      chrome.runtime.sendMessage({ type: "API_CANCEL", requestId }, () => {
        void chrome.runtime.lastError;
      });
    }

    function finish(error) {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else resolve(Date.now() - startedAt);
    }

    function listener(message) {
      if (message.requestId !== requestId) return;
      if (successTypes.has(message.type)) {
        const isComplete = message.type === "API_RESPONSE" || message.type === "API_STREAM_DONE";
        finish(null, message);
        if (!isComplete) cancelRequest();
      } else if (message.type === "API_ERROR") {
        finish(new Error(message.error?.message || "\u8fde\u63a5\u5931\u8d25"));
      } else if (message.type === "API_CANCELLED") {
        finish(new Error("\u6d4b\u8bd5\u8bf7\u6c42\u5df2\u53d6\u6d88"));
      }
    }

    timeout = setTimeout(() => {
      finish(new Error("\u8bf7\u6c42\u8d85\u65f6"));
      cancelRequest();
    }, timeoutMs);
    chrome.runtime.onMessage.addListener(listener);

    chrome.runtime.sendMessage(
      {
        type: "API_REQUEST",
        requestId,
        provider,
        messages: [{ role: "user", content: "Reply with OK only." }],
        options: { stream: true, model: modelId, thinking: true, thinkingBudget: 10000, timeout: timeoutMs },
      },
      (response) => {
        if (chrome.runtime.lastError) {
          finish(new Error(chrome.runtime.lastError.message));
        } else if (!response?.accepted) {
          finish(new Error("\u540e\u53f0\u672a\u63a5\u53d7\u6d4b\u8bd5\u8bf7\u6c42"));
        }
      }
    );
  });
}
