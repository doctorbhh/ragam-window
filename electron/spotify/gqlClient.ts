// electron/spotify/gqlClient.ts
// GraphQL client using persisted queries from sonic-liberation

import { net } from 'electron';
import { spotifyAuth } from '../spotifyAuth';

const GQL_ENDPOINT = 'https://api-partner.spotify.com/pathfinder/v1/query';
const API_ENDPOINT = 'https://api.spotify.com/v1';

// Persisted Query Hashes from sonic-liberation
const HASHES = {
  profileAttributes: '53bcb064f6cd18c23f752bc324a791194d20df612d8e1239c735144ab0399ced',
  fetchLibraryTracks: '087278b20b743578a6262c2b0b4bcd20d879c503cc359a2285baf083ef944240',
  libraryV3: '2de10199b2441d6e4ae875f27d2db361020c399fb10b03951120223fbed10b08',
  fetchPlaylist: 'bb67e0af06e8d6f52b531f97468ee4acd44cd0f82b988e15c2ea47b1148efc77',
  getAlbum: 'b9bfabef66ed756e5e13f68a942deb60bd4125ec1f1be8cc42769dc0259b4b10',
  getTrack: '612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294',
  queryArtistOverview: '446130b4a0aa6522a686aafccddb0ae849165b5e0436fd802f96e0243617b5d8',
  searchDesktop: '4801118d4a100f756e833d33984436a3899cff359c532f8fd3aaf174b60b3b49',
  searchTracks: 'bc1ca2fcd0ba1013a0fc88e6cc4f190af501851e3dafd3e1ef85840297694428',
  searchAlbums: 'a71d2c993fc98e1c880093738a55a38b57e69cc4ce5a8c113e6c5920f9513ee2',
  isCurated: 'e4ed1f91a2cc5415befedb85acf8671dc1a4bf3ca1a5b945a6386101a22e28a6',
  addToLibrary: 'a3c1ff58e6a36fec5fe1e3a193dc95d9071d96b9ba53c5ba9c1494fb1ee73915',
  removeFromLibrary: 'a3c1ff58e6a36fec5fe1e3a193dc95d9071d96b9ba53c5ba9c1494fb1ee73915',
  home: 'd62af2714f2623c923cc9eeca4b9545b4363abaa9188a9e94e2b63b823419a2c',
};

// Helper to make GraphQL requests using Electron's net module
async function gqlRequest(operationName: string, hash: string, variables: any = {}): Promise<any> {
  const accessToken = spotifyAuth.accessToken;
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  const body = JSON.stringify({
    variables,
    operationName,
    extensions: {
      persistedQuery: {
        version: 1,
        sha256Hash: hash
      }
    }
  });

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      url: GQL_ENDPOINT,
    });

    // Browser spoofing headers - Critical for avoiding 429s
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    request.setHeader('Authorization', `Bearer ${accessToken}`);
    request.setHeader('Content-Type', 'application/json');
    request.setHeader('Accept', 'application/json');
    request.setHeader('Origin', 'https://open.spotify.com');
    request.setHeader('Referer', 'https://open.spotify.com/');
    request.setHeader('Sec-Fetch-Dest', 'empty');
    request.setHeader('Sec-Fetch-Mode', 'cors');
    request.setHeader('Sec-Fetch-Site', 'same-site');
    request.setHeader('app-platform', 'WebPlayer');
    request.setHeader('spotify-app-version', '1.2.30.290.g183057e9');

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          const data = JSON.parse(responseData);
          if (data.errors) {
            console.error('[GQL] Error:', data.errors[0]?.message);
            reject(new Error(data.errors[0]?.message || 'GraphQL error'));
          } else {
            resolve(data);
          }
        } catch (e) {
          reject(new Error('Failed to parse GraphQL response'));
        }
      });
    });

    request.on('error', reject);
    request.write(body);
    request.end();
  });
}

