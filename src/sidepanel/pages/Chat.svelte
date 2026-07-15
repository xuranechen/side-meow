<script>
  import { onMount, tick } from "svelte";
  import {
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    addMessage,
    updateLastAssistantMessage,
    deleteSession,
    setActiveSession,
  } from "../stores/sessions.js";
  import { providers, activeProvider, setActiveProvider } from "../stores/providers.js";
  import { pageParams, goBack, showToast } from "../stores/ui.js";
  import MessageBubble from "../components/MessageBubble.svelte";
  import ChatInput from "../components/ChatInput.svelte";
  import ModelSelector from "../components/ModelSelector.svelte";
  import SessionList from "../components/SessionList.svelte";
  import { ChevronLeft, History, Plus, SlidersHorizontal, MessageSquare } from "lucide-svelte";

  let messagesContainer = $state(null);
  let streaming = $state(false);
  let currentAbort = $state(null);
  let showSessionList = $state(false);
  let systemPrompt = $state("");
  let showSystemPrompt = $state(false);
  let requestStartTime = $state(0);
  let firstTokenTime = $state(0);

  $effect(() => {
    if ($activeSession?.messages) {
      tick().then(scrollToBottom);
    }
  });

  onMount(async () => {
    const params = $pageParams;
    if (params.showSessions) {
      showSessionList = true;
    }
    if (params.sessionId) {
      await setActiveSession(params.sessionId);
    } else if (!$activeSessionId) {
      if ($activeProvider) {
        await createSession($activeProvider.id, $activeProvider.defaultModel);
      }
    }
  });

  function scrollToBottom() {
    if (messagesContainer) {
      messagesContainer.scrollTop = messagesContainer.scrollHeight;
    }
  }

  async function handleSend(content) {
    if (!$activeSession || !$activeProvider || streaming) return;

    await addMessage($activeSession.id, { role: "user", content });
    await addMessage($activeSession.id, { role: "assistant", content: "", metadata: { streaming: true } });

    streaming = true;
    requestStartTime = performance.now();
    firstTokenTime = 0;
    await tick();

    const requestId = "chat-" + Date.now();
    currentAbort = requestId;

    const messages = $activeSession.messages
      .filter((m) => m.role !== "assistant" || m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    chrome.runtime.sendMessage({
      type: "API_REQUEST",
      requestId,
      provider: {
        type: $activeProvider.type,
        baseUrl: $activeProvider.baseUrl,
        apiKey: $activeProvider.apiKey,
        defaultModel: $activeSession.modelId,
        headers: $activeProvider.headers || {},
        fullUrl: $activeProvider.fullUrl || false,
      },
      messages,
      options: { stream: true, model: $activeSession.modelId },
    });
  }

  function handleStreamChunk(message) {
    if (message.requestId !== currentAbort) return;

    if (message.type === "API_STREAM_CHUNK") {
      if (!firstTokenTime) firstTokenTime = performance.now();
      updateLastAssistantMessage($activeSessionId, {
        content: ($activeSession?.messages?.filter((m) => m.role === "assistant").pop()?.content || "") + message.token,
      });
    }

    if (message.type === "API_STREAM_DONE") {
      streaming = false;
      currentAbort = null;
      const lastMsg = $activeSession?.messages?.filter((m) => m.role === "assistant").pop();
      if (lastMsg) {
        const now = performance.now();
        updateLastAssistantMessage($activeSessionId, {
          metadata: {
            ...lastMsg.metadata,
            streaming: false,
            tokenUsage: message.usage,
            firstTokenMs: firstTokenTime ? Math.round(firstTokenTime - requestStartTime) : null,
            totalMs: Math.round(now - requestStartTime),
          },
        });
      }
    }

    if (message.type === "API_ERROR") {
      streaming = false;
      currentAbort = null;
      updateLastAssistantMessage($activeSessionId, {
        content: `错误: ${message.error.message}`,
        metadata: { streaming: false, error: message.error.message, statusCode: message.error.status },
      });
    }

    if (message.type === "API_CANCELLED") {
      streaming = false;
      currentAbort = null;
      updateLastAssistantMessage($activeSessionId, {
        metadata: { streaming: false, cancelled: true },
      });
    }
  }

  chrome.runtime.onMessage.addListener(handleStreamChunk);

  function handleStop() {
    if (currentAbort) {
      chrome.runtime.sendMessage({ type: "API_CANCEL", requestId: currentAbort });
    }
  }

  async function handleNewSession() {
    if (!$activeProvider) return;
    await createSession($activeProvider.id, $activeProvider.defaultModel, systemPrompt);
    showSessionList = false;
  }

  async function handleModelChange(modelId) {
    if (!$activeSession) return;
    sessions.update((s) => s.map((sess) => (sess.id === $activeSessionId ? { ...sess, modelId } : sess)));
  }

  async function handleProviderChange(providerId) {
    const provider = $providers.find((p) => p.id === providerId);
    if (!provider) return;
    await setActiveProvider(providerId);
    await createSession(providerId, provider.defaultModel, systemPrompt);
  }

  function handleCopy(content) {
    navigator.clipboard.writeText(content);
    showToast("已复制到剪贴板");
  }

  async function handleRegenerate() {
    if (!$activeSession || streaming) return;
    const messages = $activeSession.messages;
    const lastUserIndex = messages.findLastIndex((m) => m.role === "user");
    if (lastUserIndex === -1) return;

    const userMessage = messages[lastUserIndex].content;
    sessions.update((s) => s.map((sess) => {
      if (sess.id !== $activeSessionId) return sess;
      return { ...sess, messages: sess.messages.slice(0, lastUserIndex) };
    }));

    await tick();
    await handleSend(userMessage);
  }
</script>

<div class="h-full flex flex-col">
  <header class="page-header chat-header flex items-center justify-between border-b">
    <div class="flex items-center gap-1">
      <button
        class="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-text-bright)]"
        onclick={goBack}
        aria-label="返回"
      >
        <ChevronLeft size={16} />
      </button>

      <button
        class="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors {showSessionList ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-bright)]'}"
        onclick={() => (showSessionList = !showSessionList)}
        aria-label="会话列表"
      >
        <History size={16} />
      </button>
    </div>

    <ModelSelector
      providers={$providers}
      activeProvider={$activeProvider}
      activeModel={$activeSession?.modelId}
      onProviderChange={handleProviderChange}
      onModelChange={handleModelChange}
    />

    <div class="flex items-center gap-1">
      <button
        class="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors {showSystemPrompt ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-bright)]'}"
        onclick={() => (showSystemPrompt = !showSystemPrompt)}
        title="系统提示词"
      >
        <SlidersHorizontal size={16} />
      </button>

      <button
        class="p-1.5 rounded-lg hover:bg-[var(--color-bg-tertiary)] transition-colors text-[var(--color-text-secondary)] hover:text-[var(--color-text-bright)]"
        onclick={handleNewSession}
        title="新建会话"
      >
        <Plus size={16} />
      </button>
    </div>
  </header>

  {#if showSystemPrompt}
    <div class="px-3 py-2.5 border-b border-[var(--color-border)] animate-slide-up" style="background: var(--color-bg-secondary);">
      <label for="system-prompt" class="block text-[11px] font-medium text-[var(--color-text-muted)] mb-1.5" style="letter-spacing: 0.02em;">系统提示词</label>
      <textarea
        id="system-prompt"
        bind:value={systemPrompt}
        placeholder="你是一个有用的助手..."
        rows="3"
        class="resize-none"
        style="font-size: 12px; background: var(--color-bg-tertiary); border: 1px solid var(--color-border); color: var(--color-text-bright); padding: 8px 12px; width: 100%; border-radius: var(--radius-md);"
      ></textarea>
    </div>
  {/if}

  {#if showSessionList}
    <SessionList
      sessions={$sessions}
      activeSessionId={$activeSessionId}
      onSelect={(id) => {
        const sess = $sessions.find((s) => s.id === id);
        if (sess?.providerId) setActiveProvider(sess.providerId);
        setActiveSession(id);
        showSessionList = false;
      }}
      onDelete={(id) => deleteSession(id)}
      onNew={handleNewSession}
    />
  {/if}

  <main
    bind:this={messagesContainer}
    class="page-main chat-main flex-1 overflow-y-auto"
  >
    {#if !$activeSession || $activeSession.messages.length === 0}
      <div class="flex flex-col items-center justify-center h-full text-center">
        <div class="relative mb-4">
          <div class="relative w-[52px] h-[52px] rounded-md flex items-center justify-center" style="background: rgba(255,255,255,0.05); border: 1px solid var(--color-border);">
            <MessageSquare size={22} class="text-[var(--color-primary)]" />
          </div>
        </div>
        <p class="text-[13px] font-medium text-[var(--color-text-bright)] mb-1">开始一次对话</p>
        <p class="text-[11px] text-[var(--color-text-muted)]">发送消息即可测试当前接口</p>
      </div>
    {:else}
      {#each $activeSession.messages as message (message.id)}
        {#if message.role !== "system"}
          <MessageBubble
            {message}
            apiType={$activeProvider?.type}
            onCopy={() => handleCopy(message.content)}
            onRegenerate={message.role === "assistant" ? handleRegenerate : null}
          />
        {/if}
      {/each}
    {/if}
  </main>

  <ChatInput
    disabled={streaming || !$activeProvider}
    {streaming}
    onSend={handleSend}
    onStop={handleStop}
  />
</div>

<style>
  .chat-main :global(.message-row + .message-row) {
    margin-top: 16px;
  }
</style>
