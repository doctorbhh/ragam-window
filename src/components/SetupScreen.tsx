import { Music2, Radio, DownloadCloud, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface SetupScreenProps {
  onSpotifyLogin: () => void
  onYTMusicLogin: () => void
  isYTMusicLoggingIn: boolean
}

const SetupScreen = ({ onSpotifyLogin, onYTMusicLogin, isYTMusicLoggingIn }: SetupScreenProps) => {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-140px)] px-4 py-8 animate-in fade-in zoom-in duration-500">
      
      {/* Hero Header */}
      <div className="text-center max-w-2xl mb-12">
        <div className="inline-flex items-center justify-center p-4 bg-primary/10 rounded-full mb-6 ring-1 ring-primary/20 shadow-[0_0_30px_rgba(29,185,84,0.15)]">
          <Music2 className="h-12 w-12 text-primary" />
        </div>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight text-foreground mb-4">
          Your World of <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-emerald-400">Limitless Music</span>
        </h1>
        <p className="text-lg text-muted-foreground leading-relaxed max-w-xl mx-auto">
          Connect your favorite streaming services to unlock a seamless, unified listening experience with advanced desktop features.
        </p>
      </div>

      {/* Feature Highlight Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-4xl mb-12 w-full px-4">
        
        <div className="flex flex-col items-center p-6 bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow hover:border-primary/30 group">
          <div className="p-3 bg-blue-500/10 text-blue-500 rounded-xl mb-4 group-hover:scale-110 transition-transform">
            <DownloadCloud className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Offline Playback</h3>
          <p className="text-sm text-center text-muted-foreground">Download your tracks and playlists directly to your desktop for uninterrupted listening anywhere.</p>
        </div>

        <div className="flex flex-col items-center p-6 bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow hover:border-primary/30 group">
          <div className="p-3 bg-purple-500/10 text-purple-500 rounded-xl mb-4 group-hover:scale-110 transition-transform">
            <Sparkles className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Endless Discovery</h3>
          <p className="text-sm text-center text-muted-foreground">Smart autoplay ensures the music never stops, fetching related tracks utilizing powerful AI algorithms.</p>
        </div>

        <div className="flex flex-col items-center p-6 bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl shadow-sm hover:shadow-md transition-shadow hover:border-primary/30 group">
          <div className="p-3 bg-rose-500/10 text-rose-500 rounded-xl mb-4 group-hover:scale-110 transition-transform">
            <Radio className="h-6 w-6" />
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Ad-Free Experience</h3>
          <p className="text-sm text-center text-muted-foreground">Enjoy your favorite jams from Spotify and YouTube Music without any commercials or interruptions.</p>
        </div>

      </div>

      {/* Connection Actions */}
      <div className="flex flex-col sm:flex-row gap-4 items-center w-full max-w-md">
        <Button
          onClick={onSpotifyLogin}
          size="lg"
          className="w-full sm:w-auto flex-1 h-14 bg-[#1DB954] hover:bg-[#1ed760] hover:scale-105 active:scale-95 transition-all shadow-lg shadow-[#1DB954]/20 text-white font-bold text-base"
        >
          <svg className="h-5 w-5 mr-2 fill-current" viewBox="0 0 24 24">
            <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.84.24 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
          </svg>
          Connect Spotify
        </Button>
        <span className="text-xs font-medium text-muted-foreground py-2 sm:py-0">OR</span>
        <Button
          onClick={onYTMusicLogin}
          variant="outline"
          size="lg"
          disabled={isYTMusicLoggingIn}
          className="w-full sm:w-auto flex-1 h-14 border-2 hover:bg-muted/50 hover:scale-105 active:scale-95 transition-all text-foreground font-semibold text-base"
        >
          <svg className="h-5 w-5 mr-2 fill-current text-[#FF0000]" viewBox="0 0 24 24">
            <path d="M12 0C5.376 0 0 5.376 0 12s5.376 12 12 12 12-5.376 12-12S18.624 0 12 0zm0 21.6c-5.292 0-9.6-4.308-9.6-9.6S6.708 2.4 12 2.4s9.6 4.308 9.6 9.6-4.308 9.6-9.6 9.6zM9.6 16.8L16.8 12 9.6 7.2v9.6z"/>
          </svg>
          {isYTMusicLoggingIn ? 'Opening YT Music...' : 'Login YT Music'}
        </Button>
      </div>
      
    </div>
  )
}

export default SetupScreen
