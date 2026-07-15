<script>
  import { toast } from "../stores/ui.js";
  import { Check, X, AlertTriangle, Info } from "lucide-svelte";

  let toastData = $derived($toast);

  const iconMap = {
    success: Check,
    error: X,
    warning: AlertTriangle,
    info: Info,
  };

  const colorMap = {
    success: "border-[var(--color-success)]",
    error: "border-[var(--color-error)]",
    warning: "border-[var(--color-warning)]",
    info: "border-[var(--color-primary)]",
  };
</script>

{#if toastData}
  <div class="fixed top-3 left-1/2 z-50 w-[calc(100%-24px)] max-w-sm -translate-x-1/2 animate-slide-up">
    <div class="flex items-center justify-center gap-2 px-3 py-2 rounded-md border {colorMap[toastData.type] || colorMap.info} text-[12px] glass" style="color: var(--color-text-bright); box-shadow: var(--shadow-elevated);">
      {#if iconMap[toastData.type]}
        {@const Icon = iconMap[toastData.type]}
        <Icon size={13} />
      {/if}
      <span class="truncate max-w-full" title={toastData.message}>{toastData.message.length > 120 ? toastData.message.slice(0, 120) + "..." : toastData.message}</span>
    </div>
  </div>
{/if}

