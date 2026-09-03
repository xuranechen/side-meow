<script>
  import { providers, setActiveProvider, deleteProvider, reorderProviders, healthCheckProvider, healthCheckModel, healthCheckAll, refreshAllProvidersModels } from "../stores/providers.js";
  import { navigateTo, showToast } from "../stores/ui.js";
  import { settings } from "../stores/settings.js";
  import { sessions, createSession } from "../stores/sessions.js";
  import { getStorageSize, formatBytes } from "../../lib/storage/chrome-storage.js";
  import ProviderCard from "../components/ProviderCard.svelte";
  import EmptyState from "../components/EmptyState.svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";
  import { CCSwitchMapper } from "../../lib/ccswitch/mapper.js";
  import { generateDeepLink, tryOpenCCSwitch, getCCSwitchDownloadUrl } from "../../lib/ccswitch/deeplink.js";
  import { Plus, Download, Settings as SettingsIcon, History, X, Copy, Zap, Wand2, RefreshCw, Loader2 } from "lucide-svelte";
  import { getStorage, setStorage } from "../../lib/storage/chrome-storage.js";
  import AppSelector from "../components/AppSelector.svelte";
  import ModelSelect from "../components/ModelSelect.svelte";

  let showConfirm = $state(false);
  let providerToDelete = $state(null);
  let draggedIndex = $state(null);
  let selectedProvider = $state(null);
  let showCCSwitchPreview = $state(false);
  let ccswitchData = $state(null);
  let ccswitchApp = $state("claude");
  let ccswitchModel = $state("");
  let storageBytes = $state(0);
  let testAllCooldown = $state(0);
  let testAllRunning = $state(false);
  let cooldownTimer = $state(null);
  let testingModel = $state(null);
  let refreshingModels = $state(false);
  let fullTesting = $state(false);
  let showFullTestConfirm = $state(false);

  const TEST_ALL_COOLDOWN = 5 * 60 * 1000;

  $effect(() => {
    getStorage("lastTestAllTime").then((ts) => {
      if (!ts) return;
      const elapsed = Date.now() - ts;
      if (elapsed < TEST_ALL_COOLDOWN) {
        startCooldownTimer(TEST_ALL_COOLDOWN - elapsed);
      }
    });
    return () => { if (cooldownTimer) clearInterval(cooldownTimer); };
  });

  function startCooldownTimer(remaining) {
    testAllCooldown = remaining;
    if (cooldownTimer) clearInterval(cooldownTimer);
    cooldownTimer = setInterval(() => {
      testAllCooldown = Math.max(0, testAllCooldown - 1000);
      if (testAllCooldown <= 0) {
        clearInterval(cooldownTimer);
        cooldownTimer = null;
      }
    }, 1000);
  }

  function formatCooldown(ms) {
    const m = Math.floor(ms / 60000);
    const s = Math.floor((ms % 60000) / 1000);
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  async function handleTestAll() {
    if (testAllCooldown > 0 || testAllRunning) return;
    testAllRunning = true;
    startCooldownTimer(TEST_ALL_COOLDOWN);
    const timeout = ($settings.requestTimeout || 15) * 1000;
    const results = await Promise.all(
      sortedProviders.map((p) => healthCheckProvider(p.id, timeout))
    );
    await setStorage("lastTestAllTime", Date.now());
    let okProviders = 0;
    let okModels = 0;
    let totalModels = 0;
    for (const r of results) {
      if (r?.status === "ok") okProviders++;
      if (r?.total != null) {
        okModels += r.okCount || 0;
        totalModels += r.total;
      } else if (r?.status === "ok") {
        okModels++;
        totalModels++;
      }
    }
    const fail = results.length - okProviders;
    testAllRunning = false;
    showToast(
      `全部接口（默认模型）测试完成：${okProviders}/${results.length} 可用，模型 ${okModels}/${totalModels}`,
      fail === 0 ? "success" : "warning"
    );
  }

  $effect(() => {
    $providers;
    $sessions;
    getStorageSize().then((b) => { storageBytes = b; });
  });

  function handleAdd() {
    navigateTo("provider-form", { mode: "add" });
  }

  async function handleQuickParse() {
    try {
      const text = await navigator.clipboard.readText();
      if (!text?.trim()) {
        showToast("剪贴板为空", "warning");
        return;
      }
      navigateTo("provider-form", { mode: "add", prefill: text.trim() });
    } catch {
      showToast("无法读取剪贴板，请手动粘贴", "warning");
      navigateTo("provider-form", { mode: "add" });
    }
  }

  function handleEdit(id) {
    navigateTo("provider-form", { mode: "edit", providerId: id });
  }

  function handleDelete(id) {
    if ($settings.confirmDelete) {
      providerToDelete = id;
      showConfirm = true;
    } else {
      doDelete(id);
    }
  }

  async function doDelete(id) {
    await deleteProvider(id);
    showToast("配置已删除");
    showConfirm = false;
    providerToDelete = null;
  }

  function handleCancelDelete() {
    showConfirm = false;
    providerToDelete = null;
  }

  function showProviderDetails(provider) {
    selectedProvider = provider;
  }

  function closeProviderDetails() {
    selectedProvider = null;
  }

  async function copyDetail(value, label) {
    if (!value) return;
    await navigator.clipboard.writeText(value);
    showToast(`已复制${label}`);
  }

  function openCCSwitchPreview() {
    if (!selectedProvider) return;
    ccswitchData = { ...CCSwitchMapper.mapProvider(selectedProvider), app: "claude" };
    ccswitchApp = "claude";
    ccswitchModel = selectedProvider.defaultModel || "";
    showCCSwitchPreview = true;
  }

  async function confirmCCSwitchExport() {
    showCCSwitchPreview = false;
    const params = { ...ccswitchData, app: ccswitchApp, model: ccswitchModel };
    const link = generateDeepLink(params);
    const opened = await tryOpenCCSwitch(link);
    if (opened) {
      showToast("已发送到 CC Switch");
    } else {
      window.open(getCCSwitchDownloadUrl(), "_blank");
      showToast("未检测到 CC Switch，已打开下载页面", "warning");
    }
  }

  function getProviderTypeName(provider) {
    const typeMap = { openai: "OpenAI", anthropic: "Anthropic", gemini: "Gemini" };
    return typeMap[provider.type] || provider.type;
  }

  function maskApiKey(apiKey) {
    if (!apiKey) return "";
    if (apiKey.length <= 10) return "••••••";
    return `${apiKey.slice(0, 6)}••••${apiKey.slice(-4)}`;
  }

  async function handleChat(providerId) {
    const provider = $providers.find((p) => p.id === providerId);
    if (!provider) return;
    await setActiveProvider(providerId);
    const session = await createSession(providerId, provider.defaultModel);
    navigateTo("chat", { sessionId: session.id });
  }

  async function handleTest(providerId) {
    const result = await healthCheckProvider(providerId, ($settings.requestTimeout || 15) * 1000);
    if (!result) return;
    if (result.status === "ok") {
      showToast(`连接成功 (${result.latency}ms) · ${result.model}`, "success");
    } else if (result.status === "limited") {
      showToast("已触发限速：每分钟每渠道最多测试 2 个不同模型，请稍后再试", "warning");
    } else {
      showToast(`连接失败：${result.error || "连接失败"}`, "error");
    }
  }

  async function handleModelTest(modelId) {
    const pid = selectedProvider?.id;
    if (!pid || testingModel || fullTesting) return;
    testingModel = modelId;
    try {
      const timeout = ($settings.requestTimeout || 15) * 1000;
      const result = await healthCheckModel(pid, modelId, timeout);
      selectedProvider = $providers.find((p) => p.id === pid) || selectedProvider;
      if (result?.status === "ok") {
        showToast(`模型 ${result.model} 连接成功 (${result.latency}ms)`, "success");
      } else {
        showToast(`模型 ${result?.model || modelId} 连接失败：${result?.error || "连接失败"}`, "error");
      }
    } finally {
      testingModel = null;
    }
  }

  async function runFullTest() {
    const pid = selectedProvider?.id;
    if (!pid || fullTesting) return;
    showFullTestConfirm = false;
    fullTesting = true;
    try {
      const timeout = ($settings.requestTimeout || 15) * 1000;
      const entries = await healthCheckAll(pid, timeout, (m) => { testingModel = m; });
      selectedProvider = $providers.find((p) => p.id === pid) || selectedProvider;
      const ok = entries.filter((r) => r?.status === "ok").length;
      const fail = entries.filter((r) => r?.status === "error").length;
      if (entries.length === 0) {
        showToast("没有可检测的模型", "warning");
      } else if (ok === entries.length) {
        showToast(`全测完成：${ok}/${entries.length} 模型可用`, "success");
      } else if (ok > 0) {
        showToast(`全测完成：${ok}/${entries.length} 可用，${fail} 失败`, "warning");
      } else {
        showToast(`全测完成：${entries.length} 个模型均检测失败`, "error");
      }
    } finally {
      fullTesting = false;
      testingModel = null;
    }
  }

  async function handleRefreshAllModels() {
    if (refreshingModels) return;
    refreshingModels = true;
    try {
      const timeout = ($settings.requestTimeout || 15) * 1000;
      const results = await refreshAllProvidersModels(timeout);
      const ok = results.filter((r) => r?.status === "ok");
      const fail = results.filter((r) => r?.status === "error");
      const failMsg = fail.map((f) => `${f.name}: ${f.error}`).join("；");
      if (fail.length === 0) {
        showToast(`模型已更新：${ok.length} 个渠道，共 ${ok.reduce((s, r) => s + (r.count || 0), 0)} 个模型`, "success");
      } else {
        showToast(`更新 ${ok.length}/${results.length} 成功${failMsg ? `；${failMsg}` : ""}`, "warning");
      }
    } finally {
      refreshingModels = false;
    }
  }

  function handleDragStart(index) {
    draggedIndex = index;
  }

  function handleDragOver(e, index) {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    const sorted = [...$providers].sort((a, b) => a.sortIndex - b.sortIndex);
    const ids = sorted.map((p) => p.id);
    const [removed] = ids.splice(draggedIndex, 1);
    ids.splice(index, 0, removed);
    reorderProviders(ids);
    draggedIndex = index;
  }

  function handleDrop(e) {
    e.preventDefault();
    draggedIndex = null;
  }

  function handleDragEnd() {
    draggedIndex = null;
  }

  let sortedProviders = $derived(
    [...$providers].sort((a, b) => a.sortIndex - b.sortIndex)
  );

  let modelResultMap = $derived(
    Object.fromEntries(
      (selectedProvider?.healthCheck?.modelResults || []).map((r) => [r.model, r])
    )
  );

  let sortedDetailModels = $derived(
    (selectedProvider?.models || [])
      .filter((m) => m?.id)
      .sort((a, b) => statusRank(modelResultMap[a.id]) - statusRank(modelResultMap[b.id]))
  );

  function statusRank(r) {
    if (r?.status === "ok") return 0;
    if (r?.status === "error") return 2;
    return 1;
  }
</script>

<div class="h-full flex flex-col">
  <header class="page-header home-header flex items-center justify-between border-b">
    <div class="flex items-center gap-2.5">
      <div class="brand-mark">
        <img src="/icons/icon128.png" alt="赛德喵" />
      </div>
      <h1 class="text-[15px] font-semibold text-gradient">赛德喵</h1>
    </div>

    <div class="flex items-center gap-1">
      <button
        class="icon-button"
        onclick={() => navigateTo("export")}
        title="导入/导出"
      >
        <Download size={15} />
      </button>
      <button
        class="icon-button"
        onclick={() => navigateTo("chat", { showSessions: true })}
        title="历史对话"
      >
        <History size={15} />
      </button>
      <button
        class="icon-button"
        onclick={() => navigateTo("settings")}
        title="设置"
      >
        <SettingsIcon size={15} />
      </button>
      <button
        class="btn-primary home-add parse-btn flex items-center gap-1 ml-1"
        onclick={handleQuickParse}
        title="从剪贴板智能解析"
      >
        <Wand2 size={12} />
        <span class="home-add-label">智能解析</span>
      </button>
      <button
        class="btn-primary home-add flex items-center gap-1.5 ml-1"
        onclick={handleAdd}
      >
        <Plus size={13} />
        <span class="home-add-label">添加</span>
      </button>
    </div>
  </header>

  <div class="storage-bar">
    <div class="storage-info">
      <span>{$providers.length} 个接口</span>
      <span class="storage-dot"></span>
      <span>{$sessions.length} 个会话</span>
      <span class="storage-dot"></span>
      <span>{formatBytes(storageBytes)} / 10 MB</span>
    </div>
    <div class="storage-actions">
      {#if sortedProviders.length > 0}
        <button
          class="storage-action {refreshingModels ? 'storage-test-disabled' : ''}"
          onclick={handleRefreshAllModels}
          disabled={refreshingModels}
          title="一键更新所有渠道的上游模型列表"
        >
          <RefreshCw size={11} />
          {#if refreshingModels}
            <span>更新中…</span>
          {:else}
            <span>更新模型</span>
          {/if}
        </button>
      {/if}
      {#if sortedProviders.length > 1}
        <button
          class="storage-action {testAllCooldown > 0 || testAllRunning ? 'storage-test-disabled' : ''}"
          onclick={handleTestAll}
          disabled={testAllCooldown > 0 || testAllRunning}
          title={testAllCooldown > 0 ? `冷却中 ${formatCooldown(testAllCooldown)}` : "一键测试全部接口"}
        >
          <Zap size={11} />
          {#if testAllRunning}
            <span>测试中…</span>
          {:else if testAllCooldown > 0}
            <span>{formatCooldown(testAllCooldown)}</span>
          {:else}
            <span>全部测试</span>
          {/if}
        </button>
      {/if}
    </div>
  </div>

  <main class="page-main home-main flex-1 overflow-y-auto">
    {#if sortedProviders.length === 0}
      <EmptyState onAdd={handleAdd} onQuickParse={handleQuickParse} />
    {:else}
      <div class="provider-grid">
        {#each sortedProviders as provider, index (provider.id)}
          <div
            draggable="true"
            ondragstart={() => handleDragStart(index)}
            ondragover={(e) => handleDragOver(e, index)}
            ondrop={handleDrop}
            ondragend={handleDragEnd}
            onclick={() => showProviderDetails(provider)}
            class="animate-slide-up {draggedIndex === index ? 'opacity-40' : ''}"
            role="button"
            tabindex="0"
            onkeydown={(e) => e.key === "Enter" && showProviderDetails(provider)}
          >
            <ProviderCard
              {provider}
              onEdit={() => handleEdit(provider.id)}
              onDelete={() => handleDelete(provider.id)}
              onChat={() => handleChat(provider.id)}
              onTest={() => handleTest(provider.id)}
            />
          </div>
        {/each}
      </div>
    {/if}
  </main>

  {#if showConfirm}
    <ConfirmDialog
      message="确定要删除这个配置吗？此操作不可撤销。"
      confirmText="确认删除"
      danger={true}
      onConfirm={() => doDelete(providerToDelete)}
      onCancel={handleCancelDelete}
    />
  {/if}

  {#if showFullTestConfirm}
    <ConfirmDialog
      message="一键全测会连续请求当前渠道的多个模型，频繁或高并发检测可能触发上游风控封禁，请根据实际使用情况谨慎操作。确定继续？"
      confirmText="开始全测"
      danger={true}
      onConfirm={runFullTest}
      onCancel={() => (showFullTestConfirm = false)}
    />
  {/if}



  {#if selectedProvider}
    <div
      class="detail-modal-backdrop animate-fade-in"
      onclick={closeProviderDetails}
      onkeydown={(e) => e.key === "Escape" && closeProviderDetails()}
      role="button"
      tabindex="-1"
      aria-label="关闭详情"
    >
      <div class="detail-modal card animate-slide-up" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
        <div class="detail-modal-head">
          <div class="min-w-0">
            <p class="detail-eyebrow">接口详情</p>
            <h2>{selectedProvider.name}</h2>
          </div>
          <div class="detail-head-actions">
            <button
              class="detail-export detail-test-all"
              onclick={() => (showFullTestConfirm = true)}
              disabled={fullTesting || testingModel !== null}
              title="一键检测全部模型（注意风控风险）"
            >
              {#if fullTesting}
                <span>全测中…</span>
              {:else}
                <Zap size={12} />
                <span>一键全测</span>
              {/if}
            </button>
            <button class="detail-export" onclick={openCCSwitchPreview} aria-label="快速导出到 CC Switch" title="快速导出到 CC Switch">
              <Download size={12} />
              <span>导出到 CC Switch</span>
            </button>
            <button class="detail-close" onclick={closeProviderDetails} aria-label="关闭">
              <X size={14} />
            </button>
          </div>
        </div>

        <div class="detail-list">
          <button class="detail-row" onclick={() => copyDetail(selectedProvider.baseUrl, "Base URL")}>
            <span>Base URL</span>
            <code>{selectedProvider.baseUrl}</code>
            <Copy size={12} />
          </button>
          {#if selectedProvider.apiKey}
            <button class="detail-row" onclick={() => copyDetail(selectedProvider.apiKey, "API 密钥")}>
              <span>API 密钥</span>
              <code>{maskApiKey(selectedProvider.apiKey)}</code>
              <Copy size={12} />
            </button>
          {/if}
          <button class="detail-row" onclick={() => copyDetail(getProviderTypeName(selectedProvider), "接口类型")}>
            <span>接口类型</span>
            <code>{getProviderTypeName(selectedProvider)}</code>
            <Copy size={12} />
          </button>
          {#if selectedProvider.defaultModel}
            <button class="detail-row" onclick={() => copyDetail(selectedProvider.defaultModel, "默认模型")}>
              <span>默认模型</span>
              <code>{selectedProvider.defaultModel}</code>
              <Copy size={12} />
            </button>
          {/if}
          {#if selectedProvider.endpoint}
            <button class="detail-row" onclick={() => copyDetail(selectedProvider.endpoint, "请求端点")}>
              <span>请求端点</span>
              <code>{selectedProvider.endpoint}</code>
              <Copy size={12} />
            </button>
          {/if}
          {#if selectedProvider.models?.length}
            <div class="detail-group-title">模型列表</div>
            {#each sortedDetailModels as model}
              {@const hc = modelResultMap[model.id]}
              <div
                class="detail-row model-row"
                class:hc-ok={hc?.status === "ok"}
                class:hc-error={hc?.status === "error"}
                onclick={() => copyDetail(model.id, "模型 ID")}
                role="button"
                tabindex="0"
                onkeydown={(e) => e.key === "Enter" && copyDetail(model.id, "模型 ID")}
                title="点击复制模型 ID"
              >
                <span class="model-row-main">
                  <span class="model-id">{model.id}</span>
                  <span class="model-row-grow"></span>
                  {#if hc?.status === "ok"}
                    <span class="model-hc hc-ok">{hc.latency}ms</span>
                  {:else if hc?.status === "error"}
                    <span class="model-hc hc-error">不通</span>
                  {/if}
                  <button
                    class="model-copy-icon"
                    onclick={(e) => { e.stopPropagation(); copyDetail(model.id, "模型 ID"); }}
                    title="复制模型 ID"
                    aria-label="复制模型 ID"
                  >
                    <Copy size={12} />
                  </button>
                  <button
                    class="model-test"
                    onclick={(e) => { e.stopPropagation(); handleModelTest(model.id); }}
                    disabled={testingModel !== null || fullTesting}
                    title="检测此模型"
                    aria-label="检测此模型"
                  >
                    {#if testingModel === model.id}
                      <Loader2 size={11} class="animate-spin" />
                    {:else}
                      <RefreshCw size={11} />
                    {/if}
                  </button>
                </span>
                {#if hc?.status === "error"}
                  <span class="model-err">{hc.error || "连接失败"}</span>
                {/if}
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  {/if}

  {#if showCCSwitchPreview && ccswitchData}
    <div
      class="ccswitch-preview-backdrop animate-fade-in"
      onclick={() => (showCCSwitchPreview = false)}
      onkeydown={(e) => e.key === "Escape" && (showCCSwitchPreview = false)}
      role="button"
      tabindex="-1"
      aria-label="关闭"
    >
      <div class="ccswitch-preview-modal card animate-slide-up" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="0">
        <div class="ccswitch-preview-head">
          <div class="min-w-0">
            <p class="ccswitch-preview-eyebrow">CC Switch</p>
            <h2 class="text-[13px] font-semibold text-[var(--color-text-bright)]">预览导出数据</h2>
          </div>
          <button
            class="ccswitch-preview-close"
            onclick={() => (showCCSwitchPreview = false)}
            aria-label="关闭"
          >
            <X size={14} />
          </button>
        </div>

        <div class="ccswitch-preview-list">
          <div class="ccswitch-preview-row">
            <div class="flex items-center justify-between gap-2 mb-1">
              <p class="text-[12px] font-medium text-[var(--color-text-bright)] truncate" style="font-family: var(--font-mono);">{ccswitchData.name}</p>
              <AppSelector bind:value={ccswitchApp} />
            </div>
            <div class="flex items-center justify-between gap-2">
              <p class="text-[10px] text-[var(--color-text-muted)] truncate" style="font-family: var(--font-mono);">{ccswitchData.endpoint}</p>
              <ModelSelect models={ccswitchData.models} bind:value={ccswitchModel} />
            </div>
          </div>
        </div>

        <div class="ccswitch-preview-actions">
          <button
            class="ccswitch-preview-btn"
            onclick={() => (showCCSwitchPreview = false)}
          >
            取消
          </button>
          <button
            class="ccswitch-preview-btn ccswitch-preview-btn-primary"
            onclick={confirmCCSwitchExport}
          >
            确认导出
          </button>
        </div>
      </div>
    </div>
  {/if}

</div>


<style>
  .home-header { min-height: 58px; }
  .storage-bar {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding: 5px 12px;
    border-bottom: 1px solid var(--color-border);
    background: rgba(var(--sunken-rgb), .30);
  }
  .storage-info {
    display: flex;
    align-items: center;
    gap: 6px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 500;
    color: var(--color-text-secondary);
    letter-spacing: .03em;
    white-space: nowrap;
    overflow: hidden;
  }
  .storage-info span:not(.storage-dot) {
    flex: 1 1 0;
    text-align: center;
  }
  .storage-actions {
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .storage-actions .storage-action {
    flex: 1 1 0;
    justify-content: center;
  }
  .storage-dot {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--color-text-muted);
    opacity: .5;
  }
  .storage-action {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    min-height: 24px;
    padding: 3px 9px;
    border: 1px solid rgba(var(--accent-rgb), .45);
    border-radius: var(--radius-sm);
    background: rgba(var(--accent-rgb), .08);
    color: var(--color-primary-hover);
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 600;
    letter-spacing: .03em;
    white-space: nowrap;
    cursor: pointer;
    transition: border-color .15s var(--ease-out), background .15s var(--ease-out), box-shadow .15s var(--ease-out), transform .15s var(--ease-out);
  }
  .storage-action:hover:not(:disabled) {
    border-color: rgba(var(--accent-rgb), .68);
    background: rgba(var(--accent-rgb), .14);
    box-shadow: var(--glow-primary);
    transform: translateY(-1px);
  }
  .storage-action:disabled { opacity: .5; cursor: default; }
  .storage-test-disabled {
    opacity: .5;
    cursor: not-allowed;
    color: var(--color-text-muted);
  }
  .brand-mark {
    position: relative;
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    flex: 0 0 auto;
    overflow: hidden;
    background: rgba(var(--accent-rgb), .10);
    border: 1px solid rgba(var(--accent-rgb), .42);
    border-radius: 8px;
    box-shadow: var(--glow-primary);
  }
  .brand-mark img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .provider-grid { display: grid; grid-template-columns: minmax(0, 1fr); gap: 8px; }
  .detail-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 40;
    display: grid;
    place-items: center;
    padding: 12px;
    background: rgba(0, 0, 0, .68);
  }
  .detail-modal {
    width: min(360px, 100%);
    max-height: min(520px, calc(100vh - 24px));
    overflow: hidden;
    padding: 8px !important;
    background: linear-gradient(180deg, rgba(var(--overlay-rgb), .08), rgba(var(--overlay-rgb), .03)), rgba(31, 35, 41, .96);
  }
  .detail-modal-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
  .detail-eyebrow {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 9px;
    letter-spacing: .08em;
  }
  .detail-modal h2 {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-bright);
    font-size: 14px;
    font-weight: 650;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail-head-actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 5px;
  }
  .detail-export {
    display: inline-flex;
    min-height: 28px;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 8px !important;
    border: 1px solid rgba(var(--accent-rgb), .58);
    border-radius: var(--radius-sm);
    background: rgba(var(--accent-rgb), .10);
    color: var(--color-primary-hover);
    font-size: 10px;
    font-weight: 650;
    white-space: nowrap;
  }
  .detail-export:hover {
    border-color: rgba(var(--accent-rgb), .72);
    background: rgba(var(--accent-rgb), .15);
    box-shadow: var(--glow-primary);
  }
  .detail-export:disabled {
    opacity: .5;
    cursor: default;
    box-shadow: none;
  }
  .detail-close {
    display: inline-flex;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
  }
  .detail-close:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text-bright);
    background: var(--color-bg-tertiary);
  }
  .detail-list {
    display: grid;
    gap: 5px;
    max-height: 420px;
    overflow-y: auto;
    overflow-x: auto;
    padding-top: 8px;
  }
  .detail-group-title {
    margin-top: 3px;
    color: var(--color-text-muted);
    font-size: 10px;
    font-weight: 600;
  }
  .detail-row {
    display: grid;
    grid-template-columns: minmax(64px, auto) minmax(0, 1fr) auto;
    align-items: center;
    gap: 8px;
    width: 100%;
    padding: 7px !important;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: rgba(var(--sunken-rgb), .32);
    color: var(--color-text-secondary);
    text-align: left;
  }
  .detail-row:hover {
    border-color: rgba(var(--accent-rgb), .42);
    background: rgba(var(--accent-rgb), .08);
    color: var(--color-text-bright);
  }
  .detail-row span {
    overflow: hidden;
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .detail-row code {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-bright);
    font-family: var(--font-mono);
    font-size: 10px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .model-row {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    gap: 3px;
    cursor: pointer;
  }
  .model-row.hc-ok {
    border-color: rgba(183, 234, 212, .34);
    background: rgba(183, 234, 212, .06);
  }
  .model-row.hc-ok:hover {
    border-color: rgba(183, 234, 212, .55);
    background: rgba(183, 234, 212, .10);
  }
  .model-row.hc-error {
    border-color: rgba(244, 119, 136, .34);
    background: rgba(244, 119, 136, .06);
  }
  .model-row.hc-error:hover {
    border-color: rgba(244, 119, 136, .55);
    background: rgba(244, 119, 136, .10);
  }
  .model-row-main {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: visible;
    white-space: normal;
  }
  .model-row .model-id {
    flex: 0 0 auto;
    overflow: visible;
    text-overflow: clip;
    white-space: nowrap;
    line-height: 1.4;
    color: var(--color-text-bright);
    font-family: var(--font-mono);
    font-size: 10px;
  }
  .model-test {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: rgba(var(--sunken-rgb), .36);
    color: var(--color-text-secondary);
    cursor: pointer;
    transition: color .15s var(--ease-out), border-color .15s var(--ease-out), background .15s var(--ease-out);
  }
  .model-test:hover:not(:disabled) {
    color: var(--color-primary-hover);
    border-color: var(--color-border-hover);
    background: rgba(var(--accent-rgb), .08);
  }
  .model-test:disabled { opacity: .5; cursor: default; }
  .model-copy-icon {
    flex: 0 0 auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: rgba(var(--sunken-rgb), .36);
    color: var(--color-text-muted);
    cursor: pointer;
    transition: color .15s var(--ease-out), border-color .15s var(--ease-out), background .15s var(--ease-out);
  }
  .model-copy-icon:hover {
    color: var(--color-primary-hover);
    border-color: var(--color-border-hover);
    background: rgba(var(--accent-rgb), .08);
  }
  .model-row-grow { flex: 1 1 100%; min-width: 4px; }
  .model-row-main :global(svg) { flex: 0 0 auto; }
  .model-hc {
    flex: 0 0 auto;
    max-width: 90px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-family: var(--font-mono);
    font-size: 9px;
    font-weight: 600;
  }
  .model-hc.hc-ok { color: var(--color-success); }
  .model-hc.hc-error { color: var(--color-error); }
  .model-row .model-err {
    display: block;
    padding-left: 2px;
    overflow: visible;
    white-space: normal;
    color: var(--color-error);
    font-family: var(--font-mono);
    font-size: 9px;
    line-height: 1.35;
    word-break: break-word;
  }

  .parse-btn {
    background: rgba(var(--purple-rgb), 0.08) !important;
    border: 1px dashed rgba(var(--purple-rgb), 0.42) !important;
    color: #b394f4 !important;
  }
  .parse-btn:hover {
    background: rgba(var(--purple-rgb), 0.16) !important;
    border-color: rgba(var(--purple-rgb), 0.62) !important;
    box-shadow: none !important;
    transform: none !important;
  }

  @media (min-width: 460px) { .provider-grid { gap: 10px; } }
  @media (max-width: 359px) {
    .home-header { min-height: 50px; }
    .brand-mark { width: 28px; height: 28px; }
    .home-add { min-width: 34px; padding-inline: 10px; }
    .home-add-label { display: none; }
  }
  .ccswitch-preview-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 12px;
    background: rgba(0, 0, 0, .68);
  }
  .ccswitch-preview-modal {
    width: min(360px, 100%);
    max-height: min(520px, calc(100vh - 24px));
    overflow: hidden;
    padding: 8px !important;
    background: linear-gradient(180deg, rgba(var(--overlay-rgb), .08), rgba(var(--overlay-rgb), .03)), rgba(31, 35, 41, .96);
  }
  .ccswitch-preview-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--color-border);
  }
  .ccswitch-preview-eyebrow {
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1.2;
  }
  .ccswitch-preview-close {
    display: inline-flex;
    width: 28px;
    height: 28px;
    flex: 0 0 auto;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
  }
  .ccswitch-preview-close:hover {
    border-color: var(--color-border-hover);
    color: var(--color-text-bright);
    background: var(--color-bg-tertiary);
  }
  .ccswitch-preview-list {
    display: grid;
    gap: 5px;
    max-height: 360px;
    overflow-y: auto;
    padding-top: 8px;
    padding-bottom: 8px;
  }
  .ccswitch-preview-row {
    padding: 7px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: rgba(var(--sunken-rgb), .32);
  }
  .ccswitch-preview-actions {
    display: flex;
    justify-content: flex-end;
    gap: 5px;
    padding-top: 8px;
    border-top: 1px solid var(--color-border);
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