// Helper to make REST API requests (fallback for some endpoints)
async function apiRequest(endpoint: string, retries = 3): Promise<any> {
  const accessToken = spotifyAuth.accessToken;
  if (!accessToken) {
    throw new Error('Not authenticated');
  }

  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'GET',
      url: `${API_ENDPOINT}${endpoint}`,
    });

    // Browser spoofing headers
    request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    request.setHeader('Authorization', `Bearer ${accessToken}`);
    request.setHeader('Accept', 'application/json');
    request.setHeader('Origin', 'https://open.spotify.com');
    request.setHeader('Referer', 'https://open.spotify.com/');
    request.setHeader('Sec-Fetch-Dest', 'empty');
    request.setHeader('Sec-Fetch-Mode', 'cors');
    request.setHeader('Sec-Fetch-Site', 'same-site');
    request.setHeader('app-platform', 'WebPlayer');
    request.setHeader('spotify-app-version', '1.2.30.290.g183057e9');

    let responseData = '';

    request.on('response', (response) => {
      response.on('data', (chunk) => {
        responseData += chunk.toString();
      });

      response.on('end', () => {
        try {
          if (response.statusCode === 429 && retries > 0) {
             const retryAfter = parseInt(response.headers['retry-after'] as string || '1', 10);
             console.warn(`[API] Rate Limited (429). Retrying after ${retryAfter}s...`);
             setTimeout(() => {
                 apiRequest(endpoint, retries - 1).then(resolve).catch(reject);
             }, retryAfter * 1000);
             return;
          }

          const data = JSON.parse(responseData);
          if (data.error) { // Handle { error: { status: 429, ... } }
             if (data.error.status === 429 && retries > 0) {
                 console.warn(`[API] Rate Limited (JSON 429). Retrying...`);
                 setTimeout(() => {
                     apiRequest(endpoint, retries - 1).then(resolve).catch(reject);
                 }, 2000);
                 return;
             }
             console.error('[API] Request failed:', data.error);
             reject(new Error(data.error.message || `API Error ${data.error.status}`));
             return;
          }
          resolve(data);
        } catch (e) {
          reject(new Error('Failed to parse API response'));
        }
      });
    });

    request.on('error', (err) => {
       console.error('[API] Network Error:', err);
       reject(err);
    });
    request.end();
  });
}

// ============ USER ENDPOINTS ============

export async function getMe() {
  const result = await gqlRequest('profileAttributes', HASHES.profileAttributes, {});
  const user = result.data?.me?.profile;
  if (!user) throw new Error('Failed to get user profile');

  const userId = user.uri?.split(':').pop();
  return {
    id: userId,
    display_name: user.name,
    email: 'unknown',
    images: user.avatar?.sources || [],
    uri: user.uri,
    external_urls: { spotify: `https://open.spotify.com/user/${userId}` },
    type: 'user'
  };
}

