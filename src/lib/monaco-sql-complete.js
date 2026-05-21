/** @typedef {{
 *   schemas?: string[]
 *   activeSchema?: string
 *   tables?: string[]
 *   columnsByTable?: Record<string, string[]>
 * }} SqlSchemaHints */

const PG_KEYWORDS = [
  'SELECT',
  'FROM',
  'WHERE',
  'INSERT',
  'INTO',
  'UPDATE',
  'DELETE',
  'JOIN',
  'LEFT',
  'RIGHT',
  'INNER',
  'OUTER',
  'FULL',
  'CROSS',
  'ON',
  'AND',
  'OR',
  'NOT',
  'NULL',
  'AS',
  'ORDER',
  'BY',
  'GROUP',
  'HAVING',
  'LIMIT',
  'OFFSET',
  'DISTINCT',
  'UNION',
  'ALL',
  'VALUES',
  'SET',
  'RETURNING',
  'WITH',
  'CASE',
  'WHEN',
  'THEN',
  'ELSE',
  'END',
  'EXISTS',
  'IN',
  'LIKE',
  'ILIKE',
  'BETWEEN',
  'IS',
  'TRUE',
  'FALSE',
  'ASC',
  'DESC',
  'NULLS',
  'FIRST',
  'LAST',
  'CAST',
  'COALESCE',
  'COUNT',
  'SUM',
  'AVG',
  'MIN',
  'MAX',
]

const PG_FUNCTIONS = [
  'count',
  'sum',
  'avg',
  'min',
  'max',
  'lower',
  'upper',
  'trim',
  'length',
  'now',
  'current_timestamp',
  'coalesce',
  'nullif',
  'concat',
  'substring',
  'date_trunc',
  'to_char',
  'jsonb_agg',
  'row_number',
  'rank',
]

/** @param {string} name */
function quoteIdent(name) {
  return /^[a-z_][a-z0-9_$]*$/i.test(name) ? name : `"${name.replace(/"/g, '""')}"`
}

/**
 * @param {typeof import('monaco-editor')} monaco
 * @param {() => SqlSchemaHints} getHints
 */
export function registerMonacoSqlCompletion(monaco, getHints) {
  if (registerMonacoSqlCompletion.done) return
  registerMonacoSqlCompletion.done = true

  monaco.languages.setLanguageConfiguration('sql', {
    comments: { lineComment: '--', blockComment: ['/*', '*/'] },
    brackets: [
      ['(', ')'],
      ['[', ']'],
    ],
    autoClosingPairs: [
      { open: '(', close: ')' },
      { open: '[', close: ']' },
      { open: "'", close: "'", notIn: ['string', 'comment'] },
      { open: '"', close: '"', notIn: ['string', 'comment'] },
    ],
    surroundingPairs: [
      { open: '(', close: ')' },
      { open: "'", close: "'" },
      { open: '"', close: '"' },
    ],
  })

  monaco.languages.registerCompletionItemProvider('sql', {
    triggerCharacters: ['.', ' ', '"', "'"],
    provideCompletionItems(model, position) {
      const hints = getHints()
      const schemas = hints.schemas ?? []
      const activeSchema = hints.activeSchema ?? 'public'
      const tables = hints.tables ?? []
      const columnsByTable = hints.columnsByTable ?? {}

      const word = model.getWordUntilPosition(position)
      const range = new monaco.Range(
        position.lineNumber,
        word.startColumn,
        position.lineNumber,
        word.endColumn,
      )

      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      })

      const partial = (word.word || '').toLowerCase()
      /** @type {import('monaco-editor').languages.CompletionItem[]} */
      const suggestions = []
      const Kind = monaco.languages.CompletionItemKind

      const dotMatch = linePrefix.match(/(?:["']([^"']+)["']|([\w$]+))\.["']?([\w$]*)$/)
      if (dotMatch) {
        const left = dotMatch[1] || dotMatch[2] || ''
        const leftLower = left.toLowerCase()

        if (schemas.some((s) => s.toLowerCase() === leftLower)) {
          for (const table of tables) {
            if (partial && !table.toLowerCase().startsWith(partial)) continue
            suggestions.push({
              label: table,
              kind: Kind.Class,
              insertText: quoteIdent(table),
              range,
              detail: `table · ${left}`,
              sortText: `0_${table}`,
            })
          }
          return { suggestions }
        }

        const colKeys = [
          left,
          `${activeSchema}.${left}`,
          leftLower,
          `${activeSchema}.${leftLower}`,
        ]
        const cols = new Set()
        for (const key of colKeys) {
          for (const c of columnsByTable[key] ?? []) cols.add(c)
        }
        for (const col of cols) {
          if (partial && !col.toLowerCase().startsWith(partial)) continue
          suggestions.push({
            label: col,
            kind: Kind.Field,
            insertText: quoteIdent(col),
            range,
            detail: `column · ${left}`,
            sortText: `0_${col}`,
          })
        }
        if (suggestions.length) return { suggestions }
      }

      for (const schema of schemas) {
        if (partial && !schema.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: schema,
          kind: Kind.Module,
          insertText: `${quoteIdent(schema)}.`,
          range,
          detail: 'schema',
          sortText: `1_${schema}`,
        })
      }

      for (const table of tables) {
        if (partial && !table.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: table,
          kind: Kind.Class,
          insertText: quoteIdent(table),
          range,
          detail: `table · ${activeSchema}`,
          sortText: `2_${table}`,
        })
        suggestions.push({
          label: `${activeSchema}.${table}`,
          kind: Kind.Class,
          insertText: `${quoteIdent(activeSchema)}.${quoteIdent(table)}`,
          range,
          detail: 'qualified table',
          sortText: `2_q_${table}`,
        })
      }

      for (const kw of PG_KEYWORDS) {
        if (partial && !kw.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: kw,
          kind: Kind.Keyword,
          insertText: kw,
          range,
          detail: 'keyword',
          sortText: `3_${kw}`,
        })
      }

      for (const fn of PG_FUNCTIONS) {
        if (partial && !fn.toLowerCase().startsWith(partial)) continue
        suggestions.push({
          label: fn,
          kind: Kind.Function,
          insertText: `${fn}($0)`,
          insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
          range,
          detail: 'function',
          sortText: `4_${fn}`,
        })
      }

      const seenCols = new Set()
      for (const cols of Object.values(columnsByTable)) {
        for (const col of cols) {
          if (!col || seenCols.has(col)) continue
          seenCols.add(col)
          if (partial && !col.toLowerCase().startsWith(partial)) continue
          suggestions.push({
            label: col,
            kind: Kind.Field,
            insertText: quoteIdent(col),
            range,
            detail: 'column',
            sortText: `5_${col}`,
          })
        }
      }

      return { suggestions }
    },
  })
}

registerMonacoSqlCompletion.done = false
