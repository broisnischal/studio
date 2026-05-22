const STORAGE_KEY = 'db-studio:ai-settings'

/** @typedef {{ baseUrl: string, apiKey: string, model: string }} AiSettings */

export const DEFAULT_AI_SETTINGS = /** @type {AiSettings} */ ({
  baseUrl: 'https://api.mistral.ai/v1',
  apiKey: '',
  model: 'mistral-small-latest',
})

/** @returns {AiSettings} */
export function loadAiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return { ...DEFAULT_AI_SETTINGS }
    const parsed = JSON.parse(raw)
    return {
      baseUrl: String(parsed.baseUrl || DEFAULT_AI_SETTINGS.baseUrl).trim(),
      apiKey: String(parsed.apiKey || ''),
      model: String(parsed.model || DEFAULT_AI_SETTINGS.model).trim(),
    }
  } catch {
    return { ...DEFAULT_AI_SETTINGS }
  }
}

/** @param {AiSettings} settings */
export function saveAiSettings(settings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
}
