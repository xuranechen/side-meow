<script>
  import { providers } from "../stores/providers.js";
  import { sessions } from "../stores/sessions.js";
  import { settings } from "../stores/settings.js";
  import { goBack, showToast } from "../stores/ui.js";
  import { addProvider, updateProvider } from "../stores/providers.js";
  import { saveSessions } from "../stores/sessions.js";
  import { updateSettings } from "../stores/settings.js";
  import { CCSwitchMapper } from "../../lib/ccswitch/mapper.js";
  import { generateDeepLink, tryOpenCCSwitchBatch, getCCSwitchDownloadUrl } from "../../lib/ccswitch/deeplink.js";
  import { ChevronLeft, Download, Upload, FileJson, AlertTriangle, ExternalLink, X } from "lucide-svelte";
  import AppSelector from "../components/AppSelector.svelte";
  import ModelSelect from "../components/ModelSelect.svelte";

  let importFile = $state(null);
  let exportOptions = $state({
    providers: true,
    sessions: false,
    settings: true,
  });
  let selectedProviders = $state([]);
  let showCCSwitchPreview = $state(false);
  let ccswitchData = $state(null);
  let showSecurityWarning = $state(false);
  let pendingExportData = $state(null);
  let ccswitchFailed = $state(false);

  function handleExport() {
    if (exportOptions.providers && $providers.length > 0) {
      pendingExportData = {
        version: 1,
        exportedAt: Date.now(),
        source: "side-meow",
        providers: exportOptions.providers ? $providers : undefined,
        sessions: exportOptions.sessions ? $sessions : undefined,
        settings: exportOptions.settings ? $settings : undefined,
      };
      showSecurityWarning = true;
    } else {
      doExport();
    }
  }

  function doExport() {
    const data = pendingExportData || {
      version: 1,
      exportedAt: Date.now(),
      source: "api-sider",
      providers: exportOptions.providers ? $providers : undefined,
      sessions: exportOptions.sessions ? $sessions : undefined,
      settings: exportOptions.settings ? $settings : undefined,
    };

    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `side-meow-export-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();

    URL.revokeObjectURL(url);
    showToast("导出成功");
    showSecurityWarning = false;
    pendingExportData = null;
  }

  function cancelExport() {
    showSecurityWarning = false;
    pendingExportData = null;
  }

  let importConflict = $state(null);
  let importData = $state(null);

  async function handleImport() {
    if (!importFile) return;

    try {
      const text = await importFile.text();
      const data = JSON.parse(text);

      if (!data.version || !data.source) {
        throw new Error("无效的导出文件");
      }

      importData = data;

      if (data.providers && Array.isArray(data.providers)) {
        const existingNames = $providers.map((p) => p.name);
        const conflicts = data.providers.filter((p) => existingNames.includes(p.name));

        if (conflicts.length > 0) {
          importConflict = {
            type: "providers",
            conflicts: conflicts.map((c) => c.name),
            data: data,
          };
          return;
        }
      }

      await doImport(data, "skip");
    } catch (err) {
      showToast("导入失败: " + err.message, "error");
    }
  }

  async function doImport(data, conflictAction) {
    let importedCount = 0;

    if (data.providers && Array.isArray(data.providers)) {
      const existingMap = new Map($providers.map((p) => [p.name, p]));

      for (const provider of data.providers) {
        const existing = existingMap.get(provider.name);

        if (existing) {
          if (conflictAction === "overwrite") {
            await updateProvider(existing.id, provider);
            importedCount++;
          }
        } else {
          await addProvider(provider);
          importedCount++;
        }
      }
    }

    if (data.sessions && Array.isArray(data.sessions)) {
      const existingIds = new Set($sessions.map((s) => s.id));
      const newSessions = data.sessions.filter((s) => !existingIds.has(s.id));
      if (newSessions.length > 0) {
        const merged = [...newSessions, ...$sessions];
        await saveSessions(merged);
        importedCount += newSessions.length;
      }
    }

    if (data.settings && typeof data.settings === "object") {
      await updateSettings(data.settings);
    }

    showToast(`成功导入 ${importedCount} 项`);
    importFile = null;
    importData = null;
    importConflict = null;
  }

  function handleConflictResolve(action) {
    if (importData) {
      doImport(importData, action);
    }
  }

  function handleFileChange(e) {
    importFile = e.target.files[0];
  }

  function handleCCSwitchExport() {
    const selected = $providers.filter((p) => selectedProviders.includes(p.id));
    if (selected.length === 0) {
      showToast("请至少选择一个配置", "error");
      return;
    }

    ccswitchData = selected.map((p) => ({ ...CCSwitchMapper.mapProvider(p), app: "claude" }));
    showCCSwitchPreview = true;
  }

  async function handleCCSwitchConfirm() {
    showCCSwitchPreview = false;

    const links = ccswitchData.map((d) => generateDeepLink(d));
    if (links.some((l) => l.length > 2000)) {
      showToast("部分配置数据过大，请使用文件导出", "warning");
      return;
    }

    const count = await tryOpenCCSwitchBatch(links);
    if (count > 0) {
      ccswitchFailed = false;
      showToast(`已发送 ${count} 个配置到 CC Switch`);
    } else {
      ccswitchFailed = true;
      window.open(getCCSwitchDownloadUrl(), "_blank");
      showToast("未检测到 CC Switch，已打开下载页面", "warning");
    }
  }

  function toggleProviderSelection(id) {
    if (selectedProviders.includes(id)) {
      selectedProviders = selectedProviders.filter((pid) => pid !== id);
    } else {
      selectedProviders = [...selectedProviders, id];
    }
  }

  function selectAllProviders() {
    selectedProviders = $providers.map((p) => p.id);
  }

  function deselectAllProviders() {
    selectedProviders = [];
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
    <h1 class="text-[14px] font-semibold text-[var(--color-text-bright)]">数据迁移</h1>
  </header>

  <main class="page-main migration-main section-stack flex-1 overflow-y-auto space-y-4">
    <section>
      <h2 class="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-3 flex items-center gap-1.5" style="letter-spacing: 0.04em;">
        <ExternalLink size={12} class="text-[var(--color-primary)]" />
        导出到 CC Switch
      </h2>
      <p class="text-[11px] text-[var(--color-text-muted)] mb-3">
        选择要导出的配置，一键发送到 CC Switch
      </p>

      <div class="flex items-center gap-2 mb-3">
        <button
          class="text-[11px] text-[var(--color-primary)] hover:underline"
          onclick={selectAllProviders}
        >
          全选
        </button>
        <button
          class="text-[11px] text-[var(--color-primary)] hover:underline"
          onclick={deselectAllProviders}
        >
          取消全选
        </button>
        <span class="text-[11px] text-[var(--color-text-muted)]">
          已选 {selectedProviders.length} 项
        </span>
      </div>

      <div class="space-y-1.5 mb-4">
        {#each $providers as provider}
          <label class="migration-bordered flex items-center gap-3 p-3 rounded-md border border-[var(--color-border)] hover:border-[var(--color-border-hover)] cursor-pointer transition-colors" style="background: var(--color-bg-tertiary);">
            <input
              type="checkbox"
              checked={selectedProviders.includes(provider.id)}
              onchange={() => toggleProviderSelection(provider.id)}
              style="accent-color: var(--color-primary);"
            />
            <div class="flex-1 min-w-0">
              <p class="text-[12px] font-medium text-[var(--color-text-bright)] truncate">{provider.name}</p>
              <p class="text-[10px] text-[var(--color-text-muted)] truncate" style="font-family: var(--font-mono);">{provider.baseUrl}</p>
            </div>
          </label>
        {/each}
      </div>

      <button
        class="migration-bordered btn-primary flex items-center justify-center gap-2"
        onclick={handleCCSwitchExport}
        disabled={selectedProviders.length === 0}
      >
        <ExternalLink size={14} />
        导出到 CC Switch
      </button>

      {#if ccswitchFailed}
        <div class="migration-bordered p-3 rounded-md border" style="background: var(--color-bg-tertiary); border-color: var(--color-warning);">
          <div class="flex items-start gap-2">
            <AlertTriangle size={14} class="text-[var(--color-warning)] mt-0.5 flex-shrink-0" />
            <div>
              <p class="text-[11px] font-medium text-[var(--color-warning)]">未检测到 CC Switch</p>
              <p class="text-[10px] text-[var(--color-text-secondary)] mt-1">
                点击导出将打开下载页面，
                <a href={getCCSwitchDownloadUrl()} target="_blank" rel="noopener" class="text-[var(--color-primary)]">
                  前往下载
                </a>
              </p>
            </div>
          </div>
        </div>
      {/if}
    </section>

    <section>
      <h2 class="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-3 flex items-center gap-1.5" style="letter-spacing: 0.04em;">
        <FileJson size={12} class="text-[var(--color-primary)]" />
        导出 JSON
      </h2>
      <div class="space-y-2 mb-3">
        {#each [["providers", "配置", $providers.length], ["sessions", "会话", $sessions.length], ["settings", "设置", null]] as [key, label, count]}
          <label class="flex items-center gap-2">
            <input type="checkbox" bind:checked={exportOptions[key]} style="accent-color: var(--color-primary);" />
            <span class="text-[12px] text-[var(--color-text-secondary)]">{label}{count !== null ? ` (${count})` : ""}</span>
          </label>
        {/each}
      </div>

      <button
        class="migration-bordered py-2.5 rounded-md border border-[var(--color-border)] hover:border-[var(--color-border-hover)] transition-colors text-[12px] font-medium flex items-center justify-center gap-2"
        style="background: var(--color-bg-tertiary); color: var(--color-text-bright);"
        onclick={handleExport}
      >
        <Download size={14} />
        下载 JSON 文件
      </button>
    </section>

    <section>
      <h2 class="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-3 flex items-center gap-1.5" style="letter-spacing: 0.04em;">
        <Upload size={12} class="text-[var(--color-primary)]" />
        导入 JSON
      </h2>
      <div class="migration-bordered border-2 border-dashed border-[var(--color-border)] rounded-md p-6 text-center hover:border-[var(--color-border-hover)] transition-colors">
        <input
          type="file"
          accept=".json"
          onchange={handleFileChange}
          class="hidden"
          id="import-file"
        />
        <label
          for="import-file"
          class="cursor-pointer text-[12px] text-[var(--color-primary)] hover:underline flex items-center justify-center gap-1.5"
        >
          <Upload size={14} />
          选择文件
        </label>
        <p class="text-[10px] text-[var(--color-text-muted)] mt-2">
          {#if importFile}
            已选择: {importFile.name}
          {:else}
            支持 .json 格式
          {/if}
        </p>
      </div>

      {#if importFile}
        <button
          class="migration-bordered btn-primary"
          onclick={handleImport}
        >
          开始导入
        </button>
      {/if}
    </section>
  </main>

  {#if importConflict}
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.8);">
      <div class="card max-w-md w-full mx-4" style="padding: 20px;">
        <h3 class="text-[13px] font-medium mb-3 text-[var(--color-warning)]">发现重复配置</h3>

        <p class="text-[12px] text-[var(--color-text-secondary)] mb-3">
          以下配置已存在：
        </p>

        <div class="space-y-1.5 mb-5 max-h-40 overflow-y-auto">
          {#each importConflict.conflicts as name}
            <div class="px-3 py-2 rounded-sm border border-[var(--color-border)] text-[12px] text-[var(--color-text-bright)]" style="background: var(--color-bg-tertiary); font-family: var(--font-mono);">
              {name}
            </div>
          {/each}
        </div>

        <div class="ccswitch-preview-actions">
          <button class="ccswitch-preview-btn" onclick={() => { importConflict = null; importFile = null; }}>取消</button>
          <button class="ccswitch-preview-btn" onclick={() => handleConflictResolve("skip")}>跳过重复</button>
          <button class="ccswitch-preview-btn ccswitch-preview-btn-primary" onclick={() => handleConflictResolve("overwrite")}>覆盖已有</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showSecurityWarning}
    <div class="fixed inset-0 z-50 flex items-center justify-center" style="background: rgba(0,0,0,0.8);">
      <div class="card max-w-md w-full mx-4" style="padding: 20px;">
        <div class="flex items-center gap-2 mb-3">
          <AlertTriangle size={16} class="text-[var(--color-warning)]" />
          <h3 class="text-[13px] font-medium text-[var(--color-warning)]">安全提示</h3>
        </div>

        <p class="text-[12px] text-[var(--color-text-secondary)] mb-3">
          导出的文件包含 <strong style="color: var(--color-warning);">密钥</strong> 等敏感信息。
        </p>

        <ul class="text-[12px] text-[var(--color-text-secondary)] space-y-1.5 mb-5">
          <li class="flex items-start gap-2">
            <span class="text-[var(--color-text-muted)]">-</span>
            妥善保管导出文件，不要分享给他人
          </li>
          <li class="flex items-start gap-2">
            <span class="text-[var(--color-text-muted)]">-</span>
            不要上传到公开的代码仓库
          </li>
          <li class="flex items-start gap-2">
            <span class="text-[var(--color-text-muted)]">-</span>
            建议使用后删除文件
          </li>
        </ul>

        <div class="ccswitch-preview-actions">
          <button class="ccswitch-preview-btn" onclick={cancelExport}>取消</button>
          <button class="ccswitch-preview-btn" style="border-color: rgba(241,217,115,.5); background: rgba(241,217,115,.10); color: var(--color-warning);" onclick={doExport}>继续导出</button>
        </div>
      </div>
    </div>
  {/if}

  {#if showCCSwitchPreview && ccswitchData?.length}
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
          {#each ccswitchData as item, i}
            <div class="ccswitch-preview-row">
              <div class="flex items-center justify-between gap-2 mb-1">
                <p class="text-[12px] font-medium text-[var(--color-text-bright)] truncate" style="font-family: var(--font-mono);">{item.name}</p>
                <AppSelector bind:value={ccswitchData[i].app} />
              </div>
              <div class="flex items-center justify-between gap-2">
                <p class="text-[10px] text-[var(--color-text-muted)] truncate" style="font-family: var(--font-mono);">{item.endpoint}</p>
                <ModelSelect models={item.models} bind:value={ccswitchData[i].model} />
              </div>
            </div>
          {/each}
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
            onclick={handleCCSwitchConfirm}
          >
            确认导出
          </button>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .migration-main > section,
  .migration-bordered {
    padding: 5px;
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
