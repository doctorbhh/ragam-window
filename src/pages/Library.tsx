// src/pages/Library.tsx
import React, { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { Music, ArrowLeft, Bookmark, X } from 'lucide-react'
import { useSpotifyPlaylists } from '../hooks/useSpotifyPlaylists'
import { Button } from '../components/ui/button'

const Library = () => {
  const { playlists } = useSpotifyPlaylists()
  const [savedPlaylists, setSavedPlaylists] = useState<any[]>([])
  
  // Load saved playlists
  useEffect(() => {
    const loadSaved = async () => {
      try {
        const saved = await window.electron.savedPlaylists.getAll()
        setSavedPlaylists(saved)
      } catch (e) {
        console.error('Failed to load saved playlists:', e)
      }
    }
    loadSaved()
  }, [])
  
  // Remove saved playlist
  const handleRemove = async (e: React.MouseEvent, playlistId: string) => {
    e.preventDefault()
    e.stopPropagation()
    try {
      await window.electron.savedPlaylists.remove(playlistId)
      setSavedPlaylists(prev => prev.filter(p => p.id !== playlistId))
    } catch (e) {
      console.error('Failed to remove playlist:', e)
    }
  }

  return (
    <div className="p-6 pb-24 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" asChild className="md:hidden">
          <Link to="/">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        </Button>
        <h1 className="text-3xl font-bold">Your Library</h1>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
        {/* User's Spotify Playlists */}
        {playlists.map((playlist) => (
          <Link
            key={playlist.id}
            to={`/playlist/${playlist.id}`}
            className="group relative flex flex-col gap-3 rounded-lg bg-card p-4 transition-all hover:bg-accent/50"
          >
            <div className="aspect-square w-full overflow-hidden rounded-md shadow-lg">
              {playlist.images?.[0]?.url ? (
                <img
                  src={playlist.images[0].url}
                  alt={playlist.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Music className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold truncate leading-none">{playlist.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {playlist.description || `By ${playlist.owner.display_name}`}
              </p>
            </div>
          </Link>
        ))}
        
        {/* Saved Playlists from Search */}
        {savedPlaylists.map((playlist) => (
          <Link
            key={`saved-${playlist.id}`}
            to={`/playlist/${playlist.id}`}
            className="group relative flex flex-col gap-3 rounded-lg bg-card p-4 transition-all hover:bg-accent/50"
          >
            {/* Saved badge */}
            <div className="absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/80 text-primary-foreground text-[10px] font-medium">
              <Bookmark className="h-3 w-3" />
              Saved
            </div>
            
            {/* Remove button */}
            <button
              onClick={(e) => handleRemove(e, playlist.id)}
              className="absolute top-2 right-2 z-10 p-1.5 rounded-full bg-black/60 text-white opacity-0 group-hover:opacity-100 hover:bg-destructive transition-all"
              title="Remove from Library"
            >
              <X className="h-4 w-4" />
            </button>
            
            <div className="aspect-square w-full overflow-hidden rounded-md shadow-lg">
              {playlist.imageUrl ? (
                <img
                  src={playlist.imageUrl}
                  alt={playlist.name}
                  className="h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-muted">
                  <Music className="h-12 w-12 text-muted-foreground" />
                </div>
              )}
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold truncate leading-none">{playlist.name}</h3>
              <p className="text-sm text-muted-foreground line-clamp-2">
                By {playlist.ownerName || 'Unknown'}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}

export default Library
