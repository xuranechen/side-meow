<script>
  import { marked } from "marked";
  import hljs from "../../lib/highlight.js";
  import { settings } from "../stores/settings.js";
  import { Copy, RefreshCw, Check } from "lucide-svelte";

  let { message, onCopy, onRegenerate, apiType } = $props();

  let isUser = $derived(message.role === "user");
  let isAssistant = $derived(message.role === "assistant");
  let isStreaming = $derived(message.metadata?.streaming);
  let copied = $state(false);

  marked.setOptions({
    highlight: function(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {}
      }
      return hljs.highlightAuto(code).value;
    },
    breaks: true,
    gfm: true,
  });

  let renderedContent = $derived(
    isAssistant ? marked(message.content || "") : message.content
  );


  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.content);
      copied = true;
      setTimeout(() => (copied = false), 2000);
      if (onCopy) onCopy();
    } catch {}
  }
</script>

<div class="message-row flex {isUser ? 'justify-end' : 'justify-start'} animate-slide-up">
  <div class="message-bubble max-w-[90%] {isUser ? 'chat-user' : 'chat-assistant'}">
    {#if isAssistant}
      <div class="flex items-center gap-1.5 mb-1.5">
        <span class="w-1.5 h-1.5 rounded-full" style="background: var(--color-accent);"></span>
        <span class="text-[10px] font-medium text-[var(--color-text-secondary)]" style="letter-spacing: 0.04em;">回复</span>
      </div>
      <div class="prose prose-sm dark:prose-invert max-w-none break-words text-[13px]">
        {@html renderedContent}
        {#if isStreaming}
          <span class="inline-block w-1.5 h-3.5 bg-[var(--color-primary)] animate-pulse ml-0.5 rounded-sm"></span>
        {/if}
      </div>
    {:else}
      <div class="flex items-center gap-1.5 mb-1.5">
        <span class="w-1.5 h-1.5 rounded-full" style="background: var(--color-primary);"></span>
        <span class="text-[10px] font-medium text-[var(--color-text-secondary)]" style="letter-spacing: 0.04em;">用户</span>
      </div>
      <p class="whitespace-pre-wrap break-words text-[13px] text-[var(--color-text-bright)]">{message.content}</p>
    {/if}

    {#if message.metadata && !isStreaming}
      <div class="mt-2 pt-2 border-t border-[var(--color-border)] flex flex-wrap items-center gap-2.5 text-[10px] text-[var(--color-text-muted)]" style="font-family: var(--font-mono); letter-spacing: 0.02em;">
        {#if $settings.showTiming && message.metadata.firstTokenMs != null}
          <span>首字 {message.metadata.firstTokenMs}ms</span>
        {/if}
        {#if $settings.showTiming && message.metadata.totalMs != null}
          <span>完成 {(message.metadata.totalMs / 1000).toFixed(1)}s</span>
        {/if}
        {#if !$settings.showTiming && message.metadata.responseTimeMs}
          <span>{message.metadata.responseTimeMs}ms</span>
        {/if}

        {#if message.metadata.tokenUsage && $settings.showTokenCount}
          <span>入{message.metadata.tokenUsage.promptTokens} 出{message.metadata.tokenUsage.completionTokens}</span>
        {/if}

        {#if message.metadata.model}
          <span class="px-1 py-0.5 rounded-sm bg-[var(--color-bg-tertiary)] text-[9px]">
            {message.metadata.model}
          </span>
        {/if}

        {#if message.metadata.error}
          <span class="text-[var(--color-error)]">失败</span>
        {:else if message.metadata.cancelled}
          <span class="text-[var(--color-warning)]">已停止</span>
        {:else}
          <span class="text-[var(--color-success)]">完成</span>
        {/if}
      </div>
    {/if}

    {#if !isStreaming && (onCopy || onRegenerate)}
      <div class="message-actions" class:user-actions={isUser}>
        <button
          class="message-action-btn"
          onclick={handleCopy}
          title={copied ? "???" : "??"}
          aria-label={copied ? "???" : "??"}
        >
          {#if copied}
            <Check size={12} />
          {:else}
            <Copy size={12} />
          {/if}
        </button>
        {#if onRegenerate}
          <button
            class="message-action-btn"
            onclick={onRegenerate}
            title="????"
            aria-label="????"
          >
            <RefreshCw size={12} />
          </button>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  .message-row { position: relative; }
  .message-bubble {
    position: relative;
    overflow: hidden;
    padding: 5px !important;
    border-radius: var(--radius-sm) !important;
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }
  .message-bubble.chat-user {
    border-color: rgba(var(--accent-rgb), .36);
  }
  .message-bubble.chat-assistant {
    border-color: rgba(var(--blue-rgb), .30);
  }
  .message-actions {
    display: flex;
    align-items: center;
    gap: 3px;
    margin-top: 3px;
    min-height: 20px;
  }
  .message-actions.user-actions {
    justify-content: flex-end;
  }
  .message-action-btn {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm);
    color: var(--color-text-muted);
    background: rgba(var(--sunken-rgb), .28);
    transition: color .16s var(--ease-out), border-color .16s var(--ease-out), background .16s var(--ease-out);
  }
  .message-action-btn:hover {
    color: var(--color-primary-hover);
    border-color: rgba(var(--accent-rgb), .42);
    background: rgba(var(--accent-rgb), .08);
  }
</style>
