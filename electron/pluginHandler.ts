/**
 * Plugin Handler for Electron Main Process
 * Handles plugin file operations, installation, and loading
 */

import { app, ipcMain } from 'electron'
import path from 'node:path'
import fs from 'node:fs'
import https from 'https'
import http from 'http'

// Plugin directory in userData
const PLUGINS_DIR = path.join(app.getPath('userData'), 'plugins')
const PLUGIN_SETTINGS_FILE = path.join(app.getPath('userData'), 'plugin-settings.json')

// Ensure plugins directory exists
const ensurePluginsDir = () => {
  if (!fs.existsSync(PLUGINS_DIR)) {
    fs.mkdirSync(PLUGINS_DIR, { recursive: true })
  }
}

// Plugin manifest structure
interface PluginManifest {
  id: string
  name: string
  version: string
  author: string
  description: string
  type: string
  entry: string
  abilities: string[]
  apis: string[]
  icon?: string
  homepage?: string
  repository?: string
}

// Load plugin settings
const loadPluginSettings = (): any => {
  try {
    if (fs.existsSync(PLUGIN_SETTINGS_FILE)) {
      return JSON.parse(fs.readFileSync(PLUGIN_SETTINGS_FILE, 'utf-8'))
    }
  } catch (e) {
    console.error('[PluginHandler] Error loading settings:', e)
  }
  return { installedPlugins: {} }
}

// Save plugin settings
const savePluginSettings = (settings: any): void => {
  try {
    fs.writeFileSync(PLUGIN_SETTINGS_FILE, JSON.stringify(settings, null, 2))
  } catch (e) {
    console.error('[PluginHandler] Error saving settings:', e)
  }
}

