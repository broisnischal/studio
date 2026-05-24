/**
 * ORM query builder utilities for Drizzle-like and Prisma-like query evaluation
 * and SQL-to-ORM conversion.
 */

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Wrap an identifier in double-quotes, escaping embedded quotes. */
function quoteIdent(name) {
  return `"${String(name).replace(/"/g, '""')}"`
}

/** @param {unknown} v */
function literalSql(v) {
  if (v === null || v === undefined) return 'NULL'
  if (typeof v === 'boolean') return v ? 'true' : 'false'
  if (typeof v === 'number') return String(v)
  return `'${String(v).replace(/'/g, "''")}'`
}

/**
 * @param {Record<string, unknown>} where
 * @returns {string}
 */
function whereClauseFromObject(where) {
  const parts = []
  for (const [k, v] of Object.entries(where)) {
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const ops = /** @type {Record<string, unknown>} */ (v)
      if ('equals' in ops) parts.push(`${k} = ${literalSql(ops.equals)}`)
      else if ('not' in ops) parts.push(`${k} != ${literalSql(ops.not)}`)
      else if ('gt' in ops) parts.push(`${k} > ${literalSql(ops.gt)}`)
      else if ('gte' in ops) parts.push(`${k} >= ${literalSql(ops.gte)}`)
      else if ('lt' in ops) parts.push(`${k} < ${literalSql(ops.lt)}`)
      else if ('lte' in ops) parts.push(`${k} <= ${literalSql(ops.lte)}`)
      else if ('contains' in ops) parts.push(`${k} LIKE '%${ops.contains}%'`)
      else if ('startsWith' in ops) parts.push(`${k} LIKE '${ops.startsWith}%'`)
      else if ('endsWith' in ops) parts.push(`${k} LIKE '%${ops.endsWith}'`)
      else if ('in' in ops && Array.isArray(ops.in)) parts.push(`${k} IN (${ops.in.map(literalSql).join(', ')})`)
    } else {
      parts.push(`${k} = ${literalSql(v)}`)
    }
  }
  return parts.join(' AND ')
}

// ── Drizzle mock builder ──────────────────────────────────────────────────────

/**
 * Build a Proxy-based table object so that `users.id`, `users.name` etc. return
 * column references that stringify to their column name.
 * @param {string} tableName
 */
function makeTableProxy(tableName) {
  return new Proxy(
    { __tableName: tableName },
    {
      get(target, prop) {
        if (prop === '__tableName') return tableName
        if (prop === Symbol.toPrimitive || prop === 'toString' || prop === 'valueOf') {
          return () => tableName
        }
        return { __col: true, table: tableName, col: String(prop), toString: () => String(prop) }
      },
    },
  )
}

/**
 * Create the fluent Drizzle-like mock builder.
 * Each chain records intent and `.toSQL()` compiles to a SQL string.
 */
