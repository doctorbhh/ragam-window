import { ListVideo, Star, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

interface SourceSwitcherProps {
  alternatives: any[]
  savedSourceId: string | null | undefined
  onChangeSource: (item: any, save?: boolean) => void
  onClearPreference: () => void
}

/** Popover for switching between YouTube / JioSaavn audio sources. */
export function SourceSwitcher({
  alternatives,
  savedSourceId,
  onChangeSource,
  onClearPreference
}: SourceSwitcherProps) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 text-muted-foreground hover:text-white hover:bg-white/10 rounded-full"
          aria-label="Audio sources"
        >
          <ListVideo className="h-4 w-4" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-80 p-0 mr-4 mb-4 bg-black/80 backdrop-blur-xl border border-white/10 shadow-2xl rounded-xl"
        align="end"
        side="top"
      >
        <div className="p-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
          <h4 className="font-semibold text-sm text-white">Audio Sources</h4>
          {savedSourceId && (
            <button
              onClick={onClearPreference}
              className="text-[10px] text-primary hover:text-primary/80 transition-colors"
            >
              Clear Saved
            </button>
          )}
        </div>
        <p className="px-3 py-2 text-[10px] text-muted-foreground border-b border-white/5">
          Wrong song? Click <Star className="inline h-3 w-3 text-yellow-500" /> to save your preference
        </p>
        <div className="max-h-60 overflow-y-auto p-1 custom-scrollbar">
          {alternatives.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No sources found
            </div>
          ) : (
            alternatives.map((item, idx) => {
              const itemId = item.id || item.url
              const isSaved = savedSourceId === itemId

              return (
                <div
                  key={idx}
                  className={`w-full p-2 rounded-lg flex items-center gap-3 transition-colors group ${
                    isSaved ? 'bg-primary/20 border border-primary/30' : 'hover:bg-white/10'
                  }`}
                >
                  <button
                    onClick={() => onChangeSource(item)}
                    className="flex items-center gap-3 flex-1 text-left min-w-0"
                  >
                    <div className="h-9 w-9 rounded-md overflow-hidden bg-white/5 shrink-0 relative">
                      <img
                        src={item.thumbnail || item.image?.[0]?.url}
                        className="h-full w-full object-cover"
                      />
                      {isSaved && (
                        <div className="absolute inset-0 bg-primary/30 flex items-center justify-center">
                          <Check className="h-4 w-4 text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm font-medium truncate ${
                        isSaved ? 'text-primary' : 'text-white/90 group-hover:text-primary'
                      }`}>
                        {item.title || item.name}
                      </p>
                      <p className="text-[10px] text-muted-foreground truncate flex items-center gap-1">
                        {item.channelTitle || item.artists?.[0]?.name}
                        {item.isJioSaavn && (
                          <span className="bg-green-500/20 text-green-400 px-1 rounded text-[8px] font-medium">
                            JioSaavn
                          </span>
                        )}
                        {item.isVideoSource && (
                          <span className="bg-red-500/20 text-red-400 px-1 rounded text-[8px] font-medium">
                            Video
                          </span>
                        )}
                        {isSaved && ' • Saved'}
                      </p>
                    </div>
                  </button>
                  <button
                    onClick={() => {
                      if (isSaved) {
                        onClearPreference()
                      } else {
                        onChangeSource(item, true)
                      }
                    }}
                    className={`p-1.5 rounded-full transition-all shrink-0 ${
                      isSaved
                        ? 'text-yellow-500 bg-yellow-500/20'
                        : 'text-muted-foreground hover:text-yellow-500 hover:bg-yellow-500/10 opacity-0 group-hover:opacity-100'
                    }`}
                    title={isSaved ? 'Clear saved preference' : 'Set as preferred source'}
                  >
                    <Star className={`h-4 w-4 ${isSaved ? 'fill-current' : ''}`} />
                  </button>
                </div>
              )
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
