import path from 'path'
import fs from 'fs'
import { app } from 'electron'

// Base app data directory: %APPDATA%/gal-controller
export function getAppDataDir(): string {
  const dir = path.join(app.getPath('appData'), 'gal-controller')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// Database file path
export function getDbPath(): string {
  const dataDir = path.join(getAppDataDir(), 'data')
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true })
  }
  return path.join(dataDir, 'library.db')
}

// Covers storage directory
export function getCoversDir(): string {
  const dir = path.join(getAppDataDir(), 'covers')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// Thumbnails storage directory
export function getThumbnailsDir(): string {
  const dir = path.join(getAppDataDir(), 'thumbnails')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}

// Cache directory (VNDB cache etc.)
export function getCacheDir(): string {
  const dir = path.join(getAppDataDir(), 'cache')
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true })
  }
  return dir
}
