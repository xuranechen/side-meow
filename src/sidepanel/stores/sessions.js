import { writable, derived } from "svelte/store";
import { getStorage, setStorage } from "../../lib/storage/chrome-storage.js";
import { generateId } from "../../lib/uuid.js";
import { settings } from "./settings.js";

export const sessions = writable([]);
export const activeSessionId = writable(null);
export const loading = writable(false);

export const activeSession = derived(
  [sessions, activeSessionId],
  ([$sessions, $activeSessionId]) => {
    return $sessions.find((s) => s.id === $activeSessionId) || null;
  }
);

export async function loadSessions() {
  loading.set(true);
  try {
    const data = await getStorage("sessions");
    const list = Array.isArray(data) ? data : [];

    // 修复被中断（关闭面板 / SW 重启）而残留 streaming 标记的消息，
    // 否则历史会话会永远显示流式光标且隐藏思考/元信息
    let dirty = false;
    for (const session of list) {
      for (const message of session.messages || []) {
        if (message?.metadata?.streaming) {
          if (message._thinking && !message.thinkingSegments?.length) {
            message.thinkingSegments = [message._thinking];
          }
          message._thinking = null;
          message.metadata = { ...message.metadata, streaming: false, interrupted: true };
          dirty = true;
        }
      }
    }

    sessions.set(list);
    if (dirty) await setStorage("sessions", list);

    const activeId = await getStorage("active_session_id");
    if (activeId) {
      activeSessionId.set(activeId);
    }
  } catch (err) {
    console.error("Failed to load sessions:", err);
    sessions.set([]);
  } finally {
    loading.set(false);
  }
}

// 流式期间节流落盘：只在内存改动的中间态定期写入 storage，
// 这样即使流未走到 DONE（关闭面板/异常）也能保留已流出的内容与思考
let persistTimer = null;
export function persistSessionsSoon(delay = 500) {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    const current = [];
    sessions.subscribe((s) => current.push(...s))();
    setStorage("sessions", current).catch((err) => console.error("Failed to persist sessions:", err));
  }, delay);
}

export function persistSessionsNow(data) {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  const current = data || (() => { const s = []; sessions.subscribe((v) => s.push(...v))(); return s; })();
  setStorage("sessions", current).catch((err) => console.error("Failed to persist sessions:", err));
}

export async function saveSessions(newSessions) {
  sessions.set(newSessions);
  await setStorage("sessions", newSessions);
}

export async function createSession(providerId, modelId, systemPrompt = "") {
  const newSession = {
    id: generateId(),
    providerId,
    modelId,
    title: "新对话",
    messages: systemPrompt
      ? [
          {
            id: generateId(),
            role: "system",
            content: systemPrompt,
            timestamp: Date.now(),
          },
        ]
      : [],
    createdAt: Date.now(),
    updatedAt: Date.now(),
    totalTokens: 0,
    totalCost: 0,
  };
  
  const current = [];
  sessions.subscribe((s) => current.push(...s))();
  
  const updated = [newSession, ...current];
  await saveSessions(updated);
  await setActiveSession(newSession.id);
  
  return newSession;
}

export async function addMessage(sessionId, message) {
  const current = [];
  sessions.subscribe((s) => current.push(...s))();
  
  const updated = current.map((s) => {
    if (s.id !== sessionId) return s;
    
    const newMessage = {
      id: generateId(),
      timestamp: Date.now(),
      ...message,
    };
    
    const messages = [...s.messages, newMessage];
    let autoTitleEnabled = true;
    settings.subscribe((v) => { autoTitleEnabled = v.autoTitle; })();
    const title =
      autoTitleEnabled &&
      messages.filter((m) => m.role === "user").length === 1 &&
      message.role === "user"
        ? message.content.slice(0, 50) + (message.content.length > 50 ? "..." : "")
        : s.title;
    
    return {
      ...s,
      messages,
      title,
      updatedAt: Date.now(),
    };
  });
  
  await saveSessions(updated);
}

export async function updateLastAssistantMessage(sessionId, updates) {
  const current = [];
  sessions.subscribe((s) => current.push(...s))();
  
  const updated = current.map((s) => {
    if (s.id !== sessionId) return s;
    
    const messages = [...s.messages];
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") {
        messages[i] = { ...messages[i], ...updates };
        break;
      }
    }
    
    return { ...s, messages, updatedAt: Date.now() };
  });
  
  await saveSessions(updated);
}

export async function updateSessionMetadata(sessionId, metadata) {
  const current = [];
  sessions.subscribe((s) => current.push(...s))();
  
  const updated = current.map((s) =>
    s.id === sessionId ? { ...s, ...metadata, updatedAt: Date.now() } : s
  );
  
  await saveSessions(updated);
}

export async function deleteSession(sessionId) {
  const current = [];
  sessions.subscribe((s) => current.push(...s))();
  
  const updated = current.filter((s) => s.id !== sessionId);
  await saveSessions(updated);
  
  let newActive = null;
  const activeId = await getStorage("active_session_id");
  if (activeId === sessionId) {
    if (updated.length > 0) {
      await setActiveSession(updated[0].id);
      newActive = updated[0];
    } else {
      await setStorage("active_session_id", null);
      activeSessionId.set(null);
    }
  } else if (activeId) {
    newActive = updated.find((s) => s.id === activeId) || null;
  }
  return newActive;
}

export async function setActiveSession(id) {
  activeSessionId.set(id);
  await setStorage("active_session_id", id);
}

export async function clearAllSessions() {
  await saveSessions([]);
  await setStorage("active_session_id", null);
  activeSessionId.set(null);
}

export async function cleanupOldSessions(maxCount = 100, expireDays = 0) {
  const current = [];
  sessions.subscribe((s) => current.push(...s))();

  let toRemove = [];

  if (expireDays > 0) {
    const cutoff = Date.now() - expireDays * 86400000;
    toRemove = current.filter((s) => s.updatedAt < cutoff);
  }

  if (maxCount > 0) {
    const sorted = [...current].sort((a, b) => b.updatedAt - a.updatedAt);
    const overflow = sorted.slice(maxCount);
    for (const s of overflow) {
      if (!toRemove.some((r) => r.id === s.id)) {
        toRemove.push(s);
      }
    }
  }

  if (toRemove.length === 0) return 0;

  const removeIds = new Set(toRemove.map((s) => s.id));
  const toKeep = current.filter((s) => !removeIds.has(s.id));
  await saveSessions(toKeep);

  const activeId = await getStorage("active_session_id");
  if (removeIds.has(activeId)) {
    await setActiveSession(toKeep[0]?.id || null);
  }

  return toRemove.length;
}
