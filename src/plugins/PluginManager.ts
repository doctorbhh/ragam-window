/**
 * Plugin Manager for Ragam Music Player
 * Handles plugin loading, registration, and lifecycle
 */

import { 
  PluginManifest, 
  PluginInstance, 
  PluginExports, 
  PluginSettings,
  PluginType
} from './types'

class PluginManager {
  private plugins: Map<string, PluginInstance> = new Map()
  private settings: PluginSettings = { installedPlugins: {} }
  private initialized = false

  /**
   * Initialize the plugin manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) return
    
    try {
      // Load plugin settings from electron storage
      if (window.electron?.plugins) {
        const settings = await window.electron.plugins.getSettings()
        if (settings) {
          this.settings = settings
        }
        
        // Load all installed plugins
        const installedPlugins = await window.electron.plugins.list()
        for (const manifest of installedPlugins) {
          await this.loadPlugin(manifest)
        }
      }
      
      this.initialized = true
      console.log('[PluginManager] Initialized with', this.plugins.size, 'plugins')
    } catch (error) {
      console.error('[PluginManager] Initialization error:', error)
    }
  }

  /**
   * Load a plugin from its manifest
   */
  async loadPlugin(manifest: PluginManifest): Promise<boolean> {
    try {
      const pluginId = manifest.id
      
      // Check if already loaded
      if (this.plugins.has(pluginId)) {
        console.log(`[PluginManager] Plugin ${pluginId} already loaded`)
        return true
      }

      // Get enabled state from settings
      const isEnabled = this.settings.installedPlugins[pluginId]?.enabled ?? true

      // Create plugin instance
      const instance: PluginInstance = {
        manifest,
        enabled: isEnabled,
        loaded: false,
        exports: undefined
      }

      // If enabled, load the plugin code
      if (isEnabled) {
        try {
          const pluginCode = await window.electron?.plugins?.loadCode(pluginId)
          if (pluginCode) {
            // Execute plugin code in a sandboxed context
            const exports = await this.executePlugin(pluginCode, manifest)
            instance.exports = exports
            instance.loaded = true
            
            // Call onLoad hook if exists
            if (exports.onLoad) {
              await exports.onLoad()
            }
          }
        } catch (error: any) {
          instance.error = error.message
          console.error(`[PluginManager] Failed to load plugin ${pluginId}:`, error)
        }
      }

      this.plugins.set(pluginId, instance)
      console.log(`[PluginManager] Loaded plugin: ${manifest.name} v${manifest.version}`)
      return true
    } catch (error) {
      console.error('[PluginManager] Load plugin error:', error)
      return false
    }
  }

  /**
   * Execute plugin code in a sandboxed environment
   */
  private async executePlugin(code: string, manifest: PluginManifest): Promise<PluginExports> {
    // Create a sandboxed context with allowed APIs
    const context: any = {
      console: console,
      fetch: manifest.apis.includes('fetch') ? fetch.bind(window) : undefined,
      localStorage: manifest.apis.includes('localStorage') ? {
        getItem: (key: string) => localStorage.getItem(`plugin:${manifest.id}:${key}`),
        setItem: (key: string, value: string) => localStorage.setItem(`plugin:${manifest.id}:${key}`, value),
        removeItem: (key: string) => localStorage.removeItem(`plugin:${manifest.id}:${key}`)
      } : undefined,
    }

    // Create function from plugin code
    try {
      // The plugin code should export a default object with methods
      const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor
      const pluginFactory = new AsyncFunction('context', `
        const { console, fetch, localStorage } = context;
        ${code}
        return typeof exports !== 'undefined' ? exports : {};
      `)
      
      const exports = await pluginFactory(context)
      return exports as PluginExports
    } catch (error) {
      console.error('[PluginManager] Plugin execution error:', error)
      throw error
    }
  }

