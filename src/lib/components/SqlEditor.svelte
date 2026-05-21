<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'
  import { defineDbStudioMonacoThemes, monacoThemeId } from '$lib/monaco-themes.js'
  import { mode } from 'mode-watcher'

  let {
    value = $bindable(''),
    class: className = '',
    readOnly = false,
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
    ed.addCommand(KeyMod.CtrlCmd | KeyCode.KeyS, () => run(onmods))
  }

  onMount(() => {
    configureMonacoWorkers()
    defineDbStudioMonacoThemes()
    if (!container) return

    editor = monaco.editor.create(container, {
      value,
      language: 'sql',
      theme: monacoThemeId(appTheme),
      automaticLayout: true,
      minimap: { enabled: false },
      fontFamily: 'var(--font-mono)',
      fontSize: 13,
      lineHeight: 20,
      padding: { top: 12, bottom: 12 },
      scrollBeyondLastLine: false,
      wordWrap: 'on',
      readOnly,
      renderLineHighlight: 'line',
      scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 },
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
</script>

<div
  bind:this={container}
  class="h-full min-h-0 w-full overflow-hidden rounded-md border border-border bg-panel {className}"
></div>
