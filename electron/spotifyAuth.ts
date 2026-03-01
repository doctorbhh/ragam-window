// electron/spotifyAuth.ts
// TOTP-based Spotify Authentication - Follows sonic-liberation approach

import { EventEmitter } from 'events';
import { app, net } from 'electron';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';

// Lazy getter — defers app.getPath() until first use (after app.whenReady)
let _sessionFile: string | null = null;
const getSessionFile = () => {
  if (!_sessionFile) {
    _sessionFile = path.join(app.getPath('userData'), 'spotify-session.json');
  }
  return _sessionFile;
};
const NUANCE_URL = 'https://gist.githubusercontent.com/saraansx/a622d4c1a12c36afdcf701201e9482a3/raw/9afe2c9c7d1a5eb3f7a05d0002a94f45b73682d0/nuance.json';

interface SpotifySession {
  spDcCookie: string;
  accessToken: string;
  expiration: number;
  savedAt: number;
}

interface AuthResult {
  success: boolean;
  accessToken?: string;
  expiration?: number;
  error?: string;
}

interface Nuance {
  v: number;
  s: string;
}

export class SpotifyAuthEndpoint extends EventEmitter {
  private _spDc: string | null = null;
  private _accessToken: string | null = null;
  private _expiration: number = 0;
  private _nuance: Nuance | null = null;

  constructor() {
    super();
    this._loadSession();
  }

  get accessToken(): string | null {
    return this._accessToken;
  }

  get expiration(): number {
    return this._expiration;
  }

  get spDc(): string | null {
    return this._spDc;
  }

  private _loadSession(): void {
    try {
      if (fs.existsSync(getSessionFile())) {
        const data = JSON.parse(fs.readFileSync(getSessionFile(), 'utf-8')) as SpotifySession;
        this._spDc = data.spDcCookie;
        this._accessToken = data.accessToken;
        this._expiration = data.expiration;
        
        if (this.isAuthenticated()) {
          console.log('[SpotifyAuth] Recovered session from disk');
          this.emit('recovered');
        }
      }
    } catch (error) {
      console.error('[SpotifyAuth] Failed to load session:', error);
    }
  }

  private _saveSession(): void {
    try {
      const session: SpotifySession = {
        spDcCookie: this._spDc || '',
        accessToken: this._accessToken || '',
        expiration: this._expiration,
        savedAt: Date.now()
      };
      fs.writeFileSync(getSessionFile(), JSON.stringify(session, null, 2));
    } catch (error) {
      console.error('[SpotifyAuth] Failed to save session:', error);
    }
  }

  isAuthenticated(): boolean {
    return !!this._accessToken && this._expiration > Date.now();
  }

  async loginWithSpDc(spDcCookie: string): Promise<AuthResult> {
    try {
      this._spDc = spDcCookie;
      console.log('[SpotifyAuth] Starting TOTP login...');

      // Fetch nuance secret (contains version and secret)
      if (!this._nuance) {
        await this._fetchNuance();
      }

      // Get Spotify server time
      const serverTime = await this._getServerTime();
      
      // Generate TOTP
      const totp = this._generateTotp(serverTime);
      
      console.log(`[SpotifyAuth] Using TOTP v${this._nuance?.v || 0}...`);
      
      // Fetch token with TOTP in URL query params (not header!)
      const result = await this._fetchToken(totp);
      
      if (result.accessToken) {
        this._accessToken = result.accessToken;
        this._expiration = result.accessTokenExpirationTimestampMs || (Date.now() + 3600000);
        this._saveSession();
        this.emit('login', { accessToken: this._accessToken });
        console.log('[SpotifyAuth] Login successful!');
        
        return {
          success: true,
          accessToken: this._accessToken ?? undefined,
          expiration: this._expiration
        };
      } else {
        throw new Error(result.error || 'No access token in response');
      }
    } catch (error: any) {
      console.error('[SpotifyAuth] Login failed:', error.message);
      return { success: false, error: error.message };
    }
  }

  async refreshCredentials(): Promise<AuthResult> {
    if (!this._spDc) {
      return { success: false, error: 'No sp_dc cookie stored' };
    }
    return this.loginWithSpDc(this._spDc);
  }

  logout(): void {
    this._spDc = null;
    this._accessToken = null;
    this._expiration = 0;
    try {
      if (fs.existsSync(getSessionFile())) {
        fs.unlinkSync(getSessionFile());
      }
    } catch {}
    this.emit('logout');
  }

