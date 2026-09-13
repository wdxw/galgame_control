import { app, BrowserWindow, shell, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { initDatabase } from './services/library.db'
import { registerAllHandlers } from './ipc'

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#ffeff7',
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      sandbox: false,
      contextIsolation: true,
      nodeIntegration: false
    },
    icon: path.join(__dirname, '../../resources/icon.png'),
    show: false
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.bmp': 'image/bmp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  }
  return mimeTypes[ext] || 'image/png'
}

function registerLocalFileProtocol(): void {
  // Custom protocol to serve local filesystem images to the renderer.
  // Avoids cross-protocol blocking (http://localhost → file:// is blocked by Chromium).
  protocol.handle('local-file', (request) => {
    try {
      // URL formats we handle:
      // 1. local-file:///C:/Users/...  (triple-slash, recommended)
      // 2. local-file://C:/Users/...   (double-slash, legacy — drive letter may be parsed as hostname)
      const raw = request.url

      let filePath: string

      if (raw.startsWith('local-file:///')) {
        // Triple-slash format: pathname starts with /C:/..., strip the leading slash
        filePath = raw.slice('local-file:///'.length)
        if (filePath.startsWith('/') && filePath.length > 2 && filePath[2] === ':') {
          filePath = filePath.slice(1)
        }
      } else {
        // Double-slash format: drive letter (C:) may be parsed as hostname
        // e.g. local-file://c/Users/... → hostname="c", pathname="/Users/..."
        filePath = raw.slice('local-file://'.length)
        // Re-add colon after drive letter if missing (browser may strip it as port separator)
        filePath = filePath.replace(/^([a-zA-Z])([/\\])/, '$1:$2')
      }

      // Normalize backslashes to forward slashes for cross-platform compatibility
      filePath = filePath.replace(/\\/g, '/')

      // Decode percent-encoded characters
      filePath = decodeURIComponent(filePath)

      console.log(`[local-file] Requesting: ${filePath}`)

      if (!fs.existsSync(filePath)) {
        console.log(`[local-file] File not found: ${filePath}`)
        return new Response('Not Found', { status: 404 })
      }

      const data = fs.readFileSync(filePath)
      console.log(`[local-file] Serving: ${filePath} (${data.length} bytes, ${getMimeType(filePath)})`)
      return new Response(data, {
        headers: {
          'Content-Type': getMimeType(filePath),
          'Cache-Control': 'no-cache'
        }
      })
    } catch (err) {
      console.error('[local-file] Error:', err)
      return new Response('Internal Error', { status: 500 })
    }
  })
}

// Register custom protocol scheme with required privileges BEFORE app.ready
protocol.registerSchemesAsPrivileged([
  { scheme: 'local-file', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }
])

app.whenReady().then(() => {
  // Register custom protocol handler
  registerLocalFileProtocol()

  initDatabase()
  registerAllHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

export { mainWindow }
