import { ipcMain } from 'electron'
import path from 'path'
import fs from 'fs'
import { IPC_CHANNELS } from '../../shared/constants'
import { findLocalCovers } from '../services/coverExtractor'
import { searchVndb, downloadVndbCover } from '../services/vndbClient'
import { extractExeIcon } from '../services/iconExtractor'
import { generateThumbnail } from '../services/thumbnailService'
import { getCoversDir } from '../utils/paths'
import { updateGame } from '../services/library.db'
import type { VndbSearchResult } from '../../shared/types'

export function registerCoverHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.FIND_LOCAL_COVERS, (_event, gameDir: string): string[] => {
    return findLocalCovers(gameDir)
  })

  ipcMain.handle(
    IPC_CHANNELS.SEARCH_VNDB,
    async (_event, title: string): Promise<VndbSearchResult[]> => {
      return searchVndb(title)
    }
  )

  ipcMain.handle(
    IPC_CHANNELS.DOWNLOAD_VNDB_COVER,
    async (_event, gameId: string, imageUrl: string): Promise<string> => {
      const coversDir = getCoversDir()
      const coverPath = await downloadVndbCover(gameId, imageUrl, coversDir)

      // Generate thumbnail
      await generateThumbnail(coverPath, gameId)

      // Update game record
      updateGame(gameId, {
        coverPath,
        coverSource: 'vndb'
      })

      return coverPath
    }
  )

  // Extract icon from EXE file and save as cover
  ipcMain.handle(
    IPC_CHANNELS.EXTRACT_EXE_ICON,
    async (_event, gameId: string, exePath: string): Promise<string | null> => {
      return extractExeIcon(exePath, gameId)
    }
  )

  // Copy a user-selected image file to covers directory
  ipcMain.handle(
    IPC_CHANNELS.COPY_COVER_FILE,
    async (_event, gameId: string, sourcePath: string): Promise<string> => {
      const coversDir = getCoversDir()
      const ext = path.extname(sourcePath).toLowerCase()
      const destPath = path.join(coversDir, `${gameId}${ext}`)

      // Copy the file
      fs.copyFileSync(sourcePath, destPath)

      // Generate thumbnail
      try {
        await generateThumbnail(destPath, gameId)
      } catch {
        // Thumbnail generation is non-critical
      }

      return destPath
    }
  )
}