function makeDrizzleBuilder() {
  /** @type {'select' | 'insert' | 'update' | 'delete' | null} */
  let _op = null
  /** @type {string | null} */
  let _table = null
  /** @type {Record<string, { table: string, col: string } | string> | null} */
  let _selectCols = null
  /** @type {Record<string, unknown>[] | Record<string, unknown> | null} */
  let _insertValues = null
  /** @type {Record<string, unknown> | null} */
  let _setValues = null
  /** @type {string | null} */
  let _where = null
  /** @type {number | null} */
  let _limit = null
  /** @type {number | null} */
  let _offset = null
  /** @type {{ col: string, dir: 'ASC' | 'DESC' }[] } */
  let _orderBy = []

  function toSQL() {
    if (_op === 'select') {
      let cols = '*'
      if (_selectCols) {
        const parts = []
        for (const [alias, ref] of Object.entries(_selectCols)) {
          if (ref && typeof ref === 'object' && 'col' in ref) {
            parts.push(ref.col === alias ? ref.col : `${ref.col} AS ${alias}`)
          } else {
            parts.push(String(alias))
          }
        }
        if (parts.length) cols = parts.join(', ')
      }
      const qt = quoteIdent(_table)
      let sql = `SELECT ${cols} FROM ${qt}`
      if (_where) sql += ` WHERE ${_where}`
      if (_orderBy.length) sql += ` ORDER BY ${_orderBy.map((o) => `${o.col} ${o.dir}`).join(', ')}`
      if (_limit !== null) sql += ` LIMIT ${_limit}`
      if (_offset !== null) sql += ` OFFSET ${_offset}`
      return { sql, params: [] }
    }

    if (_op === 'insert') {
      const rows = Array.isArray(_insertValues) ? _insertValues : [_insertValues ?? {}]
      const keys = Object.keys(rows[0] ?? {})
      const cols = keys.join(', ')
      const valSets = rows.map((r) => `(${keys.map((k) => literalSql(r[k])).join(', ')})`).join(', ')
      return { sql: `INSERT INTO ${quoteIdent(_table)} (${cols}) VALUES ${valSets}`, params: [] }
    }

    if (_op === 'update') {
      const setCols = Object.entries(_setValues ?? {})
        .map(([k, v]) => `${k} = ${literalSql(v)}`)
        .join(', ')
      let sql = `UPDATE ${quoteIdent(_table)} SET ${setCols}`
      if (_where) sql += ` WHERE ${_where}`
      return { sql, params: [] }
    }

    if (_op === 'delete') {
      let sql = `DELETE FROM ${quoteIdent(_table)}`
      if (_where) sql += ` WHERE ${_where}`
      return { sql, params: [] }
    }

    throw new Error('Incomplete query: call db.select(), db.insert(), db.update(), or db.delete()')
  }

  const chain = {
    toSQL,
    from(tableProxy) {
      _table = tableProxy?.__tableName ?? String(tableProxy)
      return chain
    },
    where(condition) {
      if (typeof condition === 'string') {
        _where = condition
      } else if (condition && typeof condition === 'object' && '__sql' in condition) {
        _where = condition.__sql
      }
      return chain
    },
    limit(n) { _limit = Number(n); return chain },
    offset(n) { _offset = Number(n); return chain },
    orderBy(...args) {
      for (const arg of args) {
        if (arg && typeof arg === 'object' && '__orderBy' in arg) {
          _orderBy.push({ col: arg.__orderBy.col, dir: arg.__orderBy.dir })
        }
      }
      return chain
    },
    set(values) { _setValues = values; return chain },
    values(vals) { _insertValues = vals; return chain },
    returning() { return chain },
  }

  return { chain, setOp(op) { _op = op }, setTable(t) { _table = t }, setSelectCols(c) { _selectCols = c } }
}

/**
 * Build the mock `db` object, table proxies, and helper functions (eq, ne, gt, lt, asc, desc, …)
 * that are injected into the user's code evaluation context.
 * @param {string[]} tableNames
 */
function buildDrizzleContext(tableNames) {
  const tableProxies = Object.fromEntries(tableNames.map((n) => [n, makeTableProxy(n)]))

  /** @type {Record<string, Function>} */
  const helpers = {
    eq: (col, val) => ({
      __sql: `${col?.col ?? col} = ${literalSql(val)}`,
    }),
    ne: (col, val) => ({
      __sql: `${col?.col ?? col} != ${literalSql(val)}`,
    }),
    gt: (col, val) => ({
      __sql: `${col?.col ?? col} > ${literalSql(val)}`,
    }),
    gte: (col, val) => ({
      __sql: `${col?.col ?? col} >= ${literalSql(val)}`,
    }),
    lt: (col, val) => ({
      __sql: `${col?.col ?? col} < ${literalSql(val)}`,
    }),
    lte: (col, val) => ({
      __sql: `${col?.col ?? col} <= ${literalSql(val)}`,
    }),
    like: (col, pattern) => ({
      __sql: `${col?.col ?? col} LIKE ${literalSql(pattern)}`,
    }),
    ilike: (col, pattern) => ({
      __sql: `${col?.col ?? col} ILIKE ${literalSql(pattern)}`,
    }),
    isNull: (col) => ({
      __sql: `${col?.col ?? col} IS NULL`,
    }),
    isNotNull: (col) => ({
      __sql: `${col?.col ?? col} IS NOT NULL`,
    }),
    inArray: (col, vals) => ({
      __sql: `${col?.col ?? col} IN (${(vals ?? []).map(literalSql).join(', ')})`,
    }),
    notInArray: (col, vals) => ({
      __sql: `${col?.col ?? col} NOT IN (${(vals ?? []).map(literalSql).join(', ')})`,
    }),
    and: (...conds) => ({
      __sql: conds.map((c) => (c?.__sql ? `(${c.__sql})` : String(c))).join(' AND '),
    }),
    or: (...conds) => ({
      __sql: conds.map((c) => (c?.__sql ? `(${c.__sql})` : String(c))).join(' OR '),
    }),
    not: (cond) => ({
      __sql: `NOT (${cond?.__sql ?? cond})`,
    }),
    asc: (col) => ({ __orderBy: { col: col?.col ?? col, dir: 'ASC' } }),
    desc: (col) => ({ __orderBy: { col: col?.col ?? col, dir: 'DESC' } }),
    sql: (strings, ...vals) => {
      if (Array.isArray(strings)) {
        let raw = ''
        strings.forEach((s, i) => { raw += s; if (i < vals.length) raw += literalSql(vals[i]) })
        return { __sql: raw }
      }
      return { __sql: String(strings) }
    },
  }

  const db = {
    select(cols) {
      const { chain, setOp, setSelectCols } = makeDrizzleBuilder()
      setOp('select')
      if (cols && typeof cols === 'object' && !Array.isArray(cols)) {
        const mapped = {}
        for (const [alias, ref] of Object.entries(cols)) {
          mapped[alias] = ref && typeof ref === 'object' && 'col' in ref ? ref : { col: alias, table: '' }
        }
        setSelectCols(mapped)
      }
      return chain
    },
    insert(tableProxy) {
      const { chain, setOp, setTable } = makeDrizzleBuilder()
      setOp('insert')
      setTable(tableProxy?.__tableName ?? String(tableProxy))
      return chain
    },
    update(tableProxy) {
      const { chain, setOp, setTable } = makeDrizzleBuilder()
      setOp('update')
      setTable(tableProxy?.__tableName ?? String(tableProxy))
      return chain
    },
    delete(tableProxy) {
      const { chain, setOp, setTable } = makeDrizzleBuilder()
      setOp('delete')
      setTable(tableProxy?.__tableName ?? String(tableProxy))
      return chain
    },
  }

  return { db, tableProxies, helpers }
}

