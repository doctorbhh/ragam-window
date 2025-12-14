import { Sidebar } from './Sidebar'
import { Player } from './Player'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar visible on medium screens and up */}
        <div className="hidden md:block w-64 border-r border-border/10">
          <Sidebar className="h-full" />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent ">
          {/* FIX: Added 'pb-32' (padding-bottom: 8rem) 
             This ensures the last item in your list scrolls ABOVE the player bar.
          */}
          <div className="pb-32 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Persistent Player Bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Player />
      </div>
    </div>
  )
}
