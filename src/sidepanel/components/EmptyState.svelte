<script>
  import { Plus, Server, ScanLine } from "lucide-svelte";
  let { onAdd } = $props();
</script>

<div class="empty-state animate-fade-in">
  <div class="scanner" aria-hidden="true"><ScanLine size={17} /></div>
  <div class="empty-visual">
    <span class="orbit orbit-one"></span>
    <span class="orbit orbit-two"></span>
    <div class="empty-core"><Server size={23} /></div>
  </div>
  <span class="eyebrow">NODE DISCOVERY // 00</span>
  <h3>等待接口接入</h3>
  <p>添加首个大模型 API 节点，建立你的多模型控制中枢。</p>
  <button class="btn-primary flex items-center gap-1.5" onclick={onAdd}>
    <Plus size={13} /> 初始化节点
  </button>
</div>

<style>
  .empty-state {
    position: relative;
    display: flex;
    min-height: 100%;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    padding: 48px 22px;
    text-align: center;
    border: 1px dashed rgba(var(--accent-rgb), .22);
    border-radius: var(--radius-xl);
    background: radial-gradient(circle at 50% 35%, rgba(var(--accent-rgb), .08), transparent 38%), rgba(var(--sunken-rgb), .34);
  }
  .scanner { position: absolute; top: 12px; right: 12px; color: var(--color-primary-dim); opacity: .7; }
  .empty-visual { position: relative; display: grid; place-items: center; width: 96px; height: 96px; margin-bottom: 16px; }
  .orbit { position: absolute; border: 1px solid rgba(var(--accent-rgb), .20); border-radius: 50%; }
  .orbit-one { inset: 4px; }
  .orbit-two { inset: 15px; border-color: rgba(var(--blue-rgb), .18); }
  .empty-core { display: grid; place-items: center; width: 50px; height: 50px; color: var(--color-primary); border: 1px solid rgba(var(--accent-rgb), .38); background: linear-gradient(135deg, rgba(var(--accent-rgb), .12), rgba(var(--blue-rgb), .06)); clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px)); box-shadow: var(--glow-primary); }
  h3 { margin-top: 5px; color: var(--color-text-bright); font-family: var(--font-display); font-size: 16px; font-weight: 650; }
  p { max-width: 275px; margin: 7px 0 20px; color: var(--color-text-muted); font-size: 11px; line-height: 1.7; }
</style>
