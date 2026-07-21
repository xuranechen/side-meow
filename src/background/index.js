chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true });

const DEFAULT_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const PROVIDER_ONLY_HEADERS = [
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

const LEGACY_DYNAMIC_RULE_ID = 1;
const UA_RULE_ID_BASE = 1000;
const UA_RULE_ID_RANGE = 1000000000;
const BACKGROUND_TAB_ID = -1;

async function initHeaderRules() {
  try {
    // Dynamic rules persist across browser restarts and extension updates. Remove the
    // old global rule so existing installations stop modifying every page's XHRs.
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [LEGACY_DYNAMIC_RULE_ID],
    });

    // Session rules survive service-worker restarts. Clear our reserved range and
    // recreate rules lazily for the providers that are actually used this session.
    const sessionRules = await chrome.declarativeNetRequest.getSessionRules();
    const staleRuleIds = sessionRules
      .map((rule) => rule.id)
      .filter((id) => id >= UA_RULE_ID_BASE && id < UA_RULE_ID_BASE + UA_RULE_ID_RANGE);
    if (staleRuleIds.length > 0) {
      await chrome.declarativeNetRequest.updateSessionRules({ removeRuleIds: staleRuleIds });
    }
  } catch (e) {
    console.error("Failed to initialize provider header rules:", e);
  }
}

const headerRulesReady = initHeaderRules();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "API_REQUEST") {
    void handleApiRequest(message);
    sendResponse({ success: true, accepted: true });
    return false;
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

function sendRuntimeEvent(message) {
  chrome.runtime.sendMessage(message, () => {
    // Runtime events are best-effort broadcasts. Reading lastError suppresses the
    // expected warning when the side panel has already closed or has no listener.
    void chrome.runtime.lastError;
  });
}

function getUserAgentRuleId(hostname) {
  let hash = 0;
  for (let i = 0; i < hostname.length; i++) {
    hash = ((hash << 5) - hash + hostname.charCodeAt(i)) | 0;
  }
  return UA_RULE_ID_BASE + ((hash >>> 0) % UA_RULE_ID_RANGE);
}

function getHeaderValue(headers, targetName) {
  const entry = Object.entries(headers).find(([name]) => name.toLowerCase() === targetName);
  return entry?.[1];
}

async function syncUserAgentRule(provider) {
  await headerRulesReady;

  const customHeaders = provider.headers || {};
  const ua = getHeaderValue(customHeaders, "user-agent") || DEFAULT_UA;

  let hostname;
  try {
    hostname = new URL(provider.baseUrl).hostname;
  } catch (e) {
    console.warn("Skipped UA rule for invalid provider URL:", provider.baseUrl);
    return;
  }

  const ruleId = getUserAgentRuleId(hostname);

  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [ruleId],
      addRules: [{
        id: ruleId,
        priority: 1,
        action: {
          type: "modifyHeaders",
          requestHeaders: [
            { header: "User-Agent", operation: "set", value: ua },
            ...PROVIDER_ONLY_HEADERS,
          ],
        },
        condition: {
          requestDomains: [hostname],
          // Background service-worker requests have no associated browser tab.
          tabIds: [BACKGROUND_TAB_ID],
          resourceTypes: ["xmlhttprequest"],
        },
      }],
    });
  } catch (e) {
    console.error("Failed to sync UA rule:", e);
  }
}

