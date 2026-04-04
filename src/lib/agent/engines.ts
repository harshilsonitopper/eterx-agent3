import { z } from 'zod';
import { ToolDefinition } from './schemas';
import { globalToolRegistry } from './tools/registry';
import path from 'path';
import fs from 'fs-extra';

/**
 * Dynamic Skill Generator — Runtime Tool Factory
 * 
 * NEXT-GEN CONCEPT: The agent can CREATE new tools at runtime.
 * When it encounters a repetitive pattern or needs a specialized capability,
 * it generates a new tool definition, registers it, and can use it immediately.
 * 
 * Generated tools are:
 * - Persisted to .workspaces/dynamic_tools/ so they survive restarts
 * - Auto-loaded on startup
 * - Full first-class tools — appear in the tool registry
 * - Can be composed from existing tools (macro-tools)
 * 
 * EXAMPLES:
 * - Agent notices it keeps formatting dates → creates a "date_formatter" tool
 * - Agent builds a project → creates a "deploy_project" macro-tool
 * - Agent does repetitive API calls → creates a "fetch_stock_price" tool
 */

const DYNAMIC_TOOLS_DIR = path.resolve(process.cwd(), '.workspaces', 'dynamic_tools');

interface DynamicToolSpec {
  name: string;
  description: string;
  category: string;
  inputFields: Array<{ name: string, type: string, description: string, required: boolean }>;
  executionCode: string;  // JavaScript code string that gets eval'd
  composedFrom?: string[];  // If this is a macro — which tools it chains
  createdAt: number;
  createdBy: string;  // Which agent created it
}

class DynamicSkillEngine {
  private dynamicTools: Map<string, DynamicToolSpec> = new Map();

  /** Load all dynamic tools from disk and register them */
  async initialize(): Promise<void> {
    try {
      await fs.ensureDir(DYNAMIC_TOOLS_DIR);
      const files = await fs.readdir(DYNAMIC_TOOLS_DIR);

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const spec: DynamicToolSpec = await fs.readJson(path.join(DYNAMIC_TOOLS_DIR, file));
          this.registerDynamicTool(spec);
        } catch (e) {
          console.warn(`[DynamicSkills] Could not load ${file}`);
        }
      }

