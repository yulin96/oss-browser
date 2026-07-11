import type { OssBrowserApi } from '../shared/types'

declare global {
  interface Window {
    ossBrowser: OssBrowserApi
  }
}
