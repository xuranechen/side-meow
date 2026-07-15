<script>
  import { API_TYPES } from "../../lib/constants.js";
  import { MessageSquare, Link, Pencil, Trash2, GripVertical, Loader2 } from "lucide-svelte";

  let { provider, onEdit, onDelete, onChat, onTest } = $props();
  let apiType = $derived(API_TYPES[provider.type] || API_TYPES.openai);
  let modelNames = $derived(
    (provider.models || []).map((model) => model.name || model.id).filter(Boolean)
  );
  let visibleModels = $derived(modelNames.slice(0, 3));
  let remainingModelCount = $derived(Math.max(0, modelNames.length - visibleModels.length));
  let modelText = $derived(modelNames.join(" \u00b7 "));
  let modelCountText = $derived(`${modelNames.length} \u4e2a\u6a21\u578b`);
  const emptyModelText = "\u6682\u65e0\u53ef\u7528\u6a21\u578b";

  const typeLabels = { openai: "OAI", anthropic: "ANT", gemini: "GEM" };

  function timeAgo(ts) {
    if (!ts) return "";
    const diff = Math.floor((Date.now() - ts) / 1000);
    if (diff < 60) return `${diff}秒前`;
    if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
    return `${Math.floor(diff / 86400)}天前`;
  }

  let healthLevel = $derived((() => {
    const hc = provider.healthCheck;
    if (!hc || hc.status === "testing") return "none";
    if (hc.status === "error") return "fail";
    if (hc.latency >= 2000) return "slow";
    return "ok";
  })());

  let healthColor = $derived((() => {
    const map = { ok: "183,234,212", slow: "241,217,115", fail: "244,119,136", none: null };
    return map[healthLevel];
  })());
</script>

<div
  class="provider-card card {healthLevel !== 'none' ? `health-${healthLevel}` : ''}"
  style="--accent: {apiType.color};{healthColor ? ` --hc: ${healthColor};` : ''}"
