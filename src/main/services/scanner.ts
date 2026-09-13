import path from 'path'
import fs from 'fs'
import { detectExes, cleanGameTitle } from './exeDetector'
import { findLocalCovers } from './coverExtractor'
import type { ScanCandidate, ScanProgress } from '../../shared/types'

let isCancelled = false

export function cancelScan(): void {
  isCancelled = true
}

/**
 * Scan root directories for Galgame installations.
 * Reports progress via callback.
 */
export function scanDirectories(
  roots: string[],
  scanDepth: number,
  onProgress: (progress: ScanProgress) => void
): ScanCandidate[] {
  isCancelled = false
  const candidates: ScanCandidate[] = []
  let dirsScanned = 0

  for (const root of roots) {
    if (isCancelled) break

    // Normalize path
    const normalizedRoot = path.normalize(root)

    if (!fs.existsSync(normalizedRoot)) continue

    const found = scanDirectory(
      normalizedRoot,
      scanDepth,
      0,
      (currentDir: string) => {
        dirsScanned++
        onProgress({
          currentDir,
          dirsScanned,
          gamesFound: candidates.length,
          phase: 'walking'
        })
      }
    )

    candidates.push(...found)
  }

  onProgress({
    currentDir: '',
    dirsScanned,
    gamesFound: candidates.length,
    phase: 'complete'
  })

  // Deduplicate by EXE path
  return deduplicateCandidates(candidates)
}

function scanDirectory(
  dirPath: string,
  maxDepth: number,
  currentDepth: number,
  onDirScanned: (dir: string) => void
): ScanCandidate[] {
  if (isCancelled) return []

  const results: ScanCandidate[] = []
  onDirScanned(dirPath)

  // Check if this directory itself is a game (has viable EXEs)
  const exeCandidates = detectExes(dirPath, 2)

  if (exeCandidates.length > 0 && exeCandidates[0].score > 0) {
    // This is a game directory
    const localCovers = findLocalCovers(dirPath)
    const folderName = cleanGameTitle(path.basename(dirPath))

    results.push({
      folderPath: dirPath,
      folderName: folderName || path.basename(dirPath),
      exeFiles: exeCandidates,
      localCovers
    })

    // Don't recurse deeper into game directories
    return results
  }

  // Not a game directory — recurse into subdirectories
  if (currentDepth < maxDepth) {
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true })

      for (const entry of entries) {
        if (isCancelled) break

        if (entry.isDirectory() && !entry.name.startsWith('.')) {
          const subResults = scanDirectory(
            path.join(dirPath, entry.name),
            maxDepth,
            currentDepth + 1,
            onDirScanned
          )
          results.push(...subResults)
        }
      }
    } catch {
      // Skip directories we can't read
    }
  }

  return results
}

function deduplicateCandidates(candidates: ScanCandidate[]): ScanCandidate[] {
  const seenExes = new Set<string>()
  const result: ScanCandidate[] = []

  for (const candidate of candidates) {
    const topExe = candidate.exeFiles[0]
    if (topExe && !seenExes.has(topExe.path.toLowerCase())) {
      seenExes.add(topExe.path.toLowerCase())
      result.push(candidate)
    }
  }

  return result
}
