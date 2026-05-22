/**
 * @typedef {{ role: 'system'|'user'|'assistant'|'tool', content: string|null, tool_calls?: ToolCall[], tool_call_id?: string }} ApiMessage
 * @typedef {{ id: string, type: 'function', function: { name: string, arguments: string } }} ToolCall
 * @typedef {{ baseUrl: string, apiKey: string, model: string }} AiSettings
 * @typedef {{ type: 'text', content: string } | { type: 'sql', content: string }} AssistantPart
 */

/** OpenAI-compatible tool definitions — work with Mistral, OpenAI, recent Ollama models. */
export const AI_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'execute_sql',
      description:
        'Execute a SQL statement against the connected PostgreSQL database. ' +
        'For SELECT/WITH queries returns columns + rows. ' +
        'For INSERT/UPDATE/DELETE/DDL returns affected row count and a message. ' +
        'Always call this to fetch real data — never guess results.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string', description: 'Valid PostgreSQL SQL to execute.' },
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

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(settings.apiKey ? { Authorization: `Bearer ${settings.apiKey}` } : {}),
    },
    body: JSON.stringify(body),
  })

  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`AI API ${res.status}: ${text.slice(0, 400)}`)
  }

  const data = await res.json()
  const msg = data.choices?.[0]?.message
  if (!msg) throw new Error('Unexpected response from AI API')

  return {
    content: typeof msg.content === 'string' ? msg.content : null,
    toolCalls: Array.isArray(msg.tool_calls) ? msg.tool_calls : [],
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
export function parseAssistantMessage(content) {
  /** @type {AssistantPart[]} */
  const parts = []
  const regex = /```(?:sql|SQL)?\s*([\s\S]*?)```/g
  let lastIdx = 0
  let match
  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIdx) {
      const text = content.slice(lastIdx, match.index).trim()
      if (text) parts.push({ type: 'text', content: text })
    }
    const sql = match[1].trim()
    if (sql) parts.push({ type: 'sql', content: sql })
    lastIdx = match.index + match[0].length
  }
  const tail = content.slice(lastIdx).trim()
  if (tail) parts.push({ type: 'text', content: tail })
  return parts.length ? parts : [{ type: 'text', content: content }]
}

/**
 * Build a comprehensive system prompt with schema context + PostgreSQL cheatsheet.
 * @param {{
 *   schemas: string[],
 *   activeSchema: string,
 *   tables: { name: string, rowCount?: number }[],
 *   activeTable: string | null,
 *   columns: { name: string, dataType: string }[],
 *   primaryKey: string[],
 *   foreignKeys: { columns: string[], referencedSchema: string, referencedTable: string, referencedColumns: string[] }[],
 * }} ctx
 */
