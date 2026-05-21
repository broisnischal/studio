<script>
  import { onMount } from 'svelte'
  import * as monaco from 'monaco-editor'
  import { configureMonacoWorkers } from '$lib/monaco-env.js'

  let {
    value = $bindable(''),
    class: className = '',
    readOnly = false,
  } = $props()

  let container = $state(null)
  /** @type {monaco.editor.IStandaloneCodeEditor | null} */
  let editor = null

  onMount(() => {
    configureMonacoWorkers()
    if (!container) return

    editor = monaco.editor.create(container, {
      value,
      language: 'sql',
      theme: 'vs-dark',
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
</script>

<div
  bind:this={container}
  class="h-full min-h-0 w-full overflow-hidden rounded-md border border-border bg-[#1e1e1e] {className}"
></div>
