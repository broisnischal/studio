<script>
  import { highlightCode } from '$lib/shiki-highlighter.js'
  import { mode } from 'mode-watcher'

  let {
    code = '',
    lang = 'plaintext',
  } = $props()

  let html = $state('')
  let loading = $state(false)

  const appTheme = $derived(mode.current === 'light' ? 'light' : 'dark')

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
          html = `<pre class="p-3 font-mono text-[12px] text-foreground whitespace-pre-wrap break-all">${escapeHtml(source)}</pre>`
        }
      })
      .finally(() => {
        if (!cancelled) loading = false
      })
    return () => {
      cancelled = true
    }
  })

  /** @param {string} s */
  function escapeHtml(s) {
    return s
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
  }
</script>

<div class="relative min-h-0 flex-1 overflow-auto bg-panel">
  {#if loading && !html}
    <p class="px-3 py-4 font-mono text-[12px] text-muted-foreground">Highlighting…</p>
  {:else}
    <div
      class="shiki-block contents [&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-3 [&_pre]:font-mono [&_pre]:text-[12px] [&_pre]:leading-relaxed [&_pre]:whitespace-pre-wrap [&_pre]:break-all"
    >
      {@html html}
    </div>
  {/if}
</div>
