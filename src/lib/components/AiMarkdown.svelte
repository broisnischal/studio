<script>
  import { marked } from 'marked'
  import { mode } from 'mode-watcher'
  import { highlightMarkdownHtml } from '$lib/markdown-highlight.js'
  import { cn } from '$lib/utils.js'

  let { content = '', class: className = '', debounceMs = 0, streaming = false } = $props()

  let html = $state('')
  let loading = $state(false)

  const appTheme = $derived(mode.current === 'light' ? 'light' : 'dark')

  $effect(() => {
    const md = content
    const theme = appTheme
    // During streaming: render synchronously without highlighting to keep up with tokens.
    // After streaming ends the item is replaced so no re-render needed here.
    if (streaming) {
      if (!md.trim()) { html = ''; return }
      html = /** @type {string} */ (marked.parse(md, { breaks: true, gfm: true }))
      return
    }

    const wait = debounceMs
    let cancelled = false
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer

    async function render() {
      if (!md.trim()) {
        html = ''
        loading = false
        return
      }
      loading = true
      try {
        const raw = /** @type {string} */ (marked.parse(md, { breaks: true, gfm: true }))
        const highlighted = await highlightMarkdownHtml(raw, theme)
        if (!cancelled) html = highlighted
      } catch {
        if (!cancelled) {
          html = /** @type {string} */ (marked.parse(md, { breaks: true, gfm: true }))
        }
      } finally {
        if (!cancelled) loading = false
      }
    }

    if (wait > 0) {
      timer = setTimeout(() => void render(), wait)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }

    void render()
    return () => {
      cancelled = true
    }
  })
</script>

<div class={cn('prose-ai', className, loading && 'prose-ai-loading')}>
  {@html html}
  {#if streaming}
    <span class="ml-px inline-block h-[0.85em] w-px translate-y-px animate-pulse bg-foreground/70 align-middle"></span>
  {/if}
</div>
