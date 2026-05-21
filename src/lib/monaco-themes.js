import * as monaco from 'monaco-editor'

let defined = false

/** Register light/dark editor themes aligned with app panel colors. */
export function defineDbStudioMonacoThemes() {
  if (defined) return
  defined = true

  monaco.editor.defineTheme('db-studio-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '8b8b8b', fontStyle: 'italic' },
      { token: 'string', foreground: '0d7d4d' },
      { token: 'number', foreground: '0b5cad' },
      { token: 'keyword', foreground: '5b21b6' },
    ],
    colors: {
      'editor.background': '#fafafa',
      'editor.foreground': '#1a1a1a',
      'editorLineNumber.foreground': '#a3a3a3',
      'editorLineNumber.activeForeground': '#525252',
      'editor.selectionBackground': '#d4d4d480',
      'editor.inactiveSelectionBackground': '#d4d4d440',
      'editor.lineHighlightBackground': '#f0f0f0',
      'editorCursor.foreground': '#1a1a1a',
      'editorWidget.background': '#ffffff',
      'editorWidget.border': '#e5e5e5',
      'editorIndentGuide.background': '#e5e5e5',
      'editorIndentGuide.activeBackground': '#d4d4d4',
    },
  })

  monaco.editor.defineTheme('db-studio-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '737373', fontStyle: 'italic' },
      { token: 'string', foreground: '7ee787' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'keyword', foreground: 'd2a8ff' },
    ],
    colors: {
      'editor.background': '#141414',
      'editor.foreground': '#e8e8e8',
      'editorLineNumber.foreground': '#666666',
      'editorLineNumber.activeForeground': '#a3a3a3',
      'editor.selectionBackground': '#3a3a3a99',
      'editor.inactiveSelectionBackground': '#3a3a3a55',
      'editor.lineHighlightBackground': '#1c1c1c',
      'editorCursor.foreground': '#f5f5f5',
      'editorWidget.background': '#1a1a1a',
      'editorWidget.border': '#2e2e2e',
      'editorIndentGuide.background': '#2a2a2a',
      'editorIndentGuide.activeBackground': '#404040',
    },
  })
}

/** @param {'light' | 'dark'} theme */
export function monacoThemeId(theme) {
  return theme === 'light' ? 'db-studio-light' : 'db-studio-dark'
}
