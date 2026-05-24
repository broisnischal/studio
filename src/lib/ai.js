/**
 * @typedef {{ role: 'system'|'user'|'assistant'|'tool', content: string|null, tool_calls?: ToolCall[], tool_call_id?: string }} ApiMessage
 * @typedef {{ id: string, type: 'function', function: { name: string, arguments: string } }} ToolCall
 * @typedef {{ baseUrl: string, apiKey: string, model: string }} AiSettings
 * @typedef {{ type: 'text', content: string } | { type: 'sql', content: string } | { type: 'code', lang: string, content: string } | { type: 'mermaid', content: string }} AssistantPart
 */

import { formatCompactCount } from '$lib/table-list.js'

/** OpenAI-compatible tool definitions — work with Mistral, OpenAI, recent Ollama models. */
export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'execute_sql',
      description:
        'Execute a SQL statement against the connected database. ' +
        'For SELECT/WITH queries returns columns + rows. ' +
        'For INSERT/UPDATE/DELETE/DDL returns affected row count and a message. ' +
        'Always call this to fetch real data — never guess results.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'Valid SQL to execute against the connected database.' },
        },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'describe_table',
      description:
        'Get the column definitions (name, data type, nullable, default value) for a specific table. ' +
        'Call this before writing queries against an unfamiliar table.',
      parameters: {
        type: 'object',
        properties: {
          schema: { type: 'string', description: 'Schema name, e.g. "public"' },
          table: { type: 'string', description: 'Table name' },
        },
        required: ['schema', 'table'],
      },
    },
  },
]

export const MAX_AI_RETRIES = 5
const INITIAL_BACKOFF_MS = 1000
/** HTTP statuses we retry (transient overload / rate limits). */
const RETRYABLE_STATUSES = new Set([429, 502, 503])

/** @param {number} ms @param {AbortSignal} [signal] */
function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
      return
    }
    const id = setTimeout(resolve, ms)
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(id)
        reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))
      },
      { once: true },
    )
  })
}

/** @param {string | null} header */
function retryAfterMs(header) {
  if (!header) return null
  const seconds = Number(header)
  if (!Number.isNaN(seconds) && seconds >= 0) return Math.min(seconds * 1000, 120_000)
  const when = Date.parse(header)
  if (!Number.isNaN(when)) return Math.min(Math.max(0, when - Date.now()), 120_000)
  return null
}

/** @param {number} attempt @param {string | null} retryAfter */
function backoffMs(attempt, retryAfter) {
  const fromHeader = retryAfterMs(retryAfter)
  if (fromHeader != null && fromHeader > 0) return fromHeader
  const base = INITIAL_BACKOFF_MS * 2 ** attempt
  const jitter = Math.floor(Math.random() * base * 0.25)
  return Math.min(base + jitter, 120_000)
}

/** @param {number} status @param {string} body */
function formatApiError(status, body) {
  let detail = body.slice(0, 400)
  try {
    const j = JSON.parse(body)
    detail = String(j.message ?? j.error?.message ?? detail)
  } catch {
    /* use raw body */
  }
  if (status === 429) {
    const hint =
      'Wait a moment and try again, or check your API plan, model tier, and usage limits.'
    return /rate limit/i.test(detail)
      ? `Rate limit exceeded. ${hint}`
      : `Rate limit exceeded (${detail}). ${hint}`
  }
  return `AI API ${status}: ${detail}`
}

/**
 * @param {string} url
 * @param {RequestInit} init
 * @param {AbortSignal} [signal]
 * @param {(info: { attempt: number, waitMs: number, status: number }) => void} [onRetry]
 */
async function fetchWithAiRetry(url, init, signal, onRetry) {
  let attempt = 0
  while (true) {
    const res = await fetch(url, { ...init, signal })
    if (res.ok) return res

    const retryable = RETRYABLE_STATUSES.has(res.status)
    if (!retryable || attempt >= MAX_AI_RETRIES) {
      const text = await res.text().catch(() => '')
      throw new Error(formatApiError(res.status, text))
    }

    await res.text().catch(() => '')
    const waitMs = backoffMs(attempt, res.headers.get('Retry-After'))
    onRetry?.({ attempt: attempt + 1, waitMs, status: res.status })
    await sleep(waitMs, signal)
    attempt++
  }
}

