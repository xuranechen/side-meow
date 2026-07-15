<script>
  let { message, onConfirm, onCancel } = $props();
</script>

<div class="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
  <button
    class="absolute inset-0 cursor-default"
    style="background: rgba(0,0,0,0.8);"
    onclick={onCancel}
    aria-label="关闭"
  ></button>

  <div class="card max-w-sm w-full relative animate-slide-up" style="padding: 20px;">
    <div class="mb-5">
      <p class="text-[13px] text-[var(--color-text)]" style="line-height: 1.6;">
        {message}
      </p>
    </div>

    <div class="flex gap-2 justify-end">
      <button class="btn-secondary" onclick={onCancel}>取消</button>
      <button
        class="px-4 py-2 rounded-md text-[12px] font-medium transition-colors"
        style="background: var(--color-error); color: #e5e5e5;"
        onclick={onConfirm}
      >
        确认删除
      </button>
    </div>
  </div>
</div>
