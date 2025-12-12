// src/components/Layout.tsx
import { Sidebar } from './Sidebar'
import { Player } from './Player.tsx'
import { Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar visible on medium screens and up */}
        <div className="hidden md:block w-64 border-r border-border/10">
          <Sidebar className="h-full" />
        </div>

        {/* Main Content Area */}
        <main className="flex-1 overflow-y-auto bg-background">
          <Outlet />
        </main>
      </div>

      {/* Persistent Player Bar */}
      <div className="border-t border-border/10 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <Player />
      </div>
    </div>
  )
}
