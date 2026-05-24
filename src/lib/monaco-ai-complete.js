import { loadAiSettings } from '$lib/stores/ai-settings.js'

/** @typedef {import('$lib/monaco-sql-complete.js').SqlSchemaHints} SqlSchemaHints */

let registered = false

/**
 * Register an inline completions provider for the SQL language.
 * Shows AI-powered ghost-text suggestions (like Copilot) as the user types.
 * Requires an API key in AI Settings; silently no-ops if absent.
 *
 * @param {typeof import('monaco-editor')} monaco
 * @param {() => SqlSchemaHints} getHints
 */
export function registerMonacoAiCompletion(monaco, getHints) {
  if (registered) return
  registered = true

  monaco.languages.registerInlineCompletionsProvider('sql', {
    async provideInlineCompletions(model, position, _context, token) {
      const offset = model.getOffsetAt(position)
      const textBefore = model.getValue().slice(0, offset).trimEnd()
      if (textBefore.length < 4) return { items: [] }

      const settings = loadAiSettings()
      if (!settings.apiKey) return { items: [] }

      // Debounce — wait 550ms for user to pause
      const proceed = await new Promise((resolve) => {
        const t = setTimeout(() => resolve(true), 550)
        token.onCancellationRequested(() => { clearTimeout(t); resolve(false) })
      })
      if (!proceed || token.isCancellationRequested) return { items: [] }

      try {
        const completion = await fetchCompletion(textBefore, getHints(), settings, token)
        if (!completion || token.isCancellationRequested) return { items: [] }

        return {
          items: [{
            insertText: completion,
            range: {
              startLineNumber: position.lineNumber,
              startColumn: position.column,
              endLineNumber: position.lineNumber,
              endColumn: position.column,
            },
          }],
        }
      } catch {
        return { items: [] }
      }
    },
    freeInlineCompletions() {},
  })
}

/**
 * @param {string} sqlPrefix
 * @param {SqlSchemaHints} hints
 * @param {{ baseUrl: string, apiKey: string, model: string }} settings
 * @param {import('monaco-editor').CancellationToken} token
 * @returns {Promise<string | null>}
 */
async function fetchCompletion(sqlPrefix, hints, settings, token) {
  const tables = (hints.tables ?? []).slice(0, 40).join(', ')
  const colLines = Object.entries(hints.columnsByTable ?? {})
    .filter(([k]) => !k.includes('.'))
    .slice(0, 20)
    .map(([t, cols]) => `  ${t}: ${/** @type {string[]} */ (cols).slice(0, 12).join(', ')}`)
    .join('\n')

  const schemaSection = [
    tables && `Tables: ${tables}`,
    colLines && `Columns:\n${colLines}`,
  ].filter(Boolean).join('\n')

  const abort = new AbortController()
  token.onCancellationRequested(() => abort.abort())

  const res = await fetch(`${settings.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.apiKey}`,
    },
    signal: abort.signal,
    body: JSON.stringify({
      model: settings.model,
      messages: [
        {
          role: 'system',
          content: [
            'You are a SQL autocompletion engine.',
            'The user is writing a SQL query and stopped mid-way.',
            'Continue the SQL from exactly where it ends.',
            'Return ONLY the completion text — no explanation, no markdown fences, no prefix.',
            'Keep it concise: complete the current clause or at most the rest of the statement.',
            schemaSection ? `\nDatabase schema:\n${schemaSection}` : '',
          ].join(' '),
        },
        { role: 'user', content: sqlPrefix },
      ],
      max_tokens: 120,
      temperature: 0,
      stream: false,
    }),
  })

  if (!res.ok) return null
  const data = await res.json()
  const raw = (data.choices?.[0]?.message?.content ?? '').trim()
  // Strip any accidental code fences
  return raw.replace(/^```(?:sql)?\n?/i, '').replace(/\n?```$/i, '').trim() || null
}