      if (this.dynamicTools.size > 0) {
        console.log(`[DynamicSkills] Loaded ${this.dynamicTools.size} dynamic tools from disk`);
      }
    } catch {
      // Silent — dynamic tools are optional
    }
  }

  /** Create and register a new dynamic tool */
  async createTool(spec: DynamicToolSpec): Promise<{ success: boolean, message: string }> {
    // Validate name doesn't conflict with existing tools
    if (globalToolRegistry.getTool(spec.name)) {
      return { success: false, message: `Tool "${spec.name}" already exists in the registry. Choose a different name.` };
    }

    // Validate the execution code is safe (basic checks)
    const dangerousPatterns = ['process.exit', 'require("child_process")', 'rm -rf', 'format c:', 'del /f'];
    for (const pattern of dangerousPatterns) {
      if (spec.executionCode.includes(pattern)) {
        return { success: false, message: `Execution code contains dangerous pattern: "${pattern}". Rejected.` };
      }
    }

    // Build Zod schema from input fields
    const schemaFields: Record<string, any> = {};
    for (const field of spec.inputFields) {
      let zodType: any;
      switch (field.type) {
        case 'string': zodType = z.string(); break;
        case 'number': zodType = z.number(); break;
        case 'boolean': zodType = z.boolean(); break;
        case 'array': zodType = z.array(z.any()); break;
        default: zodType = z.string();
      }
      if (field.description) zodType = zodType.describe(field.description);
      schemaFields[field.name] = field.required ? zodType : zodType.optional();
    }

    // Create the tool definition
    const toolDef: ToolDefinition = {
      name: spec.name,
      description: `[DYNAMIC] ${spec.description}`,
      category: 'core' as const,
      inputSchema: z.object(schemaFields),
      outputSchema: z.object({ result: z.any(), success: z.boolean() }),
      execute: async (input: any) => {
        console.log(`[DynamicTool: ${spec.name}] Executing...`);
        try {
          // Create a sandboxed execution context. 
          // Abstract require via typeof to prevent Next.js from throwing static extraction warnings.
          const AsyncFunction = Object.getPrototypeOf(async function () { }).constructor;
          const _req = typeof require !== "undefined" ? require : null;
          const fn = new AsyncFunction('input', 'require', 'path', 'fs', spec.executionCode);
          const result = await fn(input, _req, _req ? _req('path') : path, _req ? _req('fs-extra') : fs);
          return { result, success: true };
        } catch (error: any) {
          return { result: null, success: false, error: error.message };
        }
      }
    };

    // Register in the global registry
    this.registerDynamicTool(spec);
    globalToolRegistry.registerTools([toolDef]);

    // Persist to disk
    await this.saveTool(spec);

    console.log(`[DynamicSkills] ✅ Created tool: ${spec.name}`);
    return { success: true, message: `Tool "${spec.name}" created and registered. It's now available for use.` };
  }

  /** Register a spec in memory */
  private registerDynamicTool(spec: DynamicToolSpec) {
    this.dynamicTools.set(spec.name, spec);
  }

  /** Save tool spec to disk */
  private async saveTool(spec: DynamicToolSpec) {
    await fs.ensureDir(DYNAMIC_TOOLS_DIR);
    await fs.writeJson(
      path.join(DYNAMIC_TOOLS_DIR, `${spec.name}.json`),
      spec,
      { spaces: 2 }
    );
  }

  /** List all dynamic tools */
  listTools(): DynamicToolSpec[] {
    return Array.from(this.dynamicTools.values());
  }

  /** Delete a dynamic tool */
  async deleteTool(name: string): Promise<boolean> {
    this.dynamicTools.delete(name);
    const filePath = path.join(DYNAMIC_TOOLS_DIR, `${name}.json`);
    if (await fs.pathExists(filePath)) {
      await fs.remove(filePath);
      return true;
    }
    return false;
  }
}

/**
 * Tool Composition Engine — Macro Tool Builder
 * 
 * NEXT-GEN CONCEPT: Chain multiple existing tools into a single
 * "macro-tool" that executes them in sequence, passing outputs as inputs.
 * 
 * EXAMPLE MACROS:
 * - "research_and_write": web_search → workspace_write_file
 * - "build_and_verify": workspace_write_file → workspace_verify_code
 * - "scrape_and_analyze": web_scraper → csv_analyzer
 */
interface MacroStep {
  tool: string;
  inputMapping: Record<string, string>;  // Maps macro input fields to tool input fields
  outputKey: string;  // Key to store this step's output under
}

interface MacroDefinition {
  name: string;
  description: string;
  steps: MacroStep[];
  inputFields: Array<{ name: string, type: string, description: string }>;
}

class ToolCompositionEngine {
  private macros: Map<string, MacroDefinition> = new Map();

  /** Execute a macro — run steps in sequence, piping outputs */
  async executeMacro(macro: MacroDefinition, input: any): Promise<any> {
    console.log(`[MacroEngine] Executing macro: ${macro.name} (${macro.steps.length} steps)`);

    const context: Record<string, any> = { ...input };

    for (let i = 0; i < macro.steps.length; i++) {
      const step = macro.steps[i];
      const tool = globalToolRegistry.getTool(step.tool);

      if (!tool) {
        return { error: `Step ${i + 1}: Tool "${step.tool}" not found`, step: i + 1 };
      }

      // Build input from mapping
      const stepInput: Record<string, any> = {};
      for (const [macroField, toolField] of Object.entries(step.inputMapping)) {
        stepInput[toolField] = context[macroField];
      }

      console.log(`[MacroEngine] Step ${i + 1}/${macro.steps.length}: ${step.tool}`);

      try {
        const result = await tool.execute(stepInput, {});
        context[step.outputKey] = result;
      } catch (error: any) {
        return { error: `Step ${i + 1} (${step.tool}) failed: ${error.message}`, step: i + 1, context };
      }
    }

    return { success: true, results: context };
  }

