import { Sidebar } from './Sidebar'
import { Player } from './Player'
import { TitleBar } from './TitleBar'
import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { getTheme } from '@/services/instanceService'

export default function Layout() {
  useEffect(() => {
    // Apply saved theme on startup
    const savedTheme = getTheme()
    document.documentElement.classList.remove('theme-kdon', 'theme-mello')
    
    if (savedTheme === 'kdon') {
      document.documentElement.classList.add('theme-kdon')
    } else if (savedTheme === 'mello') {
      document.documentElement.classList.add('theme-mello')
    }
  }, [])

  return (
    <div className="flex h-screen flex-col bg-background overflow-hidden">
      {/* Custom Title Bar */}
      <TitleBar />
      
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
          <div className="pl-2 pb-32 min-h-full">
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
