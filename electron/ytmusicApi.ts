import { net } from 'electron'
import { getCookies, getAuthHeader } from './ytmusicAuth'
import { toThumbUrl } from './thumbnailCache'

const INNERTUBE_BASE = 'https://music.youtube.com/youtubei/v1'
const USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const CLIENT_VERSION = '1.20241118.01.00'

function getContext() {
  return {
    client: {
      clientName: 'WEB_REMIX',
      clientVersion: CLIENT_VERSION,
      hl: 'en',
      gl: 'IN',
      experimentIds: [],
      experimentsToken: '',
      browserName: 'Chrome',
      browserVersion: '120.0.0.0',
      osName: 'Windows',
      osVersion: '10.0',
      platform: 'DESKTOP',
      musicAppInfo: {
        pwaInstallabilityStatus: 'PWA_INSTALLABILITY_STATUS_UNKNOWN',
        webDisplayMode: 'WEB_DISPLAY_MODE_BROWSER',
        musicActivityMasterSwitch: 'MUSIC_ACTIVITY_MASTER_SWITCH_INDETERMINATE',
        musicLocationMasterSwitch: 'MUSIC_LOCATION_MASTER_SWITCH_INDETERMINATE'
      }
    },
    user: { lockedSafetyMode: false }
  }
}

async function innertubeRequest(endpoint: string, body: any, additionalParams = ''): Promise<any> {
  const cookies = getCookies()
  if (!cookies) throw new Error('Not authenticated with YouTube Music')

  const url = `${INNERTUBE_BASE}/${endpoint}?prettyPrint=false${additionalParams}`
  const requestBody = JSON.stringify({
    context: getContext(),
    ...body
  })

  return new Promise((resolve, reject) => {
    const request = net.request({ url, method: 'POST' })

    request.setHeader('Cookie', cookies)
    request.setHeader('User-Agent', USER_AGENT)
    request.setHeader('Content-Type', 'application/json')
    request.setHeader('Origin', 'https://music.youtube.com')
    request.setHeader('Referer', 'https://music.youtube.com/')
    request.setHeader('X-Youtube-Client-Name', '67')
    request.setHeader('X-Youtube-Client-Version', CLIENT_VERSION)

    const authHeader = getAuthHeader()
    if (authHeader) {
      request.setHeader('Authorization', authHeader)
    }

    let data = ''
    request.on('response', (response) => {
      response.on('data', (chunk) => { data += chunk.toString() })
      response.on('end', () => {
        try {
          resolve(JSON.parse(data))
        } catch (e) {
          console.error('[YTMusicApi] JSON parse error:', e, 'Raw:', data.substring(0, 300))
          reject(new Error('Failed to parse YouTube Music response'))
        }
      })
    })

    request.on('error', (err) => {
      console.error('[YTMusicApi] Request error:', err)
      reject(err)
    })

    request.write(requestBody)
    request.end()
  })
}

// --- Navigation helpers (matching ytmusicapi Python nav pattern) ---

function nav(obj: any, path: (string | number)[], nullIfAbsent = false): any {
  let current = obj
  for (const key of path) {
    if (current == null || typeof current !== 'object') {
      return nullIfAbsent ? null : undefined
    }
    // @ts-ignore - safe index access
    current = current[key]
  }
  return current ?? (nullIfAbsent ? null : undefined)
}

// --- Parsers matching ytmusicapi Python library patterns ---

// Resize + proxy thumbnail URLs through thumb-cache:// to avoid 429 rate limits.
function proxyThumbnail(url: string, size = 226): string {
  if (!url) return ''
  let resized = url
  if (url.includes('googleusercontent.com') || url.includes('ggpht.com')) {
    resized = url.replace(/=w\d+[^&\s]*|=s\d+[^&\s]*/i, `=w${size}-h${size}-l90-rj`)
  }
  return toThumbUrl(resized)
}

