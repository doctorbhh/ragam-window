/**
 * Plugin Card Component
 * Displays plugin information with enable/disable and uninstall actions
 */

import { useState } from 'react'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Trash2, ExternalLink, Puzzle } from 'lucide-react'
import type { PluginInstance } from '@/plugins/types'

interface PluginCardProps {
  plugin: PluginInstance
  onEnable: (pluginId: string, enabled: boolean) => Promise<void>
  onUninstall: (pluginId: string) => Promise<void>
}

const typeColors: Record<string, string> = {
  metadata: 'bg-blue-500',
  auth: 'bg-green-500',
  source: 'bg-purple-500',
  scrobbler: 'bg-orange-500',
  lyrics: 'bg-pink-500'
}

export const PluginCard = ({ plugin, onEnable, onUninstall }: PluginCardProps) => {
  const [loading, setLoading] = useState(false)
  const { manifest, enabled, error } = plugin

  const handleToggle = async (checked: boolean) => {
    setLoading(true)
    try {
      await onEnable(manifest.id, checked)
    } finally {
      setLoading(false)
    }
  }

  const handleUninstall = async () => {
    if (confirm(`Are you sure you want to uninstall "${manifest.name}"?`)) {
      setLoading(true)
      try {
        await onUninstall(manifest.id)
      } finally {
        setLoading(false)
      }
    }
  }

  return (
    <div className="flex items-start justify-between p-4 bg-secondary/30 rounded-lg border border-border/50 hover:border-border transition-colors">
      <div className="flex gap-4">
        {/* Plugin Icon */}
        <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
          <Puzzle className="w-6 h-6 text-primary" />
        </div>
        
        {/* Plugin Info */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold">{manifest.name}</h3>
            <Badge variant="secondary" className="text-xs">
              v{manifest.version}
            </Badge>
            <Badge className={`text-xs ${typeColors[manifest.type] || 'bg-gray-500'}`}>
              {manifest.type}
            </Badge>
          </div>
          
          <p className="text-sm text-muted-foreground">{manifest.description}</p>
          
          <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
            <span>by {manifest.author}</span>
            {manifest.homepage && (
              <a 
                href={manifest.homepage} 
                target="_blank" 
                rel="noopener noreferrer"
                className="flex items-center gap-1 hover:text-primary transition-colors"
              >
                <ExternalLink className="w-3 h-3" />
                Website
              </a>
            )}
          </div>

          {error && (
            <p className="text-xs text-destructive mt-1">Error: {error}</p>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Switch
          checked={enabled}
          onCheckedChange={handleToggle}
          disabled={loading}
        />
        <Button
          variant="ghost"
          size="icon"
          onClick={handleUninstall}
          disabled={loading}
          className="text-destructive hover:text-destructive hover:bg-destructive/10"
        >
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  )
}

export default PluginCard