// Download file from URL
const downloadFile = (url: string): Promise<Buffer> => {
  return new Promise((resolve, reject) => {
    const protocol = url.startsWith('https') ? https : http
    
    protocol.get(url, (response) => {
      // Handle redirects
      if (response.statusCode === 301 || response.statusCode === 302) {
        const redirectUrl = response.headers.location
        if (redirectUrl) {
          downloadFile(redirectUrl).then(resolve).catch(reject)
          return
        }
      }
      
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`))
        return
      }
      
      const chunks: Buffer[] = []
      response.on('data', (chunk) => chunks.push(chunk))
      response.on('end', () => resolve(Buffer.concat(chunks)))
      response.on('error', reject)
    }).on('error', reject)
  })
}

// Read plugin manifest from directory
const readPluginManifest = (pluginDir: string): PluginManifest | null => {
  try {
    const manifestPath = path.join(pluginDir, 'plugin.json')
    if (fs.existsSync(manifestPath)) {
      return JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    }
  } catch (e) {
    console.error('[PluginHandler] Error reading manifest:', e)
  }
  return null
}

// Initialize plugin IPC handlers
export const initPluginHandlers = () => {
  ensurePluginsDir()

  // List all installed plugins
  ipcMain.handle('plugins-list', async () => {
    try {
      ensurePluginsDir()
      const plugins: PluginManifest[] = []
      
      const dirs = fs.readdirSync(PLUGINS_DIR)
      for (const dir of dirs) {
        const pluginDir = path.join(PLUGINS_DIR, dir)
        if (fs.statSync(pluginDir).isDirectory()) {
          const manifest = readPluginManifest(pluginDir)
          if (manifest) {
            plugins.push(manifest)
          }
        }
      }
      
      return plugins
    } catch (e) {
      console.error('[PluginHandler] List error:', e)
      return []
    }
  })

  // Load plugin code
  ipcMain.handle('plugins-load-code', async (_, pluginId: string) => {
    try {
      const pluginDir = path.join(PLUGINS_DIR, pluginId)
      const manifest = readPluginManifest(pluginDir)
      
      if (!manifest) {
        throw new Error('Plugin manifest not found')
      }
      
      const entryPath = path.join(pluginDir, manifest.entry)
      if (!fs.existsSync(entryPath)) {
        throw new Error('Plugin entry file not found')
      }
      
      return fs.readFileSync(entryPath, 'utf-8')
    } catch (e: any) {
      console.error('[PluginHandler] Load code error:', e)
      throw e
    }
  })

  // Install plugin from URL
  ipcMain.handle('plugins-install-url', async (_, url: string) => {
    try {
      console.log('[PluginHandler] Installing from URL:', url)
      
      // Download plugin file
      const data = await downloadFile(url)
      
      // Create temp directory and extract
      const tempDir = path.join(app.getPath('temp'), `plugin-${Date.now()}`)
      fs.mkdirSync(tempDir, { recursive: true })
      
      // If it's a .js file, create a simple plugin structure
      if (url.endsWith('.js')) {
        const pluginId = path.basename(url, '.js')
        const pluginDir = path.join(PLUGINS_DIR, pluginId)
        
        fs.mkdirSync(pluginDir, { recursive: true })
        fs.writeFileSync(path.join(pluginDir, 'index.js'), data)
        
        // Create default manifest
        const manifest: PluginManifest = {
          id: pluginId,
          name: pluginId,
          version: '1.0.0',
          author: 'Unknown',
          description: 'Plugin installed from URL',
          type: 'metadata',
          entry: 'index.js',
          abilities: [],
          apis: ['fetch']
        }
        
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2))
        
        return { success: true, manifest }
      }
      
      // If it's a JSON manifest, read and install
      if (url.endsWith('.json') || url.includes('plugin.json')) {
        const manifest = JSON.parse(data.toString()) as PluginManifest
        const pluginDir = path.join(PLUGINS_DIR, manifest.id)
        
        fs.mkdirSync(pluginDir, { recursive: true })
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), data)
        
        // Download entry file if specified
        if (manifest.entry) {
          const baseUrl = url.substring(0, url.lastIndexOf('/'))
          const entryUrl = `${baseUrl}/${manifest.entry}`
          const entryData = await downloadFile(entryUrl)
          fs.writeFileSync(path.join(pluginDir, manifest.entry), entryData)
        }
        
        return { success: true, manifest }
      }
      
      return { success: false, error: 'Unsupported plugin format' }
    } catch (e: any) {
      console.error('[PluginHandler] Install URL error:', e)
      return { success: false, error: e.message }
    }
  })

  // Install plugin from file (ArrayBuffer)
  ipcMain.handle('plugins-install-file', async (_, data: ArrayBuffer, filename: string) => {
    try {
      console.log('[PluginHandler] Installing from file:', filename)
      
      const buffer = Buffer.from(data)
      
      // For now, handle .js files
      if (filename.endsWith('.js')) {
        const pluginId = path.basename(filename, '.js')
        const pluginDir = path.join(PLUGINS_DIR, pluginId)
        
        fs.mkdirSync(pluginDir, { recursive: true })
        fs.writeFileSync(path.join(pluginDir, 'index.js'), buffer)
        
        const manifest: PluginManifest = {
          id: pluginId,
          name: pluginId,
          version: '1.0.0',
          author: 'Unknown',
          description: 'Plugin installed from file',
          type: 'metadata',
          entry: 'index.js',
          abilities: [],
          apis: ['fetch']
        }
        
        fs.writeFileSync(path.join(pluginDir, 'plugin.json'), JSON.stringify(manifest, null, 2))
        
        return { success: true, manifest }
      }
      
      return { success: false, error: 'Unsupported file format' }
    } catch (e: any) {
      console.error('[PluginHandler] Install file error:', e)
      return { success: false, error: e.message }
    }
  })

  // Uninstall plugin
  ipcMain.handle('plugins-uninstall', async (_, pluginId: string) => {
    try {
      const pluginDir = path.join(PLUGINS_DIR, pluginId)
      
      if (fs.existsSync(pluginDir)) {
        fs.rmSync(pluginDir, { recursive: true, force: true })
      }
      
      // Update settings
      const settings = loadPluginSettings()
      delete settings.installedPlugins[pluginId]
      savePluginSettings(settings)
      
      return true
    } catch (e) {
      console.error('[PluginHandler] Uninstall error:', e)
      return false
    }
  })

  // Get plugin settings
  ipcMain.handle('plugins-get-settings', async () => {
    return loadPluginSettings()
  })

  // Save plugin settings
  ipcMain.handle('plugins-save-settings', async (_, settings: any) => {
    savePluginSettings(settings)
    return true
  })

  console.log('[PluginHandler] Initialized')
}

export default initPluginHandlers