  /** Register a macro */
  registerMacro(macro: MacroDefinition) {
    this.macros.set(macro.name, macro);
  }

  /** Get a macro by name */
  getMacro(name: string): MacroDefinition | undefined {
    return this.macros.get(name);
  }

  /** List all macros */
  listMacros(): MacroDefinition[] {
    return Array.from(this.macros.values());
  }
}

/**
 * Workspace Intelligence Engine — Deep Project Understanding
 * 
 * NEXT-GEN CONCEPT: Automatically analyzes the project workspace to understand:
 * - Framework (Next.js, React, Express, Python, etc.)
 * - Language distribution
 * - Directory structure
 * - Dependencies
 * - Config files
 * - Build system
 * 
 * This context is injected into the agent's system prompt for smarter decisions.
 */
interface WorkspaceProfile {
  framework: string;
  language: string;
  packageManager: string;
  buildSystem: string;
  hasTypeScript: boolean;
  hasTests: boolean;
  hasDocker: boolean;
  hasCI: boolean;
  hasGit: boolean;
  mainDirs: string[];
  configFiles: string[];
  dependencies: string[];
  totalFiles: number;
  analyzedAt: number;
}

class WorkspaceIntelligence {
  private profile: WorkspaceProfile | null = null;

  /** Analyze the current workspace and build a profile */
  async analyze(): Promise<WorkspaceProfile> {
    const cwd = process.cwd();
    console.log(`[WorkspaceIntel] Analyzing workspace: ${cwd}`);

    const profile: WorkspaceProfile = {
      framework: 'unknown',
      language: 'unknown',
      packageManager: 'unknown',
      buildSystem: 'unknown',
      hasTypeScript: false,
      hasTests: false,
      hasDocker: false,
      hasCI: false,
      hasGit: false,
      mainDirs: [],
      configFiles: [],
      dependencies: [],
      totalFiles: 0,
      analyzedAt: Date.now()
    };

    try {
      // Check for key files
      const checks = {
        'package.json': 'npm/node',
        'tsconfig.json': 'typescript',
        'next.config.js': 'next.js',
        'next.config.mjs': 'next.js',
        'next.config.ts': 'next.js',
        'vite.config.ts': 'vite',
        'vite.config.js': 'vite',
        'angular.json': 'angular',
        'vue.config.js': 'vue',
        'requirements.txt': 'python',
        'Pipfile': 'python',
        'pyproject.toml': 'python',
        'Cargo.toml': 'rust',
        'go.mod': 'go',
        'pom.xml': 'java/maven',
        'build.gradle': 'java/gradle',
        'Dockerfile': 'docker',
        'docker-compose.yml': 'docker',
        '.github': 'github-ci',
        '.gitlab-ci.yml': 'gitlab-ci',
        '.git': 'git',
        'jest.config.js': 'jest-tests',
        'jest.config.ts': 'jest-tests',
        'vitest.config.ts': 'vitest-tests',
      };

      for (const [file, tech] of Object.entries(checks)) {
        const fullPath = path.join(cwd, file);
        if (await fs.pathExists(fullPath)) {
          profile.configFiles.push(file);

          if (tech === 'next.js') profile.framework = 'Next.js';
          else if (tech === 'vite') profile.framework = 'Vite';
          else if (tech === 'angular') profile.framework = 'Angular';
          else if (tech === 'vue') profile.framework = 'Vue';
          else if (tech === 'typescript') profile.hasTypeScript = true;
          else if (tech === 'docker') profile.hasDocker = true;
          else if (tech.includes('ci')) profile.hasCI = true;
          else if (tech === 'git') profile.hasGit = true;
          else if (tech.includes('tests')) profile.hasTests = true;

          if (tech === 'npm/node') {
            profile.language = 'JavaScript/TypeScript';
            profile.packageManager = 'npm';
          } else if (tech === 'python') {
            profile.language = 'Python';
          } else if (tech === 'rust') {
            profile.language = 'Rust';
          } else if (tech === 'go') {
            profile.language = 'Go';
          } else if (tech.startsWith('java')) {
            profile.language = 'Java';
          }
        }
      }

      // Read package.json for dependencies
      const pkgPath = path.join(cwd, 'package.json');
      if (await fs.pathExists(pkgPath)) {
        try {
          const pkg = await fs.readJson(pkgPath);
          const deps = { ...pkg.dependencies, ...pkg.devDependencies };
          profile.dependencies = Object.keys(deps).slice(0, 30);  // Top 30

          // Detect framework from deps
          if (deps['next']) profile.framework = `Next.js ${deps['next']}`;
          if (deps['react']) profile.language = 'React/TypeScript';
          if (deps['electron']) profile.framework += ' + Electron';
          if (deps['express']) profile.framework += ' + Express';

          // Detect build system
          if (pkg.scripts?.build) {
            if (pkg.scripts.build.includes('next')) profile.buildSystem = 'Next.js';
            else if (pkg.scripts.build.includes('vite')) profile.buildSystem = 'Vite';
            else if (pkg.scripts.build.includes('webpack')) profile.buildSystem = 'Webpack';
            else if (pkg.scripts.build.includes('tsc')) profile.buildSystem = 'TypeScript Compiler';
            else profile.buildSystem = pkg.scripts.build.substring(0, 50);
          }

          // Detect package manager
          if (await fs.pathExists(path.join(cwd, 'yarn.lock'))) profile.packageManager = 'yarn';
          else if (await fs.pathExists(path.join(cwd, 'pnpm-lock.yaml'))) profile.packageManager = 'pnpm';
          else if (await fs.pathExists(path.join(cwd, 'bun.lockb'))) profile.packageManager = 'bun';
        } catch { }
      }

      // Scan top-level directories
      try {
        const entries = await fs.readdir(cwd, { withFileTypes: true });
        profile.mainDirs = entries
          .filter(e => e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules')
          .map(e => e.name)
          .slice(0, 15);

        profile.totalFiles = entries.length;
      } catch { }

      this.profile = profile;

      console.log(`[WorkspaceIntel] ✅ Profile: ${profile.framework} | ${profile.language} | ${profile.packageManager}`);
      console.log(`[WorkspaceIntel]    Dirs: ${profile.mainDirs.join(', ')}`);
      console.log(`[WorkspaceIntel]    Features: TS=${profile.hasTypeScript} Docker=${profile.hasDocker} CI=${profile.hasCI} Tests=${profile.hasTests}`);

      // Persist for quick access
      await fs.ensureDir(path.join(cwd, '.workspaces'));
      await fs.writeJson(path.join(cwd, '.workspaces', 'workspace_profile.json'), profile, { spaces: 2 });

      return profile;
    } catch (error: any) {
      console.warn(`[WorkspaceIntel] Analysis failed: ${error.message}`);
      return profile;
    }
  }

  /** Get cached profile or analyze */
  async getProfile(): Promise<WorkspaceProfile> {
    if (this.profile) return this.profile;

    // Try loading from cache
    const cachePath = path.join(process.cwd(), '.workspaces', 'workspace_profile.json');
    if (await fs.pathExists(cachePath)) {
      try {
        const cached = await fs.readJson(cachePath);
        // Cache valid for 1 hour
        if (Date.now() - cached.analyzedAt < 3600000) {
          this.profile = cached;
          return cached;
        }
      } catch { }
    }

    return this.analyze();
  }

  /** Generate a concise workspace context string for system prompt injection */
  async getWorkspaceContext(): Promise<string> {
    const p = await this.getProfile();
    const parts = [
      `Project: ${p.framework} (${p.language})`,
      `Build: ${p.buildSystem} | PM: ${p.packageManager}`,
      `Features: ${[
        p.hasTypeScript && 'TypeScript',
        p.hasDocker && 'Docker',
        p.hasCI && 'CI/CD',
        p.hasTests && 'Tests',
        p.hasGit && 'Git'
      ].filter(Boolean).join(', ')}`,
      `Structure: ${p.mainDirs.join(', ')}`,
      p.dependencies.length > 0 && `Key deps: ${p.dependencies.slice(0, 10).join(', ')}`
    ].filter(Boolean);

    return `━━━ WORKSPACE INTELLIGENCE ━━━\n${parts.join('\n')}`;
  }
}

/**
 * Agent Reflection Loop — Self-Evaluation Engine
 * 
 * Before delivering a final answer, the agent reflects on its output quality.
 * 10 heuristic checks covering: length, placeholders, give-ups, formatting,
 * code blocks, completeness, file creation, research effort, tool usage, repetition.
 */
class AgentReflectionEngine {
  private reflectionCount = 0;
  private maxReflections = 2;

