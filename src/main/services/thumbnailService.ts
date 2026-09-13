import path from 'path'
import fs from 'fs'
import sharp from 'sharp'
import { getThumbnailsDir } from '../utils/paths'

/**
 * Generate a thumbnail for a cover image.
 * Returns the thumbnail file path.
 */
export async function generateThumbnail(
  coverPath: string,
  gameId: string,
  maxDimension: number = 400
): Promise<string> {
  const thumbDir = getThumbnailsDir()
  const thumbPath = path.join(thumbDir, `${gameId}.webp`)

  try {
    await sharp(coverPath)
      .resize(maxDimension, maxDimension, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .webp({ quality: 85 })
      .toFile(thumbPath)

    return thumbPath
  } catch (error) {
    // If conversion fails, just copy the original (if it's a common format)
    const ext = path.extname(coverPath).toLowerCase()
    if (['.jpg', '.jpeg', '.png', '.webp'].includes(ext)) {
      const destPath = path.join(thumbDir, `${gameId}${ext}`)
      fs.copyFileSync(coverPath, destPath)
      return destPath
    }
    throw error
  }
}

/**
 * Delete thumbnail for a game.
 */
export function deleteThumbnail(gameId: string): void {
  const thumbDir = getThumbnailsDir()
  const extensions = ['.webp', '.jpg', '.jpeg', '.png']
  for (const ext of extensions) {
    const p = path.join(thumbDir, `${gameId}${ext}`)
    if (fs.existsSync(p)) {
      fs.unlinkSync(p)
    }
  }
}