  /**
   * Install a plugin from URL or file
   */
  async installPlugin(source: string | File): Promise<{ success: boolean; error?: string }> {
    try {
      if (!window.electron?.plugins) {
        return { success: false, error: 'Plugin system not available' }
      }

      let result
      if (typeof source === 'string') {
        result = await window.electron.plugins.installFromUrl(source)
      } else {
        // Convert File to ArrayBuffer for IPC
        const buffer = await source.arrayBuffer()
        result = await window.electron.plugins.installFromFile(buffer, source.name)
      }

      if (result.success && result.manifest) {
        await this.loadPlugin(result.manifest)
        
        // Update settings
        this.settings.installedPlugins[result.manifest.id] = { enabled: true }
        await this.saveSettings()
      }

      return result
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  }

  /**
   * Uninstall a plugin
   */
  async uninstallPlugin(pluginId: string): Promise<boolean> {
    try {
      const plugin = this.plugins.get(pluginId)
      if (plugin) {
        // Call onUnload hook
        if (plugin.exports?.onUnload) {
          await plugin.exports.onUnload()
        }
        this.plugins.delete(pluginId)
      }

      // Remove from settings
      delete this.settings.installedPlugins[pluginId]
      await this.saveSettings()

      // Delete files
      if (window.electron?.plugins) {
        await window.electron.plugins.uninstall(pluginId)
      }

      return true
    } catch (error) {
      console.error('[PluginManager] Uninstall error:', error)
      return false
    }
  }

  /**
   * Enable or disable a plugin
   */
  async setPluginEnabled(pluginId: string, enabled: boolean): Promise<void> {
    const plugin = this.plugins.get(pluginId)
    if (!plugin) return

    plugin.enabled = enabled
    this.settings.installedPlugins[pluginId] = { 
      ...this.settings.installedPlugins[pluginId],
      enabled 
    }
    
    await this.saveSettings()

    // Reload plugin if enabling
    if (enabled && !plugin.loaded) {
      await this.loadPlugin(plugin.manifest)
    } else if (!enabled && plugin.loaded) {
      if (plugin.exports?.onUnload) {
        await plugin.exports.onUnload()
      }
      plugin.loaded = false
      plugin.exports = undefined
    }
  }

  /**
   * Save plugin settings
   */
  private async saveSettings(): Promise<void> {
    if (window.electron?.plugins) {
      await window.electron.plugins.saveSettings(this.settings)
    }
  }

  /**
   * Get all loaded plugins
   */
  getPlugins(): PluginInstance[] {
    return Array.from(this.plugins.values())
  }

  /**
   * Get a specific plugin by ID
   */
  getPlugin(pluginId: string): PluginInstance | undefined {
    return this.plugins.get(pluginId)
  }

  /**
   * Get plugins by type
   */
  getPluginsByType(type: PluginType): PluginInstance[] {
    return this.getPlugins().filter(p => p.manifest.type === type && p.enabled && p.loaded)
  }

  /**
   * Get the active metadata plugin
   */
  getActiveMetadataPlugin(): PluginInstance | undefined {
    const activeId = this.settings.activeMetadataPlugin
    if (activeId) {
      const plugin = this.plugins.get(activeId)
      if (plugin?.enabled && plugin?.loaded) return plugin
    }
    // Fallback to first available metadata plugin
    return this.getPluginsByType('metadata')[0]
  }

  /**
   * Get the active auth plugin
   */
  getActiveAuthPlugin(): PluginInstance | undefined {
    const activeId = this.settings.activeAuthPlugin
    if (activeId) {
      const plugin = this.plugins.get(activeId)
      if (plugin?.enabled && plugin?.loaded) return plugin
    }
    return this.getPluginsByType('auth')[0]
  }

  /**
   * Set active plugin for a type
   */
  async setActivePlugin(type: 'metadata' | 'auth' | 'source', pluginId: string): Promise<void> {
    switch (type) {
      case 'metadata':
        this.settings.activeMetadataPlugin = pluginId
        break
      case 'auth':
        this.settings.activeAuthPlugin = pluginId
        break
      case 'source':
        this.settings.activeSourcePlugin = pluginId
        break
    }
    await this.saveSettings()
  }
}

// Export singleton instance
export const pluginManager = new PluginManager()
export default pluginManager