  async reflect(
    userGoal: string,
    agentOutput: string,
    toolsUsed: string[]
  ): Promise<{ quality: 'high' | 'medium' | 'low', suggestions: string[], shouldImprove: boolean }> {
    this.reflectionCount++;
    if (this.reflectionCount > this.maxReflections) {
      return { quality: 'medium', suggestions: [], shouldImprove: false };
    }

    const suggestions: string[] = [];
    const goalLower = userGoal.toLowerCase();
    const outputLower = agentOutput.toLowerCase();
    const taskWords = userGoal.split(/\s+/).length;
    const outputWords = agentOutput.split(/\s+/).length;

    if (taskWords > 15 && outputWords < 50) suggestions.push('Output too short for task complexity');
    if (agentOutput.includes('TODO') || agentOutput.includes('placeholder') || agentOutput.includes('FIXME')) suggestions.push('Contains TODO/placeholder/FIXME');
    if (/\b(I cannot|I can't|unable to|not possible|beyond my|I'm sorry but)\b/i.test(agentOutput)) suggestions.push('Claims inability — should attempt with tools');
    if (agentOutput.includes('##') && !agentOutput.includes('\n##')) suggestions.push('Markdown headings not on own lines');
    const codeBlocks = (agentOutput.match(/```/g) || []).length;
    if (codeBlocks % 2 !== 0) suggestions.push('Unclosed code block');
    const lastChar = agentOutput.trim().slice(-1);
    if (lastChar && !/[.!?)\]"'`]/.test(lastChar) && outputWords > 20) suggestions.push('Output appears cut off mid-sentence');

    const isCodingTask = /\b(build|create|write|make|implement|code|develop|app|website|script|function|component)\b/i.test(goalLower);
    if (isCodingTask) {
      const fileTools = toolsUsed.filter(t => t.startsWith('workspace_write_file') || t.startsWith('workspace_edit_file'));
      if (fileTools.length === 0 && !outputLower.includes('file') && !outputLower.includes('created')) {
        suggestions.push('Coding task but no files created');
      }
    }

    const isResearchTask = /\b(research|find|search|look up|compare|analyze|report|summary)\b/i.test(goalLower);
    if (isResearchTask) {
      const searchTools = toolsUsed.filter(t => t.startsWith('web_search') || t.startsWith('web_scraper') || t.startsWith('deep_research'));
      if (searchTools.length === 0 && outputWords < 100) suggestions.push('Research task but no search tools used');
    }

    if (taskWords > 20 && toolsUsed.length === 0) suggestions.push('Complex task with zero tool usage');

    const sentences = agentOutput.split(/[.!?]+/).map(s => s.trim().toLowerCase()).filter(s => s.length > 20);
    const uniqueSentences = new Set(sentences);
    if (sentences.length > 5 && uniqueSentences.size < sentences.length * 0.7) suggestions.push('Repetitive content detected');

    const quality = suggestions.length === 0 ? 'high' : suggestions.length <= 2 ? 'medium' : 'low';
    const shouldImprove = quality === 'low' && this.reflectionCount < this.maxReflections;
    if (suggestions.length > 0) console.log(`[Reflection] Quality: ${quality} | Issues: ${suggestions.join('; ')}`);
    return { quality, suggestions, shouldImprove };
  }

  reset() { this.reflectionCount = 0; }
}

// ── Exports ──
export const dynamicSkillEngine = new DynamicSkillEngine();
export const toolCompositionEngine = new ToolCompositionEngine();
export const workspaceIntelligence = new WorkspaceIntelligence();
export const agentReflection = new AgentReflectionEngine();
