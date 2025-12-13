// src/services/instanceService.ts

const INSTANCES_URL = 'https://raw.githubusercontent.com/n-ce/Uma/main/dynamic_instances.json'

const STORAGE_KEY_INSTANCE = 'ragam_selected_instance'
const STORAGE_KEY_QUALITY = 'ragam_audio_quality'
const STORAGE_KEY_PROVIDER = 'ragam_search_provider'
const STORAGE_KEY_REGION = 'ragam_search_region' // NEW KEY

export const DEFAULT_INSTANCE = 'https://api.piped.private.coffee'
export const DEFAULT_QUALITY = 'high'
export const DEFAULT_PROVIDER = 'youtube'
export const DEFAULT_REGION = 'IN' // Default to India (or US)

// ... existing providers ...
export const getSearchProvider = () =>
  localStorage.getItem(STORAGE_KEY_PROVIDER) || DEFAULT_PROVIDER
export const setSearchProvider = (provider: string) =>
  localStorage.setItem(STORAGE_KEY_PROVIDER, provider)

// ... existing instances ...
export const getSavedInstance = () => localStorage.getItem(STORAGE_KEY_INSTANCE) || DEFAULT_INSTANCE
export const setSavedInstance = (url: string) => localStorage.setItem(STORAGE_KEY_INSTANCE, url)

// ... existing quality ...
export const getAudioQuality = () => localStorage.getItem(STORAGE_KEY_QUALITY) || DEFAULT_QUALITY
export const setAudioQuality = (q: string) => localStorage.setItem(STORAGE_KEY_QUALITY, q)

// NEW: Region Getters/Setters
export const getSearchRegion = () => localStorage.getItem(STORAGE_KEY_REGION) || DEFAULT_REGION
export const setSearchRegion = (region: string) => localStorage.setItem(STORAGE_KEY_REGION, region)

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