async function handleFetchModels(message) {
  const { provider } = message;
  
  try {
    await syncUserAgentRule(provider);
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
      return fetchOpenAIModels(baseUrl, apiKey, customHeaders, isFullUrl);
    case "anthropic":
      return fetchOpenAIModels(baseUrl, apiKey, customHeaders, isFullUrl).catch(() => fetchAnthropicModels());
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

function buildChatUrlCandidates(baseUrl, isFullUrl = false) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (isFullUrl) return [trimmed];

  const candidates = [`${trimmed}/chat/completions`];
  if (!endsWithVersionSegment(trimmed)) {
    candidates.push(`${trimmed}/v1/chat/completions`);
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

function buildResponsesUrlCandidates(baseUrl, isFullUrl = false) {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (isFullUrl) return [trimmed];

  const candidates = [`${trimmed}/responses`];
  if (!endsWithVersionSegment(trimmed)) {
    candidates.push(`${trimmed}/v1/responses`);
  }
  return [...new Set(candidates)];
}

function usesResponsesApi(provider) {
  return provider.type === "openai" &&
    Array.isArray(provider.tools) &&
    provider.tools.some((tool) => tool?.type === "web_search");
}

async function tryEndpoints(urlCandidates, headers, body, signal) {
  let response = null;
  let usedUrl = "";
  for (const url of urlCandidates) {
    console.log("[side-meow] Trying:", url);
    const candidate = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (candidate.ok || candidate.status !== 404) {
      response = candidate;
      usedUrl = url;
      break;
    }
  }
  return { response, usedUrl };
}

async function handleApiRequest(message) {
  const { requestId, provider, messages, options = {} } = message;
  const { stream = false, timeout = 15000 } = options;
  const abortController = new AbortController();
  activeRequests.set(requestId, abortController);

  const timeoutId = setTimeout(() => {
    abortController.abort();
    sendRuntimeEvent({
      type: "API_ERROR",
      requestId,
      error: { status: 0, message: `请求超时（${Math.round(timeout / 1000)}秒）` },
    });
  }, timeout);

  try {
    await syncUserAgentRule(provider);
    let request = buildRequest(provider, messages, options);
    let { response, usedUrl } = await tryEndpoints(
      request.urlCandidates, request.headers, request.body, abortController.signal,
    );

    // 部分接口不认思考参数（如 reasoning/thinking 触发 4xx/5xx），自动去参重试一次
    if (options.thinking && response && !response.ok && ![401, 403, 429].includes(response.status)) {
      console.log("[side-meow] Thinking request failed with", response.status, "- retrying without thinking params");
      request = buildRequest(provider, messages, { ...options, thinking: false });
      ({ response, usedUrl } = await tryEndpoints(
        request.urlCandidates, request.headers, request.body, abortController.signal,
      ));
    }

    const { responseFormat = "chat" } = request;

    if (!response) {
      sendRuntimeEvent({
        type: "API_ERROR",
        requestId,
        error: { status: 404, message: `所有端点均返回 404:\n${request.urlCandidates.join("\n")}` },
      });
      return;
    }

    console.log("[side-meow] Using:", usedUrl, response.status);
    if (!response.ok) {
      const errorText = await response.text();
      let upstreamMsg = "";
      try {
        const errorJson = JSON.parse(errorText);
        upstreamMsg = errorJson.error?.message || errorJson.detail || errorJson.message || "";
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

      sendRuntimeEvent({
        type: "API_ERROR",
        requestId,
        error: { status: response.status, message: friendlyMsg },
      });
      return;
    }

    if (stream) {
      clearTimeout(timeoutId); // 流式响应收到后清除超时，后续由流本身控制
      if (responseFormat === "responses") {
        await handleResponsesStream(response, requestId);
      } else {
        await handleStreamResponse(response, requestId, provider.type);
      }
    } else {
      clearTimeout(timeoutId);
      const data = await response.json();
      sendRuntimeEvent({
        type: "API_RESPONSE",
        requestId,
        success: true,
        data: parseResponse(provider.type, data, responseFormat),
      });
    }
  } catch (err) {
    if (err.name === "AbortError") {
      sendRuntimeEvent({ type: "API_CANCELLED", requestId });
    } else {
      sendRuntimeEvent({
        type: "API_ERROR",
        requestId,
        error: { status: 0, message: err.message || "Network error" },
      });
    }
  } finally {
    clearTimeout(timeoutId);
    activeRequests.delete(requestId);
  }
}

function handleApiCancel(message) {
  const controller = activeRequests.get(message.requestId);
  if (controller) {
    controller.abort();
    activeRequests.delete(message.requestId);
  }
}

function normalizeToolCalls(toolCallsMap) {
  return [...toolCallsMap.values()].map((toolCall) => ({
    id: toolCall.id || "",
    name: toolCall.name || "",
    arguments: toolCall.arguments || "",
  }));
}

// 某些中转在 HTTP 200 的 SSE 流里直接推一行裸 JSON 错误（不带 "data: " 前缀），
// 或在 data 负载里携带 {"error": {...}}，这里统一提取错误消息
function extractErrorMessage(parsed) {
  const err = parsed?.error;
  if (!err) return null;
  if (typeof err === "string") return err;
  const message = err.message || err.type;
  if (message) return message;
  const serialized = JSON.stringify(err);
  return serialized && serialized !== "{}" ? serialized.slice(0, 200) : null;
}

function extractBareErrorLine(line) {
  if (!line.startsWith("{")) return null;
  try {
    return extractErrorMessage(JSON.parse(line));
  } catch {
    return null;
  }
}

async function handleStreamResponse(response, requestId, apiType) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const toolCallsMap = new Map();
  const anthropicBlocks = new Map();
  let buffer = "";
  let usage = null;
  let responseModel = null;
  let currentThinking = "";
  let finishReason = null;
  let completed = false;

  function flushThinking() {
    if (!currentThinking) return;
    sendRuntimeEvent({ type: "API_THINKING_DONE", requestId, text: currentThinking });
    currentThinking = "";
  }

  function fail(message) {
    if (completed) return;
    completed = true;
    flushThinking();
    sendRuntimeEvent({
      type: "API_ERROR",
      requestId,
      error: { status: 0, message },
    });
  }

  function finish() {
    if (completed) return;
    completed = true;
    flushThinking();
    if (toolCallsMap.size > 0) {
      sendRuntimeEvent({
        type: "API_TOOL_CALLS",
        requestId,
        toolCalls: normalizeToolCalls(toolCallsMap),
      });
    }
    sendRuntimeEvent({
      type: "API_STREAM_DONE",
      requestId,
      usage,
      model: responseModel,
      incomplete: finishReason === "length",
      incompleteDetails: finishReason === "length" ? { reason: "max_output_tokens" } : null,
    });
  }

  function processEvent(data) {
    if (completed) return;
    if (data === "[DONE]") {
      finish();
      return;
    }

    const parsed = JSON.parse(data);
    const errorMessage = extractErrorMessage(parsed);
    if (errorMessage) {
      fail(errorMessage);
      return;
    }
    if (parsed.model) responseModel = parsed.model;
    if (apiType === "anthropic") {
      const index = parsed.index ?? 0;
      if (parsed.type === "content_block_start") {
        const block = parsed.content_block || {};
        anthropicBlocks.set(index, block.type || "");
        if (block.type === "tool_use") {
          toolCallsMap.set(index, {
            id: block.id || "",
            name: block.name || "",
            arguments: block.input && Object.keys(block.input).length > 0 ? JSON.stringify(block.input) : "",
          });
        }
      }
      if (parsed.type === "content_block_delta" && parsed.delta?.type === "input_json_delta") {
        const call = toolCallsMap.get(index);
        if (call) call.arguments += parsed.delta.partial_json || "";
      }
      if (parsed.type === "content_block_stop") {
        if (anthropicBlocks.get(index) === "thinking") flushThinking();
        anthropicBlocks.delete(index);
      }
    }

    const delta = parsed.choices?.[0]?.delta;
    for (const toolCall of delta?.tool_calls || []) {
      const index = toolCall.index ?? 0;
      const current = toolCallsMap.get(index) || { id: "", name: "", arguments: "" };
      if (toolCall.id) current.id = toolCall.id;
      if (toolCall.function?.name) current.name = toolCall.function.name;
      if (toolCall.function?.arguments) current.arguments += toolCall.function.arguments;
      toolCallsMap.set(index, current);
    }

    const token = extractStreamToken(apiType, parsed);
    if (token?.thinking) {
      currentThinking += token.thinking;
      sendRuntimeEvent({
        type: "API_THINKING_CHUNK",
        requestId,
        token: token.thinking,
      });
    }
    if (token?.content) {
      flushThinking();
      sendRuntimeEvent({
        type: "API_STREAM_CHUNK",
        requestId,
        token: token.content,
        done: false,
      });
    }

    const streamUsage = extractStreamUsage(apiType, parsed);
    if (streamUsage) {
      usage = { ...usage, ...streamUsage };
      if (usage.promptTokens != null && usage.completionTokens != null) {
        usage.totalTokens ??= usage.promptTokens + usage.completionTokens;
      }
    }

    const rawFinish = parsed.choices?.[0]?.finish_reason
      || (parsed.type === "message_delta" ? parsed.delta?.stop_reason : null)
      || parsed.candidates?.[0]?.finishReason;
    if (rawFinish) {
      finishReason = rawFinish === "max_tokens" || rawFinish === "MAX_TOKENS" ? "length" : rawFinish;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) {
          const bareError = extractBareErrorLine(trimmed);
          if (bareError) fail(bareError);
          continue;
        }
        try { processEvent(trimmed.slice(6)); } catch {}
      }
    }

    buffer += decoder.decode();
    const finalLine = buffer.trim();
    if (finalLine.startsWith("data: ")) {
      try { processEvent(finalLine.slice(6)); } catch {}
    } else {
      const bareError = extractBareErrorLine(finalLine);
      if (bareError) fail(bareError);
    }
    finish();
  } catch (err) {
    if (err.name === "AbortError") throw err;
    fail(err.message);
  }
}

function normalizeResponsesUsage(usage) {
  if (!usage) return null;
  return {
    promptTokens: usage.input_tokens,
    completionTokens: usage.output_tokens,
    totalTokens: usage.total_tokens ?? ((usage.input_tokens || 0) + (usage.output_tokens || 0)),
  };
}

function normalizeWebSearchCall(item) {
  const action = item?.action || {};
  return {
    id: item?.id || "",
    status: item?.status || "completed",
    actionType: action.type || "search",
    query: action.query || action.pattern || "",
    url: action.url || "",
    sources: (action.sources || [])
      .filter((source) => source?.url)
      .map((source) => ({ type: source.type || "url", url: source.url })),
  };
}

async function handleResponsesStream(response, requestId) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const webSearchCalls = new Map();
  let buffer = "";
  let currentThinking = "";
  let completed = false;

  function flushThinking() {
    if (!currentThinking) return;
    sendRuntimeEvent({ type: "API_THINKING_DONE", requestId, text: currentThinking });
    currentThinking = "";
  }

  function sendSearchCalls() {
    sendRuntimeEvent({
      type: "API_WEB_SEARCH_CALLS",
      requestId,
      webSearchCalls: [...webSearchCalls.values()],
    });
  }

  function fail(message) {
    if (completed) return;
    completed = true;
    flushThinking();
    sendRuntimeEvent({
      type: "API_ERROR",
      requestId,
      error: { status: 0, message },
    });
  }

  function finish(responseData = null) {
    if (completed) return;
    completed = true;
    flushThinking();
    if (webSearchCalls.size > 0) sendSearchCalls();
    // 用最终响应快照回填完整内容，弥补中转丢 delta 造成的截断
    let final = null;
    if (responseData) {
      try { final = parseResponsesResponse(responseData); } catch {}
    }
    sendRuntimeEvent({
      type: "API_STREAM_DONE",
      requestId,
      usage: normalizeResponsesUsage(responseData?.usage),
      model: responseData?.model || null,
      incomplete: responseData?.status === "incomplete",
      incompleteDetails: responseData?.incomplete_details || null,
      ...(final?.content ? { content: final.content } : {}),
      ...(final?.thinkingSegments ? { thinkingSegments: final.thinkingSegments } : {}),
      ...(final?.webSearchCalls ? { webSearchCalls: final.webSearchCalls } : {}),
    });
  }

  function processEvent(data) {
    if (completed) return;
    if (!data || data === "[DONE]") {
      if (data === "[DONE]") finish();
      return;
    }

    const event = JSON.parse(data);
    if (!event.type) {
      const errorMessage = extractErrorMessage(event);
      if (errorMessage) fail(errorMessage);
      return;
    }
    switch (event.type) {
      case "response.reasoning_summary_text.delta":
        currentThinking += event.delta || "";
        sendRuntimeEvent({
          type: "API_THINKING_CHUNK",
          requestId,
          token: event.delta || "",
        });
        break;
      case "response.reasoning_summary_text.done":
        flushThinking();
        break;
      case "response.output_item.done":
        if (event.item?.type === "web_search_call") {
          const call = normalizeWebSearchCall(event.item);
          webSearchCalls.set(call.id, call);
          sendSearchCalls();
        }
        break;
      case "response.output_text.delta":
      case "response.refusal.delta":
        flushThinking();
        if (event.delta) {
          sendRuntimeEvent({
            type: "API_STREAM_CHUNK",
            requestId,
            token: event.delta,
            done: false,
          });
        }
        break;
      case "response.completed":
      case "response.incomplete":
        finish(event.response);
        break;
      case "response.failed":
      case "error":
        fail(event.response?.error?.message || event.error?.message || event.message || "Responses API 请求失败");
        break;
    }
  }

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) {
          const bareError = extractBareErrorLine(trimmed);
          if (bareError) fail(bareError);
          continue;
        }
        try { processEvent(trimmed.slice(6)); } catch {}
      }
    }

    buffer += decoder.decode();
    const finalLine = buffer.trim();
    if (finalLine.startsWith("data: ")) {
      try { processEvent(finalLine.slice(6)); } catch {}
    } else {
      const bareError = extractBareErrorLine(finalLine);
      if (bareError) fail(bareError);
    }
    finish();
  } catch (err) {
    if (err.name === "AbortError") throw err;
    fail(err.message);
  }
}

