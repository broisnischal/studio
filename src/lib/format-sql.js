import { format } from 'sql-formatter'

/** @param {string} sql */
export function formatSql(sql) {
  const trimmed = sql.trim()
  if (!trimmed) return sql
  try {
    return format(trimmed, {
      language: 'postgresql',
      tabWidth: 2,
      keywordCase: 'upper',
    })
  } catch {
    return sql
  }
}

/** @param {typeof import('monaco-editor')} monaco */
export function registerMonacoSqlFormatter(monaco) {
  if (registerMonacoSqlFormatter.done) return
  registerMonacoSqlFormatter.done = true

  /** @param {import('monaco-editor').editor.ITextModel} model */
  /** @param {import('monaco-editor').Range} [range] */
  function editsFor(model, range) {
    const text = range ? model.getValueInRange(range) : model.getValue()
    const formatted = formatSql(text)
    if (formatted === text) return []
    const target = range ?? model.getFullModelRange()
    return [{ range: target, text: formatted }]
  }

  monaco.languages.registerDocumentFormattingEditProvider('sql', {
    provideDocumentFormattingEdits: (model) => editsFor(model),
  })

  monaco.languages.registerDocumentRangeFormattingEditProvider('sql', {
    provideDocumentRangeFormattingEdits: (model, range) => editsFor(model, range),
  })
}

registerMonacoSqlFormatter.done = false
