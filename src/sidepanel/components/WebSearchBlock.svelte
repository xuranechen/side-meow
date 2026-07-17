<script>
  import { Search, ChevronDown, ExternalLink } from "lucide-svelte";

  let { calls = [], streaming = false } = $props();
  let expanded = $state(false);
  let sourceCount = $derived(new Set(calls.flatMap((call) => (call.sources || []).map((source) => source.url))).size);

  function actionLabel(type) {
    if (type === "open_page") return "打开页面";
    if (type === "find_in_page") return "页内查找";
    return "搜索";
  }

  function sourceLabel(url) {
    try {
      return new URL(url).hostname.replace(/^www\./, "");
    } catch {
      return url;
    }
  }
</script>

{#if calls.length > 0}
  <div class="search-block" class:streaming>
    <button class="search-header" onclick={() => (expanded = !expanded)}>
      <div class="flex items-center gap-1.5 min-w-0">
        <Search size={12} class="search-icon" />
        <span class="search-label">联网搜索</span>
        <span class="search-count">{calls.length} 次{sourceCount ? ` · ${sourceCount} 个来源` : ""}</span>
        {#if streaming}<span class="search-pulse"></span>{/if}
      </div>
      <ChevronDown size={12} class="search-chevron {expanded ? 'expanded' : ''}" />
    </button>

    {#if expanded}
      <div class="search-content">
        {#each calls as call}
          <div class="search-call">
            <div class="search-query">
              <span class="action-label">{actionLabel(call.actionType)}</span>
              <span>{call.query || call.url || "搜索详情"}</span>
            </div>
            {#if call.sources?.length}
              <div class="source-list">
                {#each call.sources.slice(0, 4) as source}
                  <a href={source.url} target="_blank" rel="noreferrer" title={source.url}>
                    {sourceLabel(source.url)}
                    <ExternalLink size={8} />
                  </a>
                {/each}
                {#if call.sources.length > 4}
                  <span class="more-sources">+{call.sources.length - 4}</span>
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .search-block {
    margin-bottom: 6px;
    border: 1px solid rgba(var(--blue-rgb), 0.28);
    border-radius: var(--radius-sm);
    background: rgba(var(--blue-rgb), 0.05);
    overflow: hidden;
  }
  .search-block.streaming { border-color: rgba(var(--blue-rgb), 0.44); }
  .search-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 8px;
    cursor: pointer;
  }
  .search-header:hover { background: rgba(var(--blue-rgb), 0.08); }
  .search-block :global(.search-icon) { color: #73bdf5; flex-shrink: 0; }
  .search-label { color: #73bdf5; font-size: 10px; font-weight: 600; letter-spacing: 0.04em; }
  .search-count { color: var(--color-text-muted); font-size: 9px; white-space: nowrap; }
  .search-pulse {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #73bdf5;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .search-block :global(.search-chevron) {
    color: var(--color-text-muted);
    flex-shrink: 0;
    transition: transform 0.2s var(--ease-out);
  }
  .search-block :global(.search-chevron.expanded) { transform: rotate(180deg); }
  .search-content { max-height: 360px; overflow-y: auto; border-top: 1px solid rgba(var(--blue-rgb), 0.15); }
  .search-call { padding: 6px 8px; border-bottom: 1px solid rgba(var(--blue-rgb), 0.09); }
  .search-call:last-child { border-bottom: 0; }
  .search-query { display: flex; gap: 6px; color: var(--color-text-secondary); font-size: 10px; line-height: 1.5; }
  .action-label { color: #73bdf5; font-weight: 600; flex-shrink: 0; }
  .source-list { display: flex; flex-wrap: wrap; gap: 4px; margin-top: 4px; }
  .source-list a {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    max-width: 130px;
    padding: 1px 4px;
    border: 1px solid rgba(var(--blue-rgb), 0.18);
    border-radius: 3px;
    color: var(--color-text-muted);
    font-size: 9px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .source-list a:hover { color: #73bdf5; border-color: rgba(var(--blue-rgb), 0.4); }
  .more-sources { color: var(--color-text-muted); font-size: 9px; padding: 1px 2px; }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