/**
 * Call any OpenAI-compatible chat completions endpoint.
 * Returns the assistant message content and any tool calls.
 * @param {AiSettings} settings
 * @param {ApiMessage[]} messages
 * @param {unknown[] | null} tools
 * @returns {Promise<{ content: string|null, toolCalls: ToolCall[] }>}
 */
export async function chatCompletionRaw(settings, messages, tools = null) {
  const base = settings.baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`

  /** @type {Record<string, unknown>} */
  const body = { model: settings.model, messages }
  if (tools?.length) {
    body.tools = tools
    body.tool_choice = 'auto'
  }

  const res = await fetchWithAiRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    },
    undefined,
  )

  const data = await res.json()
  const msg = data.choices?.[0]?.message
  if (!msg) throw new Error('Unexpected response from AI API')

  return {
    content: typeof msg.content === 'string' ? msg.content : null,
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
  }
}

/**
 * Stream an OpenAI-compatible chat completion via SSE.
 * Yields `{ textDelta }` as tokens arrive, then `{ toolCalls }` once the stream closes.
 * Throws on HTTP errors; throws AbortError when the signal fires.
 * @param {AiSettings} settings
 * @param {ApiMessage[]} messages
 * @param {unknown[] | null} tools
 * @param {AbortSignal} [signal]
 * @param {(info: { attempt: number, waitMs: number, status: number }) => void} [onRetry]
 * @returns {AsyncGenerator<{ textDelta?: string, toolCalls?: ToolCall[] }>}
 */
export async function* chatCompletionStream(settings, messages, tools = null, signal, onRetry) {
  const base = settings.baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`

  /** @type {Record<string, unknown>} */
  const body = { model: settings.model, messages, stream: true }
  if (tools?.length) { body.tools = tools; body.tool_choice = 'auto' }

  const res = await fetchWithAiRetry(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
      },
      body: JSON.stringify(body),
    },
    signal,
    onRetry,
  )
  if (!res.body) throw new Error('No response body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  /** @type {Map<number, { id: string, name: string, args: string }>} */
  const tcAcc = new Map()
  let buf = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      buf += decoder.decode(value, { stream: true })
      const lines = buf.split('\n')
      buf = lines.pop() ?? ''
      for (const line of lines) {
        const t = line.trim()
        if (!t || t === 'data: [DONE]') continue
        if (!t.startsWith('data: ')) continue
        /** @type {any} */
        let chunk
        try { chunk = JSON.parse(t.slice(6)) } catch { continue }
        const delta = chunk.choices?.[0]?.delta
        if (!delta) continue
        if (delta.content) yield { textDelta: delta.content }
        if (Array.isArray(delta.tool_calls)) {
          for (const tc of delta.tool_calls) {
            const idx = tc.index ?? 0
            if (!tcAcc.has(idx)) tcAcc.set(idx, { id: '', name: '', args: '' })
            const acc = /** @type {{ id: string, name: string, args: string }} */ (tcAcc.get(idx))
            if (tc.id) acc.id = tc.id
            if (tc.function?.name) acc.name += tc.function.name
            if (tc.function?.arguments) acc.args += tc.function.arguments
          }
        }
      }
    }
  } finally {
    reader.releaseLock()
  }

  if (tcAcc.size > 0) {
    yield {
      toolCalls: /** @type {ToolCall[]} */ (
        [...tcAcc.entries()]
          .sort(([a], [b]) => a - b)
          .map(([, { id, name, args }]) => ({
            id: id || `call_${Math.random().toString(36).slice(2, 9)}`,
            type: 'function',
            function: { name, arguments: args },
          }))
      ),
    }
  }
}

/** Statements that permanently destroy or modify data — require user confirmation. */
const DESTRUCTIVE_RE = /^\s*(DELETE\b|DROP\b|TRUNCATE\b)/i