export async function getSavedTracks(offset = 0, limit = 20) {
  const result = await gqlRequest('fetchLibraryTracks', HASHES.fetchLibraryTracks, { offset, limit });
  const library = result.data?.me?.library;
  if (!library) throw new Error('Failed to get saved tracks');

  const tracks = library.tracks?.items?.map((item: any) => {
    const track = item.track?.data;
    if (!track) return null;

    const id = item.track?._uri?.split(':').pop();
    const artists = track.artists?.items?.map((artist: any) => {
      const artistId = artist.uri?.split(':').pop();
      return {
        id: artistId,
        name: artist.profile?.name,
        uri: artist.uri,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];

    const albumId = track.albumOfTrack?.uri?.split(':').pop();
    
    // Duration from GraphQL response
    const trackDuration = track.duration?.totalMilliseconds || 0;

    return {
      track: {
        id,
        name: track.name,
        uri: `spotify:track:${id}`,
        duration_ms: trackDuration,
        artists,
        album: {
          id: albumId,
          name: track.albumOfTrack?.name,
          images: track.albumOfTrack?.coverArt?.sources || [],
          external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
        },
        external_urls: { spotify: `https://open.spotify.com/track/${id}` }
      }
    };
  }).filter(Boolean) || [];

  return {
    items: tracks,
    total: library.tracks?.totalCount || 0,
    offset,
    limit,
    next: tracks.length === limit ? `offset=${offset + limit}` : null
  };
}

export async function getSavedPlaylists(offset = 0, limit = 20) {
  const result = await gqlRequest('libraryV3', HASHES.libraryV3, {
    filters: ['Playlists'],
    order: null,
    textFilter: '',
    features: ['LIKED_SONGS', 'YOUR_EPISODES_V2', 'PRERELEASES', 'EVENTS'],
    limit,
    offset,
    flatten: false,
    expandedFolders: [],
    folderUri: null,
    includeFoldersWhenFlattening: true
  });

  const libraryData = result.data?.me?.libraryV3;
  if (!libraryData) throw new Error('Failed to get playlists');

  const items = libraryData.items
    ?.filter((item: any) =>
      item.item?.__typename === 'PlaylistResponseWrapper' &&
      item.item?.data?.__typename === 'Playlist'
    )
    .map((item: any) => {
      const id = item.item?._uri?.split(':').pop();
      const playlist = item.item?.data;
      const owner = playlist?.ownerV2?.data;

      return {
        id,
        name: playlist?.name,
        description: playlist?.description,
        images: playlist?.images?.items?.flatMap((img: any) => img.sources) || [],
        uri: item.item?._uri,
        external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
        owner: {
          id: owner?.id,
          display_name: owner?.name,
          uri: owner?.uri,
          images: owner?.avatar?.sources || []
        },
        tracks: { total: 0 } // Will be filled when fetching playlist details
      };
    }) || [];

  return {
    items,
    total: libraryData.totalCount || 0,
    offset: libraryData.pagingInfo?.offset || offset,
    limit: libraryData.pagingInfo?.limit || limit
  };
}

// ============ PLAYLIST ENDPOINTS ============

export async function getPlaylist(playlistId: string) {
  const result = await gqlRequest('fetchPlaylist', HASHES.fetchPlaylist, {
    uri: `spotify:playlist:${playlistId}`,
    offset: 0,
    limit: 25,
    enableWatchFeedEntrypoint: true
  });

  const playlist = result.data?.playlistV2;
  if (!playlist) throw new Error('Failed to get playlist');

  const owner = playlist.ownerV2?.data;
  
  return {
    id: playlistId,
    name: playlist.name,
    description: playlist.description,
    collaborative: (playlist.members?.items?.length || 0) > 1,
    public: true,
    images: playlist.images?.items?.[0]?.sources || [],
    uri: `spotify:playlist:${playlistId}`,
    external_urls: { spotify: `https://open.spotify.com/playlist/${playlistId}` },
    owner: {
      id: owner?.uri?.split(':').pop(),
      display_name: owner?.name,
      uri: owner?.uri,
      images: owner?.avatar?.sources || []
    },
    followers: playlist.followers,
    tracks: {
      total: playlist.content?.totalCount || 0
    }
  };
}

export async function getPlaylistTracks(playlistId: string, offset = 0, limit = 25) {
  const result = await gqlRequest('fetchPlaylist', HASHES.fetchPlaylist, {
    uri: `spotify:playlist:${playlistId}`,
    offset,
    limit,
    enableWatchFeedEntrypoint: false
  });

  const playlist = result.data?.playlistV2;
  if (!playlist) throw new Error('Failed to get playlist tracks');

 
  const tracks = playlist.content?.items?.map((trackWrapper: any) => {
    const item = trackWrapper.itemV2?.data;
    if (!item) return null;

    // Debug duration path
    if (Math.random() < 0.05) { // Log only a few
       console.log('[GQL] Playlist Track Item Keys:', Object.keys(item));
       console.log('[GQL] Playlist Track Duration:', JSON.stringify(item.duration));
    }

    const trackId = item.uri?.split(':').pop();
    const trackArtists = item.artists?.items?.map((artist: any) => {
      const artistId = artist.uri?.split(':').pop();
      return {
        id: artistId,
        uri: artist.uri,
        name: artist.profile?.name,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];

    const albumId = item.albumOfTrack?.uri?.split(':').pop();

    const durationMs = item.duration?.totalMilliseconds || 
                       item.trackDuration?.totalMilliseconds || 
                       0;

    return {
      id: trackId,
      uri: item.uri,
      name: item.name,
      album: {
        album_type: 'album',
        id: albumId,
        name: item.albumOfTrack?.name,
        images: item.albumOfTrack?.coverArt?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
        artists: [trackArtists[0]]
      },
      artists: trackArtists,
      duration_ms: durationMs,
      external_urls: { spotify: `https://open.spotify.com/track/${trackId}` }
    };
  }).filter(Boolean) || [];

  return {
    items: tracks.map((track: any) => ({ track })), 
    total: playlist.content?.totalCount || 0,
    offset,
    limit,
    next: tracks.length === limit ? `offset=${offset + limit}` : null
  };
}

// ============ SEARCH ENDPOINTS ============

export async function searchAll(query: string, offset = 0, limit = 10) {
  const result = await gqlRequest('searchDesktop', HASHES.searchDesktop, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 5,
    includeAudiobooks: false,
    includeArtistHasConcertsField: false,
    includePreReleases: false,
    includeLocalConcertsField: false,
    includeAuthors: false
  });

  const searchData = result.data?.searchV2;
  if (!searchData) throw new Error('Search failed');

  return {
    tracks: convertSearchTracks(searchData.tracksV2?.items || []),
    albums: convertSearchAlbums(searchData.albumsV2?.items || []),
    artists: convertSearchArtists(searchData.artists?.items || []),
    playlists: convertSearchPlaylists(searchData.playlists?.items || [])
  };
}

export async function searchTracks(query: string, offset = 0, limit = 20) {
  const result = await gqlRequest('searchTracks', HASHES.searchTracks, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: true,
    includeAuthors: false,
    includePreReleases: false
  });

  const searchData = result.data?.searchV2?.tracksV2;
  if (!searchData) throw new Error('Track search failed');

  return {
    tracks: { items: convertSearchTracks(searchData.items || []) },
    total: searchData.totalCount || 0,
    offset: searchData.pagingInfo?.nextOffset || offset,
    limit: searchData.pagingInfo?.limit || limit
  };
}

export async function searchAlbums(query: string, offset = 0, limit = 20) {
  const result = await gqlRequest('searchAlbums', HASHES.searchAlbums, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: false,
    includeAuthors: false,
    includePreReleases: false
  });

  const searchData = result.data?.searchV2?.albumsV2;
  if (!searchData) throw new Error('Album search failed');

  return {
    albums: { items: convertSearchAlbums(searchData.items || []) },
    total: searchData.totalCount || 0,
    offset: searchData.pagingInfo?.nextOffset || offset,
    limit: searchData.pagingInfo?.limit || limit
  };
}

export async function searchArtists(query: string, offset = 0, limit = 20) {
  const result = await gqlRequest('searchDesktop', HASHES.searchDesktop, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: false,
    includeAuthors: false,
    includePreReleases: false
  });

  const searchData = result.data?.searchV2;
  if (!searchData) throw new Error('Artist search failed');

  return {
    artists: { items: convertSearchArtists(searchData.artists?.items || []) },
    total: searchData.artists?.totalCount || 0,
    offset: offset,
    limit: limit
  };
}

