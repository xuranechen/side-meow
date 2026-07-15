chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const COMMON_HEADERS = [
  { header: "sec-ch-ua", operation: "remove" },
  { header: "sec-ch-ua-mobile", operation: "remove" },
  { header: "sec-ch-ua-platform", operation: "remove" },
  { header: "sec-fetch-dest", operation: "remove" },
  { header: "sec-fetch-mode", operation: "remove" },
  { header: "sec-fetch-site", operation: "remove" },
  { header: "sec-fetch-user", operation: "remove" },
  { header: "Origin", operation: "remove" },
  { header: "Referer", operation: "remove" },
];

async function initHeaderRules() {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "User-Agent", operation: "set", value: DEFAULT_UA },
            ...COMMON_HEADERS,
          ],
        },
        condition: { urlFilter: "*", resourceTypes: ["xmlhttprequest"] },
      }],
    });
  } catch (e) {
    console.error("Failed to init header rules:", e);
  }
}

initHeaderRules();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "API_REQUEST") {
    handleApiRequest(message, sender, sendResponse);
    return true;
  }
  
  if (message.type === "API_CANCEL") {
    handleApiCancel(message);
    sendResponse({ success: true });
    return false;
  }
  
  if (message.type === "FETCH_MODELS") {
    handleFetchModels(message).then(sendResponse).catch((err) => {
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});

const activeRequests = new Map();

async function syncUserAgentRule(customHeaders = {}) {
  const ua = customHeaders["User-Agent"] || customHeaders["user-agent"];
  if (!ua) return;

  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [{
        id: 1,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "User-Agent", operation: "set", value: ua },
            ...COMMON_HEADERS,
          ],
        },
        condition: { urlFilter: "*", resourceTypes: ["xmlhttprequest"] },
      }],
    });
  } catch (e) {
    console.error("Failed to sync UA rule:", e);
  }
}

async function handleFetchModels(message) {
  const { provider } = message;
  
  try {
    const models = await fetchModelList(provider);
    return { success: true, models };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function fetchModelList(provider) {
  const { type, baseUrl, apiKey, headers: rawHeaders = {}, fullUrl: isFullUrl } = provider;
  const customHeaders = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (key.toLowerCase() !== "user-agent") customHeaders[key] = value;
  }

  switch (type) {
    case "openai":
    case "anthropic":
      return fetchOpenAIModels(baseUrl, apiKey, customHeaders, isFullUrl);
    case "gemini":
      return fetchGeminiModels(baseUrl, apiKey, customHeaders);
    default:
      throw new Error(`不支持获取 ${type} 类型的模型列表`);
  }
}

const KNOWN_COMPAT_SUFFIXES = [
  "/api/claudecode",
  "/api/anthropic",
  "/apps/anthropic",
  "/api/coding",
  "/claudecode",
  "/anthropic",
  "/step_plan",
  "/coding",
  "/claude",
];

function endsWithVersionSegment(url) {
  const last = url.split("/").pop() || "";
  return /^v\d+$/.test(last);
}

function stripCompatSuffix(baseUrl) {
  for (const suffix of KNOWN_COMPAT_SUFFIXES) {
    if (baseUrl.endsWith(suffix)) {
      return baseUrl.slice(0, -suffix.length);
    }
  }
  return null;
}

function buildModelsUrlCandidates(baseUrl, isFullUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (!trimmed) return [];

  if (isFullUrl) {
    const v1Idx = trimmed.indexOf("/v1/");
    if (v1Idx !== -1) return [`${trimmed.slice(0, v1Idx)}/v1/models`];
    const lastSlash = trimmed.lastIndexOf("/");
    if (lastSlash > 0) {
      const root = trimmed.slice(0, lastSlash);
      if (root.includes("://") && root.length > root.indexOf("://") + 3) {
        return [`${root}/v1/models`];
      }
    }
    return [];
  }

  const candidates = [];

  if (endsWithVersionSegment(trimmed)) {
    candidates.push(`${trimmed}/models`);
    if (!trimmed.endsWith("/v1")) {
      candidates.push(`${trimmed}/v1/models`);
    }
  } else {
    candidates.push(`${trimmed}/v1/models`);
  }

  const stripped = stripCompatSuffix(trimmed);
  if (stripped) {
    const root = stripped.replace(/\/+$/, "");
    if (root && root.includes("://")) {
      candidates.push(`${root}/v1/models`);
      candidates.push(`${root}/models`);
    }
  }

  return [...new Set(candidates)];
}

async function fetchOpenAIModels(baseUrl, apiKey, customHeaders, isFullUrl) {
  const candidates = buildModelsUrlCandidates(baseUrl, isFullUrl);

  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: { "Authorization": `Bearer ${apiKey}`, ...customHeaders },
      });
      if (response.ok) {
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
    } catch {}
  }
  throw new Error("模型列表接口不可用，请手动添加模型 ID");
}

