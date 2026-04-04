import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs-extra';

const execAsync = promisify(exec);

export const workspaceRunCommandTool: ToolDefinition = {
  name: 'workspace_run_command',
  description: 'Execute a shell command inside any directory. Supports absolute paths (C:\\path\\to\\dir) and relative workspace paths. Use this to run tests, build projects, install dependencies, or execute any command.',
  category: 'workspace',
  inputSchema: z.object({
    command: z.string().describe('The command to execute (e.g., "npm test", "ls -la")'),
    cwd: z.string().optional().describe('Working directory — absolute path or relative to workspace root. Default: workspace root')
  }),
  outputSchema: z.object({
    stdout: z.string(),
    stderr: z.string(),
    exitCode: z.number()
  }),
  execute: async (input: { command: string, cwd?: string }, context: any) => {
    let runDir: string;
    if (input.cwd && path.isAbsolute(input.cwd)) {
      runDir = input.cwd;
    } else {
      runDir = input.cwd ? path.resolve(process.cwd(), input.cwd) : process.cwd();
    }

    // Ensure directory exists
    await fs.ensureDir(runDir);

    console.log(`[Tool: workspace_run_command] Executing: ${input.command} in ${runDir}`);
    
    try {
      const { stdout, stderr } = await execAsync(input.command, { 
        cwd: runDir,
        timeout: 120000, // 2 minute timeout
        maxBuffer: 10 * 1024 * 1024 // 10MB buffer
      });
      return { stdout, stderr: stderr || '', exitCode: 0 };
    } catch (error: any) {
      return { 
        stdout: error.stdout || '', 
        stderr: error.stderr || error.message, 
        exitCode: error.code || 1 
      };
    }
  }
};

export const workspaceVerifyCodeTool: ToolDefinition = {
  name: 'workspace_verify_code',
  description: 'Automatically run verification checks (lint/build/test) in any directory and report error/warning counts. Supports absolute and relative paths.',
  category: 'workspace',
  inputSchema: z.object({
    checkType: z.enum(['lint', 'build', 'test']).describe('The type of verification to perform'),
    cwd: z.string().optional().describe('Working directory — absolute or relative. Default: workspace root')
  }),
  outputSchema: z.object({
    passed: z.boolean(),
    errors: z.number(),
    warnings: z.number(),
    output: z.string()
  }),
  execute: async (input: { checkType: 'lint' | 'build' | 'test', cwd?: string }, context: any) => {
    let workDir: string;
    if (input.cwd && path.isAbsolute(input.cwd)) {
      workDir = input.cwd;
    } else {
      workDir = input.cwd ? path.resolve(process.cwd(), input.cwd) : process.cwd();
    }

    let command = '';
    if (input.checkType === 'lint') command = 'npm run lint';
    else if (input.checkType === 'build') command = 'npm run build';
    else if (input.checkType === 'test') command = 'npm test';

    console.log(`[Tool: workspace_verify_code] Verifying with: ${command} in ${workDir}`);
    
    try {
      const { stdout, stderr } = await execAsync(command, { 
        cwd: workDir,
        timeout: 120000,
        maxBuffer: 10 * 1024 * 1024
      });
      const output = stdout + stderr;
      
      const errorMatch = output.match(/(\d+)\s+errors?/i);
      const warnMatch = output.match(/(\d+)\s+warnings?/i);
      
      return {
        passed: true,
        errors: errorMatch ? parseInt(errorMatch[1]) : 0,
        warnings: warnMatch ? parseInt(warnMatch[1]) : 0,
        output: output.substring(0, 5000)
      };
    } catch (error: any) {
      const output = (error.stdout || '') + (error.stderr || error.message);
      const errorMatch = output.match(/(\d+)\s+errors?/i);
      
      return {
        passed: false,
        errors: errorMatch ? parseInt(errorMatch[1]) : 1,
        warnings: 0,
        output: output.substring(0, 5000)
      };
    }
  }
};
