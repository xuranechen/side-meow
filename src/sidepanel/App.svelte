<script>
  import { onMount } from "svelte";
  import { currentPage } from "./stores/ui.js";
  import { loadProviders } from "./stores/providers.js";
  import { loadSessions } from "./stores/sessions.js";
  import { loadSettings } from "./stores/settings.js";
  import { Loader2, AlertTriangle } from "lucide-svelte";

  import Home from "./pages/Home.svelte";
  import ProviderForm from "./pages/ProviderForm.svelte";
  import Chat from "./pages/Chat.svelte";
  import Settings from "./pages/Settings.svelte";
  import Export from "./pages/Export.svelte";
  import Toast from "./components/Toast.svelte";

  let loading = $state(true);
  let error = $state(null);

  const pages = {
    home: Home,
    "provider-form": ProviderForm,
    chat: Chat,
    settings: Settings,
    export: Export,
  };

  onMount(async () => {
    try {
      await Promise.all([
        loadProviders(),
        loadSessions(),
        loadSettings(),
      ]);
    } catch (err) {
      console.error("Failed to load data:", err);
      error = err.message;
    } finally {
      loading = false;
    }
  });

  let CurrentPage = $derived(pages[$currentPage] || Home);
</script>

<div class="app-frame flex flex-col">
  {#if loading}
    <div class="flex-1 flex flex-col items-center justify-center gap-3">
      <div class="relative">
        <div class="absolute inset-0 rounded-xl blur-xl" style="background: var(--gradient-primary); opacity: 0.5;"></div>
        <div class="relative w-11 h-11 rounded-xl flex items-center justify-center" style="background: var(--gradient-primary); box-shadow: var(--glow-primary);">
          <Loader2 size={20} class="animate-spin text-white" />
        </div>
      </div>
      <div class="text-[11px]" style="color: var(--color-text-muted); letter-spacing: 0.08em;">加载中…</div>
    </div>
  {:else if error}
    <div class="flex-1 flex items-center justify-center p-4">
      <div class="text-center">
        <div class="w-9 h-9 mb-3 rounded-md bg-[var(--color-bg-tertiary)] border border-[var(--color-border)] flex items-center justify-center mx-auto">
          <AlertTriangle size={16} class="text-[var(--color-error)]" />
        </div>
        <div class="text-[13px] text-[var(--color-error)] mb-1.5 font-medium">加载失败</div>
        <div class="text-[11px] text-[var(--color-text-muted)] mb-4">{error}</div>
        <button
          class="btn-primary"
          onclick={() => window.location.reload()}
        >
          重试
        </button>
      </div>
    </div>
  {:else}
    <CurrentPage />
  {/if}
  <Toast />
</div>
