<script>
  import { tick } from 'svelte'
  import Copy from '@lucide/svelte/icons/copy'
  import Check from '@lucide/svelte/icons/check'
  import { appThemeId } from '$lib/stores/settings.js'
  import { highlightCode } from '$lib/shiki-highlighter.js'
  import { formatJsonValue } from '$lib/row-inspector.js'
  import { linkifyJsonInElement } from '$lib/json-inspector.js'

  const TRUNCATE_LIMIT = 200

  let {
    record,
    rowLabel = '',
    maxHeight = 'min(50vh, 20rem)',
  } = $props()

  let html = $state('')
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null
  /** @type {HTMLDivElement | null} */
  let rootEl = $state(null)

  /** Full JSON — used for copying. */
  const jsonText = $derived(formatJsonValue(record))

  /** JSON with long strings truncated — used for display / highlighting. */
  const displayText = $derived(formatJsonValue(truncateDeep(record, TRUNCATE_LIMIT)))

  const appTheme = $derived($appThemeId)

  /**
   * Recursively truncate string values longer than `limit` chars.
   * Copies the structure; does not mutate the original.
   * @param {unknown} value
   * @param {number} limit
   * @returns {unknown}
   */
  function truncateDeep(value, limit) {
    if (typeof value === 'string') {
      return value.length > limit ? value.slice(0, limit) + '…' : value
    }
    if (Array.isArray(value)) {
      return value.map((v) => truncateDeep(v, limit))
    }
    if (value !== null && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(/** @type {Record<string, unknown>} */ (value)).map(([k, v]) => [
          k,
          truncateDeep(v, limit),
        ])
      )
    }
    return value
  }

  $effect(() => {
    const source = displayText
    const theme = appTheme
    let cancelled = false
    highlightCode(source, 'json', theme)
      .then((result) => { if (!cancelled) html = result })
      .catch(() => {
        if (!cancelled)
          html = `<pre class="m-0 p-0 font-mono text-ui-2xs leading-relaxed whitespace-pre text-foreground">${escapeHtml(source)}</pre>`
      })
    return () => { cancelled = true }
  })

  $effect(() => {
    if (!html || !rootEl) return
    const source = displayText
    void tick().then(() => {
      const pre = rootEl?.querySelector('pre')
      if (pre instanceof HTMLElement) linkifyJsonInElement(pre, source)
    })
  })

  /** @param {string} s */
  function escapeHtml(s) {
    return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  }

  async function copyJson() {
    try {
      await navigator.clipboard.writeText(jsonText)
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
</script>

<div class="border-t border-border/50" style:max-height={maxHeight} style="overflow-y:auto">
  <div class="studio-chrome sticky top-0 z-10 flex items-center justify-between border-b border-border/50 bg-panel px-3 py-0.5">
    {#if rowLabel}
      <span class="font-mono text-ui-2xs text-muted-foreground/40 select-none">{rowLabel}</span>
    {/if}
    <button
      type="button"
      class="mr-auto inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-ui-2xs text-muted-foreground transition-colors hover:bg-accent/40 hover:text-foreground"
      onclick={copyJson}
    >
      {#if copied}
        <Check class="size-3 text-green-500" />
        Copied
      {:else}
        <Copy class="size-3" />
        Copy JSON
      {/if}
    </button>
  </div>
  <div
    bind:this={rootEl}
    data-studio-selectable="text"
    class="overflow-x-auto px-3 py-2"
  >
    {#if !html}
      <p class="font-mono text-ui-2xs text-muted-foreground/50">Loading…</p>
    {:else}
      <div
        class="[&_pre]:m-0 [&_pre]:bg-transparent! [&_pre]:p-0 [&_pre]:font-mono [&_pre]:text-ui-2xs [&_pre]:leading-relaxed [&_pre]:whitespace-pre [&_.json-inspector-url]:text-link [&_.json-inspector-url]:underline [&_.json-inspector-url]:underline-offset-2"
      >
        {@html html}
      </div>
    {/if}
  </div>
</div>
