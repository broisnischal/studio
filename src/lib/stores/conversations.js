import { getStudioDb, STORES } from '$lib/stores/studio-db.js'

const STORE = STORES.conversations

/**
 * @typedef {{
 *   id: string
 *   title: string
 *   createdAt: number
 *   updatedAt: number
 *   schema: string
 *   connectionId: string
 *   items: unknown[]
 *   apiHistory: unknown[]
 * }} Conversation
 */

function getDb() {
  return getStudioDb()
}

/**
 * @param {string} [connectionId] when provided, only return conversations for that connection
 * @returns {Promise<Conversation[]>} sorted newest first
 */
export async function listConversations(connectionId) {
  const db = await getDb()
  const all = await db.getAll(STORE)
  const filtered = connectionId ? all.filter((c) => c.connectionId === connectionId) : all
  return filtered.sort((a, b) => b.updatedAt - a.updatedAt)
}

/** @param {string} id @returns {Promise<Conversation | undefined>} */
export async function getConversation(id) {
  const db = await getDb()
  return db.get(STORE, id)
}

/** @param {Omit<Conversation, 'id' | 'createdAt' | 'updatedAt'>} data @returns {Promise<Conversation>} */
export async function createConversation(data) {
  const now = Date.now()
  const conv = /** @type {Conversation} */ ({
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    ...data,
  })
  const db = await getDb()
  await db.put(STORE, conv)
  return conv
}

/** @param {string} id @param {Partial<Omit<Conversation, 'id' | 'createdAt'>>} patch */
export async function updateConversation(id, patch) {
  const db = await getDb()
  const existing = await db.get(STORE, id)
  if (!existing) return
  await db.put(STORE, { ...existing, ...patch, updatedAt: Date.now() })
}

/** @param {string} id */
export async function deleteConversation(id) {
  const db = await getDb()
  await db.delete(STORE, id)
}
