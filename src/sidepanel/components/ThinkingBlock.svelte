<script>
  import { Brain, ChevronDown } from "lucide-svelte";

  let { thinking, streaming = false } = $props();
  let expanded = $state(true);
</script>

{#if thinking}
  <div class="thinking-block" class:streaming>
    <button class="thinking-header" onclick={() => (expanded = !expanded)}>
      <div class="flex items-center gap-1.5">
        <Brain size={12} class="thinking-icon" />
        <span class="thinking-label">思考过程</span>
        {#if streaming}<span class="thinking-pulse"></span>{/if}
      </div>
      <ChevronDown size={12} class="thinking-chevron {expanded ? 'expanded' : ''}" />
    </button>
    {#if expanded}
      <div class="thinking-content">{thinking}</div>
    {/if}
  </div>
{/if}

<style>
  .thinking-block {
    margin-bottom: 6px;
    border: 1px solid rgba(var(--purple-rgb), 0.28);
    border-radius: var(--radius-sm);
    background: rgba(var(--purple-rgb), 0.05);
    overflow: hidden;
  }
  .thinking-block.streaming {
    border-color: rgba(var(--purple-rgb), 0.42);
    background: rgba(var(--purple-rgb), 0.08);
  }
  .thinking-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    padding: 5px 8px;
    cursor: pointer;
    transition: background 0.15s var(--ease-out);
  }
  .thinking-header:hover { background: rgba(var(--purple-rgb), 0.08); }
  .thinking-block :global(.thinking-icon) { color: #b394f4; }
  .thinking-label {
    font-size: 10px;
    font-weight: 600;
    color: #b394f4;
    letter-spacing: 0.04em;
  }
  .thinking-pulse {
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: #b394f4;
    animation: pulse 1.4s ease-in-out infinite;
  }
  .thinking-block :global(.thinking-chevron) {
    color: var(--color-text-muted);
    transition: transform 0.2s var(--ease-out);
  }
  .thinking-block :global(.thinking-chevron.expanded) { transform: rotate(180deg); }
  .thinking-content {
    max-height: 400px;
    overflow-y: auto;
    padding: 6px 8px;
    border-top: 1px solid rgba(var(--purple-rgb), 0.15);
    color: var(--color-text-secondary);
    font-family: var(--font-mono);
    font-size: 11px;
    line-height: 1.6;
    white-space: pre-wrap;
    word-break: break-word;
  }
  @keyframes pulse {
    0%, 100% { opacity: 0.4; }
    50% { opacity: 1; }
  }
</style>
