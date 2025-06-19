// Environment configuration
export const env = {
  admin: import.meta.env.VITE_ADMIN,
  pds: import.meta.env.VITE_PDS,
  collection: import.meta.env.VITE_COLLECTION,
  handleList: (() => {
    try {
      return JSON.parse(import.meta.env.VITE_HANDLE_LIST || '[]')
    } catch {
      return []
    }
  })(),
  oauth: {
    clientId: import.meta.env.VITE_OAUTH_CLIENT_ID,
    redirectUri: import.meta.env.VITE_OAUTH_REDIRECT_URI
  }
}