import path from 'path';
import fs from 'fs-extra';

/**
 * Agent Memory System — Persistent Learning Engine
 * 
 * Stores and retrieves agent knowledge across sessions:
 * - User preferences (learned from interactions)
 * - Error patterns (what failed and how it was fixed)
 * - Project knowledge (file structures, tech stacks detected)
 * - Conversation summaries (compressed key insights)
 * 
 * STORAGE: .workspaces/memory/
 * - preferences.json: User preferences and patterns
 * - errors.json: Error patterns and solutions
 * - projects.json: Project-specific knowledge
 * - sessions.json: Session summaries
 */

const MEMORY_DIR = path.resolve(process.cwd(), '.workspaces', 'memory');

interface MemoryStore {
  preferences: Record<string, any>;
  errorPatterns: Array<{ tool: string, error: string, solution: string, timestamp: number }>;
  projectKnowledge: Record<string, any>;
  sessionSummaries: Array<{ timestamp: number, summary: string }>;
}

class AgentMemory {
  private store: MemoryStore = {
    preferences: {},
    errorPatterns: [],
    projectKnowledge: {},
    sessionSummaries: []
  };
  private loaded = false;

  /** Initialize and load from disk */
  async load(): Promise<void> {
    if (this.loaded) return;
    try {
      await fs.ensureDir(MEMORY_DIR);

      const prefsPath = path.join(MEMORY_DIR, 'preferences.json');
      const errorsPath = path.join(MEMORY_DIR, 'errors.json');
      const projectsPath = path.join(MEMORY_DIR, 'projects.json');
      const sessionsPath = path.join(MEMORY_DIR, 'sessions.json');

      if (await fs.pathExists(prefsPath)) this.store.preferences = await fs.readJson(prefsPath);
      if (await fs.pathExists(errorsPath)) this.store.errorPatterns = await fs.readJson(errorsPath);
      if (await fs.pathExists(projectsPath)) this.store.projectKnowledge = await fs.readJson(projectsPath);
      if (await fs.pathExists(sessionsPath)) this.store.sessionSummaries = await fs.readJson(sessionsPath);

      this.loaded = true;
      console.log(`[AgentMemory] Loaded: ${Object.keys(this.store.preferences).length} prefs, ${this.store.errorPatterns.length} error patterns, ${this.store.sessionSummaries.length} sessions`);
    } catch (e) {
      console.warn(`[AgentMemory] Could not load memory, starting fresh.`);
      this.loaded = true;
    }
  }

  /** Save current state to disk */
  async save(): Promise<void> {
    try {
      await fs.ensureDir(MEMORY_DIR);
      await fs.writeJson(path.join(MEMORY_DIR, 'preferences.json'), this.store.preferences, { spaces: 2 });
      await fs.writeJson(path.join(MEMORY_DIR, 'errors.json'), this.store.errorPatterns.slice(-50), { spaces: 2 }); // Keep last 50
      await fs.writeJson(path.join(MEMORY_DIR, 'projects.json'), this.store.projectKnowledge, { spaces: 2 });
      await fs.writeJson(path.join(MEMORY_DIR, 'sessions.json'), this.store.sessionSummaries.slice(-20), { spaces: 2 }); // Keep last 20
    } catch (e) {
      console.warn(`[AgentMemory] Could not save memory.`);
    }
  }

  // ── Preferences ──
  setPreference(key: string, value: any) {
    this.store.preferences[key] = value;
    this.save().catch(() => {});
  }

  getPreference(key: string): any {
    return this.store.preferences[key];
  }

  getAllPreferences(): Record<string, any> {
    return { ...this.store.preferences };
  }

  // ── Error Patterns ──
  recordError(tool: string, error: string, solution: string) {
    this.store.errorPatterns.push({
      tool, error: error.substring(0, 200), solution: solution.substring(0, 200),
      timestamp: Date.now()
    });
    this.save().catch(() => {});
  }

  findSimilarErrors(tool: string): Array<{ error: string, solution: string }> {
    return this.store.errorPatterns
      .filter(e => e.tool === tool)
      .slice(-5)  // Last 5 errors for this tool
      .map(e => ({ error: e.error, solution: e.solution }));
  }

  // ── Project Knowledge ──
  setProjectKnowledge(key: string, value: any) {
    this.store.projectKnowledge[key] = value;
    this.save().catch(() => {});
  }

  getProjectKnowledge(key: string): any {
    return this.store.projectKnowledge[key];
  }

  // ── Session Summaries ──
  addSessionSummary(summary: string) {
    this.store.sessionSummaries.push({ timestamp: Date.now(), summary });
    this.save().catch(() => {});
  }

  getRecentSessions(count: number = 5): string[] {
    return this.store.sessionSummaries
      .slice(-count)
      .map(s => `[${new Date(s.timestamp).toLocaleDateString()}] ${s.summary}`);
  }