export async function searchPlaylists(query: string, offset = 0, limit = 20) {
  const result = await gqlRequest('searchDesktop', HASHES.searchDesktop, {
    searchTerm: query,
    offset,
    limit,
    numberOfTopResults: 20,
    includeAudiobooks: false,
    includeAuthors: false,
    includePreReleases: false
  });

  const searchData = result.data?.searchV2;
  if (!searchData) throw new Error('Playlist search failed');

  return {
    playlists: { items: convertSearchPlaylists(searchData.playlists?.items || []) },
    total: searchData.playlists?.totalCount || 0,
    offset: offset,
    limit: limit
  };
}

// ============ ALBUM ENDPOINTS ============

export async function getAlbum(albumId: string) {
  const result = await gqlRequest('getAlbum', HASHES.getAlbum, {
    uri: `spotify:album:${albumId}`,
    locale: '',
    offset: 0,
    limit: 50
  });

  const album = result.data?.albumUnion;
  if (!album) {
    console.error('[GQL] getAlbum returned null');
    throw new Error('Failed to get album');
  }

  const artists = album.artists?.items?.map((artist: any) => {
      const id = artist.uri?.split(':').pop();
      return {
          id,
          uri: artist.uri,
          name: artist.profile?.name,
          external_urls: { spotify: `https://open.spotify.com/artist/${id}` },
          images: artist.visuals?.avatarImage?.sources || []
      }
  }) || [];

  // Map tracks similar to getAlbumTracks logic
  const tracksV2 = album.tracksV2?.items || [];
  const tracks = tracksV2.map((item: any) => {
      const track = item.track;
      const trackId = track.uri?.split(':').pop();
      
      const trackArtists = track.artists?.items?.map((artist: any) => {
          const id = artist.uri?.split(':').pop();
          return {
              id,
              uri: artist.uri,
              name: artist.profile?.name,
              external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
          };
      }) || [];

      return {
          id: trackId,
          uri: track.uri,
          name: track.name,
          duration_ms: track.duration?.totalMilliseconds,
          explicit: track.contentRating?.label === 'EXPLICIT',
          artists: trackArtists,
          album: {
            id: albumId,
            name: album.name,
            images: album.coverArt?.sources || [],
            external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
          },
          external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
          externalUri: `https://open.spotify.com/track/${trackId}` // Compat
      };
  });

  return {
    id: albumId,
    name: album.name,
    album_type: album.type?.toLowerCase(),
    label: album.label,
    release_date: album.date?.isoString,
    release_date_precision: album.date?.precision || 'day',
    images: album.coverArt?.sources || [],
    artists,
    external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
    externalUri: `https://open.spotify.com/album/${albumId}`, // Compat
    copyrights: album.copyrights?.copyright || [],
    tracks: {
        items: tracks,
        total: album.tracksV2?.totalCount || 0
    }
  };
}

