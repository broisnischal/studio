<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { defineDbStudioMonacoThemes, monacoThemeId, readEditorFontOptions } from '$lib/monaco-themes.js'
  import { normalizeThemeId } from '$lib/themes/registry.js'
  import Table2 from '@lucide/svelte/icons/table-2'
  import Copy from '@lucide/svelte/icons/copy'
  import Download from '@lucide/svelte/icons/download'
  import CheckCheck from '@lucide/svelte/icons/check-check'

  let {
    json = '[]',
    rowCount = 0,
    onshowtable = () => {},
    ondownload = /** @type {(() => void) | undefined} */ (undefined),
  } = $props()

  /** @type {HTMLElement | null} */
  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null
  let copied = $state(false)
  /** @type {ReturnType<typeof setTimeout> | null} */
  let copiedTimer = null

  function currentTheme() {
    return normalizeThemeId(document.documentElement.dataset.theme)
  }

  function handleCopy() {
    navigator.clipboard.writeText(json).then(() => {
      copied = true
      if (copiedTimer) clearTimeout(copiedTimer)
      copiedTimer = setTimeout(() => { copied = false }, 2000)
    })
  }

  onMount(() => {
    defineDbStudioMonacoThemes()
    if (!container) return

    const { fontSize, lineHeight } = readEditorFontOptions()

    editor = monaco.editor.create(container, {
      value: json,
      language: 'json',
      theme: monacoThemeId(currentTheme()),
      readOnly: true,
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize,
      lineHeight,
      fontLigatures: false,
      fontWeight: 'normal',
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      wordWrap: 'off',
      renderLineHighlight: 'none',
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      glyphMargin: false,
      folding: true,
      foldingHighlight: false,
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
      overviewRulerLanes: 0,
      hideCursorInOverviewRuler: true,
      overviewRulerBorder: false,
      smoothScrolling: true,
      cursorStyle: 'line-thin',
      contextmenu: false,
      selectionHighlight: false,
      occurrencesHighlight: 'off',
      codeLens: false,
      renderValidationDecorations: 'off',
    })

    const themeObs = new MutationObserver(() => {
      monaco.editor.setTheme(monacoThemeId(currentTheme()))
    })
    themeObs.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-theme'],
    })

    return () => {
      editor?.dispose()
      editor = null
      themeObs.disconnect()
    }
  })

  $effect(() => {
    if (!editor) return
    if (editor.getValue() !== json) editor.setValue(json)
  })
</script>

<div class="relative flex min-h-0 flex-1 overflow-hidden">
  <!-- Monaco JSON editor (full area) -->
  <div bind:this={container} class="absolute inset-0 h-full w-full"></div>

  <!-- Overlay toolbar — top right, matching screenshot style -->
  <div class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-end gap-2 p-2">
    <div class="pointer-events-auto flex items-center gap-0.5 rounded-lg border border-border/50 bg-background/85 px-1 py-1 shadow-md backdrop-blur-sm">
      {#if rowCount > 0}
        <span class="select-none px-2 font-mono text-ui-2xs text-muted-foreground">{rowCount} rows</span>
        <div class="h-4 w-px bg-border/60"></div>
      {/if}

      <button
        type="button"
        title="Copy JSON"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-ui-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        onclick={handleCopy}
      >
        {#if copied}
          <CheckCheck class="size-3.5 shrink-0 text-green-500" />
          <span>Copied</span>
        {:else}
          <Copy class="size-3.5 shrink-0" />
          <span>Copy</span>
        {/if}
      </button>

      {#if ondownload}
        <button
          type="button"
          title="Download JSON"
          class="inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          onclick={ondownload}
        >
          <Download class="size-3.5 shrink-0" />
        </button>
      {/if}

      <div class="h-4 w-px bg-border/60"></div>

      <button
        type="button"
        class="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-ui-xs font-medium text-foreground transition-colors hover:bg-muted"
        onclick={onshowtable}
      >
        <Table2 class="size-3.5 shrink-0" />
        Show table
      </button>
    </div>
  </div>
</div>

<style>
  div :global(.monaco-editor),
  div :global(.monaco-editor .margin),
  div :global(.monaco-editor-background) {
    border-radius: 0 !important;
  }

  div :global(.monaco-editor .view-lines),
  div :global(.monaco-editor .view-line) {
    font-weight: 400 !important;
  }
</style>
