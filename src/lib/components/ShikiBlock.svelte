<script>
  import { tick } from 'svelte'
  import { highlightCode } from '$lib/shiki-highlighter.js'
  import { mode } from 'mode-watcher'
  import {
    getJsonValueRangeAtOffset,
    getTextOffsetInRoot,
    linkifyJsonInElement,
    selectTextOffsets,
  } from '$lib/json-inspector.js'

  let {
    code = '',
    lang = 'plaintext',
    /** Enable JSON value select-on-dblclick and clickable URLs */
    jsonInteractive = false,
  } = $props()

  let html = $state('')
  let loading = $state(false)
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)

  const appTheme = $derived(mode.current === 'light' ? 'light' : 'dark')
  const isJsonInteractive = $derived(jsonInteractive && lang === 'json')

  $effect(() => {
    const source = code ?? ''
    const language = lang
    const theme = appTheme
    let cancelled = false
    loading = true
    highlightCode(source, language, theme)
      .then((result) => {
        if (!cancelled) html = result
      })
      .catch(() => {
        if (!cancelled) {
          html = `<pre class="p-3 font-mono text-ui-sm text-foreground whitespace-pre-wrap break-all">${escapeHtml(source)}</pre>`
        }
      })
      .finally(() => {
        if (!cancelled) loading = false
      })
    return () => {
      cancelled = true
    }
  })

  $effect(() => {
    if (!isJsonInteractive || !html || !rootEl) return
    const source = code ?? ''
    void tick().then(() => {
      const pre = rootEl?.querySelector('pre')
      if (pre instanceof HTMLElement) linkifyJsonInElement(pre, source)
    })
  })

  /** @param {string} s */
  function escapeHtml(s) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }

  /** @param {MouseEvent} e */
  function caretRangeFromEvent(e) {
    if (document.caretRangeFromPoint) {
      return document.caretRangeFromPoint(e.clientX, e.clientY)
    }
    const pos = document.caretPositionFromPoint?.(e.clientX, e.clientY)
    if (!pos) return null
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    return range
  }

  /** @param {MouseEvent} e */
  function handleDblClick(e) {
    if (!isJsonInteractive || !rootEl) return
    const pre = rootEl.querySelector('pre')
    if (!(pre instanceof HTMLElement)) return

    const range = caretRangeFromEvent(e)
    if (!range) return

    const offset = getTextOffsetInRoot(pre, range.startContainer, range.startOffset)
    const valueRange = getJsonValueRangeAtOffset(code ?? '', offset)
    if (!valueRange) return

    e.preventDefault()
    selectTextOffsets(pre, valueRange.start, valueRange.end)
  }

</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  bind:this={rootEl}
  class="app-scroll relative min-h-0 flex-1 overflow-auto bg-panel"
  ondblclick={handleDblClick}
>
  {#if loading && !html}
    <p class="px-3 py-4 font-mono text-ui-sm text-muted-foreground">Highlighting…</p>
  {:else}
    <div
      class="shiki-block contents [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-ui-sm [&_pre]:leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre]:break-all [&_.json-inspector-url]:cursor-pointer [&_.json-inspector-url]:text-primary [&_.json-inspector-url]:underline [&_.json-inspector-url]:underline-offset-2 [&_.json-inspector-url]:decoration-primary/50 hover:[&_.json-inspector-url]:decoration-primary"
    >
      {@html html}
    </div>
  {/if}
</div>
