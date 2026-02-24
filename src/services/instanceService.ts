// src/services/instanceService.ts

const INSTANCES_URL = 'https://raw.githubusercontent.com/n-ce/Uma/main/dynamic_instances.json'

const STORAGE_KEY_INSTANCE = 'ragam_selected_instance'
const STORAGE_KEY_QUALITY = 'ragam_audio_quality'
const STORAGE_KEY_PROVIDER = 'ragam_search_provider'
const STORAGE_KEY_REGION = 'ragam_search_region'
const STORAGE_KEY_NORMALIZATION = 'ragam_audio_normalization'

// Default JioSaavn API instance
export const DEFAULT_INSTANCE = 'https://saavn-ytify.vercel.app'
export const DEFAULT_QUALITY = 'high'
export const DEFAULT_PROVIDER = 'youtube' // Changed back to YouTube
export const DEFAULT_REGION = 'IN'
export const DEFAULT_NORMALIZATION = false

// Provider Getters/Setters
export const getSearchProvider = () =>
  localStorage.getItem(STORAGE_KEY_PROVIDER) || DEFAULT_PROVIDER
export const setSearchProvider = (provider: string) =>
  localStorage.setItem(STORAGE_KEY_PROVIDER, provider)

// Instance Getters/Setters (for JioSaavn API)
export const getSavedInstance = () => localStorage.getItem(STORAGE_KEY_INSTANCE) || DEFAULT_INSTANCE
export const setSavedInstance = (url: string) => localStorage.setItem(STORAGE_KEY_INSTANCE, url)

// Audio Quality Getters/Setters
export const getAudioQuality = () => localStorage.getItem(STORAGE_KEY_QUALITY) || DEFAULT_QUALITY
export const setAudioQuality = (q: string) => localStorage.setItem(STORAGE_KEY_QUALITY, q)

// Region Getters/Setters
export const getSearchRegion = () => localStorage.getItem(STORAGE_KEY_REGION) || DEFAULT_REGION
export const setSearchRegion = (region: string) => localStorage.setItem(STORAGE_KEY_REGION, region)

// Theme Getters/Setters
const STORAGE_KEY_THEME = 'ragam_theme'
export const DEFAULT_THEME = 'default'
export const getTheme = () => localStorage.getItem(STORAGE_KEY_THEME) || DEFAULT_THEME
export const setTheme = (theme: string) => localStorage.setItem(STORAGE_KEY_THEME, theme)

// Audio Normalization Getters/Setters
export const getAudioNormalization = (): boolean => {
  const stored = localStorage.getItem(STORAGE_KEY_NORMALIZATION)
  return stored === 'true'
}
export const setAudioNormalization = (enabled: boolean) =>
  localStorage.setItem(STORAGE_KEY_NORMALIZATION, String(enabled))

// Volume Getters/Setters
const STORAGE_KEY_VOLUME = 'ragam_player_volume'
export const getStoredVolume = (): number => {
  const stored = localStorage.getItem(STORAGE_KEY_VOLUME)
  return stored ? parseFloat(stored) : 1
}
export const setStoredVolume = (vol: number) => 
  localStorage.setItem(STORAGE_KEY_VOLUME, String(vol))

// Fetch dynamic instances from remote config
export const fetchInstances = async (): Promise<{
  jiosaavn: string
  invidious: string[]
  hyperpipe: string[]
}> => {
  try {
    const response = await fetch(INSTANCES_URL)
    const data = await response.json()
    return {
      jiosaavn: data.jiosaavn || DEFAULT_INSTANCE,
      invidious: data.invidious || [],
      hyperpipe: data.hyperpipe || []
    }
  } catch {
    return {
      jiosaavn: DEFAULT_INSTANCE,
      invidious: [],
      hyperpipe: []
    }
  }
}

// Get just the JioSaavn instance URL
export const fetchJioSaavnInstance = async (): Promise<string> => {
  try {
    const response = await fetch(INSTANCES_URL)
    const data = await response.json()
    return data.jiosaavn || DEFAULT_INSTANCE
  } catch {
    return DEFAULT_INSTANCE
  }
}

export const clearAllData = () => {
  localStorage.clear()
  window.location.href = '/'
}
