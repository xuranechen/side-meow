<script>
  import { onMount } from "svelte";
  import { providers, addProvider, updateProvider } from "../stores/providers.js";
  import { settings } from "../stores/settings.js";
  import { pageParams, navigateTo, goBack, showToast } from "../stores/ui.js";
  import { API_TYPES, DEFAULT_MODELS } from "../../lib/constants.js";
  import { generateId } from "../../lib/uuid.js";
  import { HEADER_PRESETS, getPresetList } from "../../lib/api/header-presets.js";
  import { ChevronLeft, Link, Plus, X, Loader2, Unlock, Wand2 } from "lucide-svelte";

  let mode = $state("add");
  let providerId = $state(null);

  let name = $state("");
  let type = $state("openai");
  let baseUrl = $state("");
  let apiKey = $state("");
  let customHeaders = $state([]);
  let models = $state([]);
  let defaultModel = $state("");
  let testing = $state(false);
  let fetchingModels = $state(false);
  let selectedPreset = $state("");
  let decodedHint = $state("");
  let fullUrl = $state(false);
  let toolsJson = $state("");

  let isNew = $derived(mode === "add");
  let isEdit = $derived(mode === "edit");
  let isTest = $derived(mode === "test");
  let presetList = $derived(getPresetList());

  onMount(() => {
    const params = $pageParams;
    mode = params.mode || "add";
    providerId = params.providerId;

    if (providerId && (isEdit || isTest)) {
      const provider = $providers.find((p) => p.id === providerId);
      if (provider) {
        name = provider.name;
        type = provider.type;
        baseUrl = provider.baseUrl;
        apiKey = provider.apiKey;
        customHeaders = provider.headers
          ? Object.entries(provider.headers).map(([key, value]) => ({ key, value }))
          : [];
        models = provider.models || [];
        defaultModel = provider.defaultModel || "";
        fullUrl = provider.fullUrl || false;
        toolsJson = provider.tools ? JSON.stringify(provider.tools, null, 2) : "";
      }
    } else {
      baseUrl = API_TYPES[type].defaultBaseUrl;
      loadDefaultModels();
    }
  });

  function loadDefaultModels() {
    const defaults = DEFAULT_MODELS[type] || [];
    models = defaults.map((m) => ({ ...m }));
    if (models.length > 0 && !defaultModel) {
      defaultModel = models[0].id;
    }
  }

  function handleTypeChange(newType) {
    type = newType;
    baseUrl = API_TYPES[newType].defaultBaseUrl;
    loadDefaultModels();
  }

  async function handleFetchModels() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      showToast("请先填写地址和密钥", "error");
      return;
    }

    fetchingModels = true;

    try {
      const headers = {};
      for (const h of customHeaders) {
        if (h.key.trim() && h.value.trim()) {
          headers[h.key.trim()] = h.value.trim();
        }
      }

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("请求超时")), ($settings.requestTimeout || 15) * 1000);

        chrome.runtime.sendMessage({
          type: "FETCH_MODELS",
          provider: {
            type,
            baseUrl: baseUrl.trim(),
            apiKey: apiKey.trim(),
            headers,
          },
        }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else if (response.success) {
            resolve(response.models);
          } else {
            reject(new Error(response.error));
          }
        });
      });

      if (result.length > 0) {
        models = result;
        if (!defaultModel || !models.find((m) => m.id === defaultModel)) {
          defaultModel = models[0].id;
        }
        showToast(`获取到 ${result.length} 个模型`);
      } else {
        showToast("未获取到模型", "warning");
      }
    } catch (err) {
      showToast("获取失败（可手动添加模型）: " + err.message, "warning");
    } finally {
      fetchingModels = false;
    }
  }

  function applyPreset(presetId) {
    selectedPreset = presetId;
    const preset = HEADER_PRESETS[presetId];
    if (!preset) return;

    const existingKeys = new Set(customHeaders.map((h) => h.key));
    const newHeaders = Object.entries(preset.headers)
      .filter(([key]) => !existingKeys.has(key))
      .map(([key, value]) => ({ key, value }));

    customHeaders = [...customHeaders, ...newHeaders];
    showToast(`已应用 ${preset.name} 预设`);
  }

  function addModel() {
    models = [...models, { id: "", name: "", maxTokens: 4096, contextWindow: 4096 }];
  }

  function removeModel(index) {
    models = models.filter((_, i) => i !== index);
    if (defaultModel === models[index]?.id) {
      defaultModel = models.length > 0 ? models[0].id : "";
    }
  }

  function addHeader() {
    customHeaders = [...customHeaders, { key: "", value: "" }];
  }

  function removeHeader(index) {
    customHeaders = customHeaders.filter((_, i) => i !== index);
  }

  function tryDecodeBase64(str) {
    if (!str || str.length < 8) return null;
    if (/^(sk-|gsk-|xai-|AIza|sess-|ark-|tp-)/.test(str)) return null;
    if (!/^[A-Za-z0-9+/=_\-]+$/.test(str)) return null;
    try {
      const padded = str.replace(/-/g, "+").replace(/_/g, "/");
      const decoded = atob(padded);
      if (decoded.length < 4 || decoded.length > 4096) return null;
      if (!/^[\x20-\x7E\n\r\t]+$/.test(decoded)) return null;
      return decoded;
    } catch {
      return null;
    }
  }

  $effect(() => {
    decodedHint = tryDecodeBase64(apiKey) || "";
  });

  function applyDecodedKey() {
    if (decodedHint) {
      apiKey = decodedHint;
      decodedHint = "";
    }
  }

  const PARSE_PATTERNS = {
    apiKey: [
      /(?:ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN|OPENAI_API_KEY|GEMINI_API_KEY|API_KEY|APIKEY|api_key|apiKey)\s*[=:]\s*["']?([A-Za-z0-9_\-\.]+)["']?/i,
      /(?:key|token|secret)\s*[=:]\s*["']?([A-Za-z0-9_\-\.]{8,})["']?/i,
      /\b(sk-[A-Za-z0-9_\-]{8,})\b/,
      /\b(gsk-[A-Za-z0-9_\-]{8,})\b/,
      /\b(xai-[A-Za-z0-9_\-]{8,})\b/,
      /\b(ark-[A-Za-z0-9_\-]{8,})\b/,
      /\b(AIzaSy[A-Za-z0-9_\-]{30,})\b/,
      /\b(tp-[A-Za-z0-9_\-]{8,})\b/,
    ],
    baseUrl: [
      /(?:ANTHROPIC_BASE_URL|OPENAI_BASE_URL|GEMINI_BASE_URL|BASE_URL|API_BASE|ENDPOINT|base_url|baseUrl|endpoint)\s*[=:]\s*["']?(https?:\/\/[^\s"',;\]]+)["']?/i,
      /\b(https?:\/\/[a-zA-Z0-9\-\.]+(?::\d+)?\/[a-zA-Z0-9\._\-\/]+)\b/,
    ],
    model: [
      /(?:ANTHROPIC_MODEL|OPENAI_MODEL|GEMINI_MODEL|MODEL|model)\s*[=:]\s*["']?([a-zA-Z0-9\-\.]+)["']?/i,
    ],
    name: [
      /(?:NAME|name|PROVIDER_NAME)\s*[=:]\s*["']?([^\s"',;\]]+)["']?/i,
    ],
  };

  function parseConfigString(input) {
    if (!input || !input.trim()) return null;
    let str = input.trim();
    const result = {};

    const wholeDecoded = tryDecodeBase64(str);
    if (wholeDecoded && (wholeDecoded.includes("http") || wholeDecoded.includes("="))) {
      str = wholeDecoded;
    }

    const lines = str.split(/[\n\r]+/).map((l) => l.trim()).filter(Boolean);

    for (const pattern of PARSE_PATTERNS.apiKey) {
      const m = str.match(pattern);
      if (m) {
        let key = m[1];
        const decoded = tryDecodeBase64(key);
        if (decoded) key = decoded;
        result.apiKey = key;
        break;
      }
    }

    if (!result.apiKey) {
      for (const line of lines) {
        if (line.startsWith("http")) continue;
        const decoded = tryDecodeBase64(line);
        if (decoded && decoded.length >= 8 && !decoded.includes(" ")) {
          result.apiKey = decoded;
          break;
        }
      }
    }

    for (const pattern of PARSE_PATTERNS.baseUrl) {
      const m = str.match(pattern);
      if (m) {
        result.baseUrl = m[1].replace(/[\/\s]+$/, "");
        break;
      }
    }

    if (!result.baseUrl) {
      for (const line of lines) {
        if (line.startsWith("http")) {
          result.baseUrl = line.replace(/[\/\s]+$/, "");
          break;
        }
        const decoded = tryDecodeBase64(line);
        if (decoded && decoded.startsWith("http")) {
          result.baseUrl = decoded.replace(/[\/\s]+$/, "");
          break;
        }
      }
    }

    for (const pattern of PARSE_PATTERNS.model) {
      const m = str.match(pattern);
      if (m) { result.model = m[1]; break; }
    }

    for (const pattern of PARSE_PATTERNS.name) {
      const m = str.match(pattern);
      if (m) { result.name = m[1]; break; }
    }

    if (result.baseUrl) {
      if (/anthropic/i.test(result.baseUrl)) result.type = "anthropic";
      else if (/generativelanguage\.googleapis/i.test(result.baseUrl)) result.type = "gemini";
      else result.type = "openai";
    } else if (result.apiKey) {
      if (result.apiKey.startsWith("sk-ant-")) result.type = "anthropic";
      else if (result.apiKey.startsWith("AIza")) result.type = "gemini";
      else result.type = "openai";
    }

    return Object.keys(result).length > 0 ? result : null;
  }

  let showPasteDialog = $state(false);
  let pasteInput = $state("");

  function openPasteDialog() {
    pasteInput = "";
    showPasteDialog = true;
  }

  function extractDomainName(url) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, "");
      const parts = host.split(".");
      if (parts.length >= 2) {
        return parts[parts.length - 2];
      }
      return host;
    } catch {
      return "";
    }
  }

  function applyParsedConfig() {
    const parsed = parseConfigString(pasteInput);
    if (!parsed) {
      showToast("未识别到有效配置", "warning");
      return;
    }
    if (parsed.type && parsed.type !== type) {
      type = parsed.type;
      loadDefaultModels();
    }
    if (parsed.apiKey) apiKey = parsed.apiKey;
    if (parsed.baseUrl) baseUrl = parsed.baseUrl;
    if (parsed.name) {
      name = name || parsed.name;
    } else if (!name.trim() && parsed.baseUrl) {
      const domain = extractDomainName(parsed.baseUrl);
      if (domain) name = domain;
    }
    if (parsed.model) {
      if (!models.find((m) => m.id === parsed.model)) {
        models = [...models, { id: parsed.model, name: parsed.model, maxTokens: 4096, contextWindow: 4096 }];
      }
      defaultModel = parsed.model;
    }
    showPasteDialog = false;
    showToast("已解析并填入配置");

    if (baseUrl.trim() && apiKey.trim()) {
      handleFetchModels();
    }
  }

  async function handleSubmit() {
    if (!name.trim() || !baseUrl.trim() || !apiKey.trim()) {
      showToast("请填写必填字段", "error");
      return;
    }

    const duplicate = $providers.find((p) => p.name === name.trim() && p.id !== providerId);
    if (duplicate) {
      showToast("已存在同名配置「" + name.trim() + "」，请修改名称", "warning");
      return;
    }

    const validModels = models.filter((m) => m.id.trim());
    if (validModels.length === 0) {
      showToast("请至少添加一个模型", "error");
      return;
    }

    const headers = {};
    for (const h of customHeaders) {
      if (h.key.trim() && h.value.trim()) {
        headers[h.key.trim()] = h.value.trim();
      }
    }

    let tools = null;
    if (toolsJson.trim()) {
      try {
        tools = JSON.parse(toolsJson);
        if (!Array.isArray(tools)) {
          showToast("工具定义必须是 JSON 数组", "error");
          return;
        }
      } catch (e) {
        showToast("工具定义 JSON 格式错误: " + e.message, "error");
        return;
      }
    }

    const providerData = {
      name: name.trim(),
      type,
      baseUrl: baseUrl.trim(),
      apiKey: apiKey.trim(),
      headers,
      models: validModels,
      defaultModel: defaultModel || validModels[0].id,
      fullUrl,
      tools,
    };

    try {
      if (isNew) {
        await addProvider(providerData);
        showToast("配置已添加");
      } else {
        await updateProvider(providerId, providerData);
        showToast("配置已更新");
      }
      goBack();
    } catch (err) {
      showToast("保存失败: " + err.message, "error");
    }
  }

  async function handleTestConnection() {
    if (!baseUrl.trim() || !apiKey.trim()) {
      showToast("请填写地址和密钥", "error");
      return;
    }

    testing = true;
    try {
      const testMessage = [{ role: "user", content: "一根0.1mm绳子对折42次后有多长？只回答结果。" }];
      const provider = {
        type,
        baseUrl: baseUrl.trim(),
        apiKey: apiKey.trim(),
        defaultModel: defaultModel || models[0]?.id || "gpt-4o-mini",
        headers: {},
        fullUrl,
      };

      if (toolsJson.trim()) {
        try {
          provider.tools = JSON.parse(toolsJson);
          if (!Array.isArray(provider.tools)) throw new Error("工具定义必须是 JSON 数组");
        } catch (e) {
          throw new Error("工具定义 JSON 格式错误: " + e.message);
        }
      }

      for (const h of customHeaders) {
        if (h.key.trim() && h.value.trim()) {
          provider.headers[h.key.trim()] = h.value.trim();
        }
      }

      const startTime = Date.now();

      chrome.runtime.sendMessage({
        type: "API_REQUEST",
        requestId: "test-" + Date.now(),
        provider,
        messages: testMessage,
        options: { stream: false, maxTokens: 10, timeout: ($settings.requestTimeout || 15) * 1000 },
      });

      const result = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error("请求超时")), ($settings.requestTimeout || 15) * 1000);

        function listener(message) {
          if (message.type === "API_RESPONSE" && message.requestId.startsWith("test-")) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            resolve(message);
          }
          if (message.type === "API_ERROR" && message.requestId.startsWith("test-")) {
            clearTimeout(timeout);
            chrome.runtime.onMessage.removeListener(listener);
            reject(new Error(message.error.message));
          }
        }

        chrome.runtime.onMessage.addListener(listener);
      });

      const elapsed = Date.now() - startTime;
      showToast(`连接成功 (${elapsed}ms)`, "success");
    } catch (err) {
      showToast(err.message || "连接失败", "error");
    } finally {
      testing = false;
    }
  }
