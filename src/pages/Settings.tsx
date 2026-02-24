import { useEffect, useState } from 'react'
import {
  Trash2,
  Signal,
  AlertTriangle,
  Globe,
  MapPin,
  HardDrive,
  Volume2,
  Infinity,
  Palette,
  ChevronRight,
  Check,
  Sparkles,
  Keyboard
} from 'lucide-react'
import { Button } from '@/components/ui/button'
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
  setAudioNormalization,
  getTheme,
  setTheme
} from '@/services/instanceService'
import {
  getCacheSettings,
  setCacheSettings,
  getCacheStats,
  clearCache,
  CacheStats
} from '@/services/cacheService'
import { usePlayer } from '@/context/PlayerContext'
import { cn } from '@/lib/utils'

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

// Theme preview cards data
const THEMES = [
  { 
    id: 'default', 
    name: 'Default Dark', 
    description: 'Modern dark with Green accents',
    colors: ['#3aed3aff', '#1e1e2e', '#2d2d3d']
  },
  { 
    id: 'kdon', 
    name: 'KDON', 
    description: 'Cyan glass with neon glow',
    colors: ['#06b6d4', '#0f1729', '#1e293b']
  },
  { 
    id: 'mello', 
    name: 'MelloStudio', 
    description: 'Carbon black with red accents',
    colors: ['#E91E63', '#121212', '#1f1f1f']
  }
]

// Setting Row Component - defined outside to prevent re-creation on re-renders
interface SettingRowProps {
  icon: any
  label: string
  description?: string
  children: React.ReactNode
  className?: string
}

