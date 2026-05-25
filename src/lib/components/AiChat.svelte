<script>
  import { tick, onMount, onDestroy } from 'svelte'
  import Bot from '@lucide/svelte/icons/bot'
  import Send from '@lucide/svelte/icons/send'
  import Square from '@lucide/svelte/icons/square'
  import Undo2 from '@lucide/svelte/icons/undo-2'
  import Redo2 from '@lucide/svelte/icons/redo-2'
  import Settings2 from '@lucide/svelte/icons/settings-2'
  import Trash2 from '@lucide/svelte/icons/trash-2'
  import Plus from '@lucide/svelte/icons/plus'
  import Play from '@lucide/svelte/icons/play'
  import PenLine from '@lucide/svelte/icons/pen-line'
  import Copy from '@lucide/svelte/icons/copy'
  import AlertTriangle from '@lucide/svelte/icons/alert-triangle'
  import Table2 from '@lucide/svelte/icons/table-2'
  import MessageSquare from '@lucide/svelte/icons/message-square'
  import Zap from '@lucide/svelte/icons/zap'
  import ChevronDown from '@lucide/svelte/icons/chevron-down'
  import ChevronRight from '@lucide/svelte/icons/chevron-right'
  import PanelLeft from '@lucide/svelte/icons/panel-left'
  import { Button } from '$lib/components/ui/button/index.js'
  import { Input } from '$lib/components/ui/input/index.js'
  import { Label } from '$lib/components/ui/label/index.js'
  import { cn } from '$lib/utils.js'
  import { executeSql } from '$lib/api.js'
  import DataTable from '$lib/components/DataTable.svelte'
  import AiMarkdown from '$lib/components/AiMarkdown.svelte'
  import AiSqlBlock from '$lib/components/AiSqlBlock.svelte'
  import ShikiBlock from '$lib/components/ShikiBlock.svelte'
  import {
    chatCompletionStream,
    MAX_AI_RETRIES,
    AI_TOOLS,
    isDestructiveSql,
    parseAssistantMessage,
    buildSystemPrompt,
  } from '$lib/ai.js'
  import { renderMermaidSync, THEMES } from 'beautiful-mermaid'
  import { mermaidThemeFor, normalizeThemeId } from '$lib/themes/registry.js'
  import { loadAiSettings, saveAiSettings } from '$lib/stores/ai-settings.js'
  import {
    listConversations,
    createConversation,
    updateConversation,
    deleteConversation,
  } from '$lib/stores/conversations.js'
  import { generateSuggestions } from '$lib/ai-suggestions.js'
  import { formatCompactCount } from '$lib/table-list.js'

  /**
   * @typedef {
   *   | { id: string, kind: 'user', text: string }
   *   | { id: string, kind: 'assistant', parts: import('$lib/ai.js').AssistantPart[] }
   *   | { id: string, kind: 'streaming' }
   *   | { id: string, kind: 'result', sql: string, columns: {name:string,dataType?:string}[], rows: unknown[][], total: number, error: string|null, isSchema?: boolean, capped?: boolean }
   *   | { id: string, kind: 'confirm', sql: string, resolve: (ok: boolean) => void }
   *   | { id: string, kind: 'thinking' }
   *   | { id: string, kind: 'executing', sql: string }
   * } ChatItem
   */

  let {
    schemaContext = {
      schemas: [],
      activeSchema: 'public',
      tables: [],
      activeTable: null,
      columns: [],
      primaryKey: [],
      foreignKeys: [],
    },
    connectionId = '',
    isActive = false,
    /** @param {string} sql */
    onwritesql = (sql) => {},
  } = $props()

  $effect(() => {
    if (isActive) {
      // Re-focus the input whenever the AI tab becomes visible
      void Promise.resolve().then(() => inputRef?.focus())
    }
  })

  // ── Settings ──────────────────────────────────────────────────────────────
  let settings = $state(loadAiSettings())
  let settingsOpen = $state(false)

  function saveSettings() {
    saveAiSettings(settings)
    settingsOpen = false
  }

  // ── Conversations list (IndexedDB) ─────────────────────────────────────────
  /** @type {import('$lib/stores/conversations.js').Conversation[]} */
  let convList = $state([])
  /** @type {string | null} */
  let activeConvId = $state(null)

  async function loadConvList() {
    convList = await listConversations(connectionId || undefined)
  }

  async function selectConversation(/** @type {string} */ id) {
    if (id === activeConvId) return
    abortCurrentRequest()
    // Save current before switching
    await persistCurrent()
    const conv = convList.find((c) => c.id === id)
    if (!conv) return
    activeConvId = id
    // Restore — filter out ephemeral items (including any stuck streaming items)
    items = /** @type {ChatItem[]} */ (
      (conv.items ?? []).filter(
        (i) =>
          /** @type {any} */ (i).kind !== 'thinking' &&
          /** @type {any} */ (i).kind !== 'confirm' &&
          /** @type {any} */ (i).kind !== 'streaming' &&
          /** @type {any} */ (i).kind !== 'executing',
      )
    )
    apiHistory = /** @type {import('$lib/ai.js').ApiMessage[]} */ (conv.apiHistory ?? [])
    error = ''
    await scrollBottom()
  }

  async function newConversation() {
    abortCurrentRequest()
    await persistCurrent()
    activeConvId = null
    items = []
    apiHistory = []
    error = ''
    await tick()
    inputRef?.focus()
  }

  async function removeConversation(/** @type {string} */ id) {
    closeContextMenu()
    await deleteConversation(id)
    convList = convList.filter((c) => c.id !== id)
    if (activeConvId === id) {
      activeConvId = null
      items = []
      apiHistory = []
      error = ''
    }
  }

  // ── Context menu ───────────────────────────────────────────────────────────
  /** @type {{ id: string, x: number, y: number } | null} */
  let contextMenu = $state(null)

  function showContextMenu(/** @type {string} */ id, /** @type {MouseEvent} */ e) {
    e.preventDefault()
    e.stopPropagation()
    contextMenu = { id, x: e.clientX, y: e.clientY }
  }

  function closeContextMenu() {
    contextMenu = null
  }

  /** Persist current chat to IndexedDB (upsert). Updates convList in-place — no re-sort. */
  async function persistCurrent() {
    if (items.length === 0) return
    const saveable = items.filter((i) => i.kind !== 'thinking' && i.kind !== 'confirm' && i.kind !== 'executing')
    if (saveable.length === 0) return
    const firstUser = saveable.find((i) => i.kind === 'user')
    const title =
      firstUser?.kind === 'user'
        ? firstUser.text.slice(0, 60) + (firstUser.text.length > 60 ? '…' : '')
        : 'Conversation'
    const plainItems = $state.snapshot(saveable)
    const plainHistory = $state.snapshot(apiHistory)
    if (activeConvId) {
      await updateConversation(activeConvId, { title, items: plainItems, apiHistory: plainHistory })
      // Patch title in place — no re-sort, no visual shuffle
      convList = convList.map((c) => c.id === activeConvId ? { ...c, title } : c)
    } else {
      const conv = await createConversation({
        title,
        schema: schemaContext.activeSchema,
        connectionId,
        items: plainItems,
        apiHistory: plainHistory,
      })
      activeConvId = conv.id
      // Prepend new conversation at the top (it is the newest)
      convList = [conv, ...convList]
    }
  }

  // ── Platform ───────────────────────────────────────────────────────────────
  const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/i.test(navigator.platform)
  const modKey = isMac ? '⌘' : 'Ctrl'
  const newChatShortcut = $derived(`${modKey}⇧T`)

  // ── Chat state ─────────────────────────────────────────────────────────────
  /** @type {ChatItem[]} */
  let items = $state([])
  /** @type {import('$lib/ai.js').ApiMessage[]} */
  let apiHistory = $state([])
  let loading = $state(false)
  let error = $state('')
  /** Shown on the thinking row while waiting on rate-limit retries */
  let aiStatusHint = $state('')
  let inputText = $state('')
  const isDraftChat = $derived(!activeConvId && items.length > 0)
  /** Tracks all (name:args) combos executed this turn — prevents exact duplicate calls */
  let executedCalls = new Set()
  /** Tracks (name:args) combos that failed this turn — prevents retrying the same broken call */
  let failedCalls = new Set()

  // ── Streaming & abort ──────────────────────────────────────────────────────
  /** Accumulates text for the currently-streaming assistant turn */
  let streamingContent = $state('')
  /** ID of the `streaming` ChatItem in `items` (null when not streaming) */
  let streamingId = $state(/** @type {string | null} */ (null))
  /** AbortController for the in-flight fetch; replaced each send() call */
  let abortController = /** @type {AbortController | null} */ (null)

  /** rAF handle for scroll debouncing during streaming */
  let rafId = /** @type {number | null} */ (null)
  /** Scroll to bottom on the next animation frame (throttled for streaming). */
  function scrollBottomSoon() {
    if (rafId !== null) return
    rafId = requestAnimationFrame(() => {
      rafId = null
      if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
    })
  }

  function stop() {
    abortController?.abort()
  }

  function abortCurrentRequest() {
    if (abortController) {
      abortController.abort()
      abortController = null
    }
    loading = false
    streamingId = null
    streamingContent = ''
    // Remove in-flight ephemeral items so the UI doesn't show a frozen state
    items = items.filter((i) => i.kind !== 'thinking' && i.kind !== 'executing' && i.kind !== 'streaming')
  }

  // ── Mermaid ───────────────────────────────────────────────────────────────
  /** App :root defines --muted, --accent, --border which inherit into SVG and override
   *  beautiful-mermaid's color-mix fallbacks — ER attributes/lines become illegible. */
  /** @param {import('$lib/themes/registry.js').ThemeId} themeId */
  function resolveMermaidTheme(themeId) {
    const base = themeId === 'light' ? THEMES['zinc-light'] : THEMES['zinc-dark']
    return { ...base, ...mermaidThemeFor(themeId) }
  }

  /** @param {SVGSVGElement} svg @param {ReturnType<typeof resolveMermaidTheme>} theme */
  function applyMermaidThemeVars(svg, theme) {
    svg.style.setProperty('--bg', theme.bg)
    svg.style.setProperty('--fg', theme.fg)
    if (theme.muted) svg.style.setProperty('--muted', theme.muted)
    if (theme.line) svg.style.setProperty('--line', theme.line)
    if (theme.accent) svg.style.setProperty('--accent', theme.accent)
    if (theme.border) svg.style.setProperty('--border', theme.border)
  }

  /** @type {Map<string, string>} */
  const mermaidCache = new Map()
  const MERMAID_CACHE_MAX = 30

  /** Render mermaid code to SVG. Results cached with LRU eviction (per app theme). */
  function processMermaidSvg(code) {
    const themeId = normalizeThemeId(document.documentElement.dataset.theme)
    const cacheKey = `${themeId}:${code}`
    if (mermaidCache.has(cacheKey)) return /** @type {string} */ (mermaidCache.get(cacheKey))
    try {
      const svg = renderMermaidSync(code, resolveMermaidTheme(themeId))
      if (mermaidCache.size >= MERMAID_CACHE_MAX) {
        mermaidCache.delete(/** @type {string} */ (mermaidCache.keys().next().value))
      }
      mermaidCache.set(cacheKey, svg)
      return svg
    } catch (e) {
      return `<pre class="text-xs text-destructive whitespace-pre-wrap">${String(e)}</pre>`
    }
  }

  /** Svelte action: applies live dark/light theming + pan/zoom to the mermaid canvas.
   *  Zoom: Ctrl/Meta + scroll (so regular chat scroll is never blocked).
   *  Pan: drag. Reset: double-click. */
  function mermaidInteractive(/** @type {HTMLDivElement} */ node) {
    const svg = /** @type {SVGSVGElement|null} */ (node.querySelector('svg'))
    if (!svg) return {}

    // ── Theming ────────────────────────────────────────────────────────────
    function applyTheme() {
      const themeId = normalizeThemeId(document.documentElement.dataset.theme)
      const theme = resolveMermaidTheme(themeId)
      applyMermaidThemeVars(svg, theme)
      node.style.background = theme.bg
    }
    applyTheme()
    const themeObs = new MutationObserver(applyTheme)
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    // ── Pan / zoom ─────────────────────────────────────────────────────────
    svg.style.transformOrigin = '0 0'
    let scale = 1, tx = 0, ty = 0
    let dragging = false, ox = 0, oy = 0

    function applyTransform(animate = false) {
      svg.style.transition = animate ? 'transform 0.25s ease' : ''
      svg.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`
    }

    const onWheel = (/** @type {WheelEvent} */ e) => {
      if (!e.ctrlKey && !e.metaKey) return   // regular scroll → let it bubble for chat scroll
      e.preventDefault()
      const { left, top } = node.getBoundingClientRect()
      const mx = e.clientX - left, my = e.clientY - top
      const factor = e.deltaY < 0 ? 1.12 : 0.89
      const ns = Math.max(0.1, Math.min(10, scale * factor))
      tx = mx - (mx - tx) * (ns / scale)
      ty = my - (my - ty) * (ns / scale)
      scale = ns
      applyTransform()
    }

    const onDown = (/** @type {MouseEvent} */ e) => {
      if (e.button !== 0) return
      dragging = true
      ox = e.clientX - tx; oy = e.clientY - ty
      node.classList.add('is-dragging')
    }

    let rafId = 0
    const onMove = (/** @type {MouseEvent} */ e) => {
      if (!dragging) return
      tx = e.clientX - ox; ty = e.clientY - oy
      if (rafId) cancelAnimationFrame(rafId)
      rafId = requestAnimationFrame(() => { rafId = 0; applyTransform() })
    }

    const onUp = () => {
      if (!dragging) return
      dragging = false
      node.classList.remove('is-dragging')
    }

    const onDblClick = () => {
      scale = 1; tx = 0; ty = 0
      applyTransform(true)
    }

    node.addEventListener('wheel', onWheel, { passive: false })
    node.addEventListener('mousedown', onDown)
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    node.addEventListener('dblclick', onDblClick)

    return {
      destroy() {
        themeObs.disconnect()
        if (rafId) cancelAnimationFrame(rafId)
        node.removeEventListener('wheel', onWheel)
        node.removeEventListener('mousedown', onDown)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        node.removeEventListener('dblclick', onDblClick)
      },
    }
  }

  /** @type {HTMLDivElement | null} */
  let scrollEl = $state(null)
  /** @type {HTMLTextAreaElement | null} */
  let inputRef = $state(null)

  // ── Input undo / redo ─────────────────────────────────────────────────────
  /** @type {string[]} */
  let inputHistory = ['']
  let inputHistoryIdx = 0
  /** @type {ReturnType<typeof setTimeout> | null} */
  let historyTimer = null

  function pushHistory(text) {
    if (historyTimer) clearTimeout(historyTimer)
    historyTimer = setTimeout(() => {
      historyTimer = null
      if (text === inputHistory[inputHistoryIdx]) return
      inputHistory = [...inputHistory.slice(0, inputHistoryIdx + 1), text]
      inputHistoryIdx = inputHistory.length - 1
    }, 250)
  }

  function undoInput() {
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null }
    if (inputText !== inputHistory[inputHistoryIdx]) {
      inputHistory = [...inputHistory.slice(0, inputHistoryIdx + 1), inputText]
      inputHistoryIdx = inputHistory.length - 1
    }
    if (inputHistoryIdx <= 0) return
    inputHistoryIdx--
    inputText = inputHistory[inputHistoryIdx]
    void tick().then(() => { resizeInput(); inputRef?.focus() })
  }

  function redoInput() {
    if (inputHistoryIdx >= inputHistory.length - 1) return
    inputHistoryIdx++
    inputText = inputHistory[inputHistoryIdx]
    void tick().then(() => { resizeInput(); inputRef?.focus() })
  }

  function resetHistory() {
    if (historyTimer) { clearTimeout(historyTimer); historyTimer = null }
    inputHistory = ['']
    inputHistoryIdx = 0
  }

  const canUndo = $derived(inputHistoryIdx > 0 || inputText !== inputHistory[inputHistoryIdx])
  const canRedo = $derived(inputHistoryIdx < inputHistory.length - 1)

  // ── `/` global focus shortcut ─────────────────────────────────────────────
  onMount(() => {
    function onSlash(/** @type {KeyboardEvent} */ e) {
      if (!isActive || e.key !== '/') return
      const tag = /** @type {HTMLElement | null} */ (document.activeElement)?.tagName ?? ''
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      if (/** @type {HTMLElement | null} */ (document.activeElement)?.isContentEditable) return
      e.preventDefault()
      inputRef?.focus()
    }
    document.addEventListener('keydown', onSlash)
    onDestroy(() => document.removeEventListener('keydown', onSlash))
  })

  let seq = 0
  const uid = () => `c${++seq}`

  const hasPendingConfirm = $derived(items.some((i) => i.kind === 'confirm'))
  const suggestions = $derived(generateSuggestions(schemaContext))

  /** System prompt memoized — only rebuilds when schemaContext changes */
  const systemPrompt = $derived(buildSystemPrompt(schemaContext))

  // ── AI sidebar visibility (persisted) ─────────────────────────────────────
  const AI_SIDEBAR_KEY = 'db-studio:ai-sidebar-open'

  function loadSidebarPref() {
    try { return localStorage.getItem(AI_SIDEBAR_KEY) !== 'false' } catch { return true }
  }

  function saveSidebarPref(v) {
    try { localStorage.setItem(AI_SIDEBAR_KEY, String(v)) } catch {}
  }

  let sidebarVisible = $state(loadSidebarPref())

  function toggleAiSidebar() {
    sidebarVisible = !sidebarVisible
    saveSidebarPref(sidebarVisible)
  }

  /** Accordion: ID of the currently expanded result card (null = all collapsed) */
  let openResultId = $state(/** @type {string | null} */ (null))
  /** Whether the user has manually collapsed results — respected by auto-open logic */
  let userPrefersCollapsed = $state(false)

  /** @param {string} id */
  function toggleResult(id) {
    if (openResultId === id) {
      openResultId = null
      userPrefersCollapsed = true
    } else {
      openResultId = id
      userPrefersCollapsed = false
    }
  }

  /** Open a result card, honouring the user's collapsed preference */
  function autoOpenResult(/** @type {string} */ id) {
    if (!userPrefersCollapsed) openResultId = id
  }

  /** Collapsed SQL code blocks (independent per-block toggle) */
  let collapsed = $state(/** @type {Set<string>} */ (new Set()))

  /** @param {string} key */
  function toggleCollapse(key) {
    const next = new Set(collapsed)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    collapsed = next
  }

  // ── Input auto-resize ──────────────────────────────────────────────────────
  function resizeInput() {
    const el = inputRef
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 160) + 'px'
  }

  function resetInputHeight() {
    if (inputRef) inputRef.style.height = 'auto'
  }

  async function scrollBottom() {
    await tick()
    if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight
  }

  /** @param {KeyboardEvent} e */
  function handleKeydown(/** @type {KeyboardEvent} */ e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      void send()
      return
    }
    // Ctrl/Cmd + Z → undo
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault()
      undoInput()
      return
    }
    // Ctrl/Cmd + Shift + Z  or  Ctrl + Y → redo
    if (
      ((e.ctrlKey || e.metaKey) && e.key === 'z' && e.shiftKey) ||
      (e.ctrlKey && e.key === 'y')
    ) {
      e.preventDefault()
      redoInput()
      return
    }
    // Ctrl/Cmd + Backspace → clear the entire input
    if (e.key === 'Backspace' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault()
      inputText = ''
      resetInputHeight()
    }
  }

  async function send(/** @type {string} */ [overrideText] = []) {
    const text = (overrideText ?? inputText).trim()
    if (!text || loading || hasPendingConfirm) return
    error = ''
    aiStatusHint = ''
    if (!overrideText) { inputText = ''; resetInputHeight(); resetHistory() }

    items = [...items, { id: uid(), kind: 'user', text }]
    apiHistory = [...apiHistory, { role: 'user', content: text }]
    await scrollBottom()

    const thinkingId = uid()
    items = [...items, { id: thinkingId, kind: 'thinking' }]
    await scrollBottom()

    loading = true
    abortController = new AbortController()
    executedCalls = new Set()
    failedCalls = new Set()
    try {
      await runAiTurn(0)
      await persistCurrent()
    } catch (e) {
      if (/** @type {any} */ (e)?.name !== 'AbortError') error = String(e)
    } finally {
      // Finalize any in-progress streaming item (abort or error mid-stream)
      if (streamingId) {
        const partial = streamingContent.trim()
        const sid = streamingId
        items = items
          .filter((i) => i.id !== thinkingId && i.kind !== 'executing')
          .map((i) =>
            i.id === sid
              ? /** @type {ChatItem} */ ({ id: sid, kind: 'assistant', parts: parseAssistantMessage(partial || '…') })
              : i,
          )
        streamingId = null
        streamingContent = ''
      } else {
        items = items.filter((i) => i.id !== thinkingId && i.kind !== 'executing')
      }
      abortController = null
      loading = false
      await tick()
      inputRef?.focus()
    }
  }

  /** Max rows fetched from DB per AI tool call — prevents OOM on large tables */
  const AI_ROW_LIMIT = 500
  /** Max rows kept in chat state for display */
  const AI_DISPLAY_ROWS = 200

  /**
   * Append LIMIT to SELECT/CTE queries that lack one.
   * DML/DDL pass through unchanged.
   * @param {string} sql
   * @returns {{ sql: string, capped: boolean }}
   */
  function guardSelectLimit(sql) {
    // Strip trailing semicolons first — appending "\nLIMIT N" after a ";" produces
    // a bare LIMIT statement that PostgreSQL rejects with a syntax error.
    const cleaned = sql.trimEnd().replace(/;+$/, '')
    const t = cleaned.trimStart()
    if (!/^(with\b|select\b)/i.test(t)) return { sql: cleaned, capped: false }
    if (/\blimit\s+\d/i.test(t)) return { sql: cleaned, capped: false }
    return { sql: `${cleaned}\nLIMIT ${AI_ROW_LIMIT}`, capped: true }
  }

  /** @param {number} depth */
  async function runAiTurn(depth) {
    if (depth > 40) throw new Error('Too many AI iterations — aborting runaway execution')

    // Space out follow-up turns after tool calls to avoid burst rate limits
    if (depth > 0) {
      await new Promise((r) => setTimeout(r, 500))
      if (abortController?.signal.aborted) throw Object.assign(new Error('Aborted'), { name: 'AbortError' })
    }

    let fullContent = ''
    /** @type {import('$lib/ai.js').ToolCall[]} */
    let toolCalls = []
    /** ID of the streaming placeholder item created on first text token */
    let itemId = /** @type {string | null} */ (null)

    for await (const chunk of chatCompletionStream(
      settings,
      [{ role: 'system', content: systemPrompt }, ...apiHistory],
      AI_TOOLS,
      abortController?.signal,
      ({ attempt, waitMs }) => {
        const sec = Math.ceil(waitMs / 1000)
        aiStatusHint = `Rate limited — retrying in ${sec}s (attempt ${attempt}/${MAX_AI_RETRIES})…`
      },
    )) {
      if (chunk.textDelta) {
        aiStatusHint = ''
        fullContent += chunk.textDelta
        if (!itemId) {
          itemId = uid()
          streamingId = itemId
          // Remove the thinking indicator the moment the first token arrives
          items = [
            ...items.filter((i) => i.kind !== 'thinking'),
            { id: itemId, kind: 'streaming' },
          ]
        }
        streamingContent = fullContent
        scrollBottomSoon()
      }
      if (chunk.toolCalls) {
        toolCalls = chunk.toolCalls
      }
    }

    // Promote the streaming placeholder to a finalized assistant item
    if (itemId) {
      streamingId = null
      streamingContent = ''
      items = items.map((i) =>
        i.id === itemId
          ? /** @type {ChatItem} */ ({ id: itemId, kind: 'assistant', parts: parseAssistantMessage(fullContent) })
          : i,
      )
    }

    if (toolCalls.length > 0) {
      apiHistory = [
        ...apiHistory,
        { role: 'assistant', content: fullContent || null, tool_calls: toolCalls },
      ]
      for (const call of toolCalls) {
        await runToolCall(call)
      }
      await runAiTurn(depth + 1)
    } else if (fullContent) {
      apiHistory = [...apiHistory, { role: 'assistant', content: fullContent }]
      // Fallback: if no streaming item was created (non-streaming endpoint), add it now
      if (!itemId) {
        items = [
          ...items,
          { id: uid(), kind: 'assistant', parts: parseAssistantMessage(fullContent) },
        ]
        await scrollBottom()
      }
    }
  }

  /** @param {import('$lib/ai.js').ToolCall} call */
  async function runToolCall(call) {
    const callKey = `${call.function.name}:${call.function.arguments}`
    if (executedCalls.has(callKey)) {
      const toolResult = JSON.stringify({ error: 'Duplicate call — this exact operation already ran this turn. Use the previous result.' })
      apiHistory = [...apiHistory, { role: 'tool', tool_call_id: call.id, content: toolResult }]
      return
    }
    if (failedCalls.has(callKey)) {
      const toolResult = JSON.stringify({ error: 'Repeated failed call — not retrying. Fix the query or explain the issue to the user.' })
      apiHistory = [...apiHistory, { role: 'tool', tool_call_id: call.id, content: toolResult }]
      return
    }
    executedCalls.add(callKey)

    let toolResult = ''
    try {
      const args = JSON.parse(call.function.arguments || '{}')

      if (call.function.name === 'execute_sql') {
        const sql = String(args.sql ?? '').trim()
        if (!sql) {
          toolResult = JSON.stringify({ error: 'Empty SQL provided' })
          apiHistory = [...apiHistory, { role: 'tool', tool_call_id: call.id, content: toolResult }]
          return
        }
        if (isDestructiveSql(sql)) {
          const confirmed = await waitForConfirm(sql)
          if (!confirmed) {
            toolResult = JSON.stringify({ cancelled: true, message: 'User declined this operation.' })
            apiHistory = [...apiHistory, { role: 'tool', tool_call_id: call.id, content: toolResult }]
            return
          }
        }
        const { sql: guardedSql, capped: frontendCapped } = guardSelectLimit(sql)
        const execId = uid()
        items = [...items, { id: execId, kind: 'executing', sql }]
        await scrollBottom()
        const data = await executeSql(guardedSql)
        const cols = data.columns ?? []
        const rows = data.rows ?? []
        const total = data.rowCount ?? rows.length
        // Backend signals a cap via its message field
        const backendCapped = typeof data.message === 'string' && data.message.startsWith('Showing first')
        const anyCapped = frontendCapped || backendCapped
        const displayRows = rows.slice(0, AI_DISPLAY_ROWS)
        const resultId = uid()
        items = items
          .filter((i) => i.id !== execId)
          .concat([{
            id: resultId,
            kind: 'result',
            sql,
            columns: cols,
            rows: displayRows,
            total,
            error: null,
            capped: anyCapped,
          }])
        autoOpenResult(resultId)
        await scrollBottom()
        toolResult = JSON.stringify({
          columns: cols.map((c) => c.name),
          rows: rows.slice(0, 30),
          total_rows: total,
          ...(anyCapped ? { notice: data.message ?? `Results capped. Use WHERE or LIMIT to fetch a specific range.` } : {}),
          message: data.message ?? null,
        })
      } else if (call.function.name === 'describe_table') {
        const schema = String(args.schema ?? schemaContext.activeSchema).replace(/'/g, "''")
        const table = String(args.table ?? '').replace(/'/g, "''")
        const execId = uid()
        items = [...items, { id: execId, kind: 'executing', sql: `${schema}.${table} schema` }]
        await scrollBottom()
        const data = await executeSql(
          `SELECT column_name::text, data_type::text, is_nullable::text, column_default::text
           FROM information_schema.columns
           WHERE table_schema = '${schema}' AND table_name = '${table}'
           ORDER BY ordinal_position`,
        )
        const cols = data.columns ?? []
        const rows = data.rows ?? []
        const schemaResultId = uid()
        items = items
          .filter((i) => i.id !== execId)
          .concat([{
            id: schemaResultId,
            kind: 'result',
            sql: `${schema}.${table} schema`,
            columns: cols,
            rows,
            total: rows.length,
            error: null,
            isSchema: true,
          }])
        autoOpenResult(schemaResultId)
        await scrollBottom()
        toolResult = JSON.stringify({
          table: `${schema}.${table}`,
          columns: rows.map((r) => ({ name: r[0], type: r[1], nullable: r[2] === 'YES', default: r[3] ?? null })),
        })
      } else {
        toolResult = JSON.stringify({ error: `Unknown tool: ${call.function.name}` })
      }
    } catch (e) {
      const msg = String(e)
      const errId = uid()
      // Remove any in-flight executing card before showing the error
      items = items
        .filter((i) => i.kind !== 'executing')
        .concat([{ id: errId, kind: 'result', sql: '', columns: [], rows: [], total: 0, error: msg }])
      autoOpenResult(errId)
      await scrollBottom()
      toolResult = JSON.stringify({ error: msg })
      failedCalls.add(callKey)
    }
    apiHistory = [...apiHistory, { role: 'tool', tool_call_id: call.id, content: toolResult }]
  }

  /** Run SQL from a text-mode code block (user pressed Run). */
  async function runSqlBlock(/** @type {string} */ sql) {
    if (loading) return
    error = ''
    if (isDestructiveSql(sql)) {
      const confirmed = await waitForConfirm(sql)
      if (!confirmed) return
    }
    loading = true
    const execId = uid()
    items = [...items, { id: execId, kind: 'executing', sql }]
    await scrollBottom()
    try {
      const data = await executeSql(sql)
      const cols = data.columns ?? []
      const rows = data.rows ?? []
      const sqlResId = uid()
      items = items
        .filter((i) => i.id !== execId)
        .concat([{ id: sqlResId, kind: 'result', sql, columns: cols, rows, total: data.rowCount ?? rows.length, error: null }])
      autoOpenResult(sqlResId)
      await scrollBottom()
      await persistCurrent()
    } catch (e) {
      const sqlErrId = uid()
      items = items
        .filter((i) => i.id !== execId)
        .concat([{ id: sqlErrId, kind: 'result', sql, columns: [], rows: [], total: 0, error: String(e) }])
      autoOpenResult(sqlErrId)
      await scrollBottom()
    } finally {
      loading = false
    }
  }

  /** @param {string} sql @returns {Promise<boolean>} */
  function waitForConfirm(sql) {
    return new Promise((resolve) => {
      const itemId = uid()
      items = [
        ...items,
        {
          id: itemId,
          kind: 'confirm',
          sql,
          resolve: (ok) => {
            items = items.filter((i) => i.id !== itemId)
            resolve(ok)
          },
        },
      ]
      void scrollBottom()
    })
  }

  /** @param {string} text */
  async function copyText(text) {
    await navigator.clipboard.writeText(text).catch(() => {})
  }

  function relativeTime(/** @type {number} */ ts) {
    const diff = (Date.now() - ts) / 1000
    if (diff < 60) return 'just now'
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
    return new Date(ts).toLocaleDateString()
  }

  /** @param {KeyboardEvent} e */
  function handleGlobalKey(e) {
    if (!isActive) return
    const mod = e.ctrlKey || e.metaKey
    if (!mod || !e.shiftKey) return
    const key = e.key.toLowerCase()
    if (key === 'b') {
      e.preventDefault()
      toggleAiSidebar()
    } else if (key === 't') {
      e.preventDefault()
      void newConversation()
    }
  }

  // Reload conversation list when user connects to a different database
  let prevConnectionId = ''
  $effect(() => {
    const id = connectionId
    if (id === prevConnectionId) return
    prevConnectionId = id
    abortCurrentRequest()
    activeConvId = null
    items = []
    apiHistory = []
    error = ''
    loadConvList()
  })

  onMount(() => {
    void tick().then(() => inputRef?.focus())
    document.addEventListener('keydown', handleGlobalKey)
  })

  onDestroy(() => {
    document.removeEventListener('keydown', handleGlobalKey)
  })
</script>

<div class="flex h-full min-h-0 overflow-hidden bg-background">
  <div class="flex min-h-0 flex-1 overflow-hidden">

      <!-- ── Conversation sidebar ───────────────────────────────────────── -->
      {#if sidebarVisible}
      <aside class="flex w-56 shrink-0 flex-col border-r border-border bg-panel">
        <div class="flex flex-col gap-2 border-b border-border px-2.5 py-2.5">
          <div class="flex items-center justify-between gap-2 px-0.5">
            <span class="text-ui-xs font-semibold text-foreground">Chats</span>
            <button
              type="button"
              class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
              title="Hide conversation list ({modKey}⇧B)"
              onclick={toggleAiSidebar}
            >
              <PanelLeft class="size-3.5" />
            </button>
          </div>
          <button
            type="button"
            class="flex w-full items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 py-2 text-left text-ui-xs text-foreground shadow-sm transition-colors hover:border-border hover:text-foreground"
            title="New chat ({newChatShortcut})"
            onclick={() => void newConversation()}
          >
            <Plus class="size-3.5 shrink-0 text-muted-foreground" />
            <span class="font-medium">New chat</span>
            <kbd
              class="ml-auto inline-flex h-5 items-center rounded border border-border bg-muted/60 px-1.5 font-mono text-[10px] text-muted-foreground"
            >{newChatShortcut}</kbd>
          </button>
        </div>

        <div class="app-scroll flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-1.5">
          {#if isDraftChat}
            <button
              type="button"
              class={cn(
                'group/chat relative flex w-full items-start gap-2 rounded-md px-2 py-2 text-left transition-colors',
                'bg-accent/45 ring-1 ring-border/60',
              )}
            >
              <MessageSquare class="mt-0.5 size-3.5 shrink-0 text-primary" />
              <div class="min-w-0 flex-1">
                <span class="block truncate text-ui-xs font-medium text-foreground">New chat</span>
                <span class="text-[10px] text-muted-foreground">Draft · unsaved</span>
              </div>
            </button>
          {/if}

          {#each convList as conv (conv.id)}
            <div class="group relative flex items-stretch">
              <button
                type="button"
                class={cn(
                  'relative flex min-w-0 flex-1 items-start gap-2 rounded-md px-2 py-2 pr-8 text-left transition-colors hover:bg-accent/35',
                  activeConvId === conv.id
                    ? 'bg-accent/45 ring-1 ring-border/60'
                    : 'text-muted-foreground hover:text-foreground',
                )}
                onclick={() => void selectConversation(conv.id)}
                oncontextmenu={(e) => showContextMenu(conv.id, e)}
              >
                {#if activeConvId === conv.id}
                  <span
                    class="absolute top-2 bottom-2 left-0 w-0.5 rounded-full bg-primary"
                    aria-hidden="true"
                  ></span>
                {/if}
                <MessageSquare
                  class={cn(
                    'mt-0.5 size-3.5 shrink-0',
                    activeConvId === conv.id ? 'text-primary' : 'text-muted-foreground/70',
                  )}
                />
                <div class="min-w-0 flex-1">
                  <span class="block truncate text-ui-xs font-medium leading-snug text-foreground">
                    {conv.title}
                  </span>
                  <span class="text-[10px] text-muted-foreground">{relativeTime(conv.updatedAt)}</span>
                </div>
              </button>
              <button
                type="button"
                class="absolute top-1/2 right-1.5 flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-[opacity,color] hover:text-destructive group-hover:opacity-100"
                title="Delete conversation"
                onclick={(e) => { e.stopPropagation(); void removeConversation(conv.id) }}
              >
                <Trash2 class="size-3" />
              </button>
            </div>
          {/each}

          {#if convList.length === 0 && !isDraftChat}
            <div class="flex flex-col items-center gap-2 px-3 py-8 text-center">
              <MessageSquare class="size-7 text-muted-foreground/25" />
              <p class="text-[11px] leading-relaxed text-muted-foreground/70">
                No conversations yet
              </p>
              <p class="text-[10px] leading-relaxed text-muted-foreground/50">
                Chats save automatically as you message
              </p>
            </div>
          {/if}
        </div>
      </aside>
      {/if}

      <!-- ── Main chat area ─────────────────────────────────────────────── -->
      <div class="flex min-h-0 min-w-0 flex-1 flex-col">

        <!-- Header -->
        <div class="flex shrink-0 items-center gap-2 border-b border-border px-3 py-2.5">
          <button
            type="button"
            class={cn(
              'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground',
              !sidebarVisible && 'text-foreground',
            )}
            title={sidebarVisible ? `Hide chats (${modKey}⇧B)` : `Show chats (${modKey}⇧B)`}
            onclick={toggleAiSidebar}
          >
            <PanelLeft class="size-4" />
          </button>
          {#if !sidebarVisible}
            <button
              type="button"
              class="inline-flex h-7 items-center gap-1.5 rounded-md border border-border/80 bg-background px-2 text-ui-xs text-muted-foreground transition-colors hover:text-foreground"
              title="New chat ({newChatShortcut})"
              onclick={() => void newConversation()}
            >
              <Plus class="size-3.5" />
              New chat
            </button>
          {/if}
          <Bot class="size-4 shrink-0 text-primary" />
          <span class="text-sm font-semibold">AI Assistant</span>
          <span class="truncate font-mono text-xs text-muted-foreground">{settings.model}</span>
          <div class="ml-auto flex items-center gap-0.5">
            <button
              type="button"
              class={cn(
                'inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                settingsOpen && 'bg-accent text-foreground',
              )}
              title="Model settings"
              onclick={() => (settingsOpen = !settingsOpen)}
            >
              <Settings2 class="size-3.5" />
            </button>
          </div>
        </div>

        <!-- Settings panel -->
        {#if settingsOpen}
          <div class="shrink-0 border-b border-border bg-muted/20 px-3 py-2.5">
            <div class="flex flex-col gap-2">
              <div class="flex gap-2">
                <div class="flex min-w-0 flex-1 flex-col gap-1">
                  <Label class="text-xs">API base URL</Label>
                  <Input class="h-7 font-mono text-xs" placeholder="https://api.mistral.ai/v1" bind:value={settings.baseUrl} />
                </div>
                <div class="flex w-40 shrink-0 flex-col gap-1">
                  <Label class="text-xs">Model</Label>
                  <Input class="h-7 font-mono text-xs" placeholder="mistral-small-latest" bind:value={settings.model} />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <Label class="text-xs">API key</Label>
                <Input class="h-7 font-mono text-xs" type="password" placeholder="sk-… (leave empty for Ollama)" bind:value={settings.apiKey} />
              </div>
              <div class="flex flex-wrap items-center gap-1.5">
                <span class="text-xs text-muted-foreground">Presets:</span>
                {#each [
                  { label: 'Mistral', url: 'https://api.mistral.ai/v1', model: 'mistral-small-latest' },
                  { label: 'OpenAI', url: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
                  { label: 'Ollama', url: 'http://localhost:11434/v1', model: 'llama3' },
                  { label: 'Gemma', url: 'http://localhost:11434/v1', model: 'gemma3' },
                ] as p (p.label)}
                  <button
                    type="button"
                    class="inline-flex h-5 items-center rounded border border-border px-1.5 font-mono text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    onclick={() => { settings.baseUrl = p.url; settings.model = p.model }}
                  >{p.label}</button>
                {/each}
              </div>
              <div class="flex items-center justify-between gap-2">
                <p class="text-xs text-muted-foreground">Any OpenAI-compatible endpoint.</p>
                <Button size="sm" class="h-7 px-3 text-xs" onclick={saveSettings}>Save</Button>
              </div>
            </div>
          </div>
        {/if}

        <!-- Messages -->
        <div bind:this={scrollEl} class="app-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3">
          {#if items.length === 0}
            <!-- Empty state with suggestions -->
            <div class="flex h-full flex-col items-center justify-center gap-4 py-6">
              <div class="flex flex-col items-center gap-2 text-center">
                <Bot class="size-8 text-muted-foreground/25" />
                <p class="text-sm font-medium text-muted-foreground">Ask anything about your database</p>
                <p class="text-xs text-muted-foreground/60">
                  {schemaContext.activeSchema}/{schemaContext.activeTable ?? '—'}
                </p>
              </div>

              {#if suggestions.length > 0}
                <div class="w-full">
                  <div class="mb-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Zap class="size-3" />
                    <span>Suggestions</span>
                  </div>
                  <div class="flex flex-wrap gap-1.5">
                    {#each suggestions as s (s.label)}
                      <button
                        type="button"
                        class="inline-flex h-7 items-center gap-1 rounded-full border border-border bg-muted/30 px-3 text-xs text-foreground transition-colors hover:bg-accent hover:border-ring/40 disabled:opacity-40"
                        disabled={loading}
                        onclick={() => void send([s.prompt])}
                      >
                        <MessageSquare class="size-3 shrink-0 text-muted-foreground" />
                        {s.label}
                      </button>
                    {/each}
                  </div>
                </div>
              {/if}
            </div>
          {:else}
            <div class="flex flex-col gap-3" data-studio-selectable="text">
              {#each items as item (item.id)}

                {#if item.kind === 'user'}
                  <div class="flex justify-end">
                    <div class="max-w-[80%] rounded-2xl rounded-tr-sm bg-primary px-3.5 py-2 text-sm leading-relaxed text-primary-foreground">
                      {item.text}
                    </div>
                  </div>

                {:else if item.kind === 'thinking'}
                  <div class="flex items-center gap-2 text-xs text-muted-foreground">
                    <Bot class="size-3.5 shrink-0 text-primary/60" />
                    {#if aiStatusHint}
                      <span>{aiStatusHint}</span>
                    {:else}
                      <span class="inline-flex gap-0.5">
                        <span class="animate-bounce" style="animation-delay:0ms">·</span>
                        <span class="animate-bounce" style="animation-delay:150ms">·</span>
                        <span class="animate-bounce" style="animation-delay:300ms">·</span>
                      </span>
                    {/if}
                  </div>

                {:else if item.kind === 'streaming'}
                  <AiMarkdown content={streamingContent} debounceMs={180} streaming />

                {:else if item.kind === 'assistant'}
                  <div class="flex flex-col gap-2">
                    {#each item.parts as part, pi}
                      {#if part.type === 'text'}
                        <AiMarkdown content={part.content} />
                      {:else if part.type === 'mermaid'}
                        <div class="mermaid-output overflow-hidden rounded-lg border border-border">
                          <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/30 px-3 py-1.5">
                            <span class="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Diagram</span>
                            <div class="flex items-center gap-2">
                              <span class="hidden text-[10px] text-muted-foreground/40 sm:block">drag · Ctrl+scroll zoom · dbl-click reset</span>
                              <button
                                type="button"
                                class="inline-flex h-5 items-center gap-1 rounded px-1.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
                                onclick={() => copyText(part.content)}
                              >
                                <Copy class="size-2.5" />Source
                              </button>
                            </div>
                          </div>
                          <div class="mermaid-canvas" use:mermaidInteractive>
                            {@html processMermaidSvg(part.content)}
                          </div>
                        </div>
                      {:else if part.type === 'sql'}
                        {@const sqlKey = `${item.id}-${pi}`}
                        {@const sqlOpen = !collapsed.has(sqlKey)}
                        <div class="overflow-hidden rounded-lg border border-border">
                          <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5">
                            <button
                              type="button"
                              class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                              onclick={() => toggleCollapse(sqlKey)}
                            >
                              {#if sqlOpen}<ChevronDown class="size-3" />{:else}<ChevronRight class="size-3" />{/if}
                              <span class="font-mono">SQL</span>
                            </button>
                            <div class="flex items-center gap-1">
                              <button type="button" class="inline-flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => copyText(part.content)}>
                                <Copy class="size-3" />Copy
                              </button>
                              <button type="button" class="inline-flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => onwritesql(part.content)}>
                                <PenLine class="size-3" />Write
                              </button>
                              <button type="button" class="inline-flex h-6 items-center gap-1 rounded bg-primary px-2 text-xs text-primary-foreground hover:opacity-90 disabled:opacity-50" disabled={loading} onclick={() => void runSqlBlock(part.content)}>
                                <Play class="size-3" />Run
                              </button>
                            </div>
                          </div>
                          <AiSqlBlock sql={part.content} open={sqlOpen} />
                        </div>
                      {:else}
                        {@const codeKey = `${item.id}-${pi}`}
                        {@const codeOpen = !collapsed.has(codeKey)}
                        <div class="overflow-hidden rounded-lg border border-border">
                          <div class="flex items-center justify-between gap-2 border-b border-border/50 bg-muted/40 px-3 py-1.5">
                            <button
                              type="button"
                              class="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
                              onclick={() => toggleCollapse(codeKey)}
                            >
                              {#if codeOpen}<ChevronDown class="size-3" />{:else}<ChevronRight class="size-3" />{/if}
                              <span class="font-mono">{part.lang || 'code'}</span>
                            </button>
                            <button type="button" class="inline-flex h-6 items-center gap-1 rounded px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground" onclick={() => copyText(part.content)}>
                              <Copy class="size-3" />Copy
                            </button>
                          </div>
                          {#if codeOpen}
                            <div class="border-t border-border/50 bg-muted/15">
                              <ShikiBlock code={part.content} lang={part.lang || 'plaintext'} embedded />
                            </div>
                          {/if}
                        </div>
                      {/if}
                    {/each}
                  </div>

                {:else if item.kind === 'executing'}
                  <div class="flex items-center gap-2 rounded-lg border border-border bg-muted/20 px-3 py-1.5 text-xs text-muted-foreground">
                    <span class="inline-flex gap-0.5">
                      <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:0ms]"></span>
                      <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:150ms]"></span>
                      <span class="size-1.5 animate-bounce rounded-full bg-muted-foreground/50 [animation-delay:300ms]"></span>
                    </span>
                    <span class="min-w-0 flex-1 truncate font-mono">Executing: {item.sql}</span>
                  </div>

                {:else if item.kind === 'result'}
                  {@const resOpen = openResultId === item.id}
                  <div class={cn(
                    'overflow-hidden rounded-lg border text-xs',
                    item.error ? 'border-destructive/40 bg-destructive/5' : 'border-border',
                    item.isSchema && 'border-primary/20',
                  )}>
                    <button
                      type="button"
                      class={cn(
                        'flex w-full items-center gap-2 px-3 py-1.5 text-left',
                        item.error ? 'bg-destructive/10'
                          : item.isSchema ? 'bg-primary/8'
                          : 'bg-muted/30',
                        !item.error && resOpen && 'border-b border-border/50',
                        item.error && resOpen && 'border-b border-destructive/30',
                        item.isSchema && resOpen && 'border-b border-primary/20',
                      )}
                      onclick={() => toggleResult(item.id)}
                    >
                      {#if resOpen}<ChevronDown class="size-3 shrink-0 text-muted-foreground" />{:else}<ChevronRight class="size-3 shrink-0 text-muted-foreground" />{/if}
                      <Table2 class={cn('size-3 shrink-0', item.isSchema ? 'text-primary/70' : 'text-muted-foreground')} />
                      <span class="min-w-0 flex-1 truncate font-mono text-muted-foreground">{item.sql || 'Query'}</span>
                      {#if !item.error}
                        <span
                          class="shrink-0 tabular-nums text-muted-foreground"
                          title={item.total.toLocaleString('en-US')}
                        >{formatCompactCount(item.total)} {item.total === 1 ? 'row' : 'rows'}</span>
                      {/if}
                    </button>
                    {#if resOpen}
                      {#if item.error}
                        <p class="px-3 py-2 font-mono text-destructive">{item.error}</p>
                      {:else if item.rows.length === 0}
                        <p class="px-3 py-2 italic text-muted-foreground">No rows returned.</p>
                      {:else}
                        <DataTable
                          columns={item.columns}
                          rows={item.rows.slice(0, 10)}
                          embedded
                          showSelection={false}
                        />
                        {#if item.capped}
                          <p class="flex items-center gap-1.5 border-t border-amber-500/20 bg-amber-500/5 px-3 py-1.5 text-amber-600 dark:text-amber-400">
                            <AlertTriangle class="size-3 shrink-0" />
                            Results capped at {AI_ROW_LIMIT.toLocaleString()} rows to protect performance. Add an explicit LIMIT or WHERE clause.
                          </p>
                        {:else if item.rows.length > 10}
                          <p class="border-t border-border/20 px-3 py-1.5 text-muted-foreground">
                            Showing 10 of {formatCompactCount(item.total)} rows
                          </p>
                        {/if}
                      {/if}
                    {/if}
                  </div>

                {:else if item.kind === 'confirm'}
                  <div class="overflow-hidden rounded-lg border border-destructive/40 bg-destructive/5">
                    <div class="flex items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-3 py-2">
                      <AlertTriangle class="size-3.5 shrink-0 text-destructive" />
                      <span class="text-xs font-medium text-destructive">Confirm destructive operation</span>
                    </div>
                    <pre class="px-3 py-2 font-mono text-xs text-foreground whitespace-pre-wrap">{item.sql}</pre>
                    <div class="flex items-center justify-between gap-2 border-t border-destructive/20 px-3 py-2">
                      <p class="text-xs text-muted-foreground">This cannot be undone.</p>
                      <div class="flex gap-2">
                        <button type="button" class="inline-flex h-7 items-center rounded-md border border-border px-3 text-xs text-muted-foreground hover:bg-accent" onclick={() => item.resolve(false)}>Cancel</button>
                        <button type="button" class="inline-flex h-7 items-center rounded-md bg-destructive px-3 text-xs font-medium text-destructive-foreground hover:opacity-90" onclick={() => item.resolve(true)}>Execute</button>
                      </div>
                    </div>
                  </div>
                {/if}

              {/each}
            </div>
          {/if}
        </div>

        <!-- Error bar -->
        {#if error}
          <div class="shrink-0 border-t border-destructive/30 bg-destructive/8 px-3 py-2 text-xs text-destructive">{error}</div>
        {/if}

        <!-- Input -->
        <div class="shrink-0 border-t border-border bg-background px-3 pb-3 pt-2.5">
          <div class={cn(
            'flex flex-col rounded-xl border bg-background transition-colors',
            hasPendingConfirm
              ? 'border-border opacity-60'
              : 'border-border focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/20',
          )}>
            <textarea
              bind:this={inputRef}
              class="min-h-[2.75rem] flex-1 resize-none bg-transparent px-3.5 pt-2.5 pb-1.5 text-sm leading-relaxed outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed"
              style="height:auto;overflow-y:hidden"
              placeholder={hasPendingConfirm ? 'Confirm or cancel the operation above…' : 'Ask anything about your database…'}
              rows={1}
              value={inputText}
              oninput={(e) => { inputText = /** @type {HTMLTextAreaElement} */ (e.target).value; resizeInput(); pushHistory(inputText) }}
              onkeydown={handleKeydown}
              disabled={hasPendingConfirm}
            ></textarea>
            <!-- toolbar row -->
            <div class="flex items-center justify-between px-2 pb-1.5">
              <div class="flex items-center gap-0.5">
                <button
                  type="button"
                  disabled={!canUndo || hasPendingConfirm}
                  onclick={undoInput}
                  title="Undo ({modKey}+Z)"
                  class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Undo2 class="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={!canRedo || hasPendingConfirm}
                  onclick={redoInput}
                  title="Redo ({modKey}+Shift+Z)"
                  class="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
                >
                  <Redo2 class="size-3.5" />
                </button>
              </div>
              {#if loading}
                <button
                  type="button"
                  class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-destructive text-destructive-foreground transition-opacity hover:opacity-80"
                  onclick={stop}
                  aria-label="Stop generating"
                  title="Stop generating"
                >
                  <Square class="size-3 fill-current" />
                </button>
              {:else}
                <button
                  type="button"
                  class="flex size-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-30"
                  disabled={hasPendingConfirm || !inputText.trim()}
                  onclick={() => void send()}
                  aria-label="Send"
                >
                  <Send class="size-3.5" />
                </button>
              {/if}
            </div>
          </div>
          <p class="mt-1.5 text-[11px] text-muted-foreground/50">
            Enter to send · Shift+Enter new line · {modKey}+Z undo · / focus
          </p>
        </div>

      </div>
    </div>

    <!-- ── Right-click context menu ─────────────────────────────────────── -->
    {#if contextMenu}
      {@const menu = contextMenu}
      <!-- invisible backdrop to close on outside click -->
      <div
        role="presentation"
        class="fixed inset-0 z-[200]"
        onclick={closeContextMenu}
        oncontextmenu={closeContextMenu}
      ></div>
      <div
        class="fixed z-[201] min-w-[10rem] overflow-hidden rounded-md border border-border bg-popover py-1 shadow-lg"
        style="left:{menu.x}px;top:{menu.y}px"
      >
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs hover:bg-accent"
          onclick={() => { void selectConversation(menu.id); closeContextMenu() }}
        >
          Open
        </button>
        <div class="my-1 h-px bg-border"></div>
        <button
          type="button"
          class="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-destructive hover:bg-destructive/10"
          onclick={() => void removeConversation(menu.id)}
        >
          <Trash2 class="size-3" /> Delete
        </button>
      </div>
    {/if}
</div>

<style>
  :global(.prose-ai) {
    font-family: "Geist Variable", ui-sans-serif, system-ui, sans-serif;
    font-size: 0.875rem;
    line-height: 1.7;
    color: var(--foreground);
    word-break: break-word;
    font-optical-sizing: auto;
  }
  :global(.prose-ai > *:first-child) { margin-top: 0; }
  :global(.prose-ai > *:last-child) { margin-bottom: 0; }
  :global(.prose-ai p) { margin: 0.35rem 0; }
  :global(.prose-ai strong) { font-weight: 600; }
  :global(.prose-ai em) { font-style: italic; }
  :global(.prose-ai h1, .prose-ai h2, .prose-ai h3, .prose-ai h4) {
    font-weight: 600;
    line-height: 1.3;
    margin: 0.75rem 0 0.25rem;
    color: var(--foreground);
  }
  :global(.prose-ai h1) { font-size: 1rem; }
  :global(.prose-ai h2) { font-size: 0.9375rem; }
  :global(.prose-ai h3) { font-size: 0.875rem; }
  :global(.prose-ai ul) { padding-left: 1.25rem; list-style-type: disc; margin: 0.35rem 0; }
  :global(.prose-ai ol) { padding-left: 1.25rem; list-style-type: decimal; margin: 0.35rem 0; }
  :global(.prose-ai li) { margin: 0.15rem 0; }
  :global(.prose-ai code) {
    font-family: ui-monospace, 'Geist Mono', monospace;
    font-size: 0.8em;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 3px;
    padding: 0.1em 0.3em;
  }
  :global(.prose-ai pre:not(.shiki)) {
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    overflow-x: auto;
    margin: 0.5rem 0;
  }
  :global(.prose-ai pre:not(.shiki) code) {
    background: none;
    border: none;
    padding: 0;
    font-size: 0.8rem;
  }
  :global(.prose-ai pre.shiki) {
    margin: 0.5rem 0;
    border: 1px solid var(--border);
    border-radius: 6px;
    overflow-x: auto;
    background: var(--editor-surface) !important;
  }
  :global(.prose-ai pre.shiki code) {
    font-family: ui-monospace, 'Geist Mono', monospace;
    font-size: 0.8rem;
    line-height: 1.55;
  }
  :global(.prose-ai-loading pre.shiki) {
    opacity: 0.7;
  }
  :global(.prose-ai table) {
    border-collapse: collapse;
    width: 100%;
    font-size: 0.8125rem;
    margin: 0.5rem 0;
  }
  :global(.prose-ai th) {
    border: 1px solid var(--border);
    padding: 0.35rem 0.75rem;
    background: var(--muted);
    font-weight: 600;
    text-align: left;
    color: var(--muted-foreground);
  }
  :global(.prose-ai td) {
    border: 1px solid var(--border);
    padding: 0.3rem 0.75rem;
    font-family: ui-monospace, 'Geist Mono', monospace;
    font-size: 0.8rem;
  }
  :global(.prose-ai tr:nth-child(even) td) { background: color-mix(in oklch, var(--muted) 40%, transparent); }
  :global(.prose-ai blockquote) {
    border-left: 2px solid var(--border);
    padding-left: 0.75rem;
    color: var(--muted-foreground);
    margin: 0.35rem 0;
  }
  :global(.prose-ai a) {
    color: var(--link);
    text-decoration: underline;
    text-underline-offset: 2px;
    text-decoration-color: color-mix(in oklch, var(--link) 45%, transparent);
  }
  :global(.prose-ai a:hover) {
    color: var(--link-hover);
    text-decoration-color: var(--link);
  }
  :global(.prose-ai hr) { border: none; border-top: 1px solid var(--border); margin: 0.75rem 0; }

  :global(.mermaid-canvas) {
    cursor: grab;
    overflow: hidden;
    position: relative;
    padding: 1rem;
    /* background is set directly by the mermaidInteractive action */
    background: #ffffff;
    /* Block app :root tokens that collide with beautiful-mermaid variable names */
    --muted: unset;
    --accent: unset;
    --border: unset;
  }
  :global(.mermaid-canvas.is-dragging) { cursor: grabbing; }

  :global(.mermaid-canvas svg) {
    display: block;
    /* Respect the SVG's natural size; shrink only if wider than the container */
    max-width: 100%;
    width: auto;
    height: auto;
    transform-origin: 0 0;
    user-select: none;
    -webkit-user-select: none;
  }
</style>