</script>

<div class="h-full flex flex-col">
  <header class="page-header flex items-center gap-2.5 border-b">
    <button
      class="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-text-bright)]"
      onclick={goBack}
      aria-label="返回"
    >
      <ChevronLeft size={16} />
    </button>
    <h1 class="text-[14px] font-semibold text-[var(--color-text-bright)]">{isNew ? "添加接口" : isEdit ? "编辑接口" : "测试连接"}</h1>
  </header>

  <main class="page-main form-panel flex-1 overflow-y-auto space-y-3">
    <div>
      <span class="block text-[11px] font-medium text-[var(--color-text-muted)] mb-2">
        接口类型 <span class="text-[var(--color-error)]">*</span>
      </span>
      <div class="grid grid-cols-3 gap-2">
        {#each Object.entries(API_TYPES) as [id, apiType]}
          <button
            class="type-option rounded-lg border transition-all text-left"
            style="border-color: {type === id ? apiType.color : 'var(--color-border)'}; background: {type === id ? `linear-gradient(135deg, ${apiType.color}2a, ${apiType.color}10)` : 'var(--color-bg-tertiary)'}; box-shadow: {type === id ? `inset 0 0 0 1px ${apiType.color}, 0 0 16px -8px ${apiType.color}` : 'none'};"
            onclick={() => handleTypeChange(id)}
          >
            <div class="flex items-center gap-1.5 mb-0.5">
              <span class="w-2 h-2 rounded-full" style="background-color: {apiType.color}; box-shadow: 0 0 6px {apiType.color};"></span>
              <span class="text-[11px] font-semibold text-[var(--color-text-bright)]">{apiType.name}</span>
            </div>
            <p class="text-[10px] text-[var(--color-text-muted)] truncate">{apiType.description}</p>
          </button>
        {/each}
      </div>
    </div>

    {#if showPasteDialog}
      <div
        class="fixed inset-0 z-50 flex items-center justify-center animate-fade-in"
        style="background: rgba(0,0,0,.68);"
        onclick={() => (showPasteDialog = false)}
        onkeydown={(e) => e.key === "Escape" && (showPasteDialog = false)}
        role="button"
        tabindex="-1"
        aria-label="关闭"
      >
        <div class="card animate-slide-up" style="width: min(440px, calc(100% - 24px)); padding: 12px;" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
          <div class="flex items-center justify-between mb-3">
            <h3 class="text-[13px] font-semibold text-[var(--color-text-bright)]">智能解析配置</h3>
            <button
              class="p-1 rounded hover:bg-[var(--color-bg-tertiary)] text-[var(--color-text-muted)]"
              onclick={() => (showPasteDialog = false)}
            >
              <X size={14} />
            </button>
          </div>

          <p class="text-[10px] text-[var(--color-text-muted)] mb-2">
            粘贴环境变量、配置字符串或含 Key/URL 的文本，自动提取接口地址和密钥
          </p>

          <textarea
            bind:value={pasteInput}
            rows="8"
            placeholder={'例如：\nexport ANTHROPIC_API_KEY="sk-ant-xxx"\nexport ANTHROPIC_BASE_URL="https://api.anthropic.com/v1"\n\n或：OPENAI_API_KEY=c2stb3BlbmFpLXggeHggeHg=（Base64 自动解码）'}
            class="resize-none w-full"
            style="font-family: var(--font-mono); font-size: 11px; padding: 8px 10px; background: rgba(var(--sunken-rgb), .42); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-bright);"
          ></textarea>

          <div class="flex justify-end gap-2 mt-3">
            <button
              class="ccswitch-preview-btn"
              onclick={() => (showPasteDialog = false)}
            >
              取消
            </button>
            <button
              class="ccswitch-preview-btn ccswitch-preview-btn-primary"
              onclick={applyParsedConfig}
            >
              解析并填入
            </button>
          </div>
        </div>
      </div>
    {/if}

    <div>
      <button
        class="parse-btn w-full"
        onclick={openPasteDialog}
        title="粘贴配置字符串自动解析"
      >
        <Wand2 size={12} />
        智能解析配置
      </button>
    </div>

    <div>
      <label class="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5" for="name">
        名称 <span class="text-[var(--color-error)]">*</span>
      </label>
      <input
        id="name"
        type="text"
        bind:value={name}
        placeholder="我的接口"
      />
    </div>

    <div>
      <label class="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5" for="baseUrl">
        地址 <span class="text-[var(--color-error)]">*</span>
      </label>
      <input
        id="baseUrl"
        type="url"
        bind:value={baseUrl}
        placeholder="https://api.openai.com/v1"
        style="font-family: var(--font-mono);"
      />
      <label class="flex items-center gap-2 mt-2 cursor-pointer">
        <button
          class="settings-toggle relative w-8 h-[18px] rounded-full transition-all flex-shrink-0"
          class:enabled={fullUrl}
          style="background: {fullUrl ? 'var(--gradient-primary)' : 'var(--color-bg-elevated)'}; box-shadow: {fullUrl ? 'var(--glow-primary)' : 'inset 0 0 0 1px var(--color-border)'};"
          onclick={() => (fullUrl = !fullUrl)}
          aria-label={fullUrl ? "关闭完整URL" : "开启完整URL"}
        >
          <div class="w-3 h-3 rounded-full bg-white transition-transform ml-0.5 {fullUrl ? 'translate-x-[14px]' : ''}"></div>
        </button>
        <span class="text-[10px] text-[var(--color-text-muted)]">完整 URL（不自动拼接 /chat/completions）</span>
      </label>
    </div>

    <div>
      <label class="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5" for="apiKey">
        密钥 <span class="text-[var(--color-error)]">*</span>
      </label>
      <input
        id="apiKey"
        type="password"
        bind:value={apiKey}
        placeholder="sk-..."
        style="font-family: var(--font-mono);"
      />
      {#if decodedHint}
        <div class="flex items-center gap-2 mt-1.5">
          <button
            class="base64-decode-btn"
            onclick={applyDecodedKey}
          >
            <Unlock size={11} />
            解码 Base64
          </button>
          <span class="text-[10px] text-[var(--color-text-muted)] truncate" style="font-family: var(--font-mono); max-width: 200px;">
            {decodedHint.slice(0, 12)}...{decodedHint.slice(-4)}
          </span>
        </div>
      {/if}
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-medium text-[var(--color-text-muted)]">自定义请求头</span>
        <div class="flex items-center gap-2">
          <select
            value={selectedPreset}
            onchange={(e) => applyPreset(e.target.value)}
            style="font-size: 11px; padding: 4px 8px; background: var(--color-bg-tertiary); border: 1px solid var(--color-border); color: var(--color-text-secondary); border-radius: var(--radius-sm); width: auto;"
          >
            <option value="">选择预设...</option>
            {#each presetList as preset}
              <option value={preset.id}>{preset.name}</option>
            {/each}
          </select>
          <button
            class="model-action"
            onclick={addHeader}
          >
            <Plus size={10} />
            添加
          </button>
        </div>
      </div>

      {#if selectedPreset && HEADER_PRESETS[selectedPreset]}
        <p class="text-[10px] text-[var(--color-text-muted)] mb-2">
          {HEADER_PRESETS[selectedPreset].description}
        </p>
      {/if}

      {#each customHeaders as header, i}
        <div class="flex gap-2 mb-2">
          <input
            type="text"
            bind:value={header.key}
            placeholder="名称"
            aria-label="请求头名称"
            style="font-family: var(--font-mono); font-size: 12px; padding: 6px 10px;"
          />
          <input
            type="text"
            bind:value={header.value}
            placeholder="值"
            aria-label="请求头值"
            style="font-family: var(--font-mono); font-size: 12px; padding: 6px 10px;"
          />
          <button
            class="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors rounded-sm hover:bg-[var(--color-bg-tertiary)]"
            onclick={() => removeHeader(i)}
            aria-label="删除"
          >
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>

    <div>
      <div class="flex items-center justify-between mb-1.5">
        <span class="text-[11px] font-medium text-[var(--color-text-muted)]">工具定义（Tools）</span>
        {#if toolsJson.trim()}
          <span class="text-[9px] text-[var(--color-success)]">已配置</span>
        {/if}
      </div>
      <textarea
        bind:value={toolsJson}
        placeholder={'[\n  { "type": "web_search" }\n]'}
        rows="6"
        class="resize-none w-full"
        style="font-family: var(--font-mono); font-size: 11px; padding: 8px 10px; background: rgba(var(--sunken-rgb), .42); border: 1px solid var(--color-border); border-radius: var(--radius-md); color: var(--color-text-bright);"
      ></textarea>
      <p class="text-[9px] text-[var(--color-text-muted)] mt-1"><code>type=web_search</code> 会自动使用 Responses API，并分开展示联网搜索、思考过程和最终回复</p>
    </div>

    <div>
      <div class="flex items-center justify-between mb-2">
        <span class="text-[11px] font-medium text-[var(--color-text-muted)]">
          模型列表 <span class="text-[var(--color-error)]">*</span>
        </span>
        <div class="flex items-center gap-2">
          <button
            class="model-action"
            onclick={handleFetchModels}
            disabled={fetchingModels || !baseUrl.trim() || !apiKey.trim()}
          >
            {#if fetchingModels}
              <Loader2 size={10} class="animate-spin" />
              获取中...
            {:else}
              获取模型
            {/if}
          </button>
          <button
            class="model-action"
            onclick={addModel}
          >
            <Plus size={10} />
            手动添加
          </button>
        </div>
      </div>

      {#if type === "anthropic"}
        <p class="text-[10px] text-[var(--color-text-muted)] mb-2">
          官方 Anthropic API 不支持获取模型列表，可手动添加
        </p>
      {/if}

      {#each models as model, i}
        <div class="flex gap-2 mb-2 items-center">
          <input
            type="text"
            bind:value={model.id}
            placeholder="模型ID"
            aria-label="模型ID"
            style="font-family: var(--font-mono); font-size: 12px; padding: 6px 10px;"
          />
          <input
            type="text"
            bind:value={model.name}
            placeholder="显示名称"
            aria-label="显示名称"
            style="font-size: 12px; padding: 6px 10px;"
          />
          <button
            class="p-1.5 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors rounded-sm hover:bg-[var(--color-bg-tertiary)]"
            onclick={() => removeModel(i)}
            aria-label="删除"
          >
            <X size={14} />
          </button>
        </div>
      {/each}
    </div>

    {#if models.length > 0}
      <div>
        <label class="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5" for="defaultModel">
          默认模型
        </label>
        <select
          id="defaultModel"
          bind:value={defaultModel}
        >
          {#each models.filter((m) => m.id) as model}
            <option value={model.id}>{model.name || model.id}</option>
          {/each}
        </select>
      </div>
    {/if}
  </main>

  <footer class="control-deck p-3 border-t glass space-y-2">
    <button
      class="form-footer-button btn-primary w-full"
      onclick={handleTestConnection}
      disabled={testing}
    >
      {#if testing}
        <Loader2 size={14} class="animate-spin" />
        测试中...
      {:else}
        <Link size={14} />
        测试连接
      {/if}
    </button>
    <button
      class="form-footer-button btn-primary w-full"
      onclick={handleSubmit}
    >
      {isNew ? "添加接口" : "保存修改"}
    </button>
  </footer>
</div>

<style>
  .form-footer-button {
    display: inline-flex !important;
    min-height: 34px;
    align-items: center;
    justify-content: center;
    gap: 6px;
    white-space: nowrap;
  }

  .form-footer-button :global(svg) {
    flex: 0 0 auto;
  }

  .type-option {
    min-height: 58px;
    padding: 8px !important;
    border-radius: var(--radius-sm) !important;
  }

  .type-option:hover {
    border-color: var(--color-border-hover) !important;
    background: rgba(var(--accent-rgb), .08) !important;
  }

  .model-action {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 8px !important;
    border: 1px solid rgba(var(--accent-rgb), 0.58);
    border-radius: var(--radius-sm);
    background: var(--gradient-primary);
    color: var(--color-primary-hover);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    transition: background .18s var(--ease-out), border-color .18s var(--ease-out), box-shadow .18s var(--ease-out), transform .18s var(--ease-out);
  }

  .model-action:hover:not(:disabled),
  .model-action:focus-visible:not(:disabled) {
    background: var(--gradient-primary-hover);
    box-shadow: var(--glow-primary);
    transform: translateY(-1px);
  }

  .model-action:disabled {
    cursor: default;
    opacity: .42;
    transform: none;
    box-shadow: none;
  }

  .base64-decode-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px !important;
    border: 1px solid rgba(var(--blue-rgb), 0.42);
    border-radius: var(--radius-sm);
    background: rgba(var(--blue-rgb), 0.10);
    color: #73bdf5;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.2;
    transition: background .16s var(--ease-out), border-color .16s var(--ease-out);
  }
  .base64-decode-btn:hover {
    background: rgba(var(--blue-rgb), 0.18);
    border-color: rgba(var(--blue-rgb), 0.62);
  }

  .parse-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 10px !important;
    min-height: 36px;
    border: 1px dashed rgba(var(--purple-rgb), 0.42);
    border-radius: var(--radius-md);
    background: rgba(var(--purple-rgb), 0.08);
    color: #b394f4;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    transition: background .16s var(--ease-out), border-color .16s var(--ease-out);
  }
  .parse-btn:hover {
    background: rgba(var(--purple-rgb), 0.16);
    border-color: rgba(var(--purple-rgb), 0.62);
  }

  .ccswitch-preview-btn {
    display: inline-flex;
    min-height: 28px;
    min-width: 64px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 0 14px !important;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: rgba(255,255,255,0.05);
    color: var(--color-text-bright);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
  }
  .ccswitch-preview-btn:hover {
    border-color: var(--color-border-hover);
    background: rgba(255,255,255,0.08);
  }
  .ccswitch-preview-btn-primary {
    border: 1px solid rgba(var(--accent-rgb), .58);
    background: rgba(var(--accent-rgb), .10);
    color: var(--color-primary-hover);
    font-weight: 650;
  }
  .ccswitch-preview-btn-primary:hover {
    border-color: rgba(var(--accent-rgb), .72);
    background: rgba(var(--accent-rgb), .15);
    box-shadow: var(--glow-primary);
  }
</style>