/** @param {string} sql */
export function isDestructiveSql(sql) {
  return DESTRUCTIVE_RE.test(sql.trim())
}

/**
 * Parse an assistant text response into alternating text and ```sql blocks.
 * @param {string} content
 * @returns {AssistantPart[]}
 */
const SQL_LANGS = new Set(['sql', 'pgsql', 'postgresql', 'plpgsql', 'sqlite', 'tsql', 'mysql', 'mariadb'])

export function parseAssistantMessage(content) {
  /** @type {AssistantPart[]} */
  const parts = []
  const regex = /```(\w*)\n?([\s\S]*?)```/g
  let lastIdx = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      const text = content.slice(lastIdx, match.index).trim()
      if (text) parts.push({ type: 'text', content: text })
    }
    const lang = match[1].toLowerCase()
    const code = match[2].trim()
    if (code) {
      if (lang === 'mermaid') {
        parts.push({ type: 'mermaid', content: code })
      } else if (!lang || SQL_LANGS.has(lang)) {
        parts.push({ type: 'sql', content: code })
      } else {
        parts.push({ type: 'code', lang, content: code })
      }
    }
    lastIdx = match.index + match[0].length
  }
  const tail = content.slice(lastIdx).trim()
  if (tail) parts.push({ type: 'text', content: tail })
  return parts.length ? parts : [{ type: 'text', content: content }]
}

/**
 * Build a comprehensive system prompt with schema context + DB-type-specific cheatsheet.
 * @param {{
 *   schemas: string[],
 *   activeSchema: string,
 *   tables: { name: string, rowCount?: number }[],
 *   activeTable: string | null,
 *   columns: { name: string, dataType: string, nullable?: boolean, enumValues?: string[] }[],
 *   primaryKey: string[],
 *   foreignKeys: { columns: string[], referencedSchema: string, referencedTable: string, referencedColumns: string[] }[],
 *   allTableColumns?: Record<string, { name: string, dataType: string, nullable?: boolean, enumValues?: string[] }[]>,
 * }} ctx
 */
