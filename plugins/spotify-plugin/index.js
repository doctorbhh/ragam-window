/**
 * Spotify Metadata Plugin for Ragam Music Player
 * 
 * Uses the sp_dc cookie method (like sonic-liberation/spotube-plugin-spotify)
 * to avoid OAuth rate limits. User provides sp_dc cookie value manually.
 * 
 * How to get sp_dc cookie:
 * 1. Open browser and go to https://open.spotify.com
 * 2. Login to Spotify
 * 3. Open DevTools (F12) -> Application -> Cookies -> https://open.spotify.com
 * 4. Find 'sp_dc' cookie and copy its value
 */

// Plugin state
let accessToken = null;
let tokenExpiry = 0;
let currentUser = null;
let spDcCookie = null;

// Spotify API base URL
const API_BASE = 'https://api.spotify.com/v1';

/**
 * Initialize plugin - check for stored credentials
 */
exports.onLoad = async function() {
  console.log('[Spotify Plugin] Loading...');
  
  // Restore sp_dc cookie from storage
  spDcCookie = localStorage.getItem('sp_dc');
  
  const token = localStorage.getItem('token');
  const expiry = localStorage.getItem('tokenExpiry');
  
  if (spDcCookie && token && expiry && Date.now() < parseInt(expiry)) {
    accessToken = token;
    tokenExpiry = parseInt(expiry);
    
    // Fetch user profile
    try {
      const user = await fetchWithAuth('/me');
      currentUser = user;
      console.log('[Spotify Plugin] Restored session for:', user.display_name);
    } catch (e) {
      console.error('[Spotify Plugin] Failed to restore session:', e);
      // Try to refresh token
      try {
        await refreshAccessToken();
      } catch (refreshError) {
        console.error('[Spotify Plugin] Failed to refresh token:', refreshError);
        exports.logout();
      }
    }
  } else if (spDcCookie) {
    // Have sp_dc but no valid token - try to get new token
    try {
      await refreshAccessToken();
    } catch (e) {
      console.error('[Spotify Plugin] Initial token fetch failed:', e);
    }
  }
  
  console.log('[Spotify Plugin] Loaded');
};

/**
 * Cleanup on unload
 */
exports.onUnload = async function() {
  console.log('[Spotify Plugin] Unloading...');
};

/**
 * Helper to make authenticated API requests
 */
async function fetchWithAuth(endpoint, options = {}) {
  if (!accessToken) {
    throw new Error('Not authenticated');
  }
  
  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      ...options.headers
    }
  });
  
  if (!response.ok) {
    if (response.status === 401) {
      // Token expired - try to refresh
      console.log('[Spotify Plugin] Token expired, refreshing...');
      await refreshAccessToken();
      // Retry the request
      return fetchWithAuth(endpoint, options);
    }
    if (response.status === 429) {
      // Rate limited - wait and retry
      const retryAfter = parseInt(response.headers.get('Retry-After') || '5');
      console.log(`[Spotify Plugin] Rate limited, waiting ${retryAfter}s...`);
      await new Promise(r => setTimeout(r, retryAfter * 1000));
      return fetchWithAuth(endpoint, options);
    }
    throw new Error(`API Error: ${response.status}`);
  }
  
  return response.json();
}

/**
 * Get access token using sp_dc cookie
 * This is the key method that avoids OAuth rate limits
 */
async function refreshAccessToken() {
  if (!spDcCookie) {
    throw new Error('No sp_dc cookie configured');
  }
  
  console.log('[Spotify Plugin] Fetching new access token...');
  
  // Fetch token from Spotify's internal API
  const response = await fetch('https://open.spotify.com/get_access_token?reason=transport&productType=web-player', {
    headers: {
      'Cookie': `sp_dc=${spDcCookie}`,
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    },
    credentials: 'include'
  });
  
  if (!response.ok) {
    throw new Error(`Token fetch failed: ${response.status}`);
  }
  
  const data = await response.json();
  
  if (!data.accessToken) {
    throw new Error('No access token in response');
  }
  
  accessToken = data.accessToken;
  tokenExpiry = data.accessTokenExpirationTimestampMs;
  
  // Store tokens
  localStorage.setItem('token', accessToken);
  localStorage.setItem('tokenExpiry', tokenExpiry.toString());
  
  // Fetch user if not already done
  if (!currentUser) {
    try {
      currentUser = await fetchWithAuth('/me');
    } catch (e) {
      console.error('[Spotify Plugin] Failed to fetch user:', e);
    }
  }
  
  console.log('[Spotify Plugin] Token refreshed, expires:', new Date(tokenExpiry).toLocaleString());
}

