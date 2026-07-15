export const API_TYPES = {
  openai: {
    id: "openai",
    name: "OpenAI 兼容",
    description: "OpenAI、DeepSeek、通义千问、Moonshot、智谱等",
    color: "#b7ead4",
    icon: "Zap",
    defaultBaseUrl: "https://api.openai.com/v1",
  },
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    description: "Claude 系列",
    color: "#f4a073",
    icon: "Diamond",
    defaultBaseUrl: "https://api.anthropic.com",
  },
  gemini: {
    id: "gemini",
    name: "Google Gemini",
    description: "Gemini 系列",
    color: "#73bdf5",
    icon: "Circle",
    defaultBaseUrl: "https://generativelanguage.googleapis.com",
  },
};

export const DEFAULT_MODELS = {
  openai: [
    { id: "gpt-4o", name: "GPT-4o", maxTokens: 16384, contextWindow: 128000 },
    { id: "gpt-4o-mini", name: "GPT-4o Mini", maxTokens: 16384, contextWindow: 128000 },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", maxTokens: 4096, contextWindow: 128000 },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", maxTokens: 4096, contextWindow: 16385 },
  ],
  anthropic: [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4", maxTokens: 64000, contextWindow: 200000 },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet", maxTokens: 8192, contextWindow: 200000 },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku", maxTokens: 8192, contextWindow: 200000 },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus", maxTokens: 4096, contextWindow: 200000 },
  ],
  gemini: [
    { id: "gemini-2.0-flash", name: "Gemini 2.0 Flash", maxTokens: 8192, contextWindow: 1048576 },
    { id: "gemini-2.0-flash-lite", name: "Gemini 2.0 Flash Lite", maxTokens: 8192, contextWindow: 1048576 },
    { id: "gemini-1.5-pro", name: "Gemini 1.5 Pro", maxTokens: 8192, contextWindow: 2097152 },
    { id: "gemini-1.5-flash", name: "Gemini 1.5 Flash", maxTokens: 8192, contextWindow: 1048576 },
  ],
};

export const STORAGE_KEYS = {
  PROVIDERS: "providers",
  SESSIONS: "sessions",
  SETTINGS: "settings",
  ACTIVE_PROVIDER_ID: "active_provider_id",
  ACTIVE_SESSION_ID: "active_session_id",
};

export const MESSAGE_ROLES = {
  USER: "user",
  ASSISTANT: "assistant",
  SYSTEM: "system",
};

export const FINISH_REASONS = {
  STOP: "stop",
  LENGTH: "length",
  CONTENT_FILTER: "content_filter",
  TOOL_CALLS: "tool_calls",
};
