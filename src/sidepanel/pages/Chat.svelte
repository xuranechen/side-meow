<script>
  import { onDestroy, onMount, tick } from "svelte";
  import {
    sessions,
    activeSessionId,
    activeSession,
    createSession,
    addMessage,
    deleteSession,
    setActiveSession,
    persistSessionsSoon,
    persistSessionsNow,
  } from "../stores/sessions.js";
  import { providers, activeProvider, setActiveProvider } from "../stores/providers.js";
  import { pageParams, goBack, showToast } from "../stores/ui.js";
  import { settings } from "../stores/settings.js";
  import MessageBubble from "../components/MessageBubble.svelte";
  import ChatInput from "../components/ChatInput.svelte";
  import ModelSelector from "../components/ModelSelector.svelte";
  import SessionList from "../components/SessionList.svelte";
  import ConfirmDialog from "../components/ConfirmDialog.svelte";
  import { ChevronLeft, History, Plus, SlidersHorizontal, MessageSquare } from "lucide-svelte";

  let messagesContainer = $state(null);
  let activeStreams = $state(new Map());
  let showSessionList = $state(false);
  let systemPrompt = $state("");
  let showSystemPrompt = $state(false);
  let showDeleteConfirm = $state(false);
  let sessionToDelete = $state(null);

  let streaming = $derived(activeStreams.has($activeSessionId));
  let currentAbort = $derived(activeStreams.get($activeSessionId)?.requestId || null);

  $effect(() => {
    if ($activeSession?.messages) {
      tick().then(scrollToBottom);
    }
  });

  $effect(() => {
    const sysMsg = $activeSession?.messages?.find((m) => m.role === "system");
    systemPrompt = sysMsg?.content || "";
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

  function updateStreamingAssistant(updates, sessionId) {
    const sid = sessionId || $activeSessionId;
    if (!sid) return;
    sessions.update((items) => items.map((session) => {
      if (session.id !== sid) return session;
      const messages = [...session.messages];
      const index = messages.findLastIndex((message) => message.role === "assistant");
      if (index >= 0) messages[index] = { ...messages[index], ...updates };
      return { ...session, messages, updatedAt: Date.now() };
    }));
    persistSessionsSoon();
  }

  async function handleSend(content) {
    if (!$activeProvider) return;
    const sessionId = $activeSessionId;
    if (!sessionId) return;
    if (activeStreams.has(sessionId)) return;

    if (!$activeSession) {
      await createSession($activeProvider.id, $activeProvider.defaultModel, systemPrompt);
    }

    await addMessage(sessionId, { role: "user", content });
    await addMessage(sessionId, {
      role: "assistant",
      content: "",
      metadata: { streaming: true },
    });

    const streamState = {
      sessionId,
      requestId: "chat-" + Date.now(),
      pendingThinkingSegments: [],
      pendingThinkingText: "",
      pendingWebSearchCalls: [],
      requestStartTime: performance.now(),
      firstTokenTime: 0,
    };
    activeStreams = new Map(activeStreams).set(sessionId, streamState);
    await tick();

    const messages = $activeSession.messages
      .filter((m) => m.role !== "assistant" || m.content)
      .map((m) => ({ role: m.role, content: m.content }));

    chrome.runtime.sendMessage({
      type: "API_REQUEST",
      requestId: streamState.requestId,
      provider: {
        type: $activeProvider.type,
        baseUrl: $activeProvider.baseUrl,
        apiKey: $activeProvider.apiKey,
        defaultModel: $activeSession.modelId,
        headers: $activeProvider.headers || {},
        fullUrl: $activeProvider.fullUrl || false,
        tools: $activeProvider.tools || null,
      },
      messages,
      options: {
        stream: $settings.streamByDefault,
        model: $activeSession.modelId,
        thinking: true,
        thinkingBudget: 10000,
        timeout: ($settings.requestTimeout || 15) * 1000,
      },
    });
  }

  function findStreamByRequestId(requestId) {
    for (const [sid, state] of activeStreams) {
      if (state.requestId === requestId) return state;
    }
    return null;
  }

  function handleStreamChunk(message) {
    const stream = findStreamByRequestId(message.requestId);
    if (!stream) return;
    const sessionId = stream.sessionId;

    if (message.type === "API_STREAM_CHUNK") {
      if (!stream.firstTokenTime) stream.firstTokenTime = performance.now();
      const session = $sessions.find((s) => s.id === sessionId);
      const lastAssistant = session?.messages?.filter((m) => m.role === "assistant").pop();
      updateStreamingAssistant({
        content: (lastAssistant?.content || "") + message.token,
      }, sessionId);
    }

    if (message.type === "API_THINKING_CHUNK") {
      stream.pendingThinkingText += message.token;
      updateStreamingAssistant({
        _thinking: stream.pendingThinkingText,
      }, sessionId);
    }

    if (message.type === "API_THINKING_DONE") {
      const text = message.text || stream.pendingThinkingText;
      if (text && stream.pendingThinkingSegments[stream.pendingThinkingSegments.length - 1] !== text) {
        stream.pendingThinkingSegments = [...stream.pendingThinkingSegments, text];
      }
      stream.pendingThinkingText = "";
      updateStreamingAssistant({
        _thinking: null,
        thinkingSegments: stream.pendingThinkingSegments.length > 0 ? [...stream.pendingThinkingSegments] : null,
      }, sessionId);
      persistSessionsNow();
    }

    if (message.type === "API_TOOL_CALLS") {
      updateStreamingAssistant({ toolCalls: message.toolCalls }, sessionId);
    }

    if (message.type === "API_WEB_SEARCH_CALLS") {
      stream.pendingWebSearchCalls = message.webSearchCalls || [];
      updateStreamingAssistant({ webSearchCalls: stream.pendingWebSearchCalls }, sessionId);
    }

    if (message.type === "API_STREAM_DONE") {
      const session = $sessions.find((s) => s.id === sessionId);
      const lastMsg = session?.messages?.filter((m) => m.role === "assistant").pop();
      const newStreams = new Map(activeStreams);
      newStreams.delete(sessionId);
      activeStreams = newStreams;
      if (lastMsg) {
        const now = performance.now();
        const fallbackSegments = stream.pendingThinkingText
          ? [...stream.pendingThinkingSegments, stream.pendingThinkingText]
          : [...stream.pendingThinkingSegments];
        const finalSegments = Array.isArray(message.thinkingSegments)
          ? message.thinkingSegments
          : fallbackSegments;
        const finalWebSearchCalls = Array.isArray(message.webSearchCalls)
          ? message.webSearchCalls
          : stream.pendingWebSearchCalls;
        const finalToolCalls = Array.isArray(message.toolCalls)
          ? message.toolCalls
          : (lastMsg.toolCalls || []);
        const updates = {
          content: typeof message.content === "string" ? message.content : lastMsg.content,
          _thinking: null,
          thinkingSegments: finalSegments.length > 0 ? finalSegments : null,
          webSearchCalls: finalWebSearchCalls.length > 0 ? finalWebSearchCalls : null,
          toolCalls: finalToolCalls.length > 0 ? finalToolCalls : null,
          metadata: {
            ...lastMsg.metadata,
            streaming: false,
            tokenUsage: message.usage,
            model: message.model || lastMsg.metadata?.model,
            incomplete: message.incomplete || false,
            incompleteReason: message.incompleteDetails?.reason || null,
            firstTokenMs: stream.firstTokenTime ? Math.round(stream.firstTokenTime - stream.requestStartTime) : null,
            totalMs: Math.round(now - stream.requestStartTime),
          },
        };
        const current = [];
        sessions.subscribe((s) => current.push(...s))();
        const updated = current.map((s) => {
          if (s.id !== sessionId) return s;
          const messages = [...s.messages];
          for (let i = messages.length - 1; i >= 0; i--) {
            if (messages[i].role === "assistant") { messages[i] = { ...messages[i], ...updates }; break; }
          }
          return { ...s, messages, updatedAt: Date.now() };
        });
        sessions.set(updated);
        persistSessionsNow(updated);
      }
    }

    if (message.type === "API_ERROR") {
      const session = $sessions.find((s) => s.id === sessionId);
      const lastMsg = session?.messages?.filter((m) => m.role === "assistant").pop();
      const newStreams = new Map(activeStreams);
      newStreams.delete(sessionId);
      activeStreams = newStreams;
      const allSegments = stream.pendingThinkingText
        ? [...stream.pendingThinkingSegments, stream.pendingThinkingText]
        : [...stream.pendingThinkingSegments];
      const streamedContent = lastMsg?.content || "";
      const updates = {
        content: streamedContent || `错误: ${message.error.message}`,
        _thinking: undefined,
        thinkingSegments: allSegments.length > 0 ? allSegments : undefined,
        metadata: {
          ...lastMsg?.metadata,
          streaming: false,
          error: message.error.message,
          statusCode: message.error.status,
        },
      };
      const current = [];
      sessions.subscribe((s) => current.push(...s))();
      const updated = current.map((s) => {
        if (s.id !== sessionId) return s;
        const messages = [...s.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") { messages[i] = { ...messages[i], ...updates }; break; }
        }
        return { ...s, messages, updatedAt: Date.now() };
      });
      sessions.set(updated);
      persistSessionsNow(updated);
    }

    if (message.type === "API_CANCELLED") {
      const session = $sessions.find((s) => s.id === sessionId);
      const lastMsg = session?.messages?.filter((m) => m.role === "assistant").pop();
      const newStreams = new Map(activeStreams);
      newStreams.delete(sessionId);
      activeStreams = newStreams;
      const allSegments = stream.pendingThinkingText
        ? [...stream.pendingThinkingSegments, stream.pendingThinkingText]
        : [...stream.pendingThinkingSegments];
      const updates = {
        _thinking: undefined,
        thinkingSegments: allSegments.length > 0 ? allSegments : undefined,
        metadata: { ...lastMsg?.metadata, streaming: false, cancelled: true },
      };
      const current = [];
      sessions.subscribe((s) => current.push(...s))();
      const updated = current.map((s) => {
        if (s.id !== sessionId) return s;
        const messages = [...s.messages];
        for (let i = messages.length - 1; i >= 0; i--) {
          if (messages[i].role === "assistant") { messages[i] = { ...messages[i], ...updates }; break; }
        }
        return { ...s, messages, updatedAt: Date.now() };
      });
      sessions.set(updated);
      persistSessionsNow(updated);
    }
  }

  chrome.runtime.onMessage.addListener(handleStreamChunk);
  onDestroy(() => chrome.runtime.onMessage.removeListener(handleStreamChunk));

  function handleStop() {
    const sid = $activeSessionId;
    const state = sid ? activeStreams.get(sid) : null;
    if (state?.requestId) {
      chrome.runtime.sendMessage({ type: "API_CANCEL", requestId: state.requestId });
    }
  }

  async function handleDeleteSession(id) {
    if ($settings.confirmDelete) {
      sessionToDelete = id;
      showDeleteConfirm = true;
      return;
    }
    await deleteSession(id);
    showSessionList = false;
  }

  async function confirmDeleteSession() {
    if (sessionToDelete) {
      const newActive = await deleteSession(sessionToDelete);
      if (newActive?.providerId) {
        await setActiveProvider(newActive.providerId);
      }
    }
    showDeleteConfirm = false;
    sessionToDelete = null;
    showSessionList = false;
  }

  function cancelDeleteSession() {
    showDeleteConfirm = false;
    sessionToDelete = null;
  }

  async function handleNewSession() {
    if (!$activeProvider) return;
    await createSession($activeProvider.id, $activeProvider.defaultModel, systemPrompt);
    showSessionList = false;
  }

  async function handleModelChange(modelId) {
    if (!$activeSession) {
      if (!$activeProvider) return;
      await createSession($activeProvider.id, modelId, systemPrompt);
      return;
    }
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
      activeModel={$activeSession?.modelId || $activeProvider?.defaultModel}
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
      onDelete={handleDeleteSession}
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
    disabled={streaming || !$activeProvider || !$activeSession}
    {streaming}
    onSend={handleSend}
    onStop={handleStop}
  />

  {#if showDeleteConfirm}
    <ConfirmDialog
      message="确定要删除这个会话吗？此操作不可撤销。"
      confirmText="确认删除"
      danger={true}
      onConfirm={confirmDeleteSession}
      onCancel={cancelDeleteSession}
    />
  {/if}
</div>

<style>
  .chat-main :global(.message-row + .message-row) {
    margin-top: 16px;
  }
</style>
