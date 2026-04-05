import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import fs from 'fs/promises';
import fse from 'fs-extra';
import path from 'path';

import { resolveWorkspacePath, checkAgentXProtection } from '../../workspace/path_resolver';

export const workspaceReadTool: ToolDefinition = {
  name: 'workspace_read_file',
  description: 'Read the contents of ANY file on the local system. Supports absolute paths (C:\\Users\\...\\Desktop\\file.txt) and relative workspace paths. You run LOCALLY — you can read files from Desktop, Documents, Downloads, anywhere.',
  category: 'workspace',
  inputSchema: z.object({
    filename: z.string().describe('File path — absolute (C:\\path\\to\\file) or relative to workspace')
  }),
  outputSchema: z.object({ content: z.string() }),
  execute: async (input: { filename: string }) => {
    const filePath = resolveWorkspacePath(input.filename);
    console.log(`[Tool: workspace_read_file] Reading: ${ filePath }`);

    if (!await fse.pathExists(filePath)) {
      throw new Error(`File not found: ${ filePath }. Check the path and try again.`);
    }

    const stats = await fs.stat(filePath);
    if (stats.size > 10 * 1024 * 1024) {
      throw new Error(`File too large (${ (stats.size / 1024 / 1024).toFixed(1) }MB). Use system_shell to read portions with Get-Content -First or Select-Object.`);
    }

    const content = await fs.readFile(filePath, 'utf-8');
    return { content, size: stats.size, path: filePath };
  }
};

export const workspaceWriteTool: ToolDefinition = {
  name: 'workspace_write_file',
  description: 'Write content to ANY file on the local system. Supports absolute paths and relative workspace paths. Creates parent directories automatically.',
  category: 'workspace',
  inputSchema: z.object({
    filename: z.string().describe('File path — absolute or relative to workspace'),
    content: z.string().describe('Content to write'),
    append: z.boolean().optional().describe('Set to true to append to the file instead of overwriting. EXTREMELY helpful for the auto-chunk workflow.')
  }),
  outputSchema: z.object({ success: z.boolean(), path: z.string() }),
  execute: async (input: { filename: string, content: string, append?: boolean }) => {
    const filePath = resolveWorkspacePath(input.filename);
    
    // AgentX Source Protection Cloak — NEVER modify our own source
    const protection = checkAgentXProtection(filePath);
    if (protection.blocked) {
      console.warn(`[Tool: workspace_write_file] 🛡️ BLOCKED: ${filePath}`);
      return { success: false, error: protection.reason, path: filePath };
    }
    
    await fse.ensureDir(path.dirname(filePath));

    console.log(`[Tool: workspace_write_file] ${input.append ? 'Appending' : 'Writing'} to: ${ filePath }`);
    
    if (input.append) {
      await fs.appendFile(filePath, input.content, 'utf-8');
    } else {
      await fs.writeFile(filePath, input.content, 'utf-8');
    }
    
    return { success: true, path: filePath, size: input.content.length };
  }
};

export const workspaceListDirectoryTool: ToolDefinition = {
  name: 'workspace_list_directory',
  description: 'List files and directories at ANY path on the local system. Use absolute paths for Desktop, Documents, etc. Use relative for workspace.',
  category: 'workspace',
  inputSchema: z.object({
    directory: z.string().optional().describe('Directory path — absolute (C:\\Users\\...\\Desktop) or relative. Default: workspace root')
  }),
  outputSchema: z.object({ files: z.array(z.string()), tree: z.string() }),
  execute: async (input: { directory?: string }) => {
    let walkDir: string;
    if (!input.directory) {
      walkDir = process.cwd();
    } else if (path.isAbsolute(input.directory)) {
      walkDir = input.directory;
    } else {
      walkDir = path.resolve(process.cwd(), input.directory);
    }

    if (!await fse.pathExists(walkDir)) {
      throw new Error(`Directory not found: ${ walkDir }`);
    }

    const entries = await fs.readdir(walkDir, { withFileTypes: true });
    const items = entries.map(e => {
      const type = e.isDirectory() ? '📁' : '📄';
      return `${ type } ${ e.name }`;
    });

    return { files: entries.map(e => e.name), tree: items.join('\n'), path: walkDir, count: entries.length };
  }
};

export const workspaceSearchTextTool: ToolDefinition = {
  name: 'workspace_search_text',
  description: 'Search for a text pattern across files. Supports both workspace and absolute directory paths.',
  category: 'workspace',
  inputSchema: z.object({
    pattern: z.string().describe('String or regex pattern to search'),
    directory: z.string().optional().describe('Directory to search in (absolute or relative). Default: workspace')
  }),
  outputSchema: z.object({ results: z.array(z.any()) }),
  execute: async (input: { pattern: string, directory?: string }) => {
    let searchDir: string;
    if (input.directory && path.isAbsolute(input.directory)) {
      searchDir = input.directory;
    } else {
      searchDir = path.resolve(process.cwd(), input.directory || '');
    }

    if (!await fse.pathExists(searchDir)) return { results: [] };

    const files = await fs.readdir(searchDir, { recursive: true });
    const results: any[] = [];

    for (const f of files) {
      const filePath = path.join(searchDir, String(f));
      try {
        const stat = await fs.stat(filePath);
        if (!stat.isFile() || stat.size > 1024 * 1024) continue; // Skip dirs and huge files

        const content = await fs.readFile(filePath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (line.includes(input.pattern)) {
            results.push({ file: String(f), line: i + 1, content: line.trim().substring(0, 200) });
          }
        });
      } catch { continue; }
    }
    return { results, totalMatches: results.length };
  }
};

export const workspaceEditFileTool: ToolDefinition = {
  name: 'workspace_edit_file',
  description: 'Edit ANY file using search and replace. Supports absolute and relative paths.',
  category: 'workspace',
  inputSchema: z.object({
    filename: z.string().describe('File path — absolute or relative'),
    edits: z.array(z.object({
      search: z.string().describe('Exact text to find'),
      replace: z.string().describe('Replacement text')
    }))
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string() }),
  execute: async (input: { filename: string, edits: any[] }) => {
    const filePath = resolveWorkspacePath(input.filename);

    // AgentX Source Protection Cloak — NEVER modify our own source
    const protection = checkAgentXProtection(filePath);
    if (protection.blocked) {
      console.warn(`[Tool: workspace_edit_file] 🛡️ BLOCKED: ${filePath}`);
      return { success: false, error: protection.reason };
    }

    if (!await fse.pathExists(filePath)) throw new Error(`File not found: ${ filePath }`);

    let content = await fs.readFile(filePath, 'utf-8');
    for (const edit of input.edits) {
      if (!content.includes(edit.search)) {
        throw new Error(`Could not find search block in ${ input.filename }. Make sure it matches exactly.`);
      }
      content = content.replace(edit.search, edit.replace);
    }

    await fs.writeFile(filePath, content, 'utf-8');
    return { success: true, message: `Applied ${ input.edits.length } edits to ${ filePath }` };
  }
};