  private async _fetchNuance(): Promise<void> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch(NUANCE_URL, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (!response.ok) {
        throw new Error(`Failed to fetch nuance: ${response.status}`);
      }
      
      const data = await response.json() as any[];
      
      // Sort by version descending and get the latest
      data.sort((a, b) => (b.v || 0) - (a.v || 0));
      const latest = data[0];
      
      if (latest && latest.s) {
        this._nuance = { v: latest.v || 1, s: latest.s };
        console.log(`[SpotifyAuth] Nuance fetched: v${this._nuance.v}`);
      } else {
        throw new Error('Invalid nuance format');
      }
    } catch (error: any) {
      console.warn('[SpotifyAuth] Nuance fetch failed, using fallback:', error.message);
      this._nuance = { v: 5, s: 'GVPZVYTFNAZ27PYEXKQ7X5YAFGC3CHBD' };
    }
  }

  private async _getServerTime(): Promise<number> {
    try {
      const fetch = (await import('node-fetch')).default;
      const response = await fetch('https://open.spotify.com/api/server-time', {
        headers: {
          'Cookie': `sp_dc=${this._spDc}`,
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      
      if (response.ok) {
        const data = await response.json() as any;
        return data.serverTime || Math.floor(Date.now() / 1000);
      }
    } catch {}
    
    return Math.floor(Date.now() / 1000);
  }

  private _generateTotp(serverTimeSeconds: number): string {
    const secret = this._nuance?.s || 'GVPZVYTFNAZ27PYEXKQ7X5YAFGC3CHBD';
    const timeStep = Math.floor(serverTimeSeconds / 30);
    
    // Base32 decode
    const base32Chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let bits = '';
    for (const char of secret.toUpperCase()) {
      const idx = base32Chars.indexOf(char);
      if (idx >= 0) {
        bits += idx.toString(2).padStart(5, '0');
      }
    }
    const keyBytes = Buffer.alloc(Math.floor(bits.length / 8));
    for (let i = 0; i < keyBytes.length; i++) {
      keyBytes[i] = parseInt(bits.substring(i * 8, (i + 1) * 8), 2);
    }

    // Create HMAC-SHA1
    const timeBuffer = Buffer.alloc(8);
    timeBuffer.writeBigInt64BE(BigInt(timeStep));
    
    const hmac = crypto.createHmac('sha1', keyBytes);
    hmac.update(timeBuffer);
    const hash = hmac.digest();

    // Dynamic truncation
    const offset = hash[hash.length - 1] & 0x0f;
    const code = ((hash[offset] & 0x7f) << 24) |
                 ((hash[offset + 1] & 0xff) << 16) |
                 ((hash[offset + 2] & 0xff) << 8) |
                 (hash[offset + 3] & 0xff);

    return (code % 1000000).toString().padStart(6, '0');
  }

  private async _fetchToken(totp: string): Promise<any> {
    // Use sonic-liberation's approach: TOTP in URL query params
    const totpVer = this._nuance?.v || 5;
    const url = `https://open.spotify.com/api/token?reason=transport&productType=web-player&totp=${totp}&totpServer=${totp}&totpVer=${totpVer}`;
    
    console.log(`[SpotifyAuth] Fetching token from: /api/token?...totpVer=${totpVer}`);
    
    return new Promise((resolve, reject) => {
      const request = net.request({
        method: 'GET',
        url,
        useSessionCookies: false
      });
      
      request.setHeader('Cookie', `sp_dc=${this._spDc}`);
      request.setHeader('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
      request.setHeader('Accept', 'application/json');
      request.setHeader('Accept-Language', 'en-US,en;q=0.9');
      request.setHeader('Referer', 'https://open.spotify.com/');
      request.setHeader('Origin', 'https://open.spotify.com');
      
      let responseData = '';
      
      request.on('response', (response) => {
        if (response.statusCode !== 200) {
          let errorText = '';
          response.on('data', (chunk) => {
            errorText += chunk.toString();
          });
          response.on('end', () => {
            console.error('[SpotifyAuth] Token error:', response.statusCode, errorText.substring(0, 200));
            reject(new Error(`Token fetch failed: HTTP ${response.statusCode}`));
          });
          return;
        }
        
        response.on('data', (chunk) => {
          responseData += chunk.toString();
        });
        
        response.on('end', () => {
          try {
            const data = JSON.parse(responseData);
            if (data.accessToken) {
              console.log('[SpotifyAuth] Got access token, length:', data.accessToken.length);
            }
            resolve(data);
          } catch (e) {
            reject(new Error('Failed to parse token response'));
          }
        });
      });
      
      request.on('error', (error) => {
        reject(error);
      });
      
      request.end();
    });
  }
}

// Singleton instance
export const spotifyAuth = new SpotifyAuthEndpoint();