export async function getAlbumTracks(albumId: string, offset = 0, limit = 50) {
  const result = await gqlRequest('getAlbum', HASHES.getAlbum, {
    uri: `spotify:album:${albumId}`,
    locale: '',
    offset,
    limit
  });

  const album = result.data?.albumUnion;
  if (!album) throw new Error('Failed to get album tracks');

  const tracksV2 = album.tracksV2?.items || [];

  // Construct minimal album object for tracks
  const trackAlbum = {
      id: albumId,
      name: album.name,
      images: album.coverArt?.sources || [],
      external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
  };

  const tracks = tracksV2.map((item: any) => {
      const track = item.track;
      const trackId = track.uri?.split(':').pop();
      
      const trackArtists = track.artists?.items?.map((artist: any) => {
          const id = artist.uri?.split(':').pop();
          return {
              id,
              uri: artist.uri,
              name: artist.profile?.name,
              external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
          };
      }) || [];

      return {
          id: trackId,
          uri: track.uri,
          name: track.name,
          duration_ms: track.duration?.totalMilliseconds,
          explicit: track.contentRating?.label === 'EXPLICIT',
          artists: trackArtists,
          album: trackAlbum,
          external_urls: { spotify: `https://open.spotify.com/track/${trackId}` },
          externalUri: `https://open.spotify.com/track/${trackId}` // Compat
      };
  });

  return {
    items: tracks,
    total: album.tracksV2?.totalCount || 0,
    offset,
    limit,
    next: tracks.length < limit ? null : `offset=${offset + limit}`
  };
}

// ============ ARTIST ENDPOINTS ============

export async function getArtist(artistId: string) {
  const result = await gqlRequest('queryArtistOverview', HASHES.queryArtistOverview, {
    uri: `spotify:artist:${artistId}`,
    locale: ''
  });

  const artist = result.data?.artistUnion;
  if (!artist) throw new Error('Failed to get artist');

  return {
    id: artistId,
    name: artist.profile?.name,
    uri: `spotify:artist:${artistId}`,
    images: artist.visuals?.avatarImage?.sources || [],
    followers: { total: artist.stats?.followers || 0 },
    external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
  };
}

export async function getArtistTopTracks(artistId: string) {
  const result = await gqlRequest('queryArtistOverview', HASHES.queryArtistOverview, {
    uri: `spotify:artist:${artistId}`,
    locale: ''
  });

  const artist = result.data?.artistUnion;
  if (!artist) throw new Error('Failed to get artist top tracks');

  const tracks = artist.discography?.topTracks?.items?.map((item: any) => {
    const track = item.track;
    if (!track) return null;

    const id = track.uri?.split(':').pop();
    const artists = track.artists?.items?.map((a: any) => {
      const artistId = a.uri?.split(':').pop();
      return {
        id: artistId,
        name: a.profile?.name,
        uri: a.uri,
        external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
      };
    }) || [];

    const albumId = track.albumOfTrack?.uri?.split(':').pop();

    return {
      id,
      name: track.name,
      uri: track.uri,
      duration_ms: track.duration?.totalMilliseconds,
      artists,
      album: {
        id: albumId,
        name: track.albumOfTrack?.name,
        images: track.albumOfTrack?.coverArt?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
      },
      external_urls: { spotify: `https://open.spotify.com/track/${id}` }
    };
  }).filter(Boolean) || [];

  return { tracks };
}

