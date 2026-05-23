import * as monaco from 'monaco-editor'

let defined = false

/** Editor chrome colors (hex) — kept in sync with app.css :root warm light palette. */
const light = {
  background: '#fffdf7',
  foreground: '#393a34',
  lineNumber: '#a8a29e',
  lineNumberActive: '#57534e',
  lineHighlight: '#f0ede4',
  selection: '#393a3420',
  selectionInactive: '#393a3410',
  cursor: '#393a34',
  widgetBg: '#fffdf7',
  widgetBorder: '#dfd9ce',
  indent: '#e5e0d6',
  indentActive: '#d4cec2',
}

const dark = {
  background: '#1c1c1c',
  foreground: '#ebebeb',
  lineNumber: '#6b7280',
  lineNumberActive: '#9ca3af',
  lineHighlight: '#262626',
  selection: '#3b4a5c99',
  selectionInactive: '#3b4a5c44',
  cursor: '#f5f5f5',
  widgetBg: '#232323',
  widgetBorder: '#363636',
  indent: '#2e2e2e',
  indentActive: '#454545',
}

/** Register light/dark editor themes aligned with app panel colors. */
export function defineDbStudioMonacoThemes() {
  if (defined) return
  defined = true

  monaco.editor.defineTheme('db-studio-light', {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'comment', foreground: 'a0a096', fontStyle: 'italic' },
      { token: 'string', foreground: '1e754f' },
      { token: 'string.sql', foreground: '1e754f' },
      { token: 'number', foreground: '2993a3' },
      { token: 'number.float', foreground: '2993a3' },
      { token: 'keyword', foreground: 'a65e2b' },
      { token: 'keyword.sql', foreground: 'a65e2b' },
      { token: 'operator', foreground: '4e4f47' },
      { token: 'delimiter', foreground: '4e4f47' },
      { token: 'identifier', foreground: '393a34' },
    ],
    colors: {
      'editor.background': light.background,
      'editor.foreground': light.foreground,
      'editorLineNumber.foreground': light.lineNumber,
      'editorLineNumber.activeForeground': light.lineNumberActive,
      'editor.selectionBackground': light.selection,
      'editor.inactiveSelectionBackground': light.selectionInactive,
      'editor.lineHighlightBackground': light.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': light.cursor,
      'editorWidget.background': light.widgetBg,
      'editorWidget.border': light.widgetBorder,
      'editorIndentGuide.background': light.indent,
      'editorIndentGuide.activeBackground': light.indentActive,
      'editorBracketMatch.background': '#e5e0d688',
      'editorBracketMatch.border': '#a8a29e',
    },
  })

  monaco.editor.defineTheme('db-studio-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6b7280', fontStyle: 'italic' },
      { token: 'string', foreground: '7ee787' },
      { token: 'string.sql', foreground: '7ee787' },
      { token: 'number', foreground: '79c0ff' },
      { token: 'number.float', foreground: '79c0ff' },
      { token: 'keyword', foreground: 'c4b5fd' },
      { token: 'keyword.sql', foreground: 'c4b5fd' },
      { token: 'operator', foreground: 'd1d5db' },
      { token: 'delimiter', foreground: '9ca3af' },
      { token: 'identifier', foreground: 'ebebeb' },
    ],
    colors: {
      'editor.background': dark.background,
      'editor.foreground': dark.foreground,
      'editorLineNumber.foreground': dark.lineNumber,
      'editorLineNumber.activeForeground': dark.lineNumberActive,
      'editor.selectionBackground': dark.selection,
      'editor.inactiveSelectionBackground': dark.selectionInactive,
      'editor.lineHighlightBackground': dark.lineHighlight,
      'editor.lineHighlightBorder': '#00000000',
      'editorCursor.foreground': dark.cursor,
      'editorWidget.background': dark.widgetBg,
      'editorWidget.border': dark.widgetBorder,
      'editorIndentGuide.background': dark.indent,
      'editorIndentGuide.activeBackground': dark.indentActive,
      'editorBracketMatch.background': '#40404088',
      'editorBracketMatch.border': '#6b7280',
    },
  })
}

/** @param {'light' | 'dark'} theme */
export function monacoThemeId(theme) {
  return theme === 'light' ? 'db-studio-light' : 'db-studio-dark'
}

/** Read editor font metrics from CSS (falls back to 16 / 26). */
export function readEditorFontOptions() {
  if (typeof document === 'undefined') {
    return { fontSize: 16, lineHeight: 26 }
  }
  const root = document.documentElement
  const size = parseFloat(getComputedStyle(root).getPropertyValue('--editor-font-size'))
  const line = parseFloat(getComputedStyle(root).getPropertyValue('--editor-line-height'))
  return {
    fontSize: Number.isFinite(size) && size >= 12 ? size : 16,
    lineHeight: Number.isFinite(line) && line >= 16 ? line : 26,
  }
}
