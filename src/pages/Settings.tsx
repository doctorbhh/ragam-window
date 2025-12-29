import { useEffect, useState, useRef } from 'react'
import {
  Trash2,
  Signal,
  AlertTriangle,
  Globe,
  MapPin,
  HardDrive,
  Volume2,
  Puzzle,
  Download,
  Link,
  Upload,
  RefreshCw
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Progress } from '@/components/ui/progress'
import { toast } from 'sonner'
import {
  clearAllData,
  getAudioQuality,
  setAudioQuality,
  getSearchProvider,
  setSearchProvider,
  getSearchRegion,
  setSearchRegion,
  getAudioNormalization,
  setAudioNormalization
} from '@/services/instanceService'
import {
  getCacheSettings,
  setCacheSettings,
  getCacheStats,
  clearCache,
  CacheSettings,
  CacheStats
} from '@/services/cacheService'
import { pluginManager } from '@/plugins/PluginManager'
import { PluginCard } from '@/components/PluginCard'
import { PluginInstance } from '@/plugins/types'
import { Input } from '@/components/ui/input'

const REGIONS = [
  { code: 'US', name: 'United States' },
  { code: 'IN', name: 'India' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CA', name: 'Canada' },
  { code: 'AU', name: 'Australia' },
  { code: 'JP', name: 'Japan' },
  { code: 'DE', name: 'Germany' },
  { code: 'FR', name: 'France' },
  { code: 'BR', name: 'Brazil' }
]

const Settings = () => {
  const [currentQuality, setCurrentQuality] = useState('high')
  const [currentProvider, setCurrentProvider] = useState('youtube')
  const [currentRegion, setCurrentRegion] = useState('IN')
  const [normalizationEnabled, setNormalizationEnabled] = useState(false)

  // Cache state
  const [cacheEnabled, setCacheEnabled] = useState(true)
  const [cacheMaxSize, setCacheMaxSize] = useState(500)
  const [cacheStats, setCacheStats] = useState<CacheStats>({ count: 0, sizeBytes: 0, sizeMB: 0 })
  const [cacheLoading, setCacheLoading] = useState(false)

  // Plugin state
  const [plugins, setPlugins] = useState<PluginInstance[]>([])
  const [pluginsLoading, setPluginsLoading] = useState(false)
  const [pluginUrl, setPluginUrl] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setCurrentQuality(getAudioQuality())
    setCurrentProvider(getSearchProvider())
    setCurrentRegion(getSearchRegion())
    setNormalizationEnabled(getAudioNormalization())
    loadCacheSettings()
    
    // Initialize plugins
    const initPlugins = async () => {
      setPluginsLoading(true)
      try {
        await pluginManager.initialize()
        setPlugins(pluginManager.getPlugins())
      } catch (e) {
        console.error('Failed to load plugins:', e)
      } finally {
        setPluginsLoading(false)
      }
    }
    initPlugins()
  }, [])

  const handleQualityChange = (value: string) => {
    setAudioQuality(value)
    setCurrentQuality(value)
    toast.success(`Audio quality set to ${value}`)
  }

  const handleProviderChange = (value: string) => {
    setSearchProvider(value)
    setCurrentProvider(value)
    toast.success(`Search provider switched to ${value === 'jiosaavn' ? 'JioSaavn' : 'YouTube'}`)
  }

  const handleRegionChange = (value: string) => {
    setSearchRegion(value)
    setCurrentRegion(value)
    toast.success(`Search region set to ${value}`)
  }

  const handleNormalizationChange = (enabled: boolean) => {
    setAudioNormalization(enabled)
    setNormalizationEnabled(enabled)
    toast.success(`Audio normalization ${enabled ? 'enabled' : 'disabled'}`)
  }

  const handleClearData = () => {
    clearAllData()
  }

  // Cache handlers
  const loadCacheSettings = async () => {
    try {
      const settings = await getCacheSettings()
      setCacheEnabled(settings.enabled)
      setCacheMaxSize(settings.maxSizeMB)
      const stats = await getCacheStats()
      setCacheStats(stats)
    } catch (e) {
      console.error('Failed to load cache settings:', e)
    }
  }

  const handleCacheToggle = async (enabled: boolean) => {
    setCacheEnabled(enabled)
    await setCacheSettings({ enabled })
    toast.success(enabled ? 'Audio caching enabled' : 'Audio caching disabled')
  }

  const handleCacheSizeChange = async (value: string) => {
    const maxSizeMB = parseInt(value)
    setCacheMaxSize(maxSizeMB)
    await setCacheSettings({ maxSizeMB })
    // Refresh stats after potential eviction
    const stats = await getCacheStats()
    setCacheStats(stats)
    toast.success(`Cache size limit set to ${maxSizeMB} MB`)
  }

  const handleClearCache = async () => {
    setCacheLoading(true)
    try {
      await clearCache()
      setCacheStats({ count: 0, sizeBytes: 0, sizeMB: 0 })
      toast.success('Audio cache cleared')
    } catch (e) {
      toast.error('Failed to clear cache')
    } finally {
      setCacheLoading(false)
    }
  }

  // Plugin handlers
  const loadPlugins = async () => {
    setPluginsLoading(true)
    try {
      await pluginManager.initialize()
      setPlugins(pluginManager.getPlugins())
    } catch (e) {
      console.error('Failed to load plugins:', e)
    } finally {
      setPluginsLoading(false)
    }
  }

  const handlePluginEnable = async (pluginId: string, enabled: boolean) => {
    await pluginManager.setPluginEnabled(pluginId, enabled)
    setPlugins(pluginManager.getPlugins())
    toast.success(enabled ? 'Plugin enabled' : 'Plugin disabled')
  }

  const handlePluginUninstall = async (pluginId: string) => {
    const success = await pluginManager.uninstallPlugin(pluginId)
    if (success) {
      setPlugins(pluginManager.getPlugins())
      toast.success('Plugin uninstalled')
    } else {
      toast.error('Failed to uninstall plugin')
    }
  }

  const handleInstallFromUrl = async () => {
    if (!pluginUrl.trim()) {
      toast.error('Please enter a plugin URL')
      return
    }
    
    setPluginsLoading(true)
    try {
      const result = await pluginManager.installPlugin(pluginUrl.trim())
      if (result.success) {
        setPlugins(pluginManager.getPlugins())
        setPluginUrl('')
        toast.success('Plugin installed successfully')
      } else {
        toast.error(result.error || 'Failed to install plugin')
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to install plugin')
    } finally {
      setPluginsLoading(false)
    }
  }

  const handleInstallFromFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    
    setPluginsLoading(true)
    try {
      const result = await pluginManager.installPlugin(file)
      if (result.success) {
        setPlugins(pluginManager.getPlugins())
        toast.success('Plugin installed successfully')
      } else {
        toast.error(result.error || 'Failed to install plugin')
      }
    } catch (e: any) {
      toast.error(e.message || 'Failed to install plugin')
    } finally {
      setPluginsLoading(false)
      if (fileInputRef.current) {
        fileInputRef.current.value = ''
      }
    }
  }

  return (
    <div className="container mx-auto p-6 max-w-2xl pb-24">
      <h1 className="text-3xl font-bold mb-6">Settings</h1>

      <div className="space-y-6">
        {/* Plugins Section */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Puzzle className="h-5 w-5 text-primary" />
                <CardTitle>Plugins</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="icon"
                onClick={() => {
                  setPluginsLoading(true)
                  pluginManager.initialize().then(() => {
                    setPlugins(pluginManager.getPlugins())
                    setPluginsLoading(false)
                  })
                }}
                disabled={pluginsLoading}
              >
                <RefreshCw className={`h-4 w-4 ${pluginsLoading ? 'animate-spin' : ''}`} />
              </Button>
            </div>
            <CardDescription>
              Extend functionality with metadata, auth, and streaming plugins.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Install from URL */}
            <div className="flex gap-2">
              <Input
                placeholder="Enter plugin URL..."
                value={pluginUrl}
                onChange={(e) => setPluginUrl(e.target.value)}
                className="flex-1"
              />
              <Button 
                onClick={handleInstallFromUrl} 
                disabled={pluginsLoading || !pluginUrl.trim()}
              >
                <Link className="h-4 w-4 mr-2" />
                Install
              </Button>
            </div>

            {/* Install from file */}
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleInstallFromFile}
                accept=".js,.json,.zip"
                className="hidden"
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={pluginsLoading}
                className="w-full"
              >
                <Upload className="h-4 w-4 mr-2" />
                Install from File
              </Button>
            </div>

            {/* Plugin list */}
            <div className="space-y-3 mt-4">
              {plugins.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <Puzzle className="h-12 w-12 mx-auto mb-3 opacity-50" />
                  <p>No plugins installed</p>
                  <p className="text-sm mt-1">Install plugins to extend functionality</p>
                </div>
              ) : (
                plugins.map((plugin) => (
                  <PluginCard
                    key={plugin.manifest.id}
                    plugin={plugin}
                    onEnable={handlePluginEnable}
                    onUninstall={handlePluginUninstall}
                  />
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Search Provider Settings */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-primary" />
              <CardTitle>Search Provider</CardTitle>
            </div>
            <CardDescription>Choose where to search and fetch songs from.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={currentProvider} onValueChange={handleProviderChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select provider" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="youtube">YouTube </SelectItem>
                <SelectItem value="jiosaavn">JioSaavn (Fast & Direct)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Region Settings */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-primary" />
              <CardTitle>Search Region</CardTitle>
            </div>
            <CardDescription>Set your preferred country for search results.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={currentRegion} onValueChange={handleRegionChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select region" />
              </SelectTrigger>
              <SelectContent>
                {REGIONS.map((region) => (
                  <SelectItem key={region.code} value={region.code}>
                    {region.name} ({region.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Audio Quality Settings */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Signal className="h-5 w-5 text-primary" />
              <CardTitle>Audio Quality</CardTitle>
            </div>
            <CardDescription>Adjust streaming quality.</CardDescription>
          </CardHeader>
          <CardContent>
            <Select value={currentQuality} onValueChange={handleQualityChange}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select quality" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="high">High (Best Audio)</SelectItem>
                <SelectItem value="medium">Medium (Balanced)</SelectItem>
                <SelectItem value="low">Low (Data Saver)</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        {/* Audio Normalization */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Volume2 className="h-5 w-5 text-primary" />
              <CardTitle>Audio Normalization</CardTitle>
            </div>
            <CardDescription>
              Automatically adjust volume levels so all songs play at similar loudness.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <Label htmlFor="normalization">Enable normalization</Label>
                <p className="text-xs text-muted-foreground">
                  Prevents sudden volume jumps between tracks
                </p>
              </div>
              <Switch
                id="normalization"
                checked={normalizationEnabled}
                onCheckedChange={handleNormalizationChange}
              />
            </div>
          </CardContent>
        </Card>

        {/* Audio Cache Settings */}
        <Card className="border-border/50 bg-card/50 backdrop-blur">
          <CardHeader>
            <div className="flex items-center gap-2">
              <HardDrive className="h-5 w-5 text-primary" />
              <CardTitle>Audio Cache</CardTitle>
            </div>
            <CardDescription>Cache songs locally for faster playback on repeat plays.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Enable Toggle */}
            <div className="flex items-center justify-between">
              <Label htmlFor="cache-toggle" className="flex flex-col gap-1">
                <span>Enable Cache</span>
                <span className="text-xs text-muted-foreground font-normal">
                  Store audio locally for faster playback
                </span>
              </Label>
              <Switch
                id="cache-toggle"
                checked={cacheEnabled}
                onCheckedChange={handleCacheToggle}
              />
            </div>

            {/* Max Size Selector */}
            <div className="space-y-2">
              <Label>Maximum Cache Size</Label>
              <Select
                value={cacheMaxSize.toString()}
                onValueChange={handleCacheSizeChange}
                disabled={!cacheEnabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="100">100 MB</SelectItem>
                  <SelectItem value="250">250 MB</SelectItem>
                  <SelectItem value="500">500 MB</SelectItem>
                  <SelectItem value="1024">1 GB</SelectItem>
                  <SelectItem value="2048">2 GB</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Usage Display */}
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Current Usage</span>
                <span className="font-medium">
                  {cacheStats.sizeMB} MB / {cacheMaxSize} MB ({cacheStats.count} songs)
                </span>
              </div>
              <Progress
                value={(cacheStats.sizeMB / cacheMaxSize) * 100}
                className="h-2"
              />
            </div>

            {/* Clear Cache Button */}
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-full"
                  disabled={cacheStats.count === 0 || cacheLoading}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  {cacheLoading ? 'Clearing...' : 'Clear Cache'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear Audio Cache?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete {cacheStats.count} cached songs ({cacheStats.sizeMB} MB).
                    Songs will be re-downloaded when played again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleClearCache}>
                    Clear Cache
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-destructive/20 bg-destructive/5">
          <CardHeader>
            <div className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5" />
              <CardTitle>Danger Zone</CardTitle>
            </div>
            <CardDescription>Irreversible actions regarding your local data.</CardDescription>
          </CardHeader>
          <CardContent>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" className="w-full sm:w-auto">
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear All Data & Reset
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will delete all local settings and reset the app.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleClearData}
                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  >
                    Yes, Clear Everything
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

export default Settings
