import { exec } from 'child_process'
import fs from 'fs'
import { getGameById, updateGame } from './library.db'

interface LaunchResult {
  success: boolean
  error?: string
}

/**
 * Launch a game using PowerShell Start-Process.
 *
 * Start-Process uses ShellExecute under the hood — the exact same Windows API
 * that File Explorer uses when you double-click an EXE. PowerShell handles
 * Unicode paths natively, so no encoding issues with Chinese/Japanese folder
 * names. -WorkingDirectory ensures the game root is the current directory,
 * which is critical when engine DLLs live in the root but the EXE is in a
 * subdirectory.
 */
export async function launchGame(gameId: string): Promise<LaunchResult> {
  const game = getGameById(gameId)

  if (!game) {
    return { success: false, error: 'Game not found in library.' }
  }

  if (!fs.existsSync(game.exePath)) {
    return {
      success: false,
      error: `Game executable not found at:\n${game.exePath}\n\nThe game may have been moved or deleted.`
    }
  }

  try {
    // Parse optional custom launch arguments
    const args: string[] = []
    if (game.exeArgs) {
      const argRegex = /"([^"]*)"|'([^']*)'|(\S+)/g
      let match
      while ((match = argRegex.exec(game.exeArgs)) !== null) {
        args.push(match[1] || match[2] || match[3])
      }
    }

    // Build PowerShell Start-Process command.
    // Single-quoted strings in PS are literal — perfect for paths with
    // special characters. No encoding issues, no temp files.
    const argList = args.length > 0
      ? ` -ArgumentList ${args.map(a => `'${a.replace(/'/g, "''")}'`).join(',')}`
      : ''
    const psCmd =
      `Start-Process ` +
      `-FilePath '${game.exePath.replace(/'/g, "''")}' ` +
      `-WorkingDirectory '${game.gameDir.replace(/'/g, "''")}'` +
      argList

    exec(
      `powershell.exe -NoProfile -NonInteractive -Command "${psCmd.replace(/"/g, '\\"')}"`,
      { windowsHide: true },
      (error) => {
        if (error) {
          console.error(`[launcher] Failed to start ${game.title}:`, error.message)
        }
      }
    )

    // Update lastPlayed timestamp
    updateGame(gameId, {
      lastPlayed: new Date().toISOString(),
      playTime: game.playTime
    })

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, error: `Failed to launch game:\n${message}` }
  }
}