  /**
   * Generate a memory context string for injection into system prompt.
   * Returns relevant preferences and patterns the agent should know about.
   */
  getMemoryContext(): string {
    const parts: string[] = [];

    const prefs = this.getAllPreferences();
    if (Object.keys(prefs).length > 0) {
      parts.push(`User Preferences: ${JSON.stringify(prefs)}`);
    }

    const sessions = this.getRecentSessions(3);
    if (sessions.length > 0) {
      parts.push(`Recent Sessions:\n${sessions.join('\n')}`);
    }

    return parts.length > 0 ? parts.join('\n') : '';
  }
}

/**
 * Context Window Manager — Smart Conversation Trimming
 * 
 * Manages the conversation history to prevent context window overflow.
 * Strategies:
 * - Summarize old tool results (replace with brief summaries)
 * - Drop old thinking/thought parts
 * - Keep recent tool calls intact
 * - Never drop the system instruction or latest user message
 */
export class ContextWindowManager {
  // Rough token estimation: ~4 chars per token
  private static estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Trim conversation contents to fit within a safe context window.
   * Preserves: system instruction, first user message, last 8 turns.
   * Summarizes: old tool responses, removes old thought parts.
   * 
   * @param contents The full conversation history
   * @param maxTokens Target maximum tokens (default: 800K, safe for Gemini)
   * @returns Trimmed contents
   */
  static trimContents(contents: any[], maxTokens: number = 800000): any[] {
    // Estimate current size
    const totalChars = JSON.stringify(contents).length;
    const estimatedTokens = this.estimateTokens(JSON.stringify(contents));

    if (estimatedTokens < maxTokens * 0.8) {
      // Under 80% — no trimming needed
      return contents;
    }

    console.log(`[ContextManager] ⚠️ Context is ${(estimatedTokens / 1000).toFixed(0)}K tokens. Trimming...`);

    // Strategy: Keep first 2 entries and last 10 entries intact
    // Middle entries: summarize tool responses, drop thinking parts, strip SYSTEM injections
    const keepHead = 2;
    const keepTail = 10;

    if (contents.length <= keepHead + keepTail) {
      return contents; // Too short to trim
    }

    const trimmed: any[] = [
      ...contents.slice(0, keepHead),
      {
        role: 'user',
        parts: [{ text: '[SYSTEM] Earlier conversation was summarized to manage context. Recent context is intact.' }]
      },
    ];

    // Middle section: summarize
    const middle = contents.slice(keepHead, contents.length - keepTail);
    for (const entry of middle) {
      if (entry.role === 'user' && entry.parts) {
        // Strip old [SYSTEM] injections and nudges — they're outdated
        const textContent = entry.parts.map((p: any) => p.text || '').join('');
        if (textContent.startsWith('[SYSTEM]') || 
            textContent.includes('STOP THINKING and use your tools') ||
            textContent.includes('Continue to the next pending step')) {
          continue; // Drop these completely — they're stale context
        }

        // Summarize tool responses (functionResponse parts)
        const hasFunctionResponse = entry.parts.some((p: any) => p.functionResponse);
        if (hasFunctionResponse) {
          const summarizedParts = entry.parts.map((p: any) => {
            if (p.functionResponse) {
              const outputStr = JSON.stringify(p.functionResponse.response?.output || '');
              if (outputStr.length > 500) {
                return {
                  functionResponse: {
                    name: p.functionResponse.name,
                    response: { output: { summary: `[Summarized: ${p.functionResponse.name} returned ${(outputStr.length / 1024).toFixed(1)}KB]` } },
                    ...(p.functionResponse.id ? { id: p.functionResponse.id } : {})
                  }
                };
              }
            }
            return p;
          });
          trimmed.push({ ...entry, parts: summarizedParts });
        } else {
          // Keep short user messages, summarize long ones
          if (textContent.length > 1000) {
            trimmed.push({
              role: entry.role,
              parts: [{ text: textContent.substring(0, 200) + '... [truncated]' }]
            });
          } else {
            trimmed.push(entry);
          }
        }
      } else if (entry.role === 'model' && entry.parts) {
        // Drop thinking parts from old model responses, keep function calls and text
        const filteredParts = entry.parts.filter((p: any) => !p.thought);
        // Also truncate long text parts in old model responses
        const compactParts = filteredParts.map((p: any) => {
          if (p.text && p.text.length > 500) {
            return { text: p.text.substring(0, 300) + '... [truncated]' };
          }
          return p;
        });
        if (compactParts.length > 0) {
          trimmed.push({ ...entry, parts: compactParts });
        }
      } else {
        trimmed.push(entry);
      }
    }

    // Append tail (recent turns) intact
    trimmed.push(...contents.slice(contents.length - keepTail));

    const newTokens = this.estimateTokens(JSON.stringify(trimmed));
    console.log(`[ContextManager] Trimmed: ${(estimatedTokens / 1000).toFixed(0)}K → ${(newTokens / 1000).toFixed(0)}K tokens (${trimmed.length} entries)`);

    return trimmed;
  }
}

export const agentMemory = new AgentMemory();
