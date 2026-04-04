import os from 'os';
import path from 'path';

/**
 * Resolves file paths according to system rules:
 * 1. Absolute paths are preserved.
 * 2. Temporary/trash/sandbox files are saved to AgentX/.temp/
 * 3. All other relative files are saved to the user's Desktop by default.
 */
export function resolveWorkspacePath(filename: string): string {
  if (path.isAbsolute(filename)) {
    return filename; // Full system access
  }

  // Define paths
  const desktopPath = path.join(os.homedir(), 'Desktop');
  const tempDir = path.resolve(process.cwd(), '.temp');

  // Distinguish working/temp files from final output
  // If the agent prepends .temp/, sandbox/, or temp/ we stash it in AgentX/.temp
  const lowerFilename = filename.toLowerCase();
  
  if (
    lowerFilename.startsWith('.temp' + path.sep) || 
    lowerFilename.startsWith('.temp/') ||
    lowerFilename.startsWith('sandbox' + path.sep) ||
    lowerFilename.startsWith('sandbox/') ||
    lowerFilename.startsWith('temp' + path.sep) ||
    lowerFilename.startsWith('temp/')
  ) {
    // Strip the prefix and save it into the real .temp folder
    const stripped = filename.replace(/^(\.?temp|sandbox)[\/\\]/i, '');
    return path.join(tempDir, stripped);
  }

  // Default for user requests: Desktop
  return path.resolve(desktopPath, filename);
}
