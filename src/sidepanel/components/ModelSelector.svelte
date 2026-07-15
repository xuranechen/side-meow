<script>
  import { ChevronDown } from "lucide-svelte";

  let { providers, activeProvider, activeModel, onProviderChange, onModelChange } = $props();

  let showDropdown = $state(false);
  let dropdownType = $state(null);

  function toggleProviderDropdown() {
    if (showDropdown && dropdownType === "provider") {
      showDropdown = false;
      return;
    }
    dropdownType = "provider";
    showDropdown = true;
  }

  function toggleModelDropdown() {
    if (showDropdown && dropdownType === "model") {
      showDropdown = false;
      return;
    }
    dropdownType = "model";
    showDropdown = true;
  }

  function selectProvider(id) {
    onProviderChange(id);
    showDropdown = false;
  }

  function selectModel(id) {
    onModelChange(id);
    showDropdown = false;
  }

  function closeDropdown() {
    showDropdown = false;
  }
</script>

<div class="model-selector">
  <button class="selector-button" onclick={toggleProviderDropdown} title={activeProvider?.name || "选择接口"}>
    <span class="selector-value">{activeProvider?.name || "选择接口"}</span>
    <ChevronDown size={11} style="color: var(--color-text-muted); flex: 0 0 auto;" />
  </button>

  <button class="selector-button" onclick={toggleModelDropdown} title={activeModel || "选择模型"}>
    <span class="selector-value">{activeModel || "选择模型"}</span>
    <ChevronDown size={11} style="color: var(--color-text-muted); flex: 0 0 auto;" />
  </button>

  {#if showDropdown}
    <div class="selector-menu card animate-slide-up" role="menu">
      {#if dropdownType === "provider"}
        {#each providers as provider}
          <button
            class:active={provider.id === activeProvider?.id}
            role="menuitem"
            onclick={() => selectProvider(provider.id)}
          >
            {provider.name}
          </button>
        {/each}
      {:else if dropdownType === "model" && activeProvider}
        {#each activeProvider.models as model}
          <button
            class:active={model.id === activeModel}
            role="menuitem"
            onclick={() => selectModel(model.id)}
          >
            {model.name || model.id}
          </button>
        {/each}
      {/if}
    </div>
  {/if}
</div>

{#if showDropdown}
  <div
    class="fixed inset-0 z-10"
    onclick={closeDropdown}
    onkeydown={(e) => e.key === "Escape" && closeDropdown()}
    role="button"
    tabindex="-1"
    aria-label="关闭"
  ></div>
{/if}

<style>
  .model-selector {
    position: relative;
    z-index: 20;
    display: flex;
    width: min(214px, 50vw);
    gap: 4px;
  }

  .selector-button {
    display: flex;
    min-width: 0;
    min-height: 29px;
    flex: 1 1 0;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 4px 6px !important;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-sm) !important;
    background: rgba(var(--sunken-rgb), .36);
    color: var(--color-text);
    font-size: 11px;
    line-height: 1.1;
    transition: border-color .16s var(--ease-out), background .16s var(--ease-out), color .16s var(--ease-out);
  }

  .selector-button:hover,
  .selector-button:focus-visible {
    border-color: var(--color-border-hover);
    background: rgba(var(--accent-rgb), .08);
    color: var(--color-text-bright);
  }

  .selector-value {
    min-width: 0;
    overflow: hidden;
    color: var(--color-text-bright);
    font-family: var(--font-mono);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selector-menu {
    position: absolute;
    top: calc(100% + 5px);
    left: 0;
    z-index: 30;
    display: grid;
    width: 100%;
    max-height: 220px;
    overflow-y: auto;
    padding: 4px !important;
    border-radius: var(--radius-md) !important;
    box-shadow: var(--shadow-elevated);
  }

  .selector-menu button {
    width: 100%;
    overflow: hidden;
    padding: 6px 7px;
    border-radius: var(--radius-sm) !important;
    color: var(--color-text);
    font-size: 11px;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .selector-menu button:hover,
  .selector-menu button.active {
    background: rgba(var(--accent-rgb), .10);
    color: var(--color-primary-hover);
  }
</style>