function getThumbnails(renderer: any): any[] {
  return nav(renderer, ['thumbnailRenderer', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails']) ||
         nav(renderer, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails']) ||
         []
}

function getBestThumbnail(renderer: any): string {
  const thumbs = getThumbnails(renderer)
  const url = thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url || '' : ''
  return proxyThumbnail(url)
}

function parseSubtitleRuns(renderer: any): { artists: any[], album: any, subtitle: string, year: string } {
  const runs = nav(renderer, ['subtitle', 'runs']) || []
  const artists: any[] = []
  let album: any = null
  let year = ''
  const fullSubtitle = runs.map((r: any) => r.text).join('')

  for (let i = 0; i < runs.length; i++) {
    const run = runs[i]
    const browseId = nav(run, ['navigationEndpoint', 'browseEndpoint', 'browseId'], true)
    if (browseId) {
      if (browseId.startsWith('MPRE')) {
        album = { name: run.text, id: browseId }
      } else if (browseId.startsWith('UC') || browseId.startsWith('FE')) {
        artists.push({ name: run.text, id: browseId })
      }
    }
    if (run.text && /^\d{4}$/.test(run.text.trim())) {
      year = run.text.trim()
    }
  }

  return { artists, album, subtitle: fullSubtitle, year }
}

function parseSong(renderer: any): any {
  const title = nav(renderer, ['title', 'runs', '0', 'text']) || ''
  const videoId = nav(renderer, ['navigationEndpoint', 'watchEndpoint', 'videoId']) || ''
  const playlistId = nav(renderer, ['navigationEndpoint', 'watchEndpoint', 'playlistId'], true) || ''
  const thumbnails = getThumbnails(renderer)
  const imageUrl = getBestThumbnail(renderer)
  const parsed = parseSubtitleRuns(renderer)

  return {
    type: 'song',
    title,
    videoId,
    playlistId,
    artists: parsed.artists,
    album: parsed.album,
    subtitle: parsed.subtitle,
    thumbnails,
    imageUrl
  }
}

function parseWatchPlaylist(renderer: any): any {
  const title = nav(renderer, ['title', 'runs', '0', 'text']) || ''
  const playlistId = nav(renderer, ['navigationEndpoint', 'watchPlaylistEndpoint', 'playlistId']) || ''
  const thumbnails = getThumbnails(renderer)
  const imageUrl = getBestThumbnail(renderer)
  const parsed = parseSubtitleRuns(renderer)

  return {
    type: 'watch_playlist',
    title,
    playlistId,
    subtitle: parsed.subtitle,
    thumbnails,
    imageUrl
  }
}

function parsePlaylist(renderer: any): any {
  const title = nav(renderer, ['title', 'runs', '0', 'text']) || ''
  const browseId = nav(renderer, ['title', 'runs', '0', 'navigationEndpoint', 'browseEndpoint', 'browseId']) || ''
  const playlistId = browseId.startsWith('VL') ? browseId.substring(2) : browseId
  const thumbnails = getThumbnails(renderer)
  const imageUrl = getBestThumbnail(renderer)
  const parsed = parseSubtitleRuns(renderer)

  const runs = nav(renderer, ['subtitle', 'runs']) || []
  let count = ''
  let author: any[] = []
  if (runs.length >= 3) {
    const countText = runs[runs.length - 1]?.text || ''
    const match = countText.match(/(\d+)/)
    if (match) count = match[1]
    const firstRun = runs[0]
    if (firstRun?.navigationEndpoint) {
      author = [{ name: firstRun.text, id: nav(firstRun, ['navigationEndpoint', 'browseEndpoint', 'browseId']) || '' }]
    }
  }

  return {
    type: 'playlist',
    title,
    playlistId,
    browseId,
    subtitle: parsed.subtitle,
    description: parsed.subtitle,
    count,
    author,
    thumbnails,
    imageUrl
  }
}

function parseAlbum(renderer: any): any {
  const title = nav(renderer, ['title', 'runs', '0', 'text']) || ''
  const browseId = nav(renderer, ['title', 'runs', '0', 'navigationEndpoint', 'browseEndpoint', 'browseId']) || ''
  const thumbnails = getThumbnails(renderer)
  const imageUrl = getBestThumbnail(renderer)
  const parsed = parseSubtitleRuns(renderer)

  return {
    type: 'album',
    title,
    browseId,
    playlistId: browseId,
    artists: parsed.artists,
    year: parsed.year,
    subtitle: parsed.subtitle,
    thumbnails,
    imageUrl
  }
}

function parseArtist(renderer: any): any {
  const title = nav(renderer, ['title', 'runs', '0', 'text']) || ''
  const browseId = nav(renderer, ['title', 'runs', '0', 'navigationEndpoint', 'browseEndpoint', 'browseId']) || ''
  const thumbnails = getThumbnails(renderer)
  const imageUrl = getBestThumbnail(renderer)
  const subscribers = nav(renderer, ['subtitle', 'runs', '0', 'text'], true) || ''

  return {
    type: 'artist',
    title,
    browseId,
    subscribers: subscribers.split(' ')[0],
    subtitle: subscribers,
    thumbnails,
    imageUrl
  }
}

function extractItemFromRenderer(renderer: any): any {
  const titleRun = nav(renderer, ['title', 'runs', '0'])
  if (!titleRun) return null

  const navEndpoint = renderer?.navigationEndpoint || titleRun?.navigationEndpoint
  const pageType = nav(navEndpoint, ['browseEndpoint', 'browseEndpointContextSupportedConfigs',
    'browseEndpointContextMusicConfig', 'pageType'], true) || ''

  const watchVideoId = nav(navEndpoint, ['watchEndpoint', 'videoId'], true)
  const watchPlaylistId = nav(navEndpoint, ['watchPlaylistEndpoint', 'playlistId'], true)

  if (watchVideoId) {
    return parseSong(renderer)
  }

  if (watchPlaylistId && !pageType) {
    return parseWatchPlaylist(renderer)
  }

  if (pageType === 'MUSIC_PAGE_TYPE_PLAYLIST') {
    return parsePlaylist(renderer)
  }

  if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || pageType === 'MUSIC_PAGE_TYPE_AUDIOBOOK') {
    return parseAlbum(renderer)
  }

  if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL') {
    return parseArtist(renderer)
  }

  const browseId = nav(navEndpoint, ['browseEndpoint', 'browseId'], true) || ''
  if (browseId.startsWith('VL')) {
    return parsePlaylist(renderer)
  }
  if (browseId.startsWith('UC') || browseId.startsWith('MP')) {
    return parseArtist(renderer)
  }
  if (browseId.startsWith('MPRE')) {
    return parseAlbum(renderer)
  }

  const title = titleRun?.text || ''
  const imageUrl = getBestThumbnail(renderer)
  const parsed = parseSubtitleRuns(renderer)

  return {
    type: 'unknown',
    title,
    browseId,
    playlistId: browseId.startsWith('VL') ? browseId.substring(2) : '',
    subtitle: parsed.subtitle,
    thumbnails: getThumbnails(renderer),
    imageUrl,
    id: browseId || Math.random().toString(36)
  }
}

// --- Shelf/Section extraction ---

function extractShelfRenderers(data: any): any[] {
  const sections: any[] = []
  try {
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || []
    for (const tab of tabs) {
      const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || []
      for (const section of sectionList) {
        const shelf = section?.musicCarouselShelfRenderer || section?.musicImmersiveCarouselShelfRenderer
        if (shelf) {
          const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer ||
                         shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer
          const title = header?.title?.runs?.[0]?.text || 'Untitled'
          const items = (shelf.contents || []).map((item: any) => {
            const twoRow = item?.musicTwoRowItemRenderer
            if (twoRow) {
              return extractItemFromRenderer(twoRow)
            }
            const listItem = item?.musicResponsiveListItemRenderer
            if (listItem) {
              return parseFlatSong(listItem)
            }
            return null
          }).filter(Boolean)

          if (items.length > 0) {
            sections.push({
              id: title.replace(/\s+/g, '_').toLowerCase(),
              title,
              contents: items,
              items
            })
          }
        }
      }
    }
  } catch (e) {
    console.error('[YTMusicApi] Error extracting shelves:', e)
  }
  return sections
}

// --- Flat song parser (for musicResponsiveListItemRenderer in shelves) ---

function parseFlatSong(renderer: any): any {
  const flexColumns = renderer.flexColumns || []
  const title = nav(flexColumns, ['0', 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs', '0', 'text']) || ''
  const videoId = nav(flexColumns, ['0', 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs', '0',
    'navigationEndpoint', 'watchEndpoint', 'videoId'], true) ||
    renderer?.playlistItemData?.videoId ||
    nav(renderer, ['overlay', 'musicItemThumbnailOverlayRenderer', 'content',
      'musicPlayButtonRenderer', 'playNavigationEndpoint', 'watchEndpoint', 'videoId'], true) || ''

  const artistRuns = nav(flexColumns, ['1', 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs']) || []
  const artists = artistRuns
    .filter((r: any) => r.navigationEndpoint)
    .map((r: any) => ({
      name: r.text,
      id: nav(r, ['navigationEndpoint', 'browseEndpoint', 'browseId']) || ''
    }))
  const subtitle = artistRuns.map((r: any) => r.text).join('')

  const albumRun = nav(flexColumns, ['2', 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs', '0'])
  const album = albumRun ? {
    name: albumRun.text || '',
    id: nav(albumRun, ['navigationEndpoint', 'browseEndpoint', 'browseId']) || ''
  } : null

  const thumbnails = nav(renderer, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails']) || []
  const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : '')

  const durationText = nav(renderer, ['fixedColumns', '0', 'musicResponsiveListItemFixedColumnRenderer', 'text', 'runs', '0', 'text']) || ''
  const durationParts = durationText.split(':').map(Number)
  let durationMs = 0
  let durationSeconds = 0
  if (durationParts.length === 2) {
    durationSeconds = durationParts[0] * 60 + durationParts[1]
    durationMs = durationSeconds * 1000
  } else if (durationParts.length === 3) {
    durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]
    durationMs = durationSeconds * 1000
  }

  return {
    type: 'song',
    title,
    videoId,
    artists,
    album,
    subtitle,
    thumbnails,
    imageUrl,
    duration: durationText,
    durationMs,
    durationSeconds,
    id: videoId || Math.random().toString(36)
  }
}

// --- Playlist tracks extraction (matches ytmusicapi Python two-column layout) ---

function extractPlaylistTracks(data: any): any[] {
  const tracks: any[] = []
  try {
    // Primary path: twoColumnBrowseResultsRenderer.secondaryContents (ytmusicapi pattern)
    const twoCol = data?.contents?.twoColumnBrowseResultsRenderer
    const secondarySection = twoCol?.secondaryContents?.sectionListRenderer
    const primaryShelf = secondarySection?.contents?.[0]?.musicPlaylistShelfRenderer ||
                         secondarySection?.contents?.[0]?.musicShelfRenderer

    if (primaryShelf?.contents) {
      for (const item of primaryShelf.contents) {
        const renderer = item?.musicResponsiveListItemRenderer
        if (!renderer) continue
        const track = parsePlaylistItem(renderer)
        if (track && track.videoId && track.title) {
          tracks.push(track)
        }
      }
    }

    // Fallback 1: tabs-based layout (albums & singleColumn playlists)
    if (tracks.length === 0) {
      const tabs = twoCol?.tabs ||
                   data?.contents?.singleColumnBrowseResultsRenderer?.tabs || []
      for (const tab of tabs) {
        const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || []
        for (const section of sectionList) {
          const shelf = section?.musicShelfRenderer || section?.musicPlaylistShelfRenderer
          if (!shelf) continue
          for (const item of (shelf.contents || [])) {
            const renderer = item?.musicResponsiveListItemRenderer
            if (!renderer) continue
            const track = parsePlaylistItem(renderer)
            if (track && track.videoId && track.title) {
              tracks.push(track)
            }
          }
        }
      }
    }

    // Fallback 2: deep search for musicShelfRenderer anywhere in sectionList
    // Some album layouts nest tracks inside musicShelfRenderer within
    // twoColumnBrowseResultsRenderer > tabs > ... > sectionListRenderer
    if (tracks.length === 0 && twoCol) {
      const tabContents = twoCol.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents || []
      for (const sec of tabContents) {
        // Check for musicShelfRenderer directly (common album layout)
        const shelf = sec?.musicShelfRenderer
        if (shelf?.contents) {
          for (const item of shelf.contents) {
            const renderer = item?.musicResponsiveListItemRenderer
            if (!renderer) continue
            const track = parsePlaylistItem(renderer)
            if (track && track.videoId && track.title) {
              tracks.push(track)
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[YTMusicApi] Error extracting playlist tracks:', e)
  }
  return tracks
}

// --- Playlist item parser (matches ytmusicapi parse_playlist_item) ---

function parsePlaylistItem(renderer: any): any {
  const flexColumns = renderer.flexColumns || []

  // Extract videoId from multiple possible locations
  let videoId = renderer?.playlistItemData?.videoId || ''
  if (!videoId) {
    // Try play button's watch endpoint  
    videoId = nav(renderer, ['overlay', 'musicItemThumbnailOverlayRenderer', 'content',
      'musicPlayButtonRenderer', 'playNavigationEndpoint', 'watchEndpoint', 'videoId'], true) || ''
  }
  if (!videoId) {
    // Try first flex column nav endpoint
    videoId = nav(flexColumns, ['0', 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs', '0',
      'navigationEndpoint', 'watchEndpoint', 'videoId'], true) || ''
  }
  if (!videoId) {
    // Try menu items for removedVideoId (unavailable/greyed-out tracks)
    const menuItems = nav(renderer, ['menu', 'menuRenderer', 'items']) || []
    for (const mi of menuItems) {
      const svc = mi?.menuServiceItemRenderer?.serviceEndpoint
      if (svc?.playlistEditEndpoint) {
        videoId = svc.playlistEditEndpoint.actions?.[0]?.removedVideoId || ''
        if (videoId) break
      }
    }
  }

  // Extract title
  const title = nav(flexColumns, ['0', 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs', '0', 'text']) || ''

  // Parse flex columns using pageType to identify artist vs album columns
  const artists: any[] = []
  let album: any = null
  let subtitleParts: string[] = []

  for (let colIdx = 1; colIdx < flexColumns.length; colIdx++) {
    const runs = nav(flexColumns, [String(colIdx), 'musicResponsiveListItemFlexColumnRenderer', 'text', 'runs']) || []
    for (const run of runs) {
      const browseEndpoint = nav(run, ['navigationEndpoint', 'browseEndpoint'], true)
      if (browseEndpoint) {
        const pageType = nav(browseEndpoint, ['browseEndpointContextSupportedConfigs',
          'browseEndpointContextMusicConfig', 'pageType'], true) || ''
        if (pageType === 'MUSIC_PAGE_TYPE_ARTIST' || pageType === 'MUSIC_PAGE_TYPE_USER_CHANNEL' || pageType === 'MUSIC_PAGE_TYPE_UNKNOWN') {
          artists.push({ name: run.text, id: browseEndpoint.browseId || '' })
        } else if (pageType === 'MUSIC_PAGE_TYPE_ALBUM' || pageType === 'MUSIC_PAGE_TYPE_AUDIOBOOK') {
          album = { name: run.text, id: browseEndpoint.browseId || '' }
        }
      }
      if (run.text) subtitleParts.push(run.text)
    }
  }

  // If no artists found from navigatable runs, use subtitle text
  const subtitle = subtitleParts.join('')
  if (artists.length === 0 && subtitle) {
    artists.push({ name: subtitle.split(' \u2022 ')[0]?.split(' & ')[0] || subtitle, id: '' })
  }

  // Duration
  const durationText = nav(renderer, ['fixedColumns', '0', 'musicResponsiveListItemFixedColumnRenderer', 'text', 'runs', '0', 'text']) || ''
  const durationParts = durationText.split(':').map(Number)
  let durationSeconds = 0
  if (durationParts.length === 2) durationSeconds = durationParts[0] * 60 + durationParts[1]
  else if (durationParts.length === 3) durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]

  // Thumbnails
  const thumbnails = nav(renderer, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails']) || []
  const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : '')

  return {
    type: 'song',
    title,
    videoId,
    artists,
    album,
    subtitle,
    thumbnails,
    imageUrl,
    duration: durationText,
    durationMs: durationSeconds * 1000,
    durationSeconds,
    id: videoId || Math.random().toString(36)
  }
}

// --- Search results extraction ---

// --- Search Implementation (matching ytmusicapi Python) ---

function getSearchParams(filter?: string, scope?: string, ignoreSpelling = false): string | null {
  const filteredParam1 = 'EgWKAQ'
  let params: string | null = null

  if (!filter && !scope && !ignoreSpelling) {
    return null
  }

  if (scope === 'uploads') {
    params = 'agIYAw%3D%3D'
  }

  if (scope === 'library') {
    if (filter) {
      const param2 = _getParam2(filter)
      return filteredParam1 + param2 + 'AWoKEAUQCRADEAoYBA%3D%3D'
    } else {
      params = 'agIYBA%3D%3D'
    }
  }

  if (!scope && filter) {
    if (filter === 'playlists') {
      params = 'Eg-KAQwIABAAGAAgACgB'
      if (!ignoreSpelling) {
        params += 'MABqChAEEAMQCRAFEAo%3D'
      } else {
        params += 'MABCAggBagoQBBADEAkQBRAK'
      }
    } else if (filter.includes('playlists')) {
      const param1 = 'EgeKAQQoA'
      const param2 = filter === 'featured_playlists' ? 'Dg' : 'EA'
      const param3 = !ignoreSpelling ? 'BagwQDhAKEAMQBBAJEAU%3D' : 'BQgIIAWoMEA4QChADEAQQCRAF'
      return param1 + param2 + param3
    } else {
      const param2 = _getParam2(filter)
      const param3 = !ignoreSpelling ? 'AWoMEA4QChADEAQQCRAF' : 'AUICCAFqDBAOEAoQAxAEEAkQBQ%3D%3D'
      return filteredParam1 + param2 + param3
    }
  }

  if (!scope && !filter && ignoreSpelling) {
    params = 'EhGKAQ4IARABGAEgASgAOAFAAUICCAE%3D'
  }

  return params
}

function _getParam2(filter: string): string {
  const filterParams: Record<string, string> = {
    'songs': 'II',
    'videos': 'IQ',
    'albums': 'IY',
    'artists': 'Ig',
    'playlists': 'Io',
    'profiles': 'JY',
    'podcasts': 'JQ',
    'episodes': 'JI'
  }
  return filterParams[filter] || ''
}

function getFlexColumnItem(data: any, index: number): any {
  if (data?.flexColumns?.length > index) {
      return nav(data.flexColumns[index], ['musicResponsiveListItemFlexColumnRenderer'], true)
  }
  return null
}

function getItemText(data: any, index: number, runIndex = 0): string | null {
  const item = getFlexColumnItem(data, index)
  if (!item) return null
  return nav(item, ['text', 'runs', runIndex, 'text'], true)
}

function parseSearchResult(data: any, resultType?: string, category?: string): any {
  const searchResult: any = { category }

  // Detect result type from browseId if not provided (e.g. top result)
  if (!resultType) {
    const browseId = nav(data, ['navigationEndpoint', 'browseEndpoint', 'browseId'], true)
    if (browseId) {
      if (browseId.startsWith('VM') || browseId.startsWith('RD') || browseId.startsWith('VL')) resultType = 'playlist'
      else if (browseId.startsWith('MPLA')) resultType = 'artist'
      else if (browseId.startsWith('MPRE')) resultType = 'album'
      else if (browseId.startsWith('MPSP')) resultType = 'podcast'
      else if (browseId.startsWith('MPED')) resultType = 'episode'
      else if (browseId.startsWith('UC')) resultType = 'artist'
    } else {
      // Fallback to video/song detection
      const videoType = nav(data, ['playNavigationEndpoint', 'watchEndpoint', 'watchEndpointMusicSupportedConfigs', 'watchEndpointMusicConfig', 'musicVideoType'], true)
      if (videoType === 'MUSIC_VIDEO_TYPE_ATV') resultType = 'song'
      else if (videoType === 'MUSIC_VIDEO_TYPE_PODCAST_EPISODE') resultType = 'episode'
      else resultType = 'video'
    }
  }

  // Fallback if still unknown - infer from category or default to song/video if flex columns exist
  if (!resultType && category) {
      const lowerCat = category.toLowerCase()
      if (lowerCat.includes('song')) resultType = 'song'
      else if (lowerCat.includes('video')) resultType = 'video'
      else if (lowerCat.includes('album')) resultType = 'album'
      else if (lowerCat.includes('artist')) resultType = 'artist'
      else if (lowerCat.includes('playlist')) resultType = 'playlist'
  }
  if (!resultType) resultType = 'song' // Safe default for lists

  searchResult.resultType = resultType

  if (resultType !== 'artist') {
    searchResult.title = nav(data, ['title', 'runs', 0, 'text'], true)
    if (!searchResult.title) {
        searchResult.title = getItemText(data, 0)
    }
  }

  if (resultType === 'artist') {
    searchResult.artist = nav(data, ['title', 'runs', 0, 'text'], true) || getItemText(data, 0)
    searchResult.browseId = nav(data, ['navigationEndpoint', 'browseEndpoint', 'browseId'], true)
    searchResult.thumbnails = nav(data, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails'], true)
    // Subscribers?
    const subtitle = nav(data, ['subtitle', 'runs', 0, 'text'], true)
    if (subtitle && subtitle.includes('subscribers')) {
      searchResult.subscribers = subtitle.split(' ')[0]
    }
  } else if (resultType === 'album') {
    searchResult.type = nav(data, ['subtitle', 'runs', 0, 'text'], true) // e.g. "Album" or "Single"
    searchResult.browseId = nav(data, ['navigationEndpoint', 'browseEndpoint', 'browseId'], true)
    searchResult.thumbnails = nav(data, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails'], true)
    
    let runs = nav(data, ['subtitle', 'runs'])
    if (!runs) {
        const flexItem = getFlexColumnItem(data, 1)
        runs = nav(flexItem, ['text', 'runs'], true) || []
    }

    if (runs.length > 2) {
      searchResult.year = runs[runs.length - 1].text
      searchResult.artist = runs[2].text 
    }
    // Try to get type/year from flex columns if subtitle failed
    if (!searchResult.type && runs.length > 0) searchResult.type = runs[0].text

  } else if (resultType === 'playlist') {
    searchResult.title = nav(data, ['title', 'runs', 0, 'text'], true) || getItemText(data, 0)
    searchResult.thumbnails = nav(data, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails'], true)
    
    let runs = nav(data, ['subtitle', 'runs'])
    if (!runs) {
       const flexItem = getFlexColumnItem(data, 1)
       runs = nav(flexItem, ['text', 'runs'], true) || []
    }
    
    if (runs.length > 0) {
       searchResult.author = runs[0].text // Often "By Author"
       searchResult.itemCount = runs[runs.length - 1]?.text.split(' ')[0]
    }
    
    const browseId = nav(data, ['navigationEndpoint', 'browseEndpoint', 'browseId'], true)
    searchResult.playlistId = browseId
    searchResult.browseId = browseId

  } else if (resultType === 'song') {
    searchResult.type = 'song'
    searchResult.videoId = nav(data, ['playNavigationEndpoint', 'watchEndpoint', 'videoId'], true) // Try play button first
    if (!searchResult.videoId) {
        searchResult.videoId = nav(data, ['onTap', 'watchEndpoint', 'videoId'], true) // Try tap action
    }
    
    searchResult.title = nav(data, ['title', 'runs', 0, 'text'], true) || getItemText(data, 0)
    searchResult.thumbnails = nav(data, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails'], true)
    
    let runs = nav(data, ['subtitle', 'runs'])
    if (!runs) {
        const flexItem = getFlexColumnItem(data, 1)
        runs = nav(flexItem, ['text', 'runs'], true) || []
    }

    // Parse artists, album, duration
    const artists = []
    let album = null
    let duration = null

    // Heuristic: Song • Artist • Album • Duration
    // or Artist • Album • Duration (if title is handled separately)
    // runs usually contain: [Artist, separator, Album, separator, Duration]
    // Loop through runs and identify by browseId or format
    for (const run of runs) {
       if (run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC')) {
           artists.push({ name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId })
       } else if (run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('MPRE') || run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('OLAK')) {
           album = { name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId }
       } else if (/^\d+:\d+$/.test(run.text)) {
           duration = run.text
       }
    }
    
    if (artists.length === 0 && runs.length > 0) {
         // Fallback logic if explicit browseIds are missing
         // Usually first item is artist
         // Filter out separators like " • "
         const validRuns = runs.filter((r: any) => r.text !== ' • ')
         if (validRuns.length > 0) {
             artists.push({ name: validRuns[0].text, id: '' })
         }
         if (validRuns.length > 1 && !album) {
             // Maybe album?
             // It's ambiguous without browseId, but usually Artist -> Album -> Duration
         }
    }

    searchResult.artists = artists
    searchResult.album = album
    searchResult.duration = duration
    searchResult.imageUrl = proxyThumbnail(searchResult.thumbnails?.[searchResult.thumbnails.length - 1]?.url)
  }
  else if (resultType === 'video') {
    searchResult.type = 'video'
    searchResult.videoId = nav(data, ['playNavigationEndpoint', 'watchEndpoint', 'videoId'], true)
    searchResult.title = nav(data, ['title', 'runs', 0, 'text'], true) || getItemText(data, 0)
    searchResult.thumbnails = nav(data, ['thumbnail', 'musicThumbnailRenderer', 'thumbnail', 'thumbnails'], true)
    
    let runs = nav(data, ['subtitle', 'runs'])
    if (!runs) {
        const flexItem = getFlexColumnItem(data, 1)
        runs = nav(flexItem, ['text', 'runs'], true) || []
    }
    
    const artists = []
    let views = ''
    let duration = ''
    
    for (const run of runs) {
       if (run.navigationEndpoint?.browseEndpoint?.browseId?.startsWith('UC')) {
           artists.push({ name: run.text, id: run.navigationEndpoint.browseEndpoint.browseId })
       } else if (run.text.includes('views')) {
           views = run.text.split(' ')[0]
       } else if (/^\d+:\d+$/.test(run.text)) {
           duration = run.text
       }
    }
    
    if (artists.length === 0 && runs.length > 0) {
         const validRuns = runs.filter((r: any) => r.text !== ' • ')
         if (validRuns.length > 0) artists.push({ name: validRuns[0].text, id: '' })
    }
    
    searchResult.artists = artists
    searchResult.views = views
    searchResult.duration = duration
    searchResult.imageUrl = proxyThumbnail(searchResult.thumbnails?.[searchResult.thumbnails.length - 1]?.url)
  }

  // Common fields fixup
  if (searchResult.thumbnails && searchResult.thumbnails.length > 0) {
      searchResult.imageUrl = proxyThumbnail(searchResult.thumbnails[searchResult.thumbnails.length - 1].url)
  }

  return searchResult
}

// --- Public API ---

export async function getHome(limit = 10): Promise<any[]> {
  console.log('[YTMusicApi] Fetching home (limit:', limit, ')...')
  const body = { browseId: 'FEmusic_home' }
  const data = await innertubeRequest('browse', body)

  // Parse initial sections from singleColumnBrowseResultsRenderer
  const sections = extractShelfRenderers(data)
  console.log(`[YTMusicApi] Initial home sections: ${sections.length}`)

  // Follow continuation tokens to load more sections (ytmusicapi pattern)
  try {
    const sectionList = data?.contents?.singleColumnBrowseResultsRenderer
      ?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer
    
    if (sectionList?.continuations) {
      let ctoken = sectionList.continuations?.[0]?.nextContinuationData?.continuation
      let iterations = 0
      const maxIterations = Math.max(0, limit - sections.length)

      while (ctoken && iterations < maxIterations) {
        const additionalParams = `&ctoken=${ctoken}&continuation=${ctoken}`
        const contResponse = await innertubeRequest('browse', body, additionalParams)
        
        const contSections = contResponse?.continuationContents?.sectionListContinuation
        if (!contSections?.contents) break

        // Parse shelves from continuation
        for (const section of contSections.contents) {
          const shelf = section?.musicCarouselShelfRenderer || section?.musicImmersiveCarouselShelfRenderer
          if (!shelf) continue
          const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer ||
                         shelf.header?.musicImmersiveCarouselShelfBasicHeaderRenderer
          const title = header?.title?.runs?.[0]?.text || 'Untitled'
          const items = (shelf.contents || []).map((item: any) => {
            const twoRow = item?.musicTwoRowItemRenderer
            if (twoRow) return extractItemFromRenderer(twoRow)
            const listItem = item?.musicResponsiveListItemRenderer
            if (listItem) return parseFlatSong(listItem)
            return null
          }).filter(Boolean)

          if (items.length > 0) {
            sections.push({
              id: title.replace(/\s+/g, '_').toLowerCase(),
              title,
              contents: items,
              items
            })
          }
        }

        // Get next continuation token
        ctoken = contSections.continuations?.[0]?.nextContinuationData?.continuation || null
        iterations++
        console.log(`[YTMusicApi] Loaded continuation ${iterations}, total sections: ${sections.length}`)
      }
    }
  } catch (e) {
    console.error('[YTMusicApi] Error loading home continuations:', e)
  }

  console.log(`[YTMusicApi] Total home sections loaded: ${sections.length}`)
  return sections
}

export async function search(query: string, filter?: string, scope?: string, ignoreSpelling = false): Promise<any[]> {
  console.log(`[YTMusicApi] Searching: '${query}' (filter: ${filter}, scope: ${scope})`)
  
  const body: any = { query }
  const params = getSearchParams(filter, scope, ignoreSpelling)
  if (params) {
    body.params = params
  }

  const data = await innertubeRequest('search', body)
  const searchResults: any[] = []

  // No results check
  if (!data?.contents) return searchResults

  let results: any
  if (data.contents.tabbedSearchResultsRenderer) {
    // With tabs (default scope)
    const tabs = data.contents.tabbedSearchResultsRenderer.tabs
    // If scope is uploads, tab index 1, else 0 (unless filters change this logic, but for simple search 0 is correct)
    const tabIndex = scope === 'uploads' ? 1 : 0 
    results = tabs[tabIndex]?.tabRenderer?.content
  } else {
    results = data.contents
  }

  const sectionList = nav(results, ['sectionListRenderer', 'contents'], true)
  if (!sectionList) return searchResults

  // Determine result type if filter is set
  let resultType: string | undefined
  if (filter && filter.includes('playlists')) {
      resultType = 'playlist'
  } else if (scope === 'uploads') {
      resultType = 'upload'
  } else if (filter) {
      // songs -> song, videos -> video, etc.
      resultType = filter.slice(0, -1)
  }

  for (const res of sectionList) {
    let category: string | undefined

    if (res.musicCardShelfRenderer) {
        // Top result
        const shelf = res.musicCardShelfRenderer
        const topResult = parseSearchResult(shelf, undefined, 'Top result')
        searchResults.push(topResult)
        
        const contents = shelf.contents
        if (contents) {
            // "More from YouTube" sometimes appears here
            for (const item of contents) {
                if (item.musicResponsiveListItemRenderer) {
                    searchResults.push(parseSearchResult(item.musicResponsiveListItemRenderer, 'song', 'More from YouTube'))
                }
            }
        }
    } else if (res.musicShelfRenderer) {
        const shelf = res.musicShelfRenderer
        category = nav(shelf, ['title', 'runs', 0, 'text'], true)
        
        // If no filter set, infer type from category title (e.g. "Songs", "Videos")
        let shelfResultType = resultType
        if (!shelfResultType && category) {
             const lowerCat = category.toLowerCase()
             if (lowerCat === 'songs') shelfResultType = 'song'
             else if (lowerCat === 'videos') shelfResultType = 'video'
             else if (lowerCat === 'albums') shelfResultType = 'album'
             else if (lowerCat === 'artists') shelfResultType = 'artist'
             else if (lowerCat === 'playlists') shelfResultType = 'playlist'
             else if (lowerCat === 'community playlists') shelfResultType = 'playlist'
        }

        const items = shelf.contents || []
        for (const item of items) {
            if (item.musicResponsiveListItemRenderer) {
                searchResults.push(parseSearchResult(item.musicResponsiveListItemRenderer, shelfResultType, category))
            }
        }
    }
  }

  console.log(`[YTMusicApi] Found ${searchResults.length} search results`)
  return searchResults
}

export async function getSearchSuggestions(query: string, detailedRuns = false): Promise<any[]> {
    const body = { input: query }
    const data = await innertubeRequest('music/get_search_suggestions', body)
    
    const rawSuggestions = nav(data, ['contents', 0, 'searchSuggestionsSectionRenderer', 'contents'], true) || []
    const suggestions: any[] = []

    for (const raw of rawSuggestions) {
        if (raw.historySuggestionRenderer) {
            const renderer = raw.historySuggestionRenderer
            const text = nav(renderer, ['navigationEndpoint', 'searchEndpoint', 'query'], true)
            const runs = nav(renderer, ['suggestion', 'runs'], true)
            if (detailedRuns) {
                suggestions.push({
                   text, runs, fromHistory: true
                })
            } else {
                suggestions.push(text)
            }
        } else if (raw.searchSuggestionRenderer) {
            const renderer = raw.searchSuggestionRenderer
            const text = nav(renderer, ['navigationEndpoint', 'searchEndpoint', 'query'], true)
            const runs = nav(renderer, ['suggestion', 'runs'], true)
             if (detailedRuns) {
                suggestions.push({
                   text, runs, fromHistory: false
                })
            } else {
                suggestions.push(text)
            }
        }
    }
    return suggestions
}

export async function getUserPlaylists(): Promise<any[]> {
  console.log('[YTMusicApi] Fetching user playlists...')
  const data = await innertubeRequest('browse', { browseId: 'FEmusic_liked_playlists' })
  const sections = extractShelfRenderers(data)
  const allItems: any[] = []
  for (const section of sections) {
    allItems.push(...(section.items || section.contents || []).filter((item: any) =>
      item.type === 'playlist' || item.type === 'album' || item.type === 'watch_playlist'
    ))
  }
  if (allItems.length === 0) {
    try {
      const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || []
      for (const tab of tabs) {
        const grid = tab?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]?.gridRenderer
        if (!grid) continue
        for (const item of (grid.items || [])) {
          const renderer = item?.musicTwoRowItemRenderer
          if (!renderer) continue
          allItems.push(extractItemFromRenderer(renderer))
        }
      }
    } catch (e) {
      console.error('[YTMusicApi] Error extracting library playlists:', e)
    }
  }
  return allItems
}

// Extract playable songs from channel/artist browse responses.
// Channels return singleColumnBrowseResultsRenderer with musicCarouselShelfRenderer shelves
// containing songs and videos.
function extractChannelSongs(data: any): any[] {
  const tracks: any[] = []
  try {
    // Channel responses use singleColumnBrowseResultsRenderer with shelves
    const tabs = data?.contents?.singleColumnBrowseResultsRenderer?.tabs || []
    for (const tab of tabs) {
      const sectionList = tab?.tabRenderer?.content?.sectionListRenderer?.contents || []
      for (const section of sectionList) {
        // musicShelfRenderer has flat song lists
        const musicShelf = section?.musicShelfRenderer
        if (musicShelf?.contents) {
          for (const item of musicShelf.contents) {
            const renderer = item?.musicResponsiveListItemRenderer
            if (renderer) {
              const track = parsePlaylistItem(renderer)
              if (track && track.videoId && track.title) {
                tracks.push(track)
              }
            }
          }
        }
        // musicCarouselShelfRenderer has two-row items (songs, videos, albums)
        const carousel = section?.musicCarouselShelfRenderer
        if (carousel?.contents) {
          for (const item of carousel.contents) {
            const twoRow = item?.musicTwoRowItemRenderer
            if (twoRow) {
              const parsed = extractItemFromRenderer(twoRow)
              if (parsed && parsed.type === 'song' && parsed.videoId) {
                tracks.push(parsed)
              }
            }
            // Also try flat list items inside carousels
            const listItem = item?.musicResponsiveListItemRenderer
            if (listItem) {
              const track = parseFlatSong(listItem)
              if (track && track.videoId && track.title) {
                tracks.push(track)
              }
            }
          }
        }
      }
    }
  } catch (e) {
    console.error('[YTMusicApi] Error extracting channel songs:', e)
  }
  return tracks
}

export async function getPlaylistDetails(playlistId: string): Promise<any> {
  console.log('[YTMusicApi] Fetching playlist:', playlistId)

  // Determine the correct browseId based on ID prefix:
  //   MPRE...  → album browseId, use as-is
  //   UC...    → channel/artist browseId, use as-is
  //   MPSP... → podcast browseId, use as-is
  //   FE...   → special browse endpoint, use as-is
  //   VL...   → already has playlist prefix, use as-is
  //   Others  → add VL prefix (regular playlists: PL, RDCLAK, OLAK, etc.)
  const directBrowsePrefixes = ['MPRE', 'UC', 'MPSP', 'FE', 'VL']
  const isDirectBrowse = directBrowsePrefixes.some(p => playlistId.startsWith(p))
  const isChannel = playlistId.startsWith('UC')
  const browseId = isDirectBrowse ? playlistId : `VL${playlistId}`
  const idType = isChannel ? 'channel' : playlistId.startsWith('MPRE') ? 'album' : 'playlist'
  console.log('[YTMusicApi] Using browseId:', browseId, `(${idType})`)

  const data = await innertubeRequest('browse', { browseId })

  // Debug: log response structure keys
  const topKeys = Object.keys(data || {})
  console.log('[YTMusicApi] Response top-level keys:', topKeys.join(', '))
  if (data?.contents) {
    console.log('[YTMusicApi] contents keys:', Object.keys(data.contents).join(', '))
  }

  // --- Extract header ---
  const twoCol = data?.contents?.twoColumnBrowseResultsRenderer
  const headerData = twoCol?.tabs?.[0]?.tabRenderer?.content?.sectionListRenderer?.contents?.[0]

  if (twoCol) {
    console.log('[YTMusicApi] twoCol found, secondaryContents:', !!twoCol?.secondaryContents)
    const secContents = twoCol?.secondaryContents?.sectionListRenderer?.contents?.[0]
    if (secContents) {
      console.log('[YTMusicApi] secondaryContents[0] keys:', Object.keys(secContents).join(', '))
    }
  }

  // Determine if this is an owned/editable playlist
  let header: any = null
  if (headerData?.musicEditablePlaylistDetailHeaderRenderer) {
    const editable = headerData.musicEditablePlaylistDetailHeaderRenderer
    header = editable.header?.musicResponsiveHeaderRenderer ||
             editable.header?.musicDetailHeaderRenderer ||
             editable
  } else if (headerData?.musicResponsiveHeaderRenderer) {
    header = headerData.musicResponsiveHeaderRenderer
  }

  // Fallback: try top-level header renderers (used by channels and albums)
  if (!header) {
    header = data?.header?.musicImmersiveHeaderRenderer ||
             data?.header?.musicDetailHeaderRenderer ||
             data?.header?.musicVisualHeaderRenderer ||
             data?.header?.musicResponsiveHeaderRenderer || {}
  }

  const title = header?.title?.runs?.[0]?.text || 'YouTube Music Playlist'
  const subtitleRuns = header?.subtitle?.runs || header?.straplineTextOne?.runs || []
  const subtitle = subtitleRuns.map((r: any) => r.text).join('')
  const thumbnails = header?.thumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                     header?.foregroundThumbnail?.musicThumbnailRenderer?.thumbnail?.thumbnails ||
                     header?.thumbnail?.croppedSquareThumbnailRenderer?.thumbnail?.thumbnails || []
  const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : '')

  // Extract tracks: use channel extractor for UC IDs, playlist extractor for everything else
  let tracks: any[]
  if (isChannel) {
    tracks = extractChannelSongs(data)
    console.log(`[YTMusicApi] Channel '${title}': ${tracks.length} songs extracted from shelves`)
  } else {
    tracks = extractPlaylistTracks(data)
    console.log(`[YTMusicApi] Playlist '${title}': ${tracks.length} tracks extracted`)
  }

  return {
    id: playlistId,
    title,
    subtitle,
    imageUrl,
    thumbnails,
    trackCount: tracks.length,
    tracks
  }
}


export async function getSongDetails(videoId: string): Promise<any> {
  console.log('[YTMusicApi] Fetching song details:', videoId)
  const data = await innertubeRequest('player', { videoId })
  const details = data?.videoDetails || {}
  const thumbs = details.thumbnail?.thumbnails || []
  return {
    id: details.videoId || videoId,
    title: details.title || '',
    artists: details.author || '',
    durationMs: (parseInt(details.lengthSeconds) || 0) * 1000,
    durationSeconds: parseInt(details.lengthSeconds) || 0,
    imageUrl: proxyThumbnail(thumbs.length > 0 ? thumbs[thumbs.length - 1]?.url : ''),
    thumbnails: thumbs,
    videoId: details.videoId || videoId
  }
}

// --- Watch Playlist (Radio / Up Next) ---
// Matches ytmusicapi Python get_watch_playlist: uses the 'next' endpoint to get
// autoplay/radio tracks for a given videoId. This is the primary data source
// for YT Music endless playback.
export async function getWatchPlaylist(videoId: string, playlistId?: string, limit = 25, radio = false): Promise<any> {
  console.log('[YTMusicApi] Fetching watch playlist for:', videoId, radio ? '(radio)' : '')

  const body: any = {
    enablePersistentPlaylistPanel: true,
    isAudioOnly: true,
    tunerSettingValue: 'AUTOMIX_SETTING_NORMAL'
  }

  if (videoId) {
    body.videoId = videoId
    // Generate radio playlist if requested
    if (radio) {
      body.playlistId = `RDAMVM${videoId}`
    } else if (playlistId) {
      body.playlistId = playlistId
    }
  }

  const data = await innertubeRequest('next', body)

  const result: any = {
    tracks: [],
    playlistId: null,
    lyrics: null,
    related: null
  }

  try {
    // Extract the watch next renderer
    const watchNext = data?.contents?.singleColumnMusicWatchNextResultsRenderer?.tabbedRenderer
      ?.watchNextTabbedResultsRenderer?.tabs || []

    // Tab 0: Up Next / Autoplay tracks
    const upNextTab = watchNext[0]?.tabRenderer?.content?.musicQueueRenderer
    const playlistPanel = upNextTab?.content?.playlistPanelRenderer

    if (playlistPanel) {
      result.playlistId = playlistPanel.playlistId || null

      for (const item of (playlistPanel.contents || [])) {
        const renderer = item?.playlistPanelVideoRenderer
        if (!renderer) continue

        const title = nav(renderer, ['title', 'runs', '0', 'text']) || ''
        const vid = renderer.videoId || nav(renderer, ['navigationEndpoint', 'watchEndpoint', 'videoId']) || ''
        const lengthText = nav(renderer, ['lengthText', 'runs', '0', 'text']) || ''

        // Parse artists from longBylineText
        const bylineRuns = nav(renderer, ['longBylineText', 'runs']) || []
        const artists: any[] = []
        let album: any = null
        for (const run of bylineRuns) {
          const browseId = nav(run, ['navigationEndpoint', 'browseEndpoint', 'browseId'], true)
          if (browseId) {
            if (browseId.startsWith('MPRE')) {
              album = { name: run.text, id: browseId }
            } else if (browseId.startsWith('UC')) {
              artists.push({ name: run.text, id: browseId })
            }
          }
        }
        if (artists.length === 0 && bylineRuns.length > 0) {
          artists.push({ name: bylineRuns[0]?.text || 'Unknown', id: '' })
        }

        // Parse duration
        const durationParts = lengthText.split(':').map(Number)
        let durationSeconds = 0
        if (durationParts.length === 2) durationSeconds = durationParts[0] * 60 + durationParts[1]
        else if (durationParts.length === 3) durationSeconds = durationParts[0] * 3600 + durationParts[1] * 60 + durationParts[2]

        const thumbnails = nav(renderer, ['thumbnail', 'thumbnails']) || []
        const imageUrl = proxyThumbnail(thumbnails.length > 0 ? thumbnails[thumbnails.length - 1]?.url : '')

        result.tracks.push({
          type: 'song',
          title,
          videoId: vid,
          artists,
          album,
          duration: lengthText,
          durationMs: durationSeconds * 1000,
          durationSeconds,
          thumbnails,
          imageUrl,
          id: vid
        })
      }
    }

    // Tab 1: Lyrics browseId
    if (watchNext[1]) {
      const lyricsEndpoint = nav(watchNext, ['1', 'tabRenderer', 'endpoint', 'browseEndpoint', 'browseId'], true)
      result.lyrics = lyricsEndpoint || null
    }

    // Tab 2: Related browseId (used for get_song_related)
    if (watchNext[2]) {
      const relatedEndpoint = nav(watchNext, ['2', 'tabRenderer', 'endpoint', 'browseEndpoint', 'browseId'], true)
      result.related = relatedEndpoint || null
    }
  } catch (e) {
    console.error('[YTMusicApi] Error parsing watch playlist:', e)
  }

  console.log(`[YTMusicApi] Watch playlist: ${result.tracks.length} tracks, related: ${result.related}`)
  return result
}

// --- Song Related Content ---
// Matches ytmusicapi Python get_song_related: browses the "Related" tab content
// Returns sections like "You might also like", "Recommended playlists", "Similar artists"
export async function getSongRelated(browseId: string): Promise<any[]> {
  console.log('[YTMusicApi] Fetching song related:', browseId)

  const data = await innertubeRequest('browse', { browseId })
  const sections: any[] = []

  try {
    const contents = data?.contents?.sectionListRenderer?.contents || []

    for (const section of contents) {
      const shelf = section?.musicCarouselShelfRenderer || section?.musicDescriptionShelfRenderer

      if (section?.musicDescriptionShelfRenderer) {
        // "About the artist" text section
        const desc = section.musicDescriptionShelfRenderer
        const title = nav(desc, ['header', 'musicCarouselShelfBasicHeaderRenderer', 'title', 'runs', '0', 'text']) ||
                      nav(desc, ['header', 'runs', '0', 'text']) || 'About'
        sections.push({
          title,
          contents: nav(desc, ['description', 'runs', '0', 'text']) || ''
        })
        continue
      }

      if (!shelf) continue

      const header = shelf.header?.musicCarouselShelfBasicHeaderRenderer
      const title = header?.title?.runs?.[0]?.text || 'Related'

      const items: any[] = []
      for (const item of (shelf.contents || [])) {
        const twoRow = item?.musicTwoRowItemRenderer
        if (twoRow) {
          const parsed = extractItemFromRenderer(twoRow)
          if (parsed) items.push(parsed)
          continue
        }
        const listItem = item?.musicResponsiveListItemRenderer
        if (listItem) {
          const parsed = parseFlatSong(listItem)
          if (parsed) items.push(parsed)
        }
      }

      if (items.length > 0) {
        sections.push({ title, contents: items })
      }
    }
  } catch (e) {
    console.error('[YTMusicApi] Error parsing song related:', e)
  }

  console.log(`[YTMusicApi] Song related: ${sections.length} sections`)
  return sections
}

