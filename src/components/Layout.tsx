import { Sidebar } from './Sidebar'
import { Player } from './Player'
import { TitleBar } from './TitleBar'
import { Outlet } from 'react-router-dom'
import { useEffect } from 'react'
import { getTheme, getRagamMode } from '@/services/instanceService'

export default function Layout() {
  useEffect(() => {
    // Apply saved theme on startup
    const savedTheme = getTheme()
    const savedMode = getRagamMode()
    document.documentElement.classList.remove('theme-kdon', 'theme-mello', 'theme-ragam', 'ragam-light')
    
    if (savedTheme === 'kdon') {
      document.documentElement.classList.add('theme-kdon')
    } else if (savedTheme === 'mello') {
      document.documentElement.classList.add('theme-mello')
    } else if (savedTheme === 'ragam') {
      document.documentElement.classList.add('theme-ragam')
      if (savedMode === 'light') {
        document.documentElement.classList.add('ragam-light')
      }
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
        <main role="main" className="flex-1 overflow-y-auto bg-background scrollbar-thin scrollbar-thumb-secondary scrollbar-track-transparent ">
          <div className="pl-2 pb-40 min-h-full">
            <Outlet />
          </div>
        </main>
      </div>

      {/* Player Bar — solid background, no transparency */}
      <Player />
    </div>
  )
}
