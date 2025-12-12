import React, { createContext, useState, useContext, useEffect } from 'react'
import { toast } from 'sonner'
// Make sure this path exists. If not, remove the import and use 'any' for now.
import { SpotifyUser } from '../types/spotify'

interface AuthContextType {
  isAuthenticated: boolean
  loading: boolean
  user: SpotifyUser | null
  spotifyToken: string | null
  login: () => void
  logout: () => void
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  loading: true,
  user: null,
  spotifyToken: null,
  login: () => {},
  logout: () => {}
})

export const useSpotifyAuth = () => useContext(AuthContext)

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<SpotifyUser | null>(null)
  const [spotifyToken, setSpotifyToken] = useState<string | null>(null)

  useEffect(() => {
    // Check if we have a valid token saved from before
    const token = localStorage.getItem('spotify_token')
    const expiresAt = localStorage.getItem('spotify_expires_at')

    if (token && expiresAt && Date.now() < parseInt(expiresAt)) {
      setSpotifyToken(token)
      fetchUserProfile(token)
    } else {
      setLoading(false)
    }
  }, [])

  const fetchUserProfile = async (token: string) => {
    try {
      // Use the official API to get user details
      const response = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${token}` }
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch profile: ${response.status}`)
      }

      const userData = await response.json()
      setUser(userData)
      setIsAuthenticated(true)
    } catch (error) {
      console.error('Auth check failed:', error)
      logout()
    } finally {
      setLoading(false)
    }
  }

  // --- THIS IS THE PART THAT WAS WRONG BEFORE ---
  const login = async () => {
    try {
      setLoading(true)

      // 1. Tell Electron to open the login window and steal the cookie
      // @ts-ignore
      const data = await window.electron.login()

      console.log('Electron Login Data:', data) // Debugging

      if (!data || !data.accessToken) {
        throw new Error('No access token received from Electron')
      }

      const token = data.accessToken
      const expiresAt = data.accessTokenExpirationTimestampMs

      // 2. Save the stolen token
      localStorage.setItem('spotify_token', token)
      localStorage.setItem('spotify_expires_at', expiresAt.toString())

      setSpotifyToken(token)

      // 3. Fetch user data
      await fetchUserProfile(token)
      toast.success('Logged in successfully!')
    } catch (error) {
      console.error('Login failed', error)
      toast.error('Login failed. Please try again.')
      setLoading(false)
    }
  }
  // ----------------------------------------------

  const logout = () => {
    localStorage.removeItem('spotify_token')
    localStorage.removeItem('spotify_expires_at')
    setIsAuthenticated(false)
    setUser(null)
    setSpotifyToken(null)
    setLoading(false)
  }

  return (
    <AuthContext.Provider value={{ isAuthenticated, loading, user, spotifyToken, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}
