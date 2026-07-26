import { app, type BrowserWindow, type Rectangle } from 'electron'
import { join } from 'node:path'
import { readJsonFile, writeJsonFileAtomic } from './atomic-json-file'

export interface WindowState {
  bounds: Rectangle
  maximized: boolean
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isWindowState(value: unknown): value is WindowState {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const state = value as Partial<WindowState>
  const bounds = state.bounds
  return (
    !!bounds &&
    isFiniteNumber(bounds.x) &&
    isFiniteNumber(bounds.y) &&
    isFiniteNumber(bounds.width) &&
    isFiniteNumber(bounds.height) &&
    bounds.width > 0 &&
    bounds.height > 0 &&
    typeof state.maximized === 'boolean'
  )
}

export class WindowStateStore {
  private get path(): string {
    return join(app.getPath('userData'), 'window-state.json')
  }

  async load(): Promise<WindowState | undefined> {
    const stored = await readJsonFile(this.path)
    if (stored === undefined) return undefined
    if (!isWindowState(stored)) throw new Error('窗口状态配置文件格式不正确')
    return stored
  }

  save(window: BrowserWindow): Promise<void> {
    return writeJsonFileAtomic(this.path, {
      bounds: window.getNormalBounds(),
      maximized: window.isMaximized()
    } satisfies WindowState)
  }
}
