export const HEADER_PRESETS = {
  browser: {
    id: "browser",
    name: "浏览器",
    description: "标准浏览器请求头",
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    },
  },
  codex: {
    id: "codex",
    name: "Codex",
    description: "OpenAI Codex CLI 请求头",
    headers: {
      "User-Agent": "Codex-CLI/1.0.0",
      "Accept": "application/json",
      "X-Title": "Codex CLI",
      "HTTP-Referer": "https://github.com/openai/codex",
    },
  },
  claudeCode: {
    id: "claudeCode",
    name: "Claude Code",
    description: "Anthropic Claude Code 请求头",
    headers: {
      "User-Agent": "Claude-Code/1.0.0",
      "Accept": "application/json",
      "anthropic-version": "2023-06-01",
      "X-Title": "Claude Code",
      "HTTP-Referer": "https://github.com/anthropics/claude-code",
    },
  },
};

export function getPresetHeaders(presetId) {
  return HEADER_PRESETS[presetId]?.headers || {};
}

export function getPresetList() {
  return Object.values(HEADER_PRESETS).map(({ id, name, description }) => ({
    id,
    name,
    description,
  }));
}
