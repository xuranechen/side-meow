<script>
  import { X, Plus, MessageSquare } from "lucide-svelte";

  let { sessions, activeSessionId, onSelect, onDelete, onNew } = $props();

  function formatDate(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now - date;

    if (diff < 60000) return "刚刚";
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分钟前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}小时前`;

    return date.toLocaleDateString("zh-CN", {
      month: "short",
      day: "numeric",
    });
  }
</script>

<div class="session-drawer border-b border-[var(--color-border)] max-h-52 overflow-y-auto">
  <div class="p-2">
    <div class="flex items-center justify-between mb-2 px-2">
      <span class="text-[11px] font-medium text-[var(--color-text-muted)] flex items-center gap-1.5">
        <MessageSquare size={11} />
        历史会话
      </span>
      <button
        class="text-[11px] text-[var(--color-primary)] hover:underline flex items-center gap-0.5"
        onclick={onNew}
      >
        <Plus size={10} />
        新建
      </button>
    </div>

    {#if sessions.length === 0}
      <p class="text-[11px] text-[var(--color-text-muted)] px-2 py-4 text-center">暂无会话</p>
    {:else}
      <div class="space-y-0.5">
        {#each sessions as session}
          <div
            class="w-full text-left px-3 py-2 rounded-md transition-colors cursor-pointer {session.id === activeSessionId ? 'bg-[var(--color-primary-muted)]' : 'hover:bg-[var(--color-bg-tertiary)]'}"
            onclick={() => onSelect(session.id)}
            onkeydown={(e) => e.key === "Enter" && onSelect(session.id)}
            role="button"
            tabindex="0"
          >
            <div class="flex items-center justify-between">
              <span class="text-[12px] truncate flex-1 {session.id === activeSessionId ? 'text-[var(--color-primary)] font-medium' : 'text-[var(--color-text)]'}">
                {session.title}
              </span>
              <button
                class="p-1 text-[var(--color-text-muted)] hover:text-[var(--color-error)] transition-colors"
                onclick={(e) => { e.stopPropagation(); onDelete(session.id); }}
                aria-label="删除会话"
              >
                <X size={12} />
              </button>
            </div>
            <div class="text-[10px] text-[var(--color-text-muted)] mt-0.5">
              {formatDate(session.updatedAt)}
            </div>
          </div>
        {/each}
      </div>
    {/if}
  </div>
</div>

<style>
  .session-drawer { background: linear-gradient(180deg, rgba(var(--overlay-rgb), .045), rgba(var(--overlay-rgb), .016)), rgba(var(--glass-rgb), .82); box-shadow: inset 0 -1px 0 rgba(var(--accent-rgb), .08), 0 14px 30px rgba(0,0,0,.22); backdrop-filter: blur(22px) saturate(115%); -webkit-backdrop-filter: blur(22px) saturate(115%); }
</style>
