import { app } from 'electron'
import { execFile } from 'child_process'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { getCoversDir } from '../utils/paths'
import { generateThumbnail } from './thumbnailService'

/**
 * Extract icon from a Windows executable and save as PNG cover.
 * Tries multiple methods in order of reliability on Windows.
 */
export async function extractExeIcon(exePath: string, gameId: string): Promise<string | null> {
  if (!fs.existsSync(exePath)) {
    return null
  }

  const coversDir = getCoversDir()
  const coverPath = path.join(coversDir, `${gameId}_icon.png`)

  // Method 1: PowerShell — most reliable on Windows for extracting EXE icons
  try {
    const success = await extractIconViaPowerShell(exePath, coverPath)
    if (success && fs.existsSync(coverPath) && fs.statSync(coverPath).size > 500) {
      console.log(`[iconExtractor] PowerShell OK: ${coverPath}`)
      try { await generateThumbnail(coverPath, gameId) } catch { /* ok */ }
      return coverPath
    }
  } catch (err) {
    console.log('[iconExtractor] PowerShell failed:', err)
  }

  // Method 2: Electron's built-in API
  try {
    const icon = await app.getFileIcon(exePath, { size: 'large' })
    if (!icon.isEmpty()) {
      const png = icon.toPNG()
      if (png && png.length > 500) {
        fs.writeFileSync(coverPath, png)
        console.log(`[iconExtractor] Electron OK: ${coverPath}`)
        try { await generateThumbnail(coverPath, gameId) } catch { /* ok */ }
        return coverPath
      }
    }
  } catch (err) {
    console.log('[iconExtractor] Electron failed:', err)
  }

  return null
}

/**
 * Use PowerShell + .NET to extract the icon directly to a PNG file.
 * This is generally the most reliable method on Windows.
 */
function extractIconViaPowerShell(exePath: string, outputPath: string): Promise<boolean> {
  return new Promise((resolve) => {
    // Escape single quotes in path for PowerShell
    const safeExe = exePath.replace(/'/g, "''")
    const safeOut = outputPath.replace(/'/g, "''")

    // PowerShell script: extract icon from EXE, save directly as PNG
    const script = `
Add-Type -AssemblyName System.Drawing
try {
  $icon = [System.Drawing.Icon]::ExtractAssociatedIcon('${safeExe}')
  if ($null -eq $icon) { Write-Output 'FAIL:no_icon'; exit 1 }
  $bmp = $icon.ToBitmap()
  $bmp.Save('${safeOut}', [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
  $icon.Dispose()
  Write-Output 'OK'
} catch {
  Write-Output "FAIL:$($_.Exception.Message)"
  exit 1
}
`

    execFile(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy', 'Bypass',
        '-Command', script
      ],
      { timeout: 15000, encoding: 'utf-8' },
      (error, stdout) => {
        if (error) {
          console.log('[iconExtractor] PS exec error:', error.message)
          resolve(false)
          return
        }
        const out = (stdout || '').trim()
        console.log('[iconExtractor] PS output:', out)
        resolve(out === 'OK')
      }
    )
  })
}
