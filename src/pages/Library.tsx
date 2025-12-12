// src/pages/Library.tsx
import React from 'react'
import { Link } from 'react-router-dom'
import { Music, ArrowLeft } from 'lucide-react'
import { useSpotifyPlaylists } from '../hooks/useSpotifyPlaylists'
import { Button } from '../components/ui/button'

const Library = () => {
  const { playlists } = useSpotifyPlaylists()

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
      </div>
    </div>
  )
}

export default Library