export async function getRelatedArtists(artistId: string) {
  const result = await gqlRequest('queryArtistOverview', HASHES.queryArtistOverview, {
    uri: `spotify:artist:${artistId}`,
    locale: ''
  });

  const artist = result.data?.artistUnion;
  if (!artist) throw new Error('Failed to get related artists');

  const related = artist.relatedContent?.relatedArtists?.items?.map((item: any) => {
    const id = item.uri?.split(':').pop();
    return {
      id,
      name: item.profile?.name,
      uri: item.uri,
      images: item.visuals?.avatarImage?.sources || [],
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
    };
  }).filter(Boolean) || [];

  return { artists: related };
}

// ============ TRACK ENDPOINTS ============

export async function getTrack(trackId: string) {
  const result = await gqlRequest('getTrack', HASHES.getTrack, {
    uri: `spotify:track:${trackId}`
  });

  const track = result.data?.trackUnion;
  if (!track) throw new Error('Failed to get track');

  const allArtists = [
    ...(track.firstArtist?.items || []),
    ...(track.otherArtists?.items || [])
  ];

  const artists = allArtists.map((artist: any) => {
    const id = artist.uri?.split(':').pop();
    return {
      id,
      name: artist.profile?.name,
      uri: artist.uri,
      external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
    };
  });

  const albumId = track.albumOfTrack?.uri?.split(':').pop();

  return {
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration?.totalMilliseconds,
    artists,
    album: {
      id: albumId || track.albumOfTrack?.id,
      name: track.albumOfTrack?.name,
      images: track.albumOfTrack?.coverArt?.sources || [],
      album_type: track.albumOfTrack?.type?.toLowerCase(),
      release_date: track.albumOfTrack?.date?.isoString,
      external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
    },
    external_urls: { spotify: `https://open.spotify.com/track/${track.id}` }
  };
}

// ============ LIBRARY MANAGEMENT ============

export async function checkSavedTracks(trackIds: string[]) {
  const result = await gqlRequest('isCurated', HASHES.isCurated, {
    uris: trackIds.map(id => `spotify:track:${id}`)
  });

  const lookup = result.data?.lookup || [];
  return lookup
    .filter((item: any) => item.data?.__typename === 'Track')
    .map((item: any) => item.data?.isCurated || false);
}

export async function saveTracks(trackIds: string[]) {
  return gqlRequest('addToLibrary', HASHES.addToLibrary, {
    uris: trackIds.map(id => `spotify:track:${id}`)
  });
}

export async function removeTracks(trackIds: string[]) {
  return gqlRequest('removeFromLibrary', HASHES.removeFromLibrary, {
    uris: trackIds.map(id => `spotify:track:${id}`)
  });
}

// ============ RECOMMENDATIONS ============

export async function getRecommendations(seeds: { seed_tracks?: string[], seed_artists?: string[], seed_genres?: string[] }, limit = 10) {
  // Build query params
  const params = new URLSearchParams();
  if (seeds.seed_tracks && seeds.seed_tracks.length > 0) {
    params.append('seed_tracks', seeds.seed_tracks.join(','));
  }
  if (seeds.seed_artists && seeds.seed_artists.length > 0) {
    params.append('seed_artists', seeds.seed_artists.join(','));
  }
  if (seeds.seed_genres && seeds.seed_genres.length > 0) {
    params.append('seed_genres', seeds.seed_genres.join(','));
  }
  params.append('limit', limit.toString());

  // Use REST API (no GraphQL hash available for recommendations)
  const result = await apiRequest(`/recommendations?${params.toString()}`);
  
  if (!result.tracks) {
    throw new Error('Failed to get recommendations');
  }

  // Convert to standard track format
  return result.tracks.map((track: any) => ({
    id: track.id,
    name: track.name,
    uri: track.uri,
    duration_ms: track.duration_ms,
    artists: track.artists.map((artist: any) => ({
      id: artist.id,
      name: artist.name,
      uri: artist.uri,
      external_urls: artist.external_urls
    })),
    album: {
      id: track.album.id,
      name: track.album.name,
      images: track.album.images,
      external_urls: track.album.external_urls
    },
    external_urls: track.external_urls
  }));
}

