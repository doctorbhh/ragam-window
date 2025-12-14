import React from 'react'
import { Download, CheckCircle, AlertCircle, FileAudio, Trash2 } from 'lucide-react'
import { useDownloads, DownloadItem } from '@/context/DownloadContext'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ScrollArea } from '@/components/ui/scroll-area'

const Downloads = () => {
  const { downloads, clearDownloads } = useDownloads()

  return (
    <div className="p-6 pb-24 h-full flex flex-col">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Download className="h-8 w-8 text-primary" />
          <h1 className="text-3xl font-bold">Downloads</h1>
        </div>
        {downloads.length > 0 && (
          <Button
            variant="ghost"
            onClick={clearDownloads}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="h-4 w-4 mr-2" />
            Clear List
          </Button>
        )}
      </div>

      {downloads.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
          <Download className="h-16 w-16 mb-4 opacity-20" />
          <p className="text-lg">No downloads yet.</p>
          <p className="text-sm">Start downloading songs to see them here.</p>
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div className="space-y-3">
            {downloads.map((item) => (
              <DownloadCard key={item.id} item={item} />
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  )
}

const DownloadCard = ({ item }: { item: DownloadItem }) => {
  const isCompleted = item.status === 'completed'
  const isError = item.status === 'error'
  const isDownloading = item.status === 'downloading' || item.status === 'pending'

  return (
    <div className="flex items-center gap-4 p-4 rounded-lg bg-card/50 border border-border/50 hover:bg-card transition-colors">
      {/* Image */}
      <div className="h-12 w-12 rounded bg-secondary shrink-0 overflow-hidden">
        {item.image ? (
          <img src={item.image} alt="" className="h-full w-full object-cover" />
        ) : (
          <div className="flex items-center justify-center h-full">
            <FileAudio className="h-6 w-6 opacity-50" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-medium truncate">{item.trackName}</h4>
        <p className="text-xs text-muted-foreground truncate">{item.artistName}</p>

        {isDownloading && (
          <div className="mt-2 flex items-center gap-2">
            <Progress value={item.progress} className="h-1.5" />
            <span className="text-xs font-mono text-muted-foreground w-8 text-right">
              {item.progress}%
            </span>
          </div>
        )}

        {isCompleted && item.filePath && (
          <p className="text-[10px] text-muted-foreground mt-1 truncate opacity-70">
            {item.filePath}
          </p>
        )}
      </div>

      {/* Status Icon */}
      <div className="shrink-0">
        {isCompleted && <CheckCircle className="h-5 w-5 text-green-500" />}
        {isError && <AlertCircle className="h-5 w-5 text-red-500" />}
        {isDownloading && (
          <div className="h-4 w-4 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        )}
      </div>
    </div>
  )
}

export default Downloads
