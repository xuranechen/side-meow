<script>
  import { marked } from "marked";
  import hljs from "../../lib/highlight.js";
  import { settings } from "../stores/settings.js";
  import ThinkingBlock from "./ThinkingBlock.svelte";
  import WebSearchBlock from "./WebSearchBlock.svelte";
  import { Copy, RefreshCw, Check, Wrench } from "lucide-svelte";

  let { message, onCopy, onRegenerate } = $props();

  let isUser = $derived(message.role === "user");
  let isAssistant = $derived(message.role === "assistant");
  let isStreaming = $derived(message.metadata?.streaming);
  let copied = $state(false);

  const HTML_TAGS = new Set([
    "p","div","span","a","img","h1","h2","h3","h4","h5","h6","ul","ol","li",
    "table","tr","td","th","thead","tbody","tfoot","blockquote","pre","code",
    "em","strong","b","i","u","s","strike","br","hr","sub","sup","mark","small",
    "del","ins","abbr","cite","dl","dt","dd","figure","figcaption","details",
    "summary","button","form","input","select","option","textarea","label",
    "video","audio","source","iframe","svg","path","style","script","html",
    "head","body","title","meta","link",
  ]);

  function escapeXmlTags(content) {
    return content.replace(/<\/?([a-zA-Z][\w-]*)\b[^>]*>/g, (match, tag) => {
      if (HTML_TAGS.has(tag.toLowerCase())) return match;
      return match.replace(/</g, "&lt;").replace(/>/g, "&gt;");
    });
  }

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
    isAssistant ? marked(escapeXmlTags(message.content || "")) : message.content
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
      {#if message.thinkingSegments?.length || message._thinking}
        {#each (message.thinkingSegments || []) as segment, i}
          <ThinkingBlock thinking={segment} />
        {/each}
        {#if message._thinking && (isStreaming || !message.thinkingSegments?.length)}
          <ThinkingBlock thinking={message._thinking} streaming={isStreaming} />
        {/if}
      {/if}
      <WebSearchBlock calls={message.webSearchCalls || []} streaming={isStreaming} />

      {#if message.toolCalls?.length}
        <div class="tool-calls-block">
          {#each message.toolCalls as tc}
            <div class="tool-call-row">
              <Wrench size={10} class="tool-call-icon" />
              <span class="tool-call-name">{tc.name || "tool"}</span>
              <span class="tool-call-args">{tc.arguments}</span>
            </div>
          {/each}
        </div>
      {/if}
      {#if renderedContent.trim() || isStreaming}
        <div class="prose prose-sm dark:prose-invert max-w-none break-words text-[13px]">
          {#if renderedContent.trim()}
            {@html renderedContent}
          {/if}
          {#if isStreaming}
            <span class="inline-block w-1.5 h-3.5 bg-[var(--color-primary)] animate-pulse ml-0.5 rounded-sm"></span>
          {/if}
        </div>
      {/if}
      {#if message.metadata?.error && !isStreaming}
        <div class="error-banner">
          <span class="error-banner-label">请求出错</span>
          <span class="error-banner-msg">{message.metadata.error}</span>
        </div>
      {/if}
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
          <span class="text-[var(--color-error)]" title={message.metadata.error}>
            失败{message.metadata.statusCode ? ` · ${message.metadata.statusCode}` : ""}
          </span>
        {:else if message.metadata.cancelled}
          <span class="text-[var(--color-warning)]">已停止</span>
        {:else if message.metadata.interrupted}
          <span class="text-[var(--color-warning)]" title="流式响应被中断，仅保留已接收部分">已中断</span>
        {:else if message.metadata.incomplete}
          <span class="text-[var(--color-warning)]" title={message.metadata.incompleteReason || "上游未返回完整内容"}>未完整生成</span>
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
          title={copied ? "已复制" : "复制"}
          aria-label={copied ? "已复制" : "复制"}
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
            title="重新生成"
            aria-label="重新生成"
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
  .tool-calls-block {
    margin-bottom: 6px;
    border: 1px solid rgba(var(--orange-rgb), 0.25);
    border-radius: var(--radius-sm);
    background: rgba(var(--orange-rgb), 0.04);
    overflow: hidden;
  }
  .tool-call-row {
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 8px;
    font-size: 11px;
    font-family: var(--font-mono);
    color: var(--color-text-secondary);
    border-bottom: 1px solid rgba(var(--orange-rgb), 0.1);
  }
  .tool-call-row:last-child {
    border-bottom: none;
  }
  .tool-calls-block :global(.tool-call-icon) {
    color: #f4a073;
    flex-shrink: 0;
  }
  .tool-call-name {
    font-weight: 600;
    color: #f4a073;
    flex-shrink: 0;
  }
  .tool-call-args {
    color: var(--color-text-muted);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .error-banner {
    display: flex;
    align-items: baseline;
    gap: 6px;
    margin-top: 6px;
    padding: 6px 8px;
    border: 1px solid rgba(var(--red-rgb), 0.28);
    border-radius: var(--radius-sm);
    background: rgba(var(--red-rgb), 0.06);
  }
  .error-banner-label {
    flex-shrink: 0;
    font-size: 10px;
    font-weight: 600;
    color: var(--color-error);
    letter-spacing: 0.04em;
  }
  .error-banner-msg {
    font-size: 11px;
    color: var(--color-text-secondary);
    word-break: break-word;
  }
</style>
