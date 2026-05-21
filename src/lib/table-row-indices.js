/**
 * @param {number} index
 * @param {number[]} removedAscending sorted ascending
 */
export function remapRowIndex(index, removedAscending) {
  let delta = 0
  for (const r of removedAscending) {
    if (r < index) delta += 1
    else break
  }
  return index - delta
}

/**
 * @param {Set<number>} indices
 * @param {number[]} removedAscending sorted ascending
 */
export function remapRowIndexSet(indices, removedAscending) {
  const removedSet = new Set(removedAscending)
  const next = new Set()
  for (const i of indices) {
    if (removedSet.has(i)) continue
    next.add(remapRowIndex(i, removedAscending))
  }
  return next
}

/**
 * @param {number | null} index
 * @param {number[]} removedAscending
 * @returns {number | null}
 */
export function remapNullableRowIndex(index, removedAscending) {
  if (index === null) return null
  if (removedAscending.includes(index)) return null
  return remapRowIndex(index, removedAscending)
}
