<script>
  import hljs from "../../lib/highlight.js";
  import { Copy, Check } from "lucide-svelte";

  let { code, language } = $props();

  let copied = $state(false);

  let highlighted = $derived(() => {
    if (language && hljs.getLanguage(language)) {
      try {
        return hljs.highlight(code, { language }).value;
      } catch {}
    }
    try {
      return hljs.highlightAuto(code).value;
    } catch {
      return code;
    }
  });

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(code);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    } catch {
      const textarea = document.createElement("textarea");
      textarea.value = code;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      copied = true;
      setTimeout(() => (copied = false), 2000);
    }
  }
</script>

<div class="relative group my-2 rounded-md border border-[var(--color-border)]" style="background: var(--color-bg-tertiary);">
  <div class="flex items-center justify-between px-4 py-2 border-b border-[var(--color-border)]">
    <span class="text-[10px] text-[var(--color-text-muted)]" style="font-family: var(--font-mono); letter-spacing: 0.02em;">{language || "代码"}</span>
    <button
      class="text-[10px] px-2 py-1 rounded-sm hover:bg-[var(--color-border)] transition-colors flex items-center gap-1 {copied ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'}"
      onclick={handleCopy}
    >
      {#if copied}
        <Check size={10} />
        已复制
      {:else}
        <Copy size={10} />
        复制
      {/if}
    </button>
  </div>
  <pre class="p-4 overflow-x-auto" style="margin: 0;"><code class="text-[12px]" style="font-family: var(--font-mono);">{@html highlighted()}</code></pre>
</div>