export function buildSystemPrompt(ctx) {
  const tableList = ctx.tables.length
    ? ctx.tables
        .map((t) => `  • ${t.name}${t.rowCount != null ? ` — ${t.rowCount.toLocaleString()} rows` : ''}`)
        .join('\n')
    : '  (no tables loaded yet — use describe_table or execute_sql to explore)'

  const activeTableSection = ctx.activeTable && ctx.columns.length
    ? [
        ``,
        `## Currently Open Table: ${ctx.activeSchema}.${ctx.activeTable}`,
        `Columns:`,
        ctx.columns.map((c) => `  ${c.name}  ${c.dataType}`).join('\n'),
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

  return `You are an expert PostgreSQL database assistant embedded in DB Studio, a database GUI client.
Your role: help users explore, query, and understand their database by executing real tool calls.

## Connection
Available schemas: ${ctx.schemas.length ? ctx.schemas.join(', ') : ctx.activeSchema}
Active schema: ${ctx.activeSchema}

## Tables in "${ctx.activeSchema}"
${tableList}
${activeTableSection}

## Tools
- \`execute_sql(sql)\` — Run any SQL. Returns rows+columns for SELECT; affected count for DML.
- \`describe_table(schema, table)\` — Get column definitions before writing queries against an unknown table.

## Response Rules
1. **Always use \`execute_sql\` to fetch real data.** Never invent or estimate results.
2. Before querying an unknown table, call \`describe_table\` to inspect its schema.
3. After tool results, give a concise human-readable summary (1–3 sentences max).
4. For destructive SQL (DELETE / DROP / TRUNCATE): explain what will change, then execute. The user will be prompted to confirm before it runs.
5. If a query returns no rows, say so clearly and suggest alternatives.
6. Prefer CTEs over subqueries for readability. Always add LIMIT for exploratory SELECTs.

---

## PostgreSQL Quick Reference

### Common Patterns
\`\`\`sql
-- Latest N rows
SELECT * FROM orders ORDER BY created_at DESC LIMIT 10;

-- Case-insensitive search
SELECT * FROM users WHERE email ILIKE '%@gmail.com';

-- Count by category
SELECT status, COUNT(*) FROM orders GROUP BY status ORDER BY 2 DESC;

-- Rows with no match (LEFT JOIN / NOT EXISTS)
SELECT u.* FROM users u LEFT JOIN orders o ON o.user_id = u.id WHERE o.id IS NULL;

-- Upsert
INSERT INTO settings(key, value) VALUES ('theme', 'dark')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
\`\`\`

### Deduplication & Window Functions
\`\`\`sql
-- Latest row per group
WITH ranked AS (
  SELECT *, ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at DESC) AS rn
  FROM events
)
SELECT * FROM ranked WHERE rn = 1;

-- Running total
SELECT date, amount, SUM(amount) OVER (ORDER BY date) AS running_total FROM sales;

-- Percentile rank
SELECT name, salary, PERCENT_RANK() OVER (ORDER BY salary) FROM employees;
\`\`\`

### Useful Functions
| Category | Functions |
|---|---|
| String | \`LOWER\`, \`UPPER\`, \`TRIM\`, \`SUBSTRING(s,1,10)\`, \`REPLACE\`, \`REGEXP_REPLACE\`, \`SPLIT_PART\`, \`CONCAT_WS\` |
| Date/Time | \`NOW()\`, \`CURRENT_DATE\`, \`DATE_TRUNC('day',ts)\`, \`EXTRACT(epoch FROM ts)\`, \`AGE(ts)\`, \`TO_CHAR(ts,'YYYY-MM')\` |
| Math | \`ROUND(x,2)\`, \`CEIL\`, \`FLOOR\`, \`ABS\`, \`RANDOM()\`, \`GENERATE_SERIES(1,10)\` |
| JSON/JSONB | \`data->>'key'\`, \`data#>>'{a,b}'\`, \`jsonb_set(data,'{k}','"v"')\`, \`jsonb_array_elements\` |
| Array | \`ANY(arr)\`, \`array_agg\`, \`unnest(arr)\`, \`ARRAY[1,2,3]\` |
| Null | \`COALESCE(col,'default')\`, \`NULLIF(col,'')\`, \`IS DISTINCT FROM\` |

### Schema Inspection
\`\`\`sql
-- All tables in schema
SELECT table_name, pg_size_pretty(pg_total_relation_size(quote_ident(table_name)))
FROM information_schema.tables WHERE table_schema = 'public' ORDER BY 1;

-- Column types
SELECT column_name, data_type, is_nullable FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'users' ORDER BY ordinal_position;

-- Foreign keys
SELECT kcu.column_name, ccu.table_name, ccu.column_name AS ref_col
FROM information_schema.table_constraints tc
JOIN information_schema.key_column_usage kcu USING (constraint_name, constraint_schema)
JOIN information_schema.constraint_column_usage ccu USING (constraint_name, constraint_schema)
WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_name = 'orders';

-- Index sizes
SELECT indexname, pg_size_pretty(pg_relation_size(indexname::regclass))
FROM pg_indexes WHERE tablename = 'orders';
\`\`\``
}