async function fetchGeminiModels(baseUrl, apiKey, customHeaders) {
  const url = `${baseUrl}/v1beta/models?key=${apiKey}`;
  
  const response = await fetch(url, {
    method: "GET",
    headers: customHeaders,
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

function buildChatUrlCandidates(baseUrl) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  const candidates = [`${trimmed}/chat/completions`];

  if (!endsWithVersionSegment(trimmed)) {
    candidates.push(`${trimmed}/v3/chat/completions`);
  }

  const stripped = stripCompatSuffix(trimmed);
  if (stripped) {
    const root = stripped.replace(/\/+$/, "");
    if (root && root.includes("://")) {
      candidates.push(`${root}/v1/chat/completions`);
      candidates.push(`${root}/chat/completions`);
    }
  }

  return [...new Set(candidates)];
}

async function handleApiRequest(message, sender, sendResponse) {
  const { requestId, provider, messages, options = {} } = message;
  const { stream = false } = options;
  
  const abortController = new AbortController();
  activeRequests.set(requestId, abortController);
  
  try {
    await syncUserAgentRule(provider.headers);
    const { urlCandidates, headers, body } = buildRequest(provider, messages, options);
    const candidates = provider.type === "openai"
      ? buildChatUrlCandidates(provider.baseUrl)
      : urlCandidates;
    let response = null;
    let usedUrl = "";

    for (const url of candidates) {
      console.log("[side-meow] Trying:", url);
      const res = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
        signal: abortController.signal,
      });
      if (res.ok || res.status !== 404) {
        response = res;
        usedUrl = url;
        break;
      }
    }

    if (!response) {
      chrome.runtime.sendMessage({
        type: "API_ERROR",
        requestId,
        error: { status: 404, message: `所有端点均返回 404:\n${candidates.join("\n")}` },
      });
      return;
    }

    console.log("[side-meow] Using:", usedUrl, response.status);
    
    if (!response.ok) {
      const errorText = await response.text();
      let upstreamMsg = "";
      try {
        const errorJson = JSON.parse(errorText);
        upstreamMsg = errorJson.error?.message || errorJson.message || "";
      } catch {
        upstreamMsg = errorText.slice(0, 200);
      }

      let friendlyMsg;
      switch (true) {
        case response.status === 401:
        case response.status === 403:
          friendlyMsg = "API Key 无效或已过期";
          break;
        case response.status === 429:
          friendlyMsg = "请求频率超限，请稍后再试";
          break;
        case response.status >= 500:
          friendlyMsg = "服务端错误";
          break;
        default:
          friendlyMsg = upstreamMsg || `HTTP ${response.status}`;
      }

      chrome.runtime.sendMessage({
        type: "API_ERROR",
        requestId,
        error: {
          status: response.status,
          message: friendlyMsg,
        },
      });
      return;
    }
    
    if (stream) {
      await handleStreamResponse(response, requestId, provider.type);
    } else {
      const data = await response.json();
      const parsed = parseResponse(provider.type, data);
      
      chrome.runtime.sendMessage({
        type: "API_RESPONSE",
        requestId,
        success: true,
        data: parsed,
      });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      chrome.runtime.sendMessage({
        type: "API_CANCELLED",
        requestId,
      });
    } else {
      chrome.runtime.sendMessage({
        type: "API_ERROR",
        requestId,
        error: {
          status: 0,
          message: err.message || "Network error",
        },
      });
    }
  } finally {
    activeRequests.delete(requestId);
  }
}

function handleApiCancel(message) {
  const { requestId } = message;
  const controller = activeRequests.get(requestId);
  if (controller) {
    controller.abort();
    activeRequests.delete(requestId);
  }
}

async function handleStreamResponse(response, requestId, apiType) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let usage = null;
  
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith("data: ")) continue;
        
        const data = trimmed.slice(6);
        if (data === "[DONE]") {
          chrome.runtime.sendMessage({
            type: "API_STREAM_DONE",
            requestId,
            usage,
          });
          return;
        }
        
        try {
          const parsed = JSON.parse(data);
          const token = extractStreamToken(apiType, parsed);
          
          if (token) {
            chrome.runtime.sendMessage({
              type: "API_STREAM_CHUNK",
              requestId,
              token: token.content,
              done: false,
            });
          }
          
          const streamUsage = extractStreamUsage(apiType, parsed);
          if (streamUsage) {
            usage = streamUsage;
          }
        } catch (e) {
          // Skip malformed chunks
        }
      }
    }
    
    chrome.runtime.sendMessage({
      type: "API_STREAM_DONE",
      requestId,
      usage,
    });
  } catch (err) {
    if (err.name !== "AbortError") {
      chrome.runtime.sendMessage({
        type: "API_ERROR",
        requestId,
        error: { status: 0, message: err.message },
      });
    }
  }
}

