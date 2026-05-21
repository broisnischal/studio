<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { registerMonacoSqlFormatter } from '$lib/format-sql.js'
  import { registerMonacoSqlCompletion } from '$lib/monaco-sql-complete.js'
  import {
    defineDbStudioMonacoThemes,
    monacoThemeId,
    readEditorFontOptions,
  } from '$lib/monaco-themes.js'
  import { mode } from 'mode-watcher'
  import { cn } from '$lib/utils.js'

  /** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

  let {
    value = $bindable(''),
    class: className = '',
    readOnly = false,
    schemaHints = /** @type {SqlSchemaHints} */ ({}),
    onmodk = undefined,
    onmodenter = undefined,
    onmods = undefined,
  } = $props()

  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null

  const appTheme = $derived(mode.current === 'light' ? 'light' : 'dark')

  /** @param {monaco.editor.IStandaloneCodeEditor} ed */
  function registerAppShortcuts(ed) {
    const KeyMod = monaco.KeyMod
    const KeyCode = monaco.KeyCode

    /** @param {() => void | undefined} fn */
    function run(fn) {
      fn?.()
    }

    ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyK, () => run(onmodk))
    ed.addCommand(KeyMod.CtrlCmd | KeyCode.Enter, () => run(onmodenter))
    ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, async () => {
      await ed.getAction('editor.action.formatDocument')?.run()
      run(onmods)
    })
  }

  onMount(() => {
    configureMonacoWorkers()
    defineDbStudioMonacoThemes()
    registerMonacoSqlFormatter(monaco)
    registerMonacoSqlCompletion(monaco, () => schemaHints)
    if (!container) return

    const { fontSize, lineHeight } = readEditorFontOptions()

    editor = monaco.editor.create(container, {
      value,
      language: 'sql',
      theme: monacoThemeId(appTheme),
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: '"Geist Mono Variable", ui-monospace, monospace',
      fontSize,
      lineHeight,
      fontLigatures: false,
      fontWeight: 'normal',
      padding: { top: 14, bottom: 14 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      renderLineHighlight: 'line',
      lineNumbers: 'on',
      lineNumbersMinChars: 3,
      scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10 },
      cursorBlinking: 'smooth',
      smoothScrolling: true,
      quickSuggestions: {
        other: true,
        comments: false,
        strings: true,
      },
      suggestOnTriggerCharacters: true,
      tabCompletion: 'on',
      wordBasedSuggestions: 'off',
      acceptSuggestionOnEnter: 'on',
      snippetSuggestions: 'inline',
    })

    registerAppShortcuts(editor)

    editor.onDidChangeModelContent(() => {
      const next = editor?.getValue() ?? ''
      if (next !== value) value = next
    })

    return () => {
      editor?.dispose()
      editor = null
    }
  })

  $effect(() => {
    if (!editor) return
    const current = editor.getValue()
    if (current !== value) editor.setValue(value)
  })

  $effect(() => {
    if (!editor) return
    editor.updateOptions({ readOnly })
  })

  $effect(() => {
    if (!editor) return
    monaco.editor.setTheme(monacoThemeId(appTheme))
  })

  $effect(() => {
    if (!editor) return
    const { fontSize, lineHeight } = readEditorFontOptions()
    editor.updateOptions({ fontSize, lineHeight })
  })
</script>

<div
  bind:this={container}
  class={cn(
    'sql-editor-host h-full min-h-0 w-full overflow-hidden rounded-lg border border-border',
    className,
  )}
></div>

<style>
  .sql-editor-host :global(.monaco-editor),
  .sql-editor-host :global(.monaco-editor .margin),
  .sql-editor-host :global(.monaco-editor-background) {
    border-radius: inherit;
  }

  .sql-editor-host :global(.monaco-editor .view-lines),
  .sql-editor-host :global(.monaco-editor .view-line) {
    font-weight: 400 !important;
  }
</style>