// ============ BROWSE/HOME ENDPOINTS ============

export async function getHome(timeZone = 'Asia/Kolkata', limit = 20) {
  const result = await gqlRequest('home', HASHES.home, {
    timeZone,
    sp_t: '',
    facet: '',
    sectionItemsLimit: limit
  });

  const homeData = result.data?.home;
  if (!homeData) return [];

  const sections = homeData.sectionContainer?.sections?.items || [];

  return sections
    .filter((section: any) =>
      section.data?.__typename === 'HomeGenericSectionData' &&
      section.sectionItems?.items?.length > 0
    )
    .map((section: any) => {
      const id = section.uri?.split(':').pop();

      const items = section.sectionItems?.items
        ?.map((item: any) => {
          const wrapperType = item.content?.__typename;
          const contentType = item.content?.data?.__typename;

          if (wrapperType === 'PlaylistResponseWrapper' && contentType === 'Playlist') {
            const playlist = item.content.data;
            const playlistId = playlist.uri?.split(':').pop();
            const owner = playlist.ownerV2?.data;

            return {
              type: 'playlist',
              id: playlistId,
              name: playlist.name,
              description: playlist.description,
              images: playlist.images?.items?.flatMap((img: any) => img.sources) || [],
              uri: playlist.uri,
              external_urls: { spotify: `https://open.spotify.com/playlist/${playlistId}` },
              owner: {
                id: owner?.uri?.split(':').pop(),
                display_name: owner?.name
              }
            };
          } else if (wrapperType === 'AlbumResponseWrapper' && contentType === 'Album') {
            const album = item.content.data;
            const albumId = album.uri?.split(':').pop();

            return {
              type: 'album',
              id: albumId,
              name: album.name,
              album_type: album.albumType?.toLowerCase(),
              images: album.coverArt?.sources || [],
              uri: album.uri,
              external_urls: { spotify: `https://open.spotify.com/album/${albumId}` },
              artists: album.artists?.items?.map((artist: any) => ({
                id: artist.uri?.split(':').pop(),
                name: artist.profile?.name
              })) || []
            };
          } else if (wrapperType === 'ArtistResponseWrapper' && contentType === 'Artist') {
            const artist = item.content.data;
            const artistId = artist.uri?.split(':').pop();

            return {
              type: 'artist',
              id: artistId,
              name: artist.profile?.name,
              images: artist.visuals?.avatarImage?.sources || [],
              uri: artist.uri,
              external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
            };
          }

          return null;
        })
        .filter(Boolean) || [];

      return {
        id,
        title: section.data?.title?.transformedLabel || 'Section',
        items
      };
    })
    .filter((section: any) => section.items?.length > 0);
}

// ============ CONVERTERS ============

function convertSearchTracks(items: any[]) {
  return items
    .filter(item =>
      item.item?.__typename === 'TrackResponseWrapper' &&
      item.item?.data?.__typename === 'Track'
    )
    .map(item => {
      const track = item.item.data;
      const id = track.uri?.split(':').pop();
      const artists = track.artists?.items?.map((artist: any) => {
        const artistId = artist.uri?.split(':').pop();
        return {
          id: artistId,
          name: artist.profile?.name,
          uri: artist.uri,
          external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
        };
      }) || [];

      const albumId = track.albumOfTrack?.uri?.split(':').pop();

      return {
        id,
        name: track.name,
        uri: track.uri,
        duration_ms: track.duration?.totalMilliseconds,
        artists,
        album: {
          id: albumId,
          name: track.albumOfTrack?.name,
          images: track.albumOfTrack?.coverArt?.sources || [],
          external_urls: { spotify: `https://open.spotify.com/album/${albumId}` }
        },
        external_urls: { spotify: `https://open.spotify.com/track/${id}` }
      };
    });
}