// ── Prisma mock builder ───────────────────────────────────────────────────────

/**
 * @param {string[]} tableNames
 */
function buildPrismaContext(tableNames) {
  function makeModelProxy(modelName) {
    const qt = quoteIdent(modelName)
    return {
      findMany(opts = {}) {
        let sql = `SELECT * FROM ${qt}`
        const where = opts.where
        if (where && typeof where === 'object' && Object.keys(where).length) {
          sql += ` WHERE ${whereClauseFromObject(where)}`
        }
        if (opts.orderBy) {
          const ob = Array.isArray(opts.orderBy) ? opts.orderBy : [opts.orderBy]
          const parts = ob.flatMap((o) =>
            Object.entries(o).map(([col, dir]) => `${col} ${String(dir).toUpperCase()}`),
          )
          if (parts.length) sql += ` ORDER BY ${parts.join(', ')}`
        }
        if (opts.take != null) sql += ` LIMIT ${Number(opts.take)}`
        if (opts.skip != null) sql += ` OFFSET ${Number(opts.skip)}`
        return { sql, params: [] }
      },
      findFirst(opts = {}) {
        let sql = `SELECT * FROM ${qt}`
        const where = opts.where
        if (where && typeof where === 'object' && Object.keys(where).length) {
          sql += ` WHERE ${whereClauseFromObject(where)}`
        }
        sql += ` LIMIT 1`
        return { sql, params: [] }
      },
      findUnique(opts = {}) {
        let sql = `SELECT * FROM ${qt}`
        const where = opts.where ?? {}
        if (Object.keys(where).length) {
          sql += ` WHERE ${whereClauseFromObject(where)}`
        }
        sql += ` LIMIT 1`
        return { sql, params: [] }
      },
      create(opts = {}) {
        const data = opts.data ?? {}
        const keys = Object.keys(data)
        const cols = keys.join(', ')
        const vals = keys.map((k) => literalSql(data[k])).join(', ')
        return { sql: `INSERT INTO ${qt} (${cols}) VALUES (${vals})`, params: [] }
      },
      update(opts = {}) {
        const data = opts.data ?? {}
        const setCols = Object.entries(data).map(([k, v]) => `${k} = ${literalSql(v)}`).join(', ')
        const where = opts.where ?? {}
        let sql = `UPDATE ${qt} SET ${setCols}`
        if (Object.keys(where).length) sql += ` WHERE ${whereClauseFromObject(where)}`
        return { sql, params: [] }
      },
      delete(opts = {}) {
        const where = opts.where ?? {}
        let sql = `DELETE FROM ${qt}`
        if (Object.keys(where).length) sql += ` WHERE ${whereClauseFromObject(where)}`
        return { sql, params: [] }
      },
      count(opts = {}) {
        let sql = `SELECT COUNT(*) FROM ${qt}`
        const where = opts?.where
        if (where && typeof where === 'object' && Object.keys(where).length) {
          sql += ` WHERE ${whereClauseFromObject(where)}`
        }
        return { sql, params: [] }
      },
      upsert(opts = {}) {
        const create = opts.create ?? {}
        const keys = Object.keys(create)
        const cols = keys.join(', ')
        const vals = keys.map((k) => literalSql(create[k])).join(', ')
        const update = opts.update ?? {}
        const setCols = Object.entries(update).map(([k, v]) => `${k} = ${literalSql(v)}`).join(', ')
        const sql = `INSERT INTO ${qt} (${cols}) VALUES (${vals}) ON CONFLICT DO UPDATE SET ${setCols}`
        return { sql, params: [] }
      },
    }
  }

  const prisma = new Proxy(
    {},
    {
      get(_, prop) {
        return makeModelProxy(String(prop))
      },
    },
  )

  return { prisma }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Evaluate a Drizzle-style query string in a sandboxed context.
 * Returns `{ sql: string, params: unknown[] }`.
 * @param {string} code
 * @param {string[]} tableNames
 * @returns {{ sql: string, params: unknown[] }}
 */
export function evalDrizzleQuery(code, tableNames) {
  const { db, tableProxies, helpers } = buildDrizzleContext(tableNames)

  const argNames = ['db', ...Object.keys(tableProxies), ...Object.keys(helpers)]
  const argValues = [db, ...Object.values(tableProxies), ...Object.values(helpers)]

  // Wrap user code so the last expression value is captured
  const wrappedCode = `
    "use strict";
    let __result;
    try { __result = (function() { return (${code.trim()}); })(); } catch(e) { throw e; }
    return __result;
  `

  let result
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function(...argNames, wrappedCode)
    result = fn(...argValues)
  } catch (e) {
    throw new Error(`Drizzle eval error: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!result) {
    throw new Error('Query did not return a value. Make sure your last expression is the query chain (e.g. db.select().from(users))')
  }

  if (typeof result.toSQL === 'function') {
    return result.toSQL()
  }

  if (result.sql && typeof result.sql === 'string') {
    return { sql: result.sql, params: result.params ?? [] }
  }

  throw new Error('Query result does not have a .toSQL() method or .sql property')
}

/**
 * Evaluate a Prisma-style query string in a sandboxed context.
 * Returns `{ sql: string, params: unknown[] }`.
 * @param {string} code
 * @param {string[]} tableNames
 * @returns {{ sql: string, params: unknown[] }}
 */
export function evalPrismaQuery(code, tableNames) {
  const { prisma } = buildPrismaContext(tableNames)

  const wrappedCode = `
    "use strict";
    let __result;
    try { __result = (function() { return (${code.trim()}); })(); } catch(e) { throw e; }
    return __result;
  `

  let result
  try {
    // eslint-disable-next-line no-new-func
    const fn = new Function('prisma', wrappedCode)
    result = fn(prisma)
  } catch (e) {
    throw new Error(`Prisma eval error: ${e instanceof Error ? e.message : String(e)}`)
  }

  if (!result) {
    throw new Error('Query did not return a value. Make sure your last expression is the query call (e.g. prisma.user.findMany({}))')
  }

  if (result.sql && typeof result.sql === 'string') {
    return { sql: result.sql, params: result.params ?? [] }
  }

  throw new Error('Query result does not have a .sql property')
}

// ── SQL → Drizzle ─────────────────────────────────────────────────────────────

/**
 * Convert a simple SELECT SQL to Drizzle chain notation.
 * Only handles SELECT; returns a comment for others.
 * @param {string} sql
 * @returns {string}
 */
export function sqlToDrizzle(sql) {
  const trimmed = sql.trim().replace(/;$/, '')

  if (!/^SELECT\b/i.test(trimmed)) {
    return `// Cannot auto-convert: use db.insert/update/delete`
  }

  try {
    const upper = trimmed.toUpperCase()

    const fromIdx = upper.search(/\bFROM\b/)
    if (fromIdx < 0) return `// Cannot auto-convert: no FROM clause`

    const selectPart = trimmed.slice(6, fromIdx).trim()
    const afterFrom = trimmed.slice(fromIdx + 4).trim()

    const whereIdx = afterFrom.search(/\bWHERE\b/i)
    const orderIdx = afterFrom.search(/\bORDER\s+BY\b/i)
    const limitIdx = afterFrom.search(/\bLIMIT\b/i)
    const offsetIdx = afterFrom.search(/\bOFFSET\b/i)

    const tableEndIdx = [whereIdx, orderIdx, limitIdx, offsetIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? afterFrom.length
    const tableName = afterFrom.slice(0, tableEndIdx).trim().replace(/^"([^"]+)"$/, '$1')

    let whereStr = ''
    if (whereIdx >= 0) {
      const afterWhere = afterFrom.slice(whereIdx + 5).trim()
      const whereEndIdx = [orderIdx, limitIdx, offsetIdx]
        .map((i) => (i >= 0 ? i - (whereIdx + 5) : Infinity))
        .filter((i) => i > 0)
        .sort((a, b) => a - b)[0]
      whereStr = whereEndIdx != null && isFinite(whereEndIdx) ? afterWhere.slice(0, whereEndIdx).trim() : afterWhere
    }

    let orderStr = ''
    if (orderIdx >= 0) {
      const afterOrder = afterFrom.slice(orderIdx).replace(/ORDER\s+BY\s+/i, '').trim()
      const orderEndIdx = [limitIdx, offsetIdx]
        .map((i) => (i >= 0 ? i - orderIdx : Infinity))
        .filter((i) => i > 0)
        .sort((a, b) => a - b)[0]
      orderStr = orderEndIdx != null && isFinite(orderEndIdx) ? afterOrder.slice(0, orderEndIdx).trim() : afterOrder
    }

    let limitStr = ''
    if (limitIdx >= 0) {
      const afterLimit = afterFrom.slice(limitIdx + 5).trim()
      const limitEndIdx = offsetIdx >= 0 ? offsetIdx - limitIdx - 5 : undefined
      limitStr = limitEndIdx != null ? afterLimit.slice(0, limitEndIdx).trim() : afterLimit.split(/\s+/)[0]
    }

    let offsetStr = ''
    if (offsetIdx >= 0) {
      offsetStr = afterFrom.slice(offsetIdx + 6).trim().split(/\s+/)[0]
    }

    let selectArg = ''
    if (selectPart !== '*') {
      const cols = selectPart.split(',').map((c) => c.trim())
      const colParts = cols.map((c) => {
        const asMatch = c.match(/^(.+?)\s+AS\s+(.+)$/i)
        if (asMatch) {
          const raw = asMatch[1].trim().replace(/^"([^"]+)"$/, '$1')
          const alias = asMatch[2].trim().replace(/^"([^"]+)"$/, '$1')
          return `${alias}: ${tableName}.${raw}`
        }
        const colName = c.replace(/^"([^"]+)"$/, '$1')
        return `${colName}: ${tableName}.${colName}`
      })
      selectArg = `{ ${colParts.join(', ')} }`
    }

    let chain = `db.select(${selectArg}).from(${tableName})`

    if (whereStr) {
      chain += `.where(${convertWhereToEq(whereStr, tableName)})`
    }

    if (orderStr) {
      const orderParts = orderStr.split(',').map((part) => {
        const segments = part.trim().split(/\s+/)
        const col = segments[0].replace(/^"([^"]+)"$/, '$1')
        const dir = (segments[1] ?? 'ASC').toUpperCase() === 'DESC' ? 'desc' : 'asc'
        return `${dir}(${tableName}.${col})`
      })
      chain += `.orderBy(${orderParts.join(', ')})`
    }

    if (limitStr) chain += `.limit(${limitStr})`
    if (offsetStr) chain += `.offset(${offsetStr})`

    return chain
  } catch {
    return `// Cannot auto-convert: ${sql}`
  }
}

