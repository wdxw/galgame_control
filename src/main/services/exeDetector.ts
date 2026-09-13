import path from 'path'
import fs from 'fs'
import {
  EXE_BLACKLIST_PATTERNS,
  DEPRIORITIZED_FOLDERS,
  KNOWN_VN_ENGINES
} from '../../shared/constants'
import type { ExeCandidate } from '../../shared/types'

interface ScoreRule {
  check: (exePath: string, context: ScanContext) => { score: number; reason?: string }
}

interface ScanContext {
  folderName: string
  folderPath: string
  isOnlyExe: boolean
  isLargest: boolean
  totalExes: number
}

/**
 * Clean up a game name from folder name.
 * Removes version numbers, release dates, and common noise.
 */
export function cleanGameTitle(folderName: string): string {
  return folderName
    // Remove common version patterns
    .replace(/v\d+[\d.]*/gi, '')
    // Remove release dates like (2023-01-01) or [20230101]
    .replace(/[\[(]\d{4}[-.]?\d{2}[-.]?\d{2}[)\]]/g, '')
    // Remove common tags
    .replace(/[\[(](?:免?安装|硬盘版|汉化|中文|破解|绿色|HD|重制|Remastered|Repack)[)\]]/gi, '')
    // Remove 【】 markers
    .replace(/[【】]/g, '')
    // Clean up whitespace
    .replace(/[_\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const rules: ScoreRule[] = [
  // EXE name matches folder name (exact or contains)
  {
    check: (exePath, ctx) => {
      const exeName = path.basename(exePath, '.exe').toLowerCase()
      const folder = ctx.folderName.toLowerCase()
      if (exeName === folder) return { score: 15, reason: 'EXE name matches folder name' }
      if (exeName.includes(folder) || folder.includes(exeName)) {
        return { score: 8, reason: 'EXE name partially matches folder name' }
      }
      return { score: 0 }
    }
  },

  // Only EXE in folder
  {
    check: (_exePath, ctx) => {
      if (ctx.isOnlyExe) return { score: 10, reason: 'Only executable in folder' }
      return { score: 0 }
    }
  },

  // Located in root directory
  {
    check: (exePath, ctx) => {
      const exeDir = path.dirname(exePath)
      if (path.normalize(exeDir) === path.normalize(ctx.folderPath)) {
        return { score: 5, reason: 'Located in game root directory' }
      }
      return { score: 0 }
    }
  },

  // Known VN engine name
  {
    check: (exePath, _ctx) => {
      const exeName = path.basename(exePath).toLowerCase()
      if (KNOWN_VN_ENGINES.some(e => e.toLowerCase() === exeName)) {
        return { score: 8, reason: 'Known visual novel engine executable' }
      }
      return { score: 0 }
    }
  },

  // Chinese-translated / Chinese-patched version (prioritized)
  {
    check: (exePath, _ctx) => {
      const exeName = path.basename(exePath, '.exe').toLowerCase()
      const parentDir = path.basename(path.dirname(exePath)).toLowerCase()
      const chsPatterns = /(?:chs|汉化|中文|cn|chinese|zh|gb|简中|繁中|简体|繁體|patch|补丁)(?!uninstall|unins|setup|install)/i
      if (chsPatterns.test(exeName) || chsPatterns.test(parentDir)) {
        return { score: 12, reason: 'Chinese translation / patched version detected' }
      }
      return { score: 0 }
    }
  },

  // Largest EXE
  {
    check: (_exePath, ctx) => {
      if (ctx.isLargest && ctx.totalExes > 1) {
        return { score: 3, reason: 'Largest executable file' }
      }
      return { score: 0 }
    }
  },

  // Blacklist check (negative score)
  {
    check: (exePath, _ctx) => {
      const exeName = path.basename(exePath)
      for (const pattern of EXE_BLACKLIST_PATTERNS) {
        if (pattern.test(exeName)) {
          return { score: -100, reason: 'Matches blacklist pattern (installer/uninstaller)' }
        }
      }
      return { score: 0 }
    }
  },

  // Deprioritized folder check
  {
    check: (exePath, _ctx) => {
      const parentDir = path.basename(path.dirname(exePath)).toLowerCase()
      if (DEPRIORITIZED_FOLDERS.some(f => parentDir === f.toLowerCase())) {
        return { score: -10, reason: 'Located in deprioritized subfolder' }
      }
      return { score: 0 }
    }
  },

  // Launcher/config/update detection
  {
    check: (exePath, _ctx) => {
      const exeName = path.basename(exePath, '.exe').toLowerCase()
      if (/config|setting|option|launcher/i.test(exeName)) {
        return { score: -5, reason: 'Appears to be a config/launcher utility' }
      }
      if (/update|patch|patcher/i.test(exeName)) {
        return { score: -8, reason: 'Appears to be an update/patcher utility' }
      }
      return { score: 0 }
    }
  }
]

/**
 * Detect viable game executables within a folder.
 * Returns candidates sorted by score (highest first).
 */
export function detectExes(folderPath: string, scanDepth: number = 2): ExeCandidate[] {
  const candidates: ExeCandidate[] = []
  const folderName = path.basename(folderPath)

  // Collect all EXE files
  const allExes = findAllExeFiles(folderPath, scanDepth)

  if (allExes.length === 0) return []

  // Get file sizes for "largest" comparison
  const exeSizes = new Map<string, number>()
  for (const exePath of allExes) {
    try {
      const stat = fs.statSync(exePath)
      exeSizes.set(exePath, stat.size)
    } catch {
      exeSizes.set(exePath, 0)
    }
  }

  const maxSize = Math.max(...exeSizes.values())

  // Score each EXE
  for (const exePath of allExes) {
    const size = exeSizes.get(exePath) || 0
    const context: ScanContext = {
      folderName,
      folderPath,
      isOnlyExe: allExes.length === 1,
      isLargest: size === maxSize && maxSize > 0,
      totalExes: allExes.length
    }

    const reasons: string[] = []
    let totalScore = 0

    for (const rule of rules) {
      const result = rule.check(exePath, context)
      totalScore += result.score
      if (result.reason && result.score !== 0) {
        reasons.push(`${result.score > 0 ? '+' : ''}${result.score}: ${result.reason}`)
      }
    }

    // Filter out blacklisted items completely (score <= -50)
    if (totalScore > -50) {
      candidates.push({
        path: exePath,
        name: path.basename(exePath),
        score: totalScore,
        sizeBytes: size,
        reasons
      })
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  return candidates
}

function findAllExeFiles(dirPath: string, maxDepth: number): string[] {
  const results: string[] = []

  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true })

    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name)

      if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) {
        results.push(fullPath)
      } else if (entry.isDirectory() && maxDepth > 0) {
        results.push(...findAllExeFiles(fullPath, maxDepth - 1))
      }
    }
  } catch {
    // Skip directories we can't read
  }

  return results
}