function convertSearchAlbums(items: any[]) {
  return items
    .filter(item =>
      item.__typename === 'AlbumResponseWrapper' &&
      item.data?.__typename === 'Album'
    )
    .map(item => {
      const album = item.data;
      const id = album.uri?.split(':').pop();
      const artists = album.artists?.items?.map((artist: any) => {
        const artistId = artist.uri?.split(':').pop();
        return {
          id: artistId,
          name: artist.profile?.name,
          uri: artist.uri,
          external_urls: { spotify: `https://open.spotify.com/artist/${artistId}` }
        };
      }) || [];

      return {
        id,
        name: album.name,
        album_type: album.type?.toLowerCase(),
        images: album.coverArt?.sources || [],
        artists,
        release_date: album.date?.year?.toString(),
        external_urls: { spotify: `https://open.spotify.com/album/${id}` }
      };
    });
}

function convertSearchArtists(items: any[]) {
  return items
    .filter(item =>
      item.__typename === 'ArtistResponseWrapper' &&
      item.data?.__typename === 'Artist'
    )
    .map(item => {
      const artist = item.data;
      const id = artist.uri?.split(':').pop();
      return {
        id,
        name: artist.profile?.name,
        uri: artist.uri,
        images: artist.visuals?.avatarImage?.sources || [],
        external_urls: { spotify: `https://open.spotify.com/artist/${id}` }
      };
    });
}

function convertSearchPlaylists(items: any[]) {
  return items
    .filter(item =>
      item.__typename === 'PlaylistResponseWrapper' &&
      item.data?.__typename === 'Playlist'
    )
    .map(item => {
      const playlist = item.data;
      const id = playlist.uri?.split(':').pop();
      const owner = playlist.ownerV2?.data;
      const ownerId = owner?.uri?.split(':').pop();

      return {
        id,
        name: playlist.name,
        description: playlist.description,
        uri: playlist.uri,
        images: playlist.images?.items?.flatMap((img: any) => img.sources) || [],
        external_urls: { spotify: `https://open.spotify.com/playlist/${id}` },
        owner: {
          id: ownerId,
          display_name: owner?.name,
          uri: owner?.uri
        }
      };
    });
}

export const SpotifyGqlApi = {
  user: {
    me: getMe,
    savedTracks: getSavedTracks,
    savedPlaylists: getSavedPlaylists,
    recentlyPlayed: getRecentlyPlayed
  },
  playlist: {
    get: getPlaylist,
    getTracks: getPlaylistTracks
  },
  album: {
    get: getAlbum,
    getTracks: getAlbumTracks
  },
  artist: {
    get: getArtist,
    getTopTracks: getArtistTopTracks,
    getRelatedArtists: getRelatedArtists
  },
  track: {
    get: getTrack
  },
  search: {
    all: searchAll,
    tracks: searchTracks,
    albums: searchAlbums,
    artists: searchArtists,
    playlists: searchPlaylists
  },
  library: {
    checkSavedTracks,
    saveTracks,
    removeTracks
  },
  browse: {
    home: getHome,
    getRecommendations
  },
  player: {
    // Add player namespace if needed in future
  }
};

export async function getRecentlyPlayed(limit = 50) {
  // Use REST API for recently played (no consistent GraphQL hash)
  const result = await apiRequest(`/me/player/recently-played?limit=${limit}`);
  
  if (!result.items) {
    throw new Error('Failed to get recently played tracks');
  }

  return {
    items: result.items.map((item: any) => ({
      track: {
        id: item.track.id,
        name: item.track.name,
        uri: item.track.uri,
        duration_ms: item.track.duration_ms,
        artists: item.track.artists.map((artist: any) => ({
          id: artist.id,
          name: artist.name,
          uri: artist.uri,
          external_urls: artist.external_urls
        })),
        album: {
          id: item.track.album.id,
          name: item.track.album.name,
          images: item.track.album.images,
          external_urls: item.track.album.external_urls
        },
        external_urls: item.track.external_urls
      },
      played_at: item.played_at
    }))
  };
}

// Re-export with recentlyPlayed added to user namespace for consistency
// OR add to a new namespace. Let's add to 'user' since it's user data.
// SpotifyGqlApi.user.recentlyPlayed assignment removed (added to definition)

