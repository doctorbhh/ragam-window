

/**
 * Custom Title Bar Component
 * This replaces the native window title bar with a styled, draggable region.
 * The native window controls (min, max, close) are handled by Electron's titleBarOverlay.
 */
export function TitleBar() {
  return (
    <div 
      className="h-10 bg-background/95 backdrop-blur border-b border-white/5 flex items-center px-4 select-none"
      style={{ 
        WebkitAppRegion: 'drag', // Makes the title bar draggable
        appRegion: 'drag' 
      } as React.CSSProperties}
    >
      {/* App Logo & Title */}
      <div className="flex items-center gap-2">
        <img src="./icon.png" className="w-6 h-6 object-contain drop-shadow-sm" alt="Logo" />
        <span className="text-sm font-semibold text-foreground/90">Ragam</span>
      </div>

      {/* Spacer - The native window controls will be on the right via titleBarOverlay */}
    </div>
  )
}
