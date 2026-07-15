<script>
  import { ChevronDown } from "lucide-svelte";

  let { models = [], value = $bindable("") } = $props();

  let open = $state(false);
  let triggerEl = $state(null);
  let menuPos = $state({ top: 0, right: 0 });

  let selectedLabel = $derived(
    models.find((m) => m.id === value)?.name || value || "未选择"
  );

  function toggle() {
    if (!open && triggerEl) {
      const r = triggerEl.getBoundingClientRect();
      menuPos = { top: r.bottom + 4, right: window.innerWidth - r.right };
    }
    open = !open;
  }

  function select(val) {
    value = val;
    open = false;
  }

  function close() {
    open = false;
  }
</script>

{#if models.length > 1}
  <button
    bind:this={triggerEl}
    class="model-select-trigger"
    onclick={toggle}
    aria-haspopup="listbox"
    aria-expanded={open}
  >
    <span>{selectedLabel}</span>
    <ChevronDown size={10} style="color: var(--color-text-muted); flex: 0 0 auto;" />
  </button>

  {#if open}
    <div
      class="model-select-backdrop"
      onclick={close}
      onkeydown={(e) => e.key === "Escape" && close()}
      role="button"
      tabindex="-1"
      aria-label="关闭"
    ></div>
    <div
      class="model-select-menu"
      style="top: {menuPos.top}px; right: {menuPos.right}px;"
      role="listbox"
    >
      {#each models as m}
        <button
          class:active={m.id === value}
          role="option"
          aria-selected={m.id === value}
          onclick={() => select(m.id)}
        >
          {m.name || m.id}
        </button>
      {/each}
    </div>
  {/if}
{:else}
  <span class="model-select-single">{selectedLabel}</span>
{/if}

<style>
  .model-select-trigger {
    display: inline-flex;
    max-width: 140px;
    min-width: 0;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding: 0 6px !important;
    min-height: 26px;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: rgba(var(--sunken-rgb), .58);
    color: var(--color-text-bright);
    font-size: 10px;
    font-family: var(--font-mono);
    line-height: 1.2;
    transition: border-color .16s var(--ease-out), background .16s var(--ease-out);
  }
  .model-select-trigger:hover,
  .model-select-trigger:focus-visible {
    border-color: rgba(var(--accent-rgb), .42);
    background: rgba(var(--sunken-rgb), .72);
  }
  .model-select-trigger span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .model-select-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
  }
  .model-select-menu {
    position: fixed;
    z-index: 100;
    display: grid;
    min-width: 88px;
    max-height: 200px;
    overflow-y: auto;
    padding: 3px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: rgb(31, 35, 41);
    box-shadow: var(--shadow-elevated);
  }
  .model-select-menu button {
    width: 100%;
    padding: 4px 7px;
    border-radius: var(--radius-sm);
    color: #ffffff;
    font-family: var(--font-mono);
    font-size: 10px;
    text-align: left;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .model-select-menu button:hover,
  .model-select-menu button.active {
    background: rgba(var(--accent-rgb), .12);
    color: #ffffff;
  }
  .model-select-single {
    color: var(--color-text-muted);
    font-size: 10px;
    font-family: var(--font-mono);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