function buildRequest(provider, messages, options) {
  const { type, baseUrl, apiKey, headers: rawHeaders = {}, fullUrl: isFullUrl } = provider;
  const { stream = false, temperature = 0.7 } = options;
  const hasExplicitMaxTokens = Number.isFinite(options.maxTokens) && options.maxTokens > 0;
  const maxTokens = hasExplicitMaxTokens ? options.maxTokens : 4096;
  const model = options.model || provider.defaultModel;
  const customHeaders = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (key.toLowerCase() !== "user-agent") customHeaders[key] = value;
  }

  switch (type) {
    case "openai": {
      const { thinking = false, thinkingBudget = 10000 } = options;
      const headers = {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        ...customHeaders,
      };

      if (usesResponsesApi(provider)) {
        const body = {
          model,
          input: messages.map((message) => ({ role: message.role, content: message.content })),
          stream,
          temperature,
          tools: provider.tools,
          tool_choice: "auto",
        };
        if (hasExplicitMaxTokens) body.max_output_tokens = maxTokens;
        if (thinking) body.reasoning = { summary: "auto" };
        return {
          responseFormat: "responses",
          urlCandidates: buildResponsesUrlCandidates(baseUrl, isFullUrl),
          headers,
          body,
        };
      }

      const body = {
        model,
        messages: messages.map((message) => ({ role: message.role, content: message.content })),
        stream,
        temperature,
      };
      // 不强制默认 max_tokens：思考类模型的推理也计入输出，4096 会导致回复被 length 截断
      if (hasExplicitMaxTokens) body.max_tokens = maxTokens;
      if (thinking) body.thinking = { type: "enabled", budget_tokens: thinkingBudget };
      if (provider.tools) body.tools = provider.tools;
      return {
        responseFormat: "chat",
        urlCandidates: buildChatUrlCandidates(baseUrl, isFullUrl),
        headers,
        body,
      };
    }

    case "anthropic": {
      const systemMessage = messages.find((message) => message.role === "system");
      const nonSystemMessages = messages.filter((message) => message.role !== "system");
      const { thinking = false, thinkingBudget = 10000 } = options;
      // Anthropic 的 thinking 预算计入 max_tokens，未显式配置时抬高上限给正文留空间
      const anthropicMaxTokens = !hasExplicitMaxTokens && thinking
        ? thinkingBudget + 8192
        : maxTokens;
      const body = {
        model,
        max_tokens: anthropicMaxTokens,
        messages: nonSystemMessages.map((message) => ({ role: message.role, content: message.content })),
        ...(systemMessage ? { system: systemMessage.content } : {}),
        stream,
      };
      if (thinking) {
        body.thinking = {
          type: "enabled",
          budget_tokens: Math.min(thinkingBudget, anthropicMaxTokens - 1),
        };
      }
      return {
        urlCandidates: [`${baseUrl.replace(/\/+$/, "")}/v1/messages`],
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          ...customHeaders,
        },
        body,
      };
    }

    case "gemini": {
      const systemMessage = messages.find((message) => message.role === "system");
      const nonSystemMessages = messages.filter((message) => message.role !== "system");
      const { thinking = false, thinkingBudget = 10000 } = options;
      const generationConfig = { temperature };
      if (hasExplicitMaxTokens) generationConfig.maxOutputTokens = maxTokens;
      if (thinking) generationConfig.thinkingConfig = { thinkingBudget };
      return {
        urlCandidates: [`${baseUrl.replace(/\/+$/, "")}/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`],
        headers: { "Content-Type": "application/json", ...customHeaders },
        body: {
          contents: nonSystemMessages.map((message) => ({
            role: message.role === "assistant" ? "model" : "user",
            parts: [{ text: message.content }],
          })),
          generationConfig,
          ...(systemMessage ? { systemInstruction: { parts: [{ text: systemMessage.content }] } } : {}),
        },
      };
    }

    default:
      throw new Error(`Unsupported API type: ${type}`);
  }
}

