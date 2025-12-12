const INSTANCES_URL = 'https://raw.githubusercontent.com/n-ce/Uma/main/dynamic_instances.json'

const STORAGE_KEY_INSTANCE = 'ragam_selected_instance'
const STORAGE_KEY_QUALITY = 'ragam_audio_quality'
const STORAGE_KEY_PROVIDER = 'ragam_search_provider'

export const DEFAULT_INSTANCE = 'https://api.piped.private.coffee'
export const DEFAULT_QUALITY = 'high'
export const DEFAULT_PROVIDER = 'youtube'

export const getSearchProvider = () =>
  localStorage.getItem(STORAGE_KEY_PROVIDER) || DEFAULT_PROVIDER
export const setSearchProvider = (provider: string) =>
  localStorage.setItem(STORAGE_KEY_PROVIDER, provider)

export const getSavedInstance = () => localStorage.getItem(STORAGE_KEY_INSTANCE) || DEFAULT_INSTANCE
export const setSavedInstance = (url: string) => localStorage.setItem(STORAGE_KEY_INSTANCE, url)

export const getAudioQuality = () => localStorage.getItem(STORAGE_KEY_QUALITY) || DEFAULT_QUALITY
export const setAudioQuality = (q: string) => localStorage.setItem(STORAGE_KEY_QUALITY, q)

export const fetchInstances = async () => {
  try {
    const response = await fetch(INSTANCES_URL)
    const data = await response.json()
    return data.piped || []
  } catch {
    return []
  }
}

export const clearAllData = () => {
  localStorage.clear()
  window.location.href = '/'
}