/**
 * Login with sp_dc cookie
 * User must provide the sp_dc cookie value
 */
exports.login = async function(spDcValue) {
  console.log('[Spotify Plugin] Login requested');
  
  // If no sp_dc provided, check if we have one stored
  if (!spDcValue) {
    // Show prompt for user to enter sp_dc
    spDcValue = window.prompt(
      'Enter your Spotify sp_dc cookie value:\n\n' +
      'How to get it:\n' +
      '1. Go to https://open.spotify.com in your browser\n' +
      '2. Login to Spotify\n' +
      '3. Press F12 -> Application -> Cookies\n' +
      '4. Find "sp_dc" and copy its value'
    );
  }
  
  if (!spDcValue || !spDcValue.trim()) {
    return { success: false, error: 'No sp_dc cookie provided' };
  }
  
  spDcCookie = spDcValue.trim();
  localStorage.setItem('sp_dc', spDcCookie);
  
  try {
    await refreshAccessToken();
    
    return {
      success: true,
      token: accessToken,
      expiresAt: tokenExpiry,
      user: currentUser ? {
        id: currentUser.id,
        display_name: currentUser.display_name,
        images: currentUser.images,
        email: currentUser.email
      } : null
    };
  } catch (e) {
    // Clear invalid cookie
    spDcCookie = null;
    localStorage.removeItem('sp_dc');
    return { success: false, error: e.message };
  }
};

/**
 * Logout
 */
exports.logout = async function() {
  accessToken = null;
  tokenExpiry = 0;
  currentUser = null;
  spDcCookie = null;
  localStorage.removeItem('token');
  localStorage.removeItem('tokenExpiry');
  localStorage.removeItem('sp_dc');
  console.log('[Spotify Plugin] Logged out');
};

/**
 * Check if authenticated
 */
exports.isAuthenticated = function() {
  return accessToken !== null && Date.now() < tokenExpiry;
};

/**
 * Get current user
 */
exports.getUser = function() {
  return currentUser;
};

/**
 * Get access token
 */
exports.getToken = function() {
  return accessToken;
};

/**
 * Search for tracks, albums, artists
 */
exports.search = async function(query, options = {}) {
  const types = options.type?.join(',') || 'track,album,artist';
  const limit = options.limit || 20;
  const offset = options.offset || 0;
  
  const params = new URLSearchParams({
    q: query,
    type: types,
    limit: limit.toString(),
    offset: offset.toString()
  });
  
  const data = await fetchWithAuth(`/search?${params}`);
  
  return {
    tracks: data.tracks?.items || [],
    albums: data.albums?.items || [],
    artists: data.artists?.items || []
  };
};

/**
 * Get track by ID
 */
exports.getTrack = async function(id) {
  return fetchWithAuth(`/tracks/${id}`);
};

/**
 * Get album by ID
 */
exports.getAlbum = async function(id) {
  return fetchWithAuth(`/albums/${id}`);
};

/**
 * Get artist by ID
 */
exports.getArtist = async function(id) {
  return fetchWithAuth(`/artists/${id}`);
};

/**
 * Get playlist by ID
 */
exports.getPlaylist = async function(id) {
  return fetchWithAuth(`/playlists/${id}`);
};

/**
 * Get current user's playlists
 */
exports.getUserPlaylists = async function() {
  const data = await fetchWithAuth('/me/playlists?limit=50');
  return data.items || [];
};

console.log('[Spotify Plugin] Module loaded - Uses sp_dc cookie method');
