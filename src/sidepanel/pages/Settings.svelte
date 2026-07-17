<script>
  import { settings, updateSetting } from "../stores/settings.js";
  import { goBack, showToast } from "../stores/ui.js";
  import { sessions, cleanupOldSessions } from "../stores/sessions.js";
  import { providers } from "../stores/providers.js";
  import { clearAllStorage, getStorageSize, formatBytes } from "../../lib/storage/chrome-storage.js";
  import { ChevronLeft, Zap, Activity, FileText, HardDrive, ChevronDown, Timer, Trash2 } from "lucide-svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";


  const historyOptions = [
    { value: 10, label: "10" },
    { value: 50, label: "50" },
    { value: 100, label: "100" },
    { value: 0, label: "\u65e0\u9650" },
  ];

  const expireOptions = [
    { value: 7, label: "7 天" },
    { value: 30, label: "30 天" },
    { value: 90, label: "90 天" },
    { value: 0, label: "永不过期" },
  ];

  const timeoutOptions = [
    { value: 5, label: "5 秒" },
    { value: 10, label: "10 秒" },
    { value: 15, label: "15 秒" },
    { value: 30, label: "30 秒" },
    { value: 60, label: "60 秒" },
  ];

  let historyOpen = $state(false);
  let expireOpen = $state(false);
  let timeoutOpen = $state(false);
  let selectedHistoryLabel = $derived(
    historyOptions.find((option) => option.value === $settings.maxChatHistory)?.label || "50"
  );
  let selectedExpireLabel = $derived(
    expireOptions.find((option) => option.value === $settings.sessionExpireDays)?.label || "30 天"
  );
  let selectedTimeoutLabel = $derived(
    timeoutOptions.find((option) => option.value === $settings.requestTimeout)?.label || "15 秒"
  );

  function selectHistory(value) {
    updateSetting("maxChatHistory", value);
    historyOpen = false;
  }

  function selectExpire(value) {
    updateSetting("sessionExpireDays", value);
    expireOpen = false;
  }

  function selectTimeout(value) {
    updateSetting("requestTimeout", value);
    timeoutOpen = false;
  }

  let storageBytes = $state(0);
  let showCleanupConfirm = $state(false);
  let showClearAllConfirm = $state(false);

  async function refreshStorageSize() {
    storageBytes = await getStorageSize();
  }

  $effect(() => {
    $sessions;
    $providers;
    refreshStorageSize();
  });

  async function handleCleanupOld() {
    const count = await cleanupOldSessions($settings.maxChatHistory || 100, $settings.sessionExpireDays || 0);
    await refreshStorageSize();
    showToast(count > 0 ? `已清理 ${count} 个过期会话` : "没有需要清理的会话");
  }

  async function handleClearAll() {
    await clearAllStorage();
    window.location.reload();
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
    <h1 class="text-[14px] font-semibold text-[var(--color-text-bright)]">设置中心</h1>
  </header>

  <main class="page-main settings-main flex-1 overflow-y-auto space-y-4">
    <section>
      <h2 class="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-2.5 flex items-center gap-1.5" style="letter-spacing: 0.04em;">
        <Zap size={12} class="text-[var(--color-primary)]" />
        聊天
      </h2>
      <div class="card px-3.5">
        {#each [
          ["streamByDefault", "默认流式输出", Zap],
          ["showTokenCount", "显示令牌计数", Activity],
          ["showTiming", "显示耗时", Timer],
          ["autoTitle", "自动生成标题", FileText],
        ] as [key, label, Icon]}
          <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)] last:border-0">
            <span class="text-[12px] leading-5 flex items-center gap-2.5 text-[var(--color-text)]">
              <Icon size={13} class="text-[var(--color-text-muted)]" />
              {label}
            </span>
            <button
              class="settings-toggle relative w-9 h-5 rounded-full transition-all"
              class:enabled={$settings[key]}
              style="background: {$settings[key] ? 'var(--gradient-primary)' : 'var(--color-bg-elevated)'}; box-shadow: {$settings[key] ? 'var(--glow-primary)' : 'inset 0 0 0 1px var(--color-border)'};"
              onclick={() => updateSetting(key, !$settings[key])}
              aria-label={$settings[key] ? "关闭" : "开启"}
            >
              <div class="w-3.5 h-3.5 rounded-full bg-white transition-transform ml-0.75 {$settings[key] ? 'translate-x-[16px]' : ''}"></div>
            </button>
          </div>
        {/each}
        <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)]">
          <span class="text-[12px] leading-5 flex items-center gap-2.5 text-[var(--color-text)]">
            <Zap size={13} class="text-[var(--color-text-muted)]" />
            Temperature
          </span>
          <div class="flex items-center gap-2">
            <input
              type="range"
              min="0"
              max="2"
              step="0.1"
              value={$settings.temperature}
              oninput={(e) => updateSetting("temperature", parseFloat(e.target.value))}
              class="w-20 accent-[var(--color-primary)]"
            />
            <span class="text-[11px] font-mono text-[var(--color-text-muted)] w-6 text-right">{$settings.temperature}</span>
          </div>
        </div>
        <div class="flex min-h-14 items-center justify-between py-4">
          <span class="text-[12px] leading-5 flex items-center gap-2.5 text-[var(--color-text)]">
            <Zap size={13} class="text-[var(--color-text-muted)]" />
            Max Tokens
          </span>
          <div class="flex items-center gap-2">
            <input
              type="number"
              min="0"
              step="256"
              value={$settings.maxTokens}
              oninput={(e) => updateSetting("maxTokens", parseInt(e.target.value) || 0)}
              placeholder="0 = 自动"
              class="w-20 px-2 py-1 rounded border border-[var(--color-border)] bg-[var(--color-bg-tertiary)] text-[11px] font-mono text-[var(--color-text-bright)] text-right"
            />
          </div>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-2.5 flex items-center gap-1.5" style="letter-spacing: 0.04em;">
        <HardDrive size={12} class="text-[var(--color-primary)]" />
        存储
      </h2>
      <div class="card px-3.5">
        <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)]">
          <span class="text-[12px] text-[var(--color-text)]">已用空间</span>
          <span class="text-[12px] font-mono text-[var(--color-text-secondary)]">{formatBytes(storageBytes)} / 10 MB</span>
        </div>
        <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)]">
          <span class="text-[12px] text-[var(--color-text)]">数据统计</span>
          <span class="text-[11px] font-mono text-[var(--color-text-muted)]">{$providers.length} 接口 · {$sessions.length} 会话</span>
        </div>
        <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)]">
          <span class="text-[12px] text-[var(--color-text)]">最大保留会话数</span>
          <div class="settings-select-wrap">
            <button
              class="settings-select-trigger"
              onclick={() => (historyOpen = !historyOpen)}
              aria-haspopup="listbox"
              aria-expanded={historyOpen}
            >
              <span>{selectedHistoryLabel}</span>
              <ChevronDown size={12} />
            </button>
            {#if historyOpen}
              <div class="settings-select-menu" role="listbox">
                {#each historyOptions as option}
                  <button
                    class:active={option.value === $settings.maxChatHistory}
                    onclick={() => selectHistory(option.value)}
                    role="option"
                    aria-selected={option.value === $settings.maxChatHistory}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
           </div>
        </div>
        <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)]">
          <span class="text-[12px] text-[var(--color-text)]">会话过期时间</span>
          <div class="settings-select-wrap">
            <button
              class="settings-select-trigger"
              onclick={() => (expireOpen = !expireOpen)}
              aria-haspopup="listbox"
              aria-expanded={expireOpen}
            >
              <span>{selectedExpireLabel}</span>
              <ChevronDown size={12} />
            </button>
            {#if expireOpen}
              <div class="settings-select-menu" role="listbox">
                {#each expireOptions as option}
                  <button
                    class:active={option.value === $settings.sessionExpireDays}
                    onclick={() => selectExpire(option.value)}
                    role="option"
                    aria-selected={option.value === $settings.sessionExpireDays}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="flex min-h-14 items-center justify-between py-4 border-b border-[var(--color-border)]">
          <span class="text-[12px] text-[var(--color-text)]">请求超时时间</span>
          <div class="settings-select-wrap">
            <button
              class="settings-select-trigger"
              onclick={() => (timeoutOpen = !timeoutOpen)}
              aria-haspopup="listbox"
              aria-expanded={timeoutOpen}
            >
              <span>{selectedTimeoutLabel}</span>
              <ChevronDown size={12} />
            </button>
            {#if timeoutOpen}
              <div class="settings-select-menu" role="listbox">
                {#each timeoutOptions as option}
                  <button
                    class:active={option.value === $settings.requestTimeout}
                    onclick={() => selectTimeout(option.value)}
                    role="option"
                    aria-selected={option.value === $settings.requestTimeout}
                  >
                    {option.label}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        </div>
        <div class="py-3 flex gap-2">
          <button class="cleanup-btn" onclick={() => (showCleanupConfirm = true)}>
            <Trash2 size={12} />
            清理过期会话
          </button>
          <button class="cleanup-btn" style="color: var(--color-error);" onclick={() => (showClearAllConfirm = true)}>
            <Trash2 size={12} />
            清除全部数据
          </button>
        </div>
      </div>
    </section>

    <section>
      <h2 class="text-[11px] font-semibold text-[var(--color-text-secondary)] mb-2" style="letter-spacing: 0.04em;">关于</h2>
      <div class="card px-3.5 py-4">
        <div class="flex items-center gap-1.5 mb-1">
          <span class="text-[12px] font-semibold text-gradient">赛德喵</span>
          <span class="version-tag">v1.0.0</span>
        </div>
        <p class="text-[11px] text-[var(--color-text-muted)]">浏览器侧边栏大模型接口管理工具</p>
      </div>
    </section>
  </main>

  {#if showCleanupConfirm}
    <ConfirmDialog
      message="确定清理过期会话吗？将按保留数量和过期时间清理，此操作不可撤销。"
      confirmText="确认清理"
      onConfirm={() => { showCleanupConfirm = false; handleCleanupOld(); }}
      onCancel={() => (showCleanupConfirm = false)}
    />
  {/if}

  {#if showClearAllConfirm}
    <ConfirmDialog
      message="确定要清除全部数据吗？所有配置、会话、设置将被永久删除，此操作不可撤销。"
      confirmText="全部清除"
      danger={true}
      onConfirm={() => { showClearAllConfirm = false; handleClearAll(); }}
      onCancel={() => (showClearAllConfirm = false)}
    />
  {/if}
</div>

<style>
  .settings-toggle {
    border: 1px solid var(--color-border);
    transition: border-color .18s ease, box-shadow .18s ease, filter .18s ease;
  }
  .settings-toggle:hover { border-color: var(--color-border-hover); }
  .settings-toggle.enabled { border-color: rgba(var(--accent-rgb), .62); }
  .settings-select-wrap {
    position: relative;
    flex: 0 0 auto;
  }
  .settings-select-trigger {
    display: inline-flex;
    min-width: 82px;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 5px 8px !important;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: rgba(var(--sunken-rgb), .58);
    color: #ffffff;
    font-family: var(--font-mono);
    font-size: 12px;
    line-height: 1.2;
  }
  .settings-select-trigger:hover,
  .settings-select-trigger:focus-visible {
    border-color: rgba(var(--accent-rgb), .42);
    background: rgba(var(--sunken-rgb), .72);
  }
  .settings-select-trigger span {
    color: #ffffff;
  }
  .settings-select-menu {
    position: absolute;
    top: calc(100% + 4px);
    right: 0;
    z-index: 20;
    display: grid;
    min-width: 82px;
    padding: 4px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: rgb(31, 35, 41);
    box-shadow: var(--shadow-elevated);
  }
  .settings-select-menu button {
    width: 100%;
    padding: 5px 8px;
    border-radius: var(--radius-sm);
    color: #ffffff;
    font-family: var(--font-mono);
    font-size: 12px;
    text-align: left;
  }
  .settings-select-menu button:hover,
  .settings-select-menu button.active {
    background: rgba(var(--accent-rgb), .12);
    color: #ffffff;
  }
  .version-tag {
    display: inline-flex;
    align-items: center;
    min-height: 20px;
    margin-left: 4px;
    padding: 3px 6px !important;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: rgba(var(--sunken-rgb), .38);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: 10px;
    line-height: 1;
  }
  .cleanup-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 6px 12px !important;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    background: rgba(var(--sunken-rgb), .32);
    color: var(--color-text-secondary);
    font-size: 11px;
    font-weight: 500;
    transition: border-color .16s var(--ease-out), background .16s var(--ease-out), color .16s var(--ease-out);
  }
  .cleanup-btn:hover {
    border-color: var(--color-border-hover);
    background: rgba(var(--sunken-rgb), .52);
    color: var(--color-text-bright);
  }
</style>


