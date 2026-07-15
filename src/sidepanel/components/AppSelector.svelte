<script>
  import { ChevronDown } from "lucide-svelte";
  import { CCSwitchMapper } from "../../lib/ccswitch/mapper.js";

  let { value = $bindable("claude") } = $props();

  const apps = CCSwitchMapper.CC_SWITCH_APPS;
  let open = $state(false);
  let triggerEl = $state(null);
  let menuPos = $state({ top: 0, right: 0 });

  let selectedLabel = $derived(
    apps.find((a) => a.value === value)?.label || value
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

<button
  bind:this={triggerEl}
  class="app-selector-trigger"
  onclick={toggle}
  aria-haspopup="listbox"
  aria-expanded={open}
>
  <span>{selectedLabel}</span>
  <ChevronDown size={10} style="color: var(--color-text-muted); flex: 0 0 auto;" />
</button>

{#if open}
  <div
    class="app-selector-backdrop"
    onclick={close}
    onkeydown={(e) => e.key === "Escape" && close()}
    role="button"
    tabindex="-1"
    aria-label="关闭"
  ></div>
  <div
    class="app-selector-menu"
    style="top: {menuPos.top}px; right: {menuPos.right}px;"
    role="listbox"
  >
    {#each apps as app}
      <button
        class:active={app.value === value}
        role="option"
        aria-selected={app.value === value}
        onclick={() => select(app.value)}
      >
        {app.label}
      </button>
    {/each}
  </div>
{/if}

<style>
  .app-selector-trigger {
    display: inline-flex;
    min-width: 88px;
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
  .app-selector-trigger:hover,
  .app-selector-trigger:focus-visible {
    border-color: rgba(var(--accent-rgb), .42);
    background: rgba(var(--sunken-rgb), .72);
  }
  .app-selector-backdrop {
    position: fixed;
    inset: 0;
    z-index: 90;
  }
  .app-selector-menu {
    position: fixed;
    z-index: 100;
    display: grid;
    min-width: 88px;
    padding: 3px;
    border: 1px solid var(--line-strong);
    border-radius: var(--radius-md);
    background: rgb(31, 35, 41);
    box-shadow: var(--shadow-elevated);
  }
  .app-selector-menu button {
    width: 100%;
    padding: 4px 7px;
    border-radius: var(--radius-sm);
    color: #ffffff;
    font-family: var(--font-mono);
    font-size: 10px;
    text-align: left;
    white-space: nowrap;
  }
  .app-selector-menu button:hover,
  .app-selector-menu button.active {
    background: rgba(var(--accent-rgb), .12);
    color: #ffffff;
  }
</style>
