<script>
  import { marked } from 'marked'
  import { mode } from 'mode-watcher'
  import { highlightMarkdownHtml } from '$lib/markdown-highlight.js'
  import { cn } from '$lib/utils.js'

  let { content = '', class: className = '', debounceMs = 0, streaming = false } = $props()

  /** @param {HTMLElement} node */
  function copyButtons(node) {
    function inject() {
      node.querySelectorAll('pre.shiki:not([data-copy-injected])').forEach((pre) => {
        pre.setAttribute('data-copy-injected', '1')
        pre.style.position = 'relative'
        const wrapper = document.createElement('div')
        wrapper.className = 'shiki-copy-wrap'
        wrapper.style.cssText = 'position:relative;display:contents'
        const btn = document.createElement('button')
        btn.type = 'button'
        btn.setAttribute('aria-label', 'Copy code')
        btn.className =
          'shiki-copy-btn absolute right-2 top-2 z-10 inline-flex size-6 items-center justify-center rounded border border-[var(--border)] bg-[var(--background)]/80 text-[var(--muted-foreground)] opacity-0 transition-opacity backdrop-blur-sm hover:text-[var(--foreground)]'
        btn.innerHTML =
          '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
        btn.addEventListener('click', async () => {
          const text = pre.querySelector('code')?.textContent ?? pre.textContent ?? ''
          await navigator.clipboard.writeText(text).catch(() => {})
          btn.innerHTML =
            '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="color:#22c55e"><polyline points="20 6 9 17 4 12"/></svg>'
          setTimeout(() => {
            btn.innerHTML =
              '<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>'
          }, 1500)
        })
        pre.addEventListener('mouseenter', () => { btn.style.opacity = '1' })
        pre.addEventListener('mouseleave', () => { btn.style.opacity = '0' })
        pre.appendChild(btn)
      })
    }

    const obs = new MutationObserver(inject)
    obs.observe(node, { childList: true, subtree: true })
    inject()
    return { destroy() { obs.disconnect() } }
  }

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

<div class={cn('prose-ai', className, loading && 'prose-ai-loading')} use:copyButtons>
  {@html html}
  {#if streaming}
    <span class="ml-px inline-block h-[0.85em] w-px translate-y-px animate-pulse bg-foreground/70 align-middle"></span>
  {/if}
</div>
