import { writable, derived } from "svelte/store";
import { getStorage, setStorage } from "../../lib/storage/chrome-storage.js";
import { generateId } from "../../lib/uuid.js";

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
    sessions.set(Array.isArray(data) ? data : []);
    
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
    const title =
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
  
  const activeId = await getStorage("active_session_id");
  if (activeId === sessionId) {
    if (updated.length > 0) {
      await setActiveSession(updated[0].id);
    } else {
      await setStorage("active_session_id", null);
      activeSessionId.set(null);
    }
  }
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

export async function cleanupOldSessions(maxCount = 100) {
  if (maxCount <= 0) return;
  
  const current = [];
  sessions.subscribe((s) => current.push(...s))();
  
  if (current.length <= maxCount) return;
  
  const sorted = [...current].sort((a, b) => b.updatedAt - a.updatedAt);
  const toKeep = sorted.slice(0, maxCount);
  const toRemove = sorted.slice(maxCount);
  
  await saveSessions(toKeep);
  
  const activeId = await getStorage("active_session_id");
  if (toRemove.some((s) => s.id === activeId)) {
    await setActiveSession(toKeep[0]?.id || null);
  }
}