function parseResponsesResponse(data) {
  const output = Array.isArray(data.output) ? data.output : [];
  const thinkingSegments = output
    .filter((item) => item.type === "reasoning")
    .flatMap((item) => item.summary || [])
    .filter((part) => part.type === "summary_text" && part.text)
    .map((part) => part.text);
  const webSearchCalls = output
    .filter((item) => item.type === "web_search_call")
    .map(normalizeWebSearchCall);
  const content = output
    .filter((item) => item.type === "message")
    .flatMap((item) => item.content || [])
    .filter((part) => part.type === "output_text" || part.type === "refusal")
    .map((part) => part.text || part.refusal || "")
    .join("\n\n");

  return {
    content,
    thinkingSegments: thinkingSegments.length > 0 ? thinkingSegments : null,
    webSearchCalls: webSearchCalls.length > 0 ? webSearchCalls : null,
    usage: normalizeResponsesUsage(data.usage),
    finishReason: data.status,
    model: data.model,
  };
}

function parseResponse(apiType, data, responseFormat = "chat") {
  if (responseFormat === "responses") return parseResponsesResponse(data);

  switch (apiType) {
    case "openai": {
      const message = data.choices?.[0]?.message || {};
      const content = typeof message.content === "string"
        ? message.content
        : (message.content || [])
            .filter((part) => part?.type === "text" || part?.type === "output_text")
            .map((part) => part.text || "")
            .join("\n\n");
      const toolCalls = (message.tool_calls || []).map((call) => ({
        id: call.id || "",
        name: call.function?.name || "",
        arguments: call.function?.arguments || "",
      }));
      return {
        content,
        thinkingSegments: message.reasoning_content ? [message.reasoning_content] : null,
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        usage: data.usage ? {
          promptTokens: data.usage.prompt_tokens,
          completionTokens: data.usage.completion_tokens,
          totalTokens: data.usage.total_tokens,
        } : null,
        finishReason: data.choices?.[0]?.finish_reason,
        model: data.model,
      };
    }

    case "anthropic": {
      const blocks = data.content || [];
      const toolCalls = blocks
        .filter((block) => block.type === "tool_use")
        .map((block) => ({ id: block.id || "", name: block.name || "", arguments: JSON.stringify(block.input || {}) }));
      return {
        content: blocks.filter((block) => block.type === "text").map((block) => block.text || "").join("\n\n"),
        thinkingSegments: blocks.filter((block) => block.type === "thinking").map((block) => block.thinking || ""),
        toolCalls: toolCalls.length > 0 ? toolCalls : null,
        usage: data.usage ? {
          promptTokens: data.usage.input_tokens,
          completionTokens: data.usage.output_tokens,
          totalTokens: data.usage.input_tokens + data.usage.output_tokens,
        } : null,
        finishReason: data.stop_reason,
        model: data.model,
      };
    }

    case "gemini": {
      const parts = data.candidates?.[0]?.content?.parts || [];
      return {
        content: parts.filter((part) => !part.thought && part.text).map((part) => part.text).join("\n\n"),
        thinkingSegments: parts.filter((part) => part.thought && part.text).map((part) => part.text),
        usage: data.usageMetadata ? {
          promptTokens: data.usageMetadata.promptTokenCount,
          completionTokens: data.usageMetadata.candidatesTokenCount,
          totalTokens: data.usageMetadata.totalTokenCount,
        } : null,
        finishReason: data.candidates?.[0]?.finishReason,
        model: null,
      };
    }

    default:
      throw new Error(`Unsupported API type: ${apiType}`);
  }
}