export function buildSystemPrompt(ctx) {
  const tableList = ctx.tables.length
    ? ctx.tables
        .map((t) => `  • ${t.name}${t.rowCount != null ? ` — ${formatCompactCount(t.rowCount)} rows` : ''}`)
        .join('\n')
    : '  (no tables loaded yet — use describe_table or execute_sql to explore)'

  /** @param {{ name: string, dataType: string, nullable?: boolean, enumValues?: string[] }} c */
  function colLine(c) {
    const parts = [c.name.padEnd(24), c.dataType]
    if (c.nullable === false) parts.push('NOT NULL')
    if (c.enumValues?.length) parts.push(`enum(${c.enumValues.join(', ')})`)
    return '  ' + parts.join('  ')
  }

  const activeTableSection = ctx.activeTable && ctx.columns.length
    ? [
        ``,
        `## Currently Open Table: ${ctx.activeSchema}.${ctx.activeTable}`,
        `Columns:`,
        ctx.columns.map(colLine).join('\n'),
        ctx.primaryKey.length ? `Primary key: ${ctx.primaryKey.join(', ')}` : '',
        ctx.foreignKeys.length
          ? `Foreign keys:\n${ctx.foreignKeys
              .map(
                (fk) =>
                  `  (${fk.columns.join(', ')}) → ${fk.referencedSchema}.${fk.referencedTable}(${fk.referencedColumns.join(', ')})`,
              )
              .join('\n')}`
          : '',
      ]
        .filter(Boolean)
        .join('\n')
    : ''

  const otherTablesSection = (() => {
    const cache = ctx.allTableColumns ?? {}
    const activeKey = ctx.activeTable ? `${ctx.activeSchema}.${ctx.activeTable}` : null
    const otherEntries = Object.entries(cache).filter(([k]) => k !== activeKey)
    if (!otherEntries.length) return ''
    return (
      `\n## Other Loaded Tables\n` +
      otherEntries
        .map(([key, cols]) => `${key}:\n${cols.map(colLine).join('\n')}`)
        .join('\n\n')
    )
  })()

  const dbType = ctx.dbType ?? 'postgres'

  const DB_LABEL = {
    postgres: 'PostgreSQL',
    sqlite: 'SQLite',
    d1: 'Cloudflare D1 (SQLite-compatible)',
  }

  const DB_NOTES = {
    postgres: `Use standard PostgreSQL syntax. All PG features are available: CTEs, window functions, JSON/JSONB operators, pg_catalog, ILIKE, RETURNING, ON CONFLICT, etc.`,
    sqlite: `Use SQLite syntax only. Important limitations: no RIGHT/FULL OUTER JOIN, no stored procedures, no ILIKE (use LIKE with LOWER()), limited ALTER TABLE (can only add columns), use strftime() for dates, INTEGER PRIMARY KEY is auto-increment (not SERIAL), ON CONFLICT is supported, no RETURNING in older SQLite builds. Do NOT use PostgreSQL-specific functions or operators.`,
    d1: `Use SQLite-compatible SQL for Cloudflare D1. D1 is built on SQLite — do NOT use PostgreSQL syntax. Avoid ILIKE, SERIAL, pg_catalog, JSON operators (->>/->), window functions may be limited. Use strftime() for dates. D1 does not support triggers or stored procedures.`,
  }

  const ERD_QUERIES = {
    postgres: `\`\`\`sql
-- All columns
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_schema = '${ctx.activeSchema}'
ORDER BY table_name, ordinal_position;

-- All foreign keys
SELECT kcu.table_name, kcu.column_name,
       ccu.table_name AS ref_table, ccu.column_name AS ref_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu
     ON kcu.constraint_name = tc.constraint_name AND kcu.constraint_schema = tc.constraint_schema
JOIN information_schema.constraint_column_usage ccu
     ON ccu.constraint_name = tc.constraint_name AND ccu.constraint_schema = tc.constraint_schema
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.constraint_schema = '${ctx.activeSchema}';
\`\`\``,
    sqlite: `\`\`\`sql
-- All tables
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
\`\`\`
Then for each table use \`describe_table\` or \`PRAGMA table_info('tablename')\` and \`PRAGMA foreign_key_list('tablename')\`.`,
    d1: `\`\`\`sql
-- All tables
SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;
\`\`\`
Then for each table use \`describe_table\` or \`PRAGMA table_info('tablename')\` and \`PRAGMA foreign_key_list('tablename')\`.`,
  }

  const QUICK_REF = {
    postgres: `## PostgreSQL Quick Reference

### Common Patterns
\`\`\`sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
SELECT * FROM users WHERE email ILIKE '%@gmail.com';
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY 2 DESC;
INSERT INTO settings(key, value) VALUES ('theme', 'dark')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
\`\`\`

### Window Functions
\`\`\`sql
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM events
) SELECT * FROM ranked WHERE rn = 1;
\`\`\`

### Useful Functions
| Category | Functions |
|---|---|
| String | \`LOWER\`, \`UPPER\`, \`TRIM\`, \`SUBSTRING(s,1,10)\`, \`REPLACE\`, \`REGEXP_REPLACE\`, \`SPLIT_PART\`, \`CONCAT_WS\` |
| Date/Time | \`NOW()\`, \`CURRENT_DATE\`, \`DATE_TRUNC('day',ts)\`, \`EXTRACT(epoch FROM ts)\`, \`AGE(ts)\`, \`TO_CHAR(ts,'YYYY-MM')\` |
| Math | \`ROUND(x,2)\`, \`CEIL\`, \`FLOOR\`, \`ABS\`, \`RANDOM()\`, \`GENERATE_SERIES(1,10)\` |
| JSON/JSONB | \`data->>'key'\`, \`data#>>'{a,b}'\`, \`jsonb_set(data,'{k}','"v"')\`, \`jsonb_array_elements\` |
| Null | \`COALESCE(col,'default')\`, \`NULLIF(col,'')\`, \`IS DISTINCT FROM\` |

### Schema Inspection
\`\`\`sql
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))
FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;
\`\`\``,

    sqlite: `## SQLite Quick Reference

### Common Patterns
\`\`\`sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
SELECT * FROM users WHERE LOWER(email) LIKE '%@gmail.com';
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY 2 DESC;
INSERT OR REPLACE INTO settings(key, value) VALUES ('theme', 'dark');
\`\`\`

### Date & Time (strftime)
\`\`\`sql
SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) FROM orders GROUP BY 1;
SELECT * FROM events WHERE created_at >= date('now', '-7 days');
\`\`\`

### Useful Functions
| Category | Functions |
|---|---|
| String | \`LOWER\`, \`UPPER\`, \`TRIM\`, \`SUBSTR(s,1,10)\`, \`REPLACE\`, \`INSTR\`, \`GROUP_CONCAT\` |
| Date | \`date('now')\`, \`strftime('%Y-%m-%d',col)\`, \`datetime('now','-1 day')\` |
| Math | \`ROUND(x,2)\`, \`ABS\`, \`RANDOM()\` |
| Null | \`COALESCE(col,'default')\`, \`NULLIF(col,'')\`, \`IFNULL(col,0)\` |

### Schema Inspection
\`\`\`sql
SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;
PRAGMA table_info('tablename');
PRAGMA foreign_key_list('tablename');
PRAGMA index_list('tablename');
\`\`\``,

    d1: `## Cloudflare D1 Quick Reference

### Common Patterns
\`\`\`sql
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;
SELECT * FROM users WHERE LOWER(email) LIKE '%@gmail.com';
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY 2 DESC;
INSERT OR REPLACE INTO settings(key, value) VALUES ('theme', 'dark');
\`\`\`

### Date & Time
\`\`\`sql
SELECT strftime('%Y-%m', created_at) AS month, COUNT(*) FROM orders GROUP BY 1;
SELECT * FROM events WHERE created_at >= date('now', '-7 days');
\`\`\`

### Schema Inspection
\`\`\`sql
SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name;
PRAGMA table_info('tablename');
PRAGMA foreign_key_list('tablename');
\`\`\``,
  }

  return `You are an expert ${DB_LABEL[dbType] ?? 'SQL'} database assistant embedded in DB Studio, a database GUI client.
Your role: help users explore, query, and understand their database by executing real tool calls.

## Database Engine
${DB_LABEL[dbType] ?? dbType}
${DB_NOTES[dbType] ?? ''}

## Connection
Available schemas: ${ctx.schemas.length ? ctx.schemas.join(', ') : ctx.activeSchema}
Active schema: ${ctx.activeSchema}

## Tables in "${ctx.activeSchema}"
${tableList}
${activeTableSection}
${otherTablesSection}
## Tools
- \`execute_sql(sql)\` — Run any SQL. Returns rows+columns for SELECT; affected count for DML.
- \`describe_table(schema, table)\` — Get column definitions before writing queries against an unknown table.

## Response Rules
1. **Always use \`execute_sql\` to fetch real data.** Never invent or estimate results.
2. Before querying an unknown table, call \`describe_table\` to inspect its schema.
3. After tool results, give a concise human-readable summary (1–3 sentences max).
4. For destructive SQL (DELETE / DROP / TRUNCATE): explain what will change, then execute. The user will be prompted to confirm before it runs.
5. If a query returns no rows, say so clearly and suggest alternatives.
6. **LIMIT is mandatory.** Every SELECT must include an explicit LIMIT. Tables can have millions of rows — omitting LIMIT will time out the query and crash the client. Use \`LIMIT 100\` for exploration, higher only when the user explicitly requests more data.
7. If a tool call returns an error, do NOT retry the exact same query. Analyze the error, produce a corrected query, or explain to the user why it cannot be done.
8. To visualize data or structure, output a \`\`\`mermaid code block — it will be rendered as an interactive diagram. Use \`erDiagram\` for entity-relationship / schema diagrams, \`flowchart TD\` for process flows, and \`xychart-beta\` for bar/line charts.
9. For ERD / schema diagrams, fetch schema data with:
${ERD_QUERIES[dbType] ?? ERD_QUERIES.postgres}

---

${QUICK_REF[dbType] ?? QUICK_REF.postgres}`
}