/**
 * @param {string} where
 * @param {string} tableName
 */
function convertWhereToEq(where, tableName) {
  // Handles simple `col = val` or `col = 'val'` expressions.
  const eqMatch = where.match(/^(\w+)\s*=\s*(.+)$/)
  if (eqMatch) {
    const col = eqMatch[1]
    const rawVal = eqMatch[2].trim()
    const val = rawVal.match(/^'(.+)'$/) ? `'${rawVal.slice(1, -1)}'` : rawVal
    return `eq(${tableName}.${col}, ${val})`
  }
  return `sql\`${where}\``
}

// ── SQL → Prisma ──────────────────────────────────────────────────────────────

/**
 * Convert a simple SELECT SQL to Prisma findMany notation.
 * @param {string} sql
 * @param {string[]} [tableNames]
 * @returns {string}
 */
export function sqlToPrisma(sql, tableNames) {
  const trimmed = sql.trim().replace(/;$/, '')

  if (!/^SELECT\b/i.test(trimmed)) {
    return `// Cannot auto-convert: use prisma.model.create/update/delete`
  }

  try {
    const upper = trimmed.toUpperCase()
    const fromIdx = upper.search(/\bFROM\b/)
    if (fromIdx < 0) return `// Cannot auto-convert: no FROM clause`

    const afterFrom = trimmed.slice(fromIdx + 4).trim()

    const whereIdx = afterFrom.search(/\bWHERE\b/i)
    const orderIdx = afterFrom.search(/\bORDER\s+BY\b/i)
    const limitIdx = afterFrom.search(/\bLIMIT\b/i)
    const offsetIdx = afterFrom.search(/\bOFFSET\b/i)

    const tableEndIdx = [whereIdx, orderIdx, limitIdx, offsetIdx].filter((i) => i >= 0).sort((a, b) => a - b)[0] ?? afterFrom.length
    const tableName = afterFrom.slice(0, tableEndIdx).trim().replace(/^"([^"]+)"$/, '$1')

    const opts = []

    if (whereIdx >= 0) {
      const afterWhere = afterFrom.slice(whereIdx + 5).trim()
      const whereEndIdx = [orderIdx, limitIdx, offsetIdx]
        .map((i) => (i >= 0 ? i - (whereIdx + 5) : Infinity))
        .filter((i) => i > 0)
        .sort((a, b) => a - b)[0]
      const whereStr = whereEndIdx != null && isFinite(whereEndIdx) ? afterWhere.slice(0, whereEndIdx).trim() : afterWhere
      const eqMatch = whereStr.match(/^(\w+)\s*=\s*(.+)$/)
      if (eqMatch) {
        const col = eqMatch[1]
        const rawVal = eqMatch[2].trim()
        const val = rawVal.match(/^'(.+)'$/) ? `'${rawVal.slice(1, -1)}'` : rawVal
        opts.push(`where: { ${col}: ${val} }`)
      }
    }

    if (orderIdx >= 0) {
      const afterOrder = afterFrom.slice(orderIdx).replace(/ORDER\s+BY\s+/i, '').trim()
      const orderEndIdx = [limitIdx, offsetIdx]
        .map((i) => (i >= 0 ? i - orderIdx : Infinity))
        .filter((i) => i > 0)
        .sort((a, b) => a - b)[0]
      const orderStr = orderEndIdx != null && isFinite(orderEndIdx) ? afterOrder.slice(0, orderEndIdx).trim() : afterOrder
      const parts = orderStr.split(',').map((p) => {
        const segs = p.trim().split(/\s+/)
        const col = segs[0].replace(/^"([^"]+)"$/, '$1')
        const dir = (segs[1] ?? 'asc').toLowerCase() === 'desc' ? 'desc' : 'asc'
        return `{ ${col}: '${dir}' }`
      })
      opts.push(`orderBy: ${parts.length === 1 ? parts[0] : `[${parts.join(', ')}]`}`)
    }

    if (limitIdx >= 0) {
      const afterLimit = afterFrom.slice(limitIdx + 5).trim()
      const limitEndIdx = offsetIdx >= 0 ? offsetIdx - limitIdx - 5 : undefined
      const limitVal = limitEndIdx != null ? afterLimit.slice(0, limitEndIdx).trim() : afterLimit.split(/\s+/)[0]
      opts.push(`take: ${limitVal}`)
    }

    if (offsetIdx >= 0) {
      const offsetVal = afterFrom.slice(offsetIdx + 6).trim().split(/\s+/)[0]
      opts.push(`skip: ${offsetVal}`)
    }

    const optsStr = opts.length ? `{ ${opts.join(', ')} }` : '{}'
    return `prisma.${tableName}.findMany(${optsStr})`
  } catch {
    return `// Cannot auto-convert: ${sql}`
  }
}