function extractStreamToken(apiType, data) {
  switch (apiType) {
    case "openai": {
      const delta = data.choices?.[0]?.delta;
      if (!delta || delta.tool_calls) return null;
      const result = {};
      if (delta.reasoning_content) result.thinking = delta.reasoning_content;
      if (typeof delta.content === "string" && delta.content) result.content = delta.content;
      return Object.keys(result).length > 0 ? result : null;
    }

    case "anthropic":
      if (data.type !== "content_block_delta") return null;
      if (data.delta?.type === "thinking_delta") return { thinking: data.delta.thinking || "" };
      if (data.delta?.type === "text_delta") return { content: data.delta.text || "" };
      return null;

    case "gemini": {
      const parts = data.candidates?.[0]?.content?.parts || [];
      const result = {};
      for (const part of parts) {
        if (!part.text) continue;
        if (part.thought) result.thinking = (result.thinking || "") + part.text;
        else result.content = (result.content || "") + part.text;
      }
      return Object.keys(result).length > 0 ? result : null;
    }

    default:
      return null;
  }
}

function extractStreamUsage(apiType, data) {
  switch (apiType) {
    case "openai":
      return data.usage ? {
        promptTokens: data.usage.prompt_tokens,
        completionTokens: data.usage.completion_tokens,
        totalTokens: data.usage.total_tokens,
      } : null;

    case "anthropic":
      if (data.type === "message_delta") return { completionTokens: data.usage?.output_tokens };
      if (data.type === "message_start") return { promptTokens: data.message?.usage?.input_tokens };
      return null;

    case "gemini":
      return data.usageMetadata ? {
        promptTokens: data.usageMetadata.promptTokenCount,
        completionTokens: data.usageMetadata.candidatesTokenCount,
        totalTokens: data.usageMetadata.totalTokenCount,
      } : null;

    default:
      return null;
  }
}
