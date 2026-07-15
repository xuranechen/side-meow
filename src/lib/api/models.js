export async function fetchModelList(provider) {
  const { type, baseUrl, apiKey, headers: customHeaders = {} } = provider;
  
  switch (type) {
    case "openai":
      return fetchOpenAIModels(baseUrl, apiKey, customHeaders);
    case "gemini":
      return fetchGeminiModels(baseUrl, apiKey, customHeaders);
    case "anthropic":
      return fetchAnthropicModels();
    default:
      throw new Error(`不支持获取 ${type} 类型的模型列表`);
  }
}

async function fetchOpenAIModels(baseUrl, apiKey, customHeaders) {
  const url = `${baseUrl}/models`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      ...customHeaders,
    },
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`获取模型列表失败: ${response.status}`);
  }
  
  const data = await response.json();
  const models = data.data || [];
  
  return models
    .filter((m) => m.id)
    .map((m) => ({
      id: m.id,
      name: formatModelName(m.id),
      ownedBy: m.owned_by,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchGeminiModels(baseUrl, apiKey, customHeaders) {
  const url = `${baseUrl}/v1beta/models?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: {
      ...customHeaders,
    },
  });
  
  if (!response.ok) {
    throw new Error(`获取模型列表失败: ${response.status}`);
  }
  
  const data = await response.json();
  const models = data.models || [];
  
  return models
    .filter((m) => m.name && m.supportedGenerationMethods?.includes("generateContent"))
    .map((m) => {
      const id = m.name.replace("models/", "");
      return {
        id,
        name: m.displayName || formatModelName(id),
        description: m.description,
        contextWindow: m.inputTokenLimit,
        maxTokens: m.outputTokenLimit,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

async function fetchAnthropicModels() {
  return [
    { id: "claude-sonnet-4-20250514", name: "Claude Sonnet 4" },
    { id: "claude-3-5-sonnet-20241022", name: "Claude 3.5 Sonnet" },
    { id: "claude-3-5-haiku-20241022", name: "Claude 3.5 Haiku" },
    { id: "claude-3-opus-20240229", name: "Claude 3 Opus" },
    { id: "claude-3-haiku-20240307", name: "Claude 3 Haiku" },
  ];
}

function formatModelName(id) {
  return id
    .split("/")
    .pop()
    .split("-")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ")
    .replace(/\b(Gpt|Api|Llm|Ai)\b/g, (match) => match.toUpperCase());
}
