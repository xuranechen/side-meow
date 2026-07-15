<script>
  let { message, onConfirm, onCancel, confirmText = "确认", danger = false } = $props();
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="dialog-backdrop animate-fade-in" onclick={onCancel} onkeydown={(e) => e.key === "Escape" && onCancel()}>
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="dialog-modal card animate-slide-up" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()}>
    <p class="dialog-message">{message}</p>

    <div class="dialog-actions">
      <button class="dialog-btn" onclick={onCancel}>取消</button>
      <button class="dialog-btn" class:dialog-btn-danger={danger} onclick={onConfirm}>{confirmText}</button>
    </div>
  </div>
</div>

<style>
  .dialog-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 12px;
    background: rgba(0, 0, 0, .68);
  }
  .dialog-modal {
    width: min(320px, 100%);
    padding: 14px !important;
    background: linear-gradient(180deg, rgba(var(--overlay-rgb), .08), rgba(var(--overlay-rgb), .03)), rgba(31, 35, 41, .96);
  }
  .dialog-message {
    margin-bottom: 14px;
    color: var(--color-text);
    font-size: 12px;
    line-height: 1.6;
  }
  .dialog-actions {
    display: flex;
    justify-content: flex-end;
    gap: 5px;
    padding-top: 10px;
    border-top: 1px solid var(--color-border);
  }
  .dialog-btn {
    display: inline-flex;
    min-height: 28px;
    min-width: 64px;
    align-items: center;
    justify-content: center;
    padding: 0 14px !important;
    border-radius: var(--radius-sm);
    border: 1px solid var(--color-border);
    background: rgba(255,255,255,0.05);
    color: var(--color-text-bright);
    font-size: 11px;
    font-weight: 500;
    white-space: nowrap;
    transition: border-color .16s var(--ease-out), background .16s var(--ease-out);
  }
  .dialog-btn:hover {
    border-color: var(--color-border-hover);
    background: rgba(255,255,255,0.08);
  }
  .dialog-btn-danger {
    border-color: rgba(var(--red-rgb), .50);
    background: rgba(var(--red-rgb), .10);
    color: var(--color-error);
  }
  .dialog-btn-danger:hover {
    border-color: rgba(var(--red-rgb), .70);
    background: rgba(var(--red-rgb), .18);
  }
</style>
