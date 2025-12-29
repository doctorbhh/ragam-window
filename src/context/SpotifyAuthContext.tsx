import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react'

interface SpotifyUser {
  id: string
  displayName: string
  email?: string
  image?: string
  images?: { url: string }[]
  country?: string
  product?: string
}

interface SpotifyAuthContextType {
  isAuthenticated: boolean
  spotifyToken: string | null
  spotifyUser: SpotifyUser | null
  user: { id: string; display_name: string; email?: string; images?: { url: string }[] } | null
  isLoading: boolean
  login: () => Promise<void>
  loginWithSpDc: (spDcCookie: string) => Promise<void>
  logout: () => void
  refreshToken: () => Promise<void>
  showSpDcDialog: boolean
  setShowSpDcDialog: (show: boolean) => void
}

const SpotifyAuthContext = createContext<SpotifyAuthContextType | undefined>(undefined)

export const SpotifyAuthProvider = ({ children }: { children: ReactNode }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null)
  const [spotifyUser, setSpotifyUser] = useState<SpotifyUser | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [showSpDcDialog, setShowSpDcDialog] = useState(false)

  // Fetch user profile using IPC (avoids 429)
  const fetchUserProfile = async (_token: string) => {
    try {
      // @ts-ignore
      const data = await window.electron.spotify.getMe()
      
      if (!data) {
        console.warn('[Auth] Profile fetch failed')
        return null
      }
      
      console.log('[Auth] Profile fetched:', data.display_name)
      
      return {
        id: data.id,
        displayName: data.display_name,
        email: data.email,
        image: data.images?.[0]?.url,
        images: data.images,
        country: data.country,
        product: data.product
      }
    } catch (error) {
      console.error('[Auth] Profile fetch error:', error)
      return null
    }
  }

  // Check for existing session on load
  useEffect(() => {
    const checkSession = async () => {
      console.log('[Auth] Checking for existing session...')
      try {
        // @ts-ignore
        const session = await window.electron.refreshToken()
        
        if (session?.success && session.accessToken) {
          console.log('[Auth] Found valid session')
          setSpotifyToken(session.accessToken)
          setIsAuthenticated(true)
          
          const profile = await fetchUserProfile(session.accessToken)
          if (profile) {
            setSpotifyUser(profile)
          }
        } else {
          console.log('[Auth] No valid session found')
        }
      } catch (error) {
        console.error('[Auth] Session check error:', error)
      } finally {
        setIsLoading(false)
      }
    }

    checkSession()
  }, [])

  // OAuth Login (opens Spotify login window)
  const login = useCallback(async () => {
    setIsLoading(true)
    try {
      // @ts-ignore
      const result = await window.electron.login()
      
      if (result?.accessToken) {
        console.log('[Auth] Login successful')
        setSpotifyToken(result.accessToken)
        setIsAuthenticated(true)
        
        const profile = await fetchUserProfile(result.accessToken)
        if (profile) {
          setSpotifyUser(profile)
        }
      } else {
        console.error('[Auth] Login failed:', (result as any)?.error)
      }
    } catch (error) {
      console.error('[Auth] Login error:', error)
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Login with sp_dc cookie
  const loginWithSpDc = useCallback(async (spDcCookie: string) => {
    setIsLoading(true)
    try {
      // @ts-ignore
      const result = await window.electron.refreshToken(spDcCookie)
      
      if (result?.success && result.accessToken) {
        console.log('[Auth] Cookie login successful')
        setSpotifyToken(result.accessToken)
        setIsAuthenticated(true)
        
        const profile = await fetchUserProfile(result.accessToken)
        if (profile) {
          setSpotifyUser(profile)
        }
      } else {
        console.error('[Auth] Cookie login failed:', result?.error)
        throw new Error(result?.error || 'Login failed')
      }
    } catch (error) {
      console.error('[Auth] Cookie login error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Refresh token
  const refreshToken = useCallback(async () => {
    try {
      // @ts-ignore
      const result = await window.electron.refreshToken()
      
      if (result?.success && result.accessToken) {
        setSpotifyToken(result.accessToken)
        setIsAuthenticated(true)
        
        const profile = await fetchUserProfile(result.accessToken)
        if (profile) {
          setSpotifyUser(profile)
        }
      }
    } catch (error) {
      console.error('[Auth] Refresh error:', error)
    }
  }, [])

  // Logout
  const logout = useCallback(() => {
    setSpotifyToken(null)
    setSpotifyUser(null)
    setIsAuthenticated(false)
    // Note: The actual session file would need to be cleared on the main process
  }, [])

  // Create user object with display_name for Header.tsx compatibility
  const user = spotifyUser ? {
    id: spotifyUser.id,
    display_name: spotifyUser.displayName,
    email: spotifyUser.email,
    images: spotifyUser.images
  } : null

  return (
    <SpotifyAuthContext.Provider
      value={{
        isAuthenticated,
        spotifyToken,
        spotifyUser,
        user,
        isLoading,
        login,
        loginWithSpDc,
        logout,
        refreshToken,
        showSpDcDialog,
        setShowSpDcDialog
      }}
    >
      {children}
    </SpotifyAuthContext.Provider>
  )
}

export const useSpotifyAuth = () => {
  const context = useContext(SpotifyAuthContext)
  if (!context) {
    throw new Error('useSpotifyAuth must be used within a SpotifyAuthProvider')
  }
  return context
}

// Alias for App.tsx compatibility
export const AuthProvider = SpotifyAuthProvider

export default SpotifyAuthContext
