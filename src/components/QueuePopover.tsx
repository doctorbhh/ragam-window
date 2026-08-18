import { ListMusic } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface QueuePopoverProps {
  queue: any[]
  currentTrack: any | null
  isPlaying: boolean
  onPlayTrack: (track: any) => void
  onClearQueue: () => void
}

/** Displays the play queue as a popover anchored to the queue icon button. */
export function QueuePopover({
  queue,
  currentTrack,
  isPlaying,
  onPlayTrack,
  onClearQueue
}: QueuePopoverProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full"
          aria-label="Queue"
        >
          <ListMusic className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 mr-4 mb-4 bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl"
        align="end"
        side="top"
      >
        <div className="border-b border-white/10 p-3 bg-white/5 flex justify-between items-center">
          <h4 className="font-semibold text-sm text-white">Play Queue</h4>
          <div className="flex items-center gap-2">
            {queue.length > 0 && (
              <button
                onClick={onClearQueue}
                className="text-[10px] text-red-400 hover:text-red-300 transition-colors"
              >
                Clear All
              </button>
            )}
            <span className="text-xs bg-white/10 px-2 py-0.5 rounded-full text-white/70">
              {queue.length}
            </span>
          </div>
        </div>
        <div className="max-h-[50vh] overflow-y-auto w-full custom-scrollbar p-1">
          {queue.length === 0 ? (
            <div className="flex h-32 flex-col items-center justify-center text-muted-foreground">
              <p>Queue is empty</p>
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {queue.map((track, i) => {
                const isCurrentTrack = currentTrack?.id === track.id
                return (
                  <button
                    key={`${track.id}-${i}`}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left hover:bg-white/10 rounded-lg transition-colors group ${isCurrentTrack ? 'bg-primary/20' : ''}`}
                    onClick={() => onPlayTrack(track)}
                  >
                    <div className="h-8 w-8 rounded overflow-hidden bg-white/5 shrink-0">
                      {track.album?.images?.[0]?.url ? (
                        <img
                          src={track.album.images[0].url}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="h-full w-full flex items-center justify-center text-white/30 text-xs">♪</div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`truncate text-sm font-medium ${isCurrentTrack ? 'text-primary' : 'text-white/90 group-hover:text-white'}`}>
                        {track.name}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {track.artists?.map((a: any) => a.name).join(', ')}
                      </p>
                    </div>
                    {isCurrentTrack && isPlaying && (
                      <div className="h-2 w-2 rounded-full bg-primary animate-pulse shrink-0" />
                    )}
                  </button>
                )
              })}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