function buildRequest(provider, messages, options) {
  const { type, baseUrl, apiKey, headers: rawHeaders = {}, fullUrl: isFullUrl } = provider;
  const { stream = false, temperature = 0.7, maxTokens = 4096 } = options;
  const model = options.model || provider.defaultModel;

  const customHeaders = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (key.toLowerCase() !== "user-agent") {
      customHeaders[key] = value;
    }
  }

  switch (type) {
    case "openai":
      return {
        urlCandidates: buildChatUrlCandidates(baseUrl),
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          ...customHeaders,
        },
        body: {
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          stream,
          temperature,
          max_tokens: maxTokens,
        },
      };
    
    case "anthropic":
      const systemMessage = messages.find((m) => m.role === "system");
      const nonSystemMessages = messages.filter((m) => m.role !== "system");
      
      return {
        urlCandidates: [`${baseUrl}/v1/messages`],
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          ...customHeaders,
        },
        body: {
          model,
          max_tokens: maxTokens,
          messages: nonSystemMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          ...(systemMessage ? { system: systemMessage.content } : {}),
          stream,
        },
      };
    
    case "gemini":
      const geminiSystem = messages.find((m) => m.role === "system");
      const geminiMessages = messages.filter((m) => m.role !== "system");
      
      return {
        urlCandidates: [`${baseUrl}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`],
        headers: {
          "Content-Type": "application/json",
          ...customHeaders,
        },
        body: {
          contents: geminiMessages.map((m) => ({
            role: m.role === "assistant" ? "model" : "user",
            parts: [{ text: m.content }],
          })),
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
          ...(geminiSystem
            ? { systemInstruction: { parts: [{ text: geminiSystem.content }] } }
            : {}),
        },
      };
    
    default:
      throw new Error(`Unsupported API type: ${type}`);
  }
}

function parseResponse(apiType, data) {
  switch (apiType) {
    case "openai":
      return {
        content: data.choices?.[0]?.message?.content || "",
        usage: data.usage
          ? {
              promptTokens: data.usage.prompt_tokens,
              completionTokens: data.usage.completion_tokens,
              totalTokens: data.usage.total_tokens,
            }
          : null,
        finishReason: data.choices?.[0]?.finish_reason,
        model: data.model,
      };
    
    case "anthropic":
      return {
        content: data.content?.[0]?.text || "",
        usage: data.usage
          ? {
              promptTokens: data.usage.input_tokens,
              completionTokens: data.usage.output_tokens,
              totalTokens: data.usage.input_tokens + data.usage.output_tokens,
            }
          : null,
        finishReason: data.stop_reason,
        model: data.model,
      };
    
    case "gemini":
      return {
        content: data.candidates?.[0]?.content?.parts?.[0]?.text || "",
        usage: data.usageMetadata
          ? {
              promptTokens: data.usageMetadata.promptTokenCount,
              completionTokens: data.usageMetadata.candidatesTokenCount,
              totalTokens: data.usageMetadata.totalTokenCount,
            }
          : null,
        finishReason: data.candidates?.[0]?.finishReason,
        model: null,
      };
    
    default:
      throw new Error(`Unsupported API type: ${apiType}`);
  }
}

function extractStreamToken(apiType, data) {
  switch (apiType) {
    case "openai":
      const content = data.choices?.[0]?.delta?.content;
      return content ? { content } : null;
    
    case "anthropic":
      if (data.type === "content_block_delta") {
        return { content: data.delta?.text || "" };
      }
      return null;
    
    case "gemini":
      const geminiContent = data.candidates?.[0]?.content?.parts?.[0]?.text;
      return geminiContent ? { content: geminiContent } : null;
    
    default:
      return null;
  }
}

function extractStreamUsage(apiType, data) {
  switch (apiType) {
    case "openai":
      return data.usage
        ? {
            promptTokens: data.usage.prompt_tokens,
            completionTokens: data.usage.completion_tokens,
            totalTokens: data.usage.total_tokens,
          }
        : null;
    
    case "anthropic":
      if (data.type === "message_delta") {
        return {
          completionTokens: data.usage?.output_tokens,
        };
      }
      if (data.type === "message_start") {
        return {
          promptTokens: data.message?.usage?.input_tokens,
        };
      }
      return null;
    
    case "gemini":
      return data.usageMetadata
        ? {
            promptTokens: data.usageMetadata.promptTokenCount,
            completionTokens: data.usageMetadata.candidatesTokenCount,
            totalTokens: data.usageMetadata.totalTokenCount,
          }
        : null;
    
    default:
      return null;
  }
}
