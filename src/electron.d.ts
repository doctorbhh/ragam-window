export {}

declare global {
  interface Window {
    electron: {
      login: () => Promise<{ accessToken: string; accessTokenExpirationTimestampMs: number }>
    }
  }
}
