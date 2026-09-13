import path from 'path'
import fs from 'fs'
import { COVER_FILE_PATTERNS, COVER_EXTENSIONS, COVER_SUBDIRS } from '../../shared/constants'

interface CoverMatch {
  path: string
  priority: number
  size: number
}

/**
 * Find potential cover images in a game directory.
 * Returns paths sorted by best match first.
 */
export function findLocalCovers(gameDir: string): string[] {
  const matches: CoverMatch[] = []

  // Check root directory first
  try {
    const entries = fs.readdirSync(gameDir, { withFileTypes: true })

    for (const entry of entries) {
      if (!entry.isFile()) continue

      const ext = path.extname(entry.name).toLowerCase()
      if (!COVER_EXTENSIONS.includes(ext)) continue

      const baseName = path.basename(entry.name, ext).toLowerCase()
      const patternIndex = COVER_FILE_PATTERNS.findIndex(
        p => baseName === p.toLowerCase()
      )

      if (patternIndex >= 0) {
        try {
          const stat = fs.statSync(path.join(gameDir, entry.name))
          matches.push({
            path: path.join(gameDir, entry.name),
            priority: patternIndex, // Lower index = higher priority
            size: stat.size
          })
        } catch {
          // Skip files we can't stat
        }
      }
    }

    // Check common subdirectories for covers
    for (const subdir of COVER_SUBDIRS) {
      const subdirPath = path.join(gameDir, subdir)
      if (!fs.existsSync(subdirPath)) continue

      try {
        const subEntries = fs.readdirSync(subdirPath, { withFileTypes: true })
        for (const entry of subEntries) {
          if (!entry.isFile()) continue

          const ext = path.extname(entry.name).toLowerCase()
          if (!COVER_EXTENSIONS.includes(ext)) continue

          const baseName = path.basename(entry.name, ext).toLowerCase()
          const patternIndex = COVER_FILE_PATTERNS.findIndex(
            p => baseName === p.toLowerCase()
          )

          if (patternIndex >= 0) {
            try {
              const stat = fs.statSync(path.join(subdirPath, entry.name))
              matches.push({
                path: path.join(subdirPath, entry.name),
                priority: patternIndex + COVER_FILE_PATTERNS.length, // Deprioritize subdirectory covers
                size: stat.size
              })
            } catch {
              // Skip
            }
          }
        }
      } catch {
        // Skip directories we can't read
      }
    }
  } catch {
    // Skip directories we can't read
  }

  // Sort: priority first (lower is better), then larger size is better
  matches.sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority
    return b.size - a.size
  })

  return matches.map(m => m.path)
}
