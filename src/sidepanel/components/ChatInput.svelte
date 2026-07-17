<script>
  import { Send, Square } from "lucide-svelte";

  let { disabled, streaming, onSend, onStop } = $props();

  let content = $state("");
  let textarea = $state(null);

  function handleKeydown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  function handleSend() {
    const trimmed = content.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    content = "";

    if (textarea) {
      textarea.style.height = "auto";
    }
  }

  function handleInput() {
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = Math.min(textarea.scrollHeight, 120) + "px";
    }
  }
</script>

<footer class="chat-composer border-t glass">
  <div class="flex items-end gap-2">
    <textarea
      bind:this={textarea}
      bind:value={content}
      onkeydown={handleKeydown}
      oninput={handleInput}
      placeholder={streaming ? "正在生成中…" : disabled ? "请先选择接口..." : "输入消息，回车发送…"}
      {disabled}
      rows="1"
      class="composer-input resize-none min-h-[44px] max-h-[120px] w-full"
      style="padding: 10px 12px; font-size: 13px; border-radius: var(--radius-md);"
    ></textarea>

    {#if streaming}
      <button
        class="stop-btn flex-shrink-0 transition-all active:translate-y-px"
        onclick={onStop}
        title="停止"
      >
        <Square size={14} fill="currentColor" />
      </button>
    {:else}
      <button
        class="send-btn flex-shrink-0 transition-all active:translate-y-px"
        class:active={content.trim() && !disabled}
        onclick={handleSend}
        disabled={!content.trim() || disabled}
        title="发送"
      >
        <Send size={15} />
      </button>
    {/if}
  </div>
  <div class="composer-meta">
    <span><i></i>{streaming ? "正在生成…" : disabled ? "未选择接口" : "接口已就绪"}</span>
    <span>回车发送 · Shift + 回车换行</span>
  </div>
</footer>

<style>
  .send-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: var(--color-bg-tertiary);
    color: var(--color-text-muted);
    border: 1px solid var(--color-border);
  }
  .send-btn.active {
    background: rgba(var(--accent-rgb), .10);
    color: var(--color-primary-hover);
    border-color: rgba(var(--accent-rgb), .58);
    box-shadow: var(--glow-primary);
  }
  .send-btn.active:hover {
    background: rgba(var(--accent-rgb), .14);
  }
  .send-btn:disabled {
    cursor: default;
  }
  .stop-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 10px;
    background: rgba(var(--orange-rgb), 0.14);
    color: var(--color-warning);
    border: 1px solid rgba(var(--orange-rgb), 0.38);
  }
  .stop-btn:hover {
    background: rgba(var(--orange-rgb), 0.22);
  }
  .chat-composer {
    padding: 11px 12px 9px;
    border-color: var(--color-border);
    background: rgba(var(--glass-rgb), 0.82);
    backdrop-filter: blur(22px) saturate(115%);
    -webkit-backdrop-filter: blur(22px) saturate(115%);
  }
  .composer-input {
    border-color: var(--color-border);
    background: rgba(var(--sunken-rgb), 0.42);
  }
  .composer-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-top: 6px;
    color: var(--color-text-muted);
    font-family: var(--font-mono);
    font-size: 8px;
    letter-spacing: .06em;
  }
  .composer-meta span:first-child { display: flex; align-items: center; gap: 5px; color: var(--color-primary-dim); }
  .composer-meta i { width: 4px; height: 4px; border-radius: 50%; background: var(--color-success); }
</style>