const SettingRow = ({ icon: Icon, label, description, children, className }: SettingRowProps) => (
  <div className={cn(
    "group flex items-center justify-between py-4 px-5 rounded-xl",
    "hover:bg-white/5 border border-transparent hover:border-white/10",
    className
  )}>
    <div className="flex items-center gap-4">
      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center group-hover:bg-primary/20">
        <Icon className="h-5 w-5 text-primary" />
      </div>
      <div>
        <p className="font-medium text-foreground">{label}</p>
        {description && (
          <p className="text-sm text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </div>
    <div className="flex items-center gap-2">
      {children}
    </div>
  </div>
)

// Toggle Row Component - defined outside to prevent re-creation on re-renders
interface ToggleRowProps {
  icon: any
  label: string
  description?: string
  checked: boolean
  onCheckedChange: (checked: boolean) => void
}

const ToggleRow = ({ icon: Icon, label, description, checked, onCheckedChange }: ToggleRowProps) => (
  <SettingRow icon={Icon} label={label} description={description}>
    <Switch 
      checked={checked} 
      onCheckedChange={onCheckedChange}
      className="data-[state=checked]:bg-primary"
    />
  </SettingRow>
)

const Settings = () => {
  const [currentQuality, setCurrentQuality] = useState('high')
  const [currentProvider, setCurrentProvider] = useState('youtube')
  const [currentRegion, setCurrentRegion] = useState('IN')
  const [normalizationEnabled, setNormalizationEnabled] = useState(false)
  const [currentTheme, setCurrentTheme] = useState('default')
  const { spotifyEndless, ytmusicEndless, toggleSpotifyEndless, toggleYtmusicEndless } = usePlayer()

  // Cache state
  const [cacheEnabled, setCacheEnabled] = useState(true)
  const [cacheMaxSize, setCacheMaxSize] = useState(500)
  const [cacheStats, setCacheStats] = useState<CacheStats>({ count: 0, sizeBytes: 0, sizeMB: 0 })
  const [cacheLoading, setCacheLoading] = useState(false)

  useEffect(() => {
    setCurrentQuality(getAudioQuality())
    setCurrentProvider(getSearchProvider())
    setCurrentRegion(getSearchRegion())
    setNormalizationEnabled(getAudioNormalization())
    setCurrentTheme(getTheme())
    loadCacheSettings()
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

  const handleThemeChange = (value: string) => {
    setTheme(value)
    setCurrentTheme(value)
    document.documentElement.classList.remove('theme-kdon', 'theme-mello')
    if (value !== 'default') {
      document.documentElement.classList.add(`theme-${value}`)
    }
    const themeNames: Record<string, string> = {
      default: 'Default',
      kdon: 'KDON',
      mello: 'MelloStudio'
    }
    toast.success(`Theme set to ${themeNames[value] || 'Default'}`)
  }

  const handleClearData = () => {
    clearAllData()
  }

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

  return (
    <div className="min-h-full pb-32">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-4xl mx-auto px-6 py-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-primary to-primary/50 flex items-center justify-center shadow-lg shadow-primary/20">
              <Sparkles className="h-6 w-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-foreground">Settings</h1>
              <p className="text-sm text-muted-foreground">Customize your experience</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        
        {/* Appearance Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Palette className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Appearance</h2>
          </div>
          
          <div className="bg-card/30 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden">
            {/* Theme Cards */}
            <div className="p-5">
              <Label className="text-sm text-muted-foreground mb-4 block">Choose Theme</Label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    onClick={() => handleThemeChange(theme.id)}
                    className={cn(
                      "relative group p-4 rounded-xl border-2 transition-all duration-200 text-left",
                      "hover:shadow-lg hover:shadow-primary/5",
                      currentTheme === theme.id 
                        ? "border-primary bg-primary/10 shadow-lg shadow-primary/10" 
                        : "border-white/10 hover:border-white/20 bg-white/5"
                    )}
                  >
                    {/* Color Preview */}
                    <div className="flex gap-1.5 mb-3">
                      {theme.colors.map((color, i) => (
                        <div 
                          key={i}
                          className="w-6 h-6 rounded-full shadow-inner"
                          style={{ backgroundColor: color }}
                        />
                      ))}
                    </div>
                    
                    <p className="font-semibold text-foreground">{theme.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{theme.description}</p>
                    
                    {/* Selected indicator */}
                    {currentTheme === theme.id && (
                      <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-primary flex items-center justify-center">
                        <Check className="h-3.5 w-3.5 text-white" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Audio Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Volume2 className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Audio</h2>
          </div>
          
          <div className="bg-card/30 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
            <SettingRow icon={Signal} label="Audio Quality" description="Higher quality uses more data">
              <Select value={currentQuality} onValueChange={handleQualityChange}>
                <SelectTrigger className="w-40 bg-white/5 border-white/10">
                  <SelectValue placeholder="Select quality" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High (320kbps)</SelectItem>
                  <SelectItem value="medium">Medium (192kbps)</SelectItem>
                  <SelectItem value="low">Low (128kbps)</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <ToggleRow 
              icon={Volume2} 
              label="Audio Normalization" 
              description="Consistent volume across all tracks"
              checked={normalizationEnabled}
              onCheckedChange={handleNormalizationChange}
            />

            <ToggleRow 
              icon={Infinity} 
              label="Spotify Endless Playback" 
              description="Auto-queue from Spotify recommendations"
              checked={spotifyEndless}
              onCheckedChange={toggleSpotifyEndless}
            />

            <ToggleRow 
              icon={Infinity} 
              label="YT Music Endless Playback" 
              description="Auto-queue from YouTube Music radio"
              checked={ytmusicEndless}
              onCheckedChange={toggleYtmusicEndless}
            />
          </div>
        </section>

        {/* Search Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Globe className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Search & Region</h2>
          </div>
          
          <div className="bg-card/30 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5">
            <SettingRow icon={Globe} label="Search Provider" description="Source for audio streaming">
              <Select value={currentProvider} onValueChange={handleProviderChange}>
                <SelectTrigger className="w-44 bg-white/5 border-white/10">
                  <SelectValue placeholder="Select provider" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="youtube">YouTube</SelectItem>
                  <SelectItem value="jiosaavn">JioSaavn</SelectItem>
                </SelectContent>
              </Select>
            </SettingRow>

            <SettingRow icon={MapPin} label="Search Region" description="Preferred country for results">
              <Select value={currentRegion} onValueChange={handleRegionChange}>
                <SelectTrigger className="w-44 bg-white/5 border-white/10">
                  <SelectValue placeholder="Select region" />
                </SelectTrigger>
                <SelectContent>
                  {REGIONS.map((region) => (
                    <SelectItem key={region.code} value={region.code}>
                      {region.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </SettingRow>
          </div>
        </section>

        {/* Shortcuts Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <Keyboard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Keyboard Shortcuts</h2>
          </div>
          
          <div className="bg-card/30 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden divide-y divide-white/5 p-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-y-4 gap-x-6">
              <div className="flex justify-between items-center">
                <span className="text-foreground">Play / Pause</span>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-muted-foreground border border-white/5 shadow-sm">Space</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">Next Track</span>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-muted-foreground border border-white/5 shadow-sm">Right arrow &rarr;</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">Previous Track</span>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-muted-foreground border border-white/5 shadow-sm">Left arrow &larr;</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">Volume Up</span>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-muted-foreground border border-white/5 shadow-sm">Up arrow &uarr;</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">Volume Down</span>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-muted-foreground border border-white/5 shadow-sm">Down arrow &darr;</kbd>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-foreground">Toggle Mute</span>
                <kbd className="px-2 py-1 bg-white/10 rounded text-xs font-mono text-muted-foreground border border-white/5 shadow-sm">M</kbd>
              </div>
              
            </div>
          </div>
        </section>

        {/* Storage Section */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <HardDrive className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Storage & Cache</h2>
          </div>
          
          <div className="bg-card/30 backdrop-blur-sm rounded-2xl border border-white/5 overflow-hidden">
            <div className="divide-y divide-white/5">
              <ToggleRow 
                icon={HardDrive} 
                label="Audio Cache" 
                description="Store songs locally for faster playback"
                checked={cacheEnabled}
                onCheckedChange={handleCacheToggle}
              />

              <SettingRow icon={HardDrive} label="Max Cache Size" description="Storage limit for cached audio">
                <Select 
                  value={cacheMaxSize.toString()} 
                  onValueChange={handleCacheSizeChange}
                  disabled={!cacheEnabled}
                >
                  <SelectTrigger className="w-32 bg-white/5 border-white/10">
                    <SelectValue placeholder="Size" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="100">100 MB</SelectItem>
                    <SelectItem value="250">250 MB</SelectItem>
                    <SelectItem value="500">500 MB</SelectItem>
                    <SelectItem value="1024">1 GB</SelectItem>
                    <SelectItem value="2048">2 GB</SelectItem>
                  </SelectContent>
                </Select>
              </SettingRow>
            </div>

            {/* Cache Usage */}
            <div className="px-5 py-4 bg-white/[0.02] border-t border-white/5">
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Cache Usage</span>
                <span className="font-medium text-foreground">
                  {cacheStats.sizeMB} MB / {cacheMaxSize} MB
                  <span className="text-muted-foreground ml-2">({cacheStats.count} songs)</span>
                </span>
              </div>
              <Progress 
                value={(cacheStats.sizeMB / cacheMaxSize) * 100} 
                className="h-2 bg-white/10"
              />
              
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="mt-3 text-muted-foreground hover:text-destructive"
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
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleClearCache}>Clear Cache</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>

        {/* Danger Zone */}
        <section className="space-y-4">
          <div className="flex items-center gap-2 px-1">
            <AlertTriangle className="h-4 w-4 text-destructive" />
            <h2 className="text-sm font-semibold text-destructive/70 uppercase tracking-wider">Danger Zone</h2>
          </div>
          
          <div className="bg-destructive/5 rounded-2xl border border-destructive/20 p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">Reset Everything</p>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Clear all settings, cache, and preferences
                </p>
              </div>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" size="sm">
                    <Trash2 className="h-4 w-4 mr-2" />
                    Reset All
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will delete all local settings and reset the app. This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction 
                      onClick={handleClearData}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                    >
                      Yes, Reset Everything
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          </div>
        </section>

      </div>
    </div>
  )
}

export default Settings