>
  <span class="corner corner-top"></span>
  <span class="corner corner-bottom"></span>

  <div class="provider-head">
    <div class="type-mark" style="--accent: {apiType.color};">
      <span>{typeLabels[provider.type] || "—"}</span>
      <i></i>
    </div>

    <div class="min-w-0 flex-1">
      <div class="flex items-center gap-2 min-w-0">
        <h3 class="provider-name">{provider.name}</h3>
      </div>
      <div class="endpoint-row">
        <span>ENDPOINT</span>
        <p>{provider.baseUrl}</p>
      </div>
    </div>

    <div class="drag-handle" title="拖动排序">
      <GripVertical size={15} />
    </div>
  </div>

  {#if provider.healthCheck}
    <div class="health-row">
      {#if provider.healthCheck.status === "testing"}
        <span class="health-dot health-dot-testing"></span>
        <span class="health-text">检测中...</span>
      {:else if provider.healthCheck.status === "ok"}
        <span class="health-dot health-dot-ok"></span>
        <span class="health-text">{provider.healthCheck.latency}ms</span>
        {#if provider.healthCheck.latency >= 2000}
          <span class="health-tag health-tag-slow">慢</span>
        {/if}
      {:else}
        <span class="health-dot health-dot-error"></span>
        <span class="health-text health-error-text">{provider.healthCheck.error || "连接失败"}</span>
      {/if}
      <span class="health-time">{timeAgo(provider.healthCheck.lastCheck)}</span>
    </div>
  {/if}

  <div class="model-summary" title={modelText || emptyModelText}>
    <span class="model-count">{modelCountText}</span>
    <div class="model-list">
      {#if visibleModels.length > 0}
        {#each visibleModels as model}
          <span class="model-name" title={model}>{model}</span>
        {/each}
        {#if remainingModelCount > 0}
          <span class="model-more">+{remainingModelCount}</span>
        {/if}
      {:else}
        <span class="model-empty">{emptyModelText}</span>
      {/if}
    </div>
  </div>

  <div class="provider-actions">
    <button class="action-btn action-primary" onclick={(e) => { e.stopPropagation(); onChat(); }}>
      <MessageSquare size={12} /> 对话
    </button>
    <button class="action-btn" onclick={(e) => { e.stopPropagation(); onTest(); }}>
      <Link size={12} /> 测试
    </button>
    <button class="action-btn hide-compact" onclick={(e) => { e.stopPropagation(); onEdit(); }}>
      <Pencil size={12} /> 编辑
    </button>
    <div class="flex-1"></div>
    <button class="action-btn danger" onclick={(e) => { e.stopPropagation(); onDelete(); }} aria-label="删除">
      <Trash2 size={12} />
    </button>
  </div>
</div>

<style>
  .provider-card {
    position: relative;
    overflow: hidden;
    padding: 9px 10px;
    border-radius: var(--radius-lg);
    border: 1px solid var(--color-card-border);
    background:
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
    backdrop-filter: blur(18px) saturate(115%);
    -webkit-backdrop-filter: blur(18px) saturate(115%);
    transition: transform .18s var(--ease-out), border-color .18s var(--ease-out), box-shadow .18s var(--ease-out), background .18s var(--ease-out);
  }
  .provider-card:hover {
    transform: translateY(-1px);
    box-shadow: 0 16px 34px rgba(0,0,0,.24), inset 0 1px 0 rgba(var(--overlay-rgb), 0.08);
  }
  .provider-card.health-ok {
    border-color: rgba(183,234,212, .30);
    background:
      linear-gradient(180deg, rgba(183,234,212, .06), rgba(183,234,212, .02)),
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
  }
  .provider-card.health-ok:hover {
    border-color: rgba(183,234,212, .50);
    background:
      linear-gradient(180deg, rgba(183,234,212, .09), rgba(183,234,212, .03)),
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
  }
  .provider-card.health-slow {
    border-color: rgba(241,217,115, .30);
    background:
      linear-gradient(180deg, rgba(241,217,115, .06), rgba(241,217,115, .02)),
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
  }
  .provider-card.health-slow:hover {
    border-color: rgba(241,217,115, .50);
    background:
      linear-gradient(180deg, rgba(241,217,115, .09), rgba(241,217,115, .03)),
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
  }
  .provider-card.health-fail {
    border-color: rgba(244,119,136, .30);
    background:
      linear-gradient(180deg, rgba(244,119,136, .06), rgba(244,119,136, .02)),
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
  }
  .provider-card.health-fail:hover {
    border-color: rgba(244,119,136, .50);
    background:
      linear-gradient(180deg, rgba(244,119,136, .09), rgba(244,119,136, .03)),
      linear-gradient(180deg, rgba(var(--overlay-rgb), 0.045), rgba(var(--overlay-rgb), 0.016)),
      rgba(var(--overlay-rgb), 0.026);
  }
  .provider-card:hover :global(.drag-handle) { opacity: 1; }
  .provider-head { position: relative; z-index: 1; display: flex; align-items: center; gap: 8px; }
  .type-mark {
    position: relative;
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    flex: 0 0 auto;
    color: var(--accent);
    border: 1px solid color-mix(in srgb, var(--accent) 34%, var(--line));
    background: color-mix(in srgb, var(--accent) 10%, rgba(var(--overlay-rgb), 0.045));
    border-radius: 8px;
    font-family: var(--font-mono);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: .06em;
  }
  .provider-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-bright); font-family: var(--font-display); font-size: 14px; font-weight: 650; letter-spacing: .01em; }
  .endpoint-row { display: flex; align-items: center; gap: 6px; min-width: 0; margin-top: 2px; }
  .endpoint-row span { flex: 0 0 auto; color: var(--color-text-muted); font-family: var(--font-mono); font-size: 7px; letter-spacing: .13em; }
  .endpoint-row p { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-secondary); font-family: var(--font-mono); font-size: 10px; }

  .health-row { display: flex; align-items: center; gap: 5px; margin-top: 5px; }
  .health-dot { width: 6px; height: 6px; border-radius: 50%; flex: 0 0 auto; }
  .health-dot-ok { background: var(--color-success); box-shadow: 0 0 6px rgba(52, 211, 153, .5); }
  .health-dot-error { background: var(--color-error); box-shadow: 0 0 6px rgba(239, 68, 68, .5); }
  .health-dot-testing { background: var(--color-warning); animation: pulse 1s infinite; }
  .health-text { font-family: var(--font-mono); font-size: 10px; color: var(--color-text-muted); }
  .health-error-text { color: var(--color-error); max-width: 160px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .health-time { margin-left: auto; font-family: var(--font-mono); font-size: 9px; color: var(--color-text-muted); opacity: .6; }
  .health-tag { padding: 0 4px; border-radius: 3px; font-size: 9px; font-weight: 600; }
  .health-tag-slow { background: rgba(241,217,115,.15); color: #f1d973; border: 1px solid rgba(241,217,115,.30); }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: .4; } }

  .drag-handle { z-index: 2; flex: 0 0 auto; opacity: .28; color: var(--color-text-muted); transition: opacity .18s ease, color .18s ease; }
  .drag-handle:hover { color: var(--color-primary); }
  .model-summary { position: relative; z-index: 1; display: flex; align-items: center; min-width: 0; gap: 6px; margin-top: 6px; font-size: 10px; line-height: 18px; }
  .model-count { flex: 0 0 auto; padding: 0 5px; color: var(--color-primary-hover); border: 1px solid rgba(var(--accent-rgb), .22); border-radius: 5px; background: rgba(var(--accent-rgb), .07); font-weight: 600; }
  .model-list { display: flex; align-items: center; min-width: 0; gap: 4px; overflow: hidden; }
  .model-name { flex: 0 1 auto; min-width: 36px; max-width: 92px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; padding: 0 5px; color: var(--color-text-secondary); border: 1px solid var(--color-border); border-radius: 5px; background: rgba(var(--sunken-rgb), .46); }
  .model-more { flex: 0 0 auto; color: var(--color-primary); font-weight: 600; }
  .model-empty { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--color-text-muted); }
  .provider-actions { position: relative; z-index: 2; display: flex; align-items: center; gap: 4px; margin-top: 6px; padding-top: 6px; border-top: 1px solid var(--color-border); }
  .action-btn { display: flex; align-items: center; gap: 5px; min-height: 27px; padding: 4px 7px; border: 1px solid var(--color-border); border-radius: 7px; color: var(--color-text-secondary); font-size: 10px; transition: color .16s var(--ease-out), background .16s var(--ease-out), border-color .16s var(--ease-out); }
  .action-btn:hover { color: var(--color-primary-hover); border-color: var(--color-border-hover); background: var(--color-primary-muted); }
  .action-primary { color: var(--color-primary-hover); border-color: rgba(var(--accent-rgb), .5); background: rgba(var(--accent-rgb), .10); font-weight: 700; }
  .action-primary:hover { color: var(--color-primary-hover); border-color: rgba(var(--accent-rgb), .68); background: rgba(var(--accent-rgb), .14); }
  .danger:hover { color: var(--color-error); border-color: rgba(var(--red-rgb),.5); background: rgba(var(--red-rgb),.08); }
</style>
