/**
 * Plugin Context for React Components
 * Provides access to plugin manager and plugin state
 */

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react'
import { pluginManager } from './PluginManager'
import { 
  PluginInstance, 
  PluginExports, 
  SearchResult, 
  AuthResult,
  Track,
  Album,
  Artist,
  Playlist,
  User
} from './types'

interface PluginContextType {
  // State
  plugins: PluginInstance[]
  loading: boolean
  initialized: boolean
  
  // Plugin management
  installPlugin: (source: string | File) => Promise<{ success: boolean; error?: string }>
  uninstallPlugin: (pluginId: string) => Promise<boolean>
  enablePlugin: (pluginId: string, enabled: boolean) => Promise<void>
  refreshPlugins: () => Promise<void>
  
  // Auth (from active auth plugin)
  isAuthenticated: boolean
  user: User | null
  login: () => Promise<AuthResult | null>
  logout: () => Promise<void>
  
  // Metadata (from active metadata plugin)
  search: (query: string) => Promise<SearchResult | null>
  getTrack: (id: string) => Promise<Track | null>
  getAlbum: (id: string) => Promise<Album | null>
  getArtist: (id: string) => Promise<Artist | null>
  getPlaylist: (id: string) => Promise<Playlist | null>
  getUserPlaylists: () => Promise<Playlist[]>
}

const PluginContext = createContext<PluginContextType | null>(null)

export const usePlugins = () => {
  const context = useContext(PluginContext)
  if (!context) {
    throw new Error('usePlugins must be used within a PluginProvider')
  }
  return context
}

export const PluginProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [plugins, setPlugins] = useState<PluginInstance[]>([])
  const [loading, setLoading] = useState(true)
  const [initialized, setInitialized] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [user, setUser] = useState<User | null>(null)

  // Initialize plugin manager
  useEffect(() => {
    const init = async () => {
      try {
        await pluginManager.initialize()
        setPlugins(pluginManager.getPlugins())
        setInitialized(true)
        
        // Check auth state from active auth plugin
        const authPlugin = pluginManager.getActiveAuthPlugin()
        if (authPlugin?.exports?.isAuthenticated) {
          setIsAuthenticated(authPlugin.exports.isAuthenticated())
          if (authPlugin.exports.getUser) {
            setUser(authPlugin.exports.getUser())
          }
        }
      } catch (error) {
        console.error('[PluginContext] Init error:', error)
      } finally {
        setLoading(false)
      }
    }
    init()
  }, [])

  const refreshPlugins = useCallback(async () => {
    setPlugins(pluginManager.getPlugins())
  }, [])

  const installPlugin = useCallback(async (source: string | File) => {
    const result = await pluginManager.installPlugin(source)
    await refreshPlugins()
    return result
  }, [refreshPlugins])

  const uninstallPlugin = useCallback(async (pluginId: string) => {
    const result = await pluginManager.uninstallPlugin(pluginId)
    await refreshPlugins()
    return result
  }, [refreshPlugins])

  const enablePlugin = useCallback(async (pluginId: string, enabled: boolean) => {
    await pluginManager.setPluginEnabled(pluginId, enabled)
    await refreshPlugins()
  }, [refreshPlugins])

  // Auth methods - delegate to active auth plugin
  const login = useCallback(async (): Promise<AuthResult | null> => {
    const authPlugin = pluginManager.getActiveAuthPlugin()
    if (!authPlugin?.exports?.login) {
      console.warn('[PluginContext] No auth plugin available')
      return null
    }
    
    try {
      const result = await authPlugin.exports.login()
      if (result.success) {
        setIsAuthenticated(true)
        if (result.user) setUser(result.user)
      }
      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }, [])

  const logout = useCallback(async () => {
    const authPlugin = pluginManager.getActiveAuthPlugin()
    if (authPlugin?.exports?.logout) {
      await authPlugin.exports.logout()
    }
    setIsAuthenticated(false)
    setUser(null)
  }, [])

  // Metadata methods - delegate to active metadata plugin
  const getMetadataPlugin = useCallback((): PluginExports | null => {
    const plugin = pluginManager.getActiveMetadataPlugin()
    return plugin?.exports || null
  }, [])

  const search = useCallback(async (query: string): Promise<SearchResult | null> => {
    const exports = getMetadataPlugin()
    if (!exports?.search) return null
    return exports.search(query)
  }, [getMetadataPlugin])

  const getTrack = useCallback(async (id: string): Promise<Track | null> => {
    const exports = getMetadataPlugin()
    if (!exports?.getTrack) return null
    return exports.getTrack(id)
  }, [getMetadataPlugin])

  const getAlbum = useCallback(async (id: string): Promise<Album | null> => {
    const exports = getMetadataPlugin()
    if (!exports?.getAlbum) return null
    return exports.getAlbum(id)
  }, [getMetadataPlugin])

  const getArtist = useCallback(async (id: string): Promise<Artist | null> => {
    const exports = getMetadataPlugin()
    if (!exports?.getArtist) return null
    return exports.getArtist(id)
  }, [getMetadataPlugin])

  const getPlaylist = useCallback(async (id: string): Promise<Playlist | null> => {
    const exports = getMetadataPlugin()
    if (!exports?.getPlaylist) return null
    return exports.getPlaylist(id)
  }, [getMetadataPlugin])

  const getUserPlaylists = useCallback(async (): Promise<Playlist[]> => {
    const exports = getMetadataPlugin()
    if (!exports?.getUserPlaylists) return []
    return exports.getUserPlaylists()
  }, [getMetadataPlugin])

  const value: PluginContextType = {
    plugins,
    loading,
    initialized,
    installPlugin,
    uninstallPlugin,
    enablePlugin,
    refreshPlugins,
    isAuthenticated,
    user,
    login,
    logout,
    search,
    getTrack,
    getAlbum,
    getArtist,
    getPlaylist,
    getUserPlaylists
  }

  return (
    <PluginContext.Provider value={value}>
      {children}
    </PluginContext.Provider>
  )
}

export default PluginContext
