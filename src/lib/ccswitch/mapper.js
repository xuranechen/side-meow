export class CCSwitchMapper {
  static mapProvider(provider) {
    return {
      resource: "provider",
      name: provider.name,
      endpoint: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.defaultModel,
      models: provider.models || [],
    };
  }

  static CC_SWITCH_APPS = [
    { value: "claude", label: "Claude Code" },
    { value: "claude_desktop", label: "Claude Desktop" },
    { value: "codex", label: "Codex" },
    { value: "gemini", label: "Gemini CLI" },
    { value: "opencode", label: "OpenCode" },
    { value: "openclaw", label: "OpenClaw" },
    { value: "hermes", label: "Hermes" },
  ];

  static mapApiFormat(type) {
    const mapping = {
      openai: "openai_chat",
      anthropic: "anthropic",
      gemini: "gemini_native",
    };
    return mapping[type] || "openai_chat";
  }

  static mapApiKeyField(type) {
    const mapping = {
      openai: "OPENAI_API_KEY",
      anthropic: "ANTHROPIC_API_KEY",
      gemini: "GEMINI_API_KEY",
    };
    return mapping[type] || "API_KEY";
  }

  static mapIcon(type) {
    const mapping = {
      openai: "openai",
      anthropic: "anthropic",
      gemini: "gemini",
    };
    return mapping[type] || "openai";
  }

  static mapIconColor(type) {
    const mapping = {
      openai: "#10A37F",
      anthropic: "#D97706",
      gemini: "#4285F4",
    };
    return mapping[type] || "#6B7280";
  }
}
