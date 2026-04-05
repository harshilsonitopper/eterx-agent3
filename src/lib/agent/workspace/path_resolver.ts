import os from 'os';
import path from 'path';
import fs from 'fs';

// ═══════════════════════════════════════════════════════════════
// AgentX Source Protection Cloak v1.0
// 
// The ABSOLUTE #1 RULE: The agent can NEVER modify its own source code.
// This prevents catastrophic self-destruction (like the page.tsx incident).
// ═══════════════════════════════════════════════════════════════

/** 
 * The AgentX project root — detected at startup. 
 * Every file operation is checked against this to prevent self-modification.
 */
const AGENTX_ROOT = detectAgentXRoot();

/**
 * Protected directories within AgentX that the agent must NEVER touch.
 * .workspaces is excluded because the agent legitimately uses it for temp work.
 */
const PROTECTED_SUBDIRS = ['src', 'electron', 'public', 'node_modules', '.git', '.next', 'dist'];

/**
 * Files in AgentX root that are protected.
 */
const PROTECTED_ROOT_FILES = [
  'package.json', 'package-lock.json', 'tsconfig.json', 'tsconfig.bot.json',
  'next.config.mjs', 'tailwind.config.ts', 'postcss.config.js', 
  '.gitignore', 'next-env.d.ts'
];

function detectAgentXRoot(): string {
  // process.cwd() is the AgentX root when running in dev
  const cwd = process.cwd();
  
  // Verify by checking for our signature files
  const hasPackageJson = fs.existsSync(path.join(cwd, 'package.json'));
  const hasSrc = fs.existsSync(path.join(cwd, 'src'));
  
  if (hasPackageJson && hasSrc) {
    return path.resolve(cwd);
  }
  
  // Fallback: hardcoded known path
  return path.resolve('c:\\Harshil projects\\AgentX');
}

/**
 * Checks if a path falls inside the protected AgentX source tree.
 * Returns { blocked: true, reason: string } if the path is protected.
 * 
 * ALLOWED paths within AgentX:
 *   - .workspaces/  (agent's working area)
 *   - .temp/        (temporary files)
 *   - .agent_task_tracker.* (task tracking)
 *   - data/         (user data directory)
 * 
 * BLOCKED paths:
 *   - src/          (all source code)
 *   - electron/     (desktop app code)  
 *   - public/       (static assets)
 *   - node_modules/ (dependencies)
 *   - .git/         (version control)
 *   - .next/        (build output)
 *   - dist/         (production build)
 *   - package.json, tsconfig.json, etc. (config files)
 */
export function checkAgentXProtection(targetPath: string): { blocked: boolean; reason: string } {
  const resolvedTarget = path.resolve(targetPath).toLowerCase();
  const resolvedRoot = AGENTX_ROOT.toLowerCase();
  
  // If the path is not inside AgentX at all, it's fine
  if (!resolvedTarget.startsWith(resolvedRoot)) {
    return { blocked: false, reason: '' };
  }
  
  // Get the relative path within AgentX
  const relativePath = path.relative(AGENTX_ROOT, path.resolve(targetPath));
  const relLower = relativePath.toLowerCase();
  
  // ALLOWED exceptions within AgentX
  const allowedPrefixes = ['.workspaces', '.temp', 'data', 'p_block_ppt_assets'];
  const allowedFiles = ['.agent_task_tracker.json', '.agent_task_tracker.md', 'chunk_log.txt', 'chunk_log2.txt', 'err.log'];
  
  for (const prefix of allowedPrefixes) {
    if (relLower.startsWith(prefix.toLowerCase())) {
      return { blocked: false, reason: '' };
    }
  }
  
  for (const file of allowedFiles) {
    if (relLower === file.toLowerCase()) {
      return { blocked: false, reason: '' };
    }
  }
  
  // CHECK: Is it a protected subdirectory?
  for (const dir of PROTECTED_SUBDIRS) {
    if (relLower.startsWith(dir.toLowerCase())) {
      return { 
        blocked: true, 
        reason: `🛡️ BLOCKED: Cannot modify AgentX source file "${relativePath}". The "${dir}/" directory is protected. Save your files to the Desktop or a different location instead.` 
      };
    }
  }
  
  // CHECK: Is it a protected root config file?
  for (const file of PROTECTED_ROOT_FILES) {
    if (relLower === file.toLowerCase()) {
      return {
        blocked: true,
        reason: `🛡️ BLOCKED: Cannot modify AgentX config file "${file}". This is a protected project configuration file.`
      };
    }
  }
  
  // Any other file directly in AgentX root — allow cautiously
  // (e.g., report_content.txt, process_data.js are user-created)
  return { blocked: false, reason: '' };
}

/**
 * Resolves the REAL user Desktop path, handling:
 * - OneDrive Desktop redirection (common on modern Windows)
 * - Standard Windows Desktop
 * - Electron app context where CWD might differ
 */
function getRealDesktopPath(): string {
  const homeDir = os.homedir();
  
  // Check OneDrive Desktop first (many Windows users have this)
  const oneDriveDesktop = path.join(homeDir, 'OneDrive', 'Desktop');
  if (fs.existsSync(oneDriveDesktop)) {
    return oneDriveDesktop;
  }
  
  // Check OneDrive with locale-specific folder names
  const oneDrivePath = process.env.OneDrive || process.env.OneDriveConsumer || '';
  if (oneDrivePath) {
    const oneDriveDesktopAlt = path.join(oneDrivePath, 'Desktop');
    if (fs.existsSync(oneDriveDesktopAlt)) {
      return oneDriveDesktopAlt;
    }
  }
  
  // Standard Windows Desktop
  const standardDesktop = path.join(homeDir, 'Desktop');
  if (fs.existsSync(standardDesktop)) {
    return standardDesktop;
  }
  
  // Fallback: create standard Desktop if nothing exists
  return standardDesktop;
}

/**
 * Resolves file paths according to system rules:
 * 1. Absolute paths are preserved (but checked against AgentX protection).
 * 2. Temporary/trash/sandbox files are saved to AgentX/.temp/
 * 3. All other relative files are saved to the user's REAL Desktop.
 * 4. Files targeting AgentX source are BLOCKED with a clear error.
 */
export function resolveWorkspacePath(filename: string): string {
  if (path.isAbsolute(filename)) {
    // Check protection before allowing absolute path writes
    const protection = checkAgentXProtection(filename);
    if (protection.blocked) {
      throw new Error(protection.reason);
    }
    return filename;
  }

  // Define paths
  const desktopPath = getRealDesktopPath();
  const tempDir = path.resolve(process.cwd(), '.temp');

  // Distinguish working/temp files from final output
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

  // Default for user requests: REAL Desktop
  const finalPath = path.resolve(desktopPath, filename);
  
  // Double-check: make sure resolved path isn't somehow inside AgentX
  const protection = checkAgentXProtection(finalPath);
  if (protection.blocked) {
    // Redirect to Desktop instead
    return path.resolve(desktopPath, path.basename(filename));
  }
  
  return finalPath;
}

/**
 * Get info about the path resolution system for debugging.
 */
export function getPathResolverInfo(): {
  agentXRoot: string;
  desktopPath: string;
  tempDir: string;
  protectedDirs: string[];
} {
  return {
    agentXRoot: AGENTX_ROOT,
    desktopPath: getRealDesktopPath(),
    tempDir: path.resolve(process.cwd(), '.temp'),
    protectedDirs: PROTECTED_SUBDIRS,
  };
}
