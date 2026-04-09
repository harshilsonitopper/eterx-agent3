import fs from 'fs-extra';
import path from 'path';

/**
 * SessionStateManager v2 — Persistent Session Continuity + Self-Review Engine
 * 
 * v2 UPGRADES:
 * - Rich file tracking: stores file purpose + content snapshot, not just paths
 * - Self-review: can read back created files to understand what was built
 * - Smart "work more" support: knows what was created and what can be enhanced
 * - Task plan persistence: remembers the decomposed plan and completed steps
 * - Edit history: tracks what was modified, not just what was created
 */

const SESSION_DIR = path.resolve(process.cwd(), '.workspaces', '.session');
const STATE_FILE = path.join(SESSION_DIR, 'state.json');
const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

/** Rich file record — tracks what was done to each file and why */
interface FileRecord {
  filename: string;
  action: 'created' | 'edited' | 'deleted';
  purpose: string;       // Why this file was created/edited
  contentPreview: string; // First 150 chars of content
  sizeBytes: number;
  timestamp: number;
}

export interface SessionState {
  /** Normalized tool call signatures that have been executed */
  callHistory: string[];
  /** Files that have been written in this session (paths only, for dedup) */
  writtenFiles: string[];
  /** Rich file records with content previews */
  fileRecords: FileRecord[];
  /** Skills loaded via get_skill_guidelines */
  loadedSkills: string[];
  /** Whether task_decomposer was already used */
  taskDecomposerUsed: boolean;
  /** Per-tool call counts */
  toolCallCounts: Record<string, number>;
  /** Per-category call counts */
  categoryCallCounts: Record<string, number>;
  /** Last user message (for "continue" context) */
  lastUserMessage: string;
  /** Summary of what the agent accomplished */
  actionSummary: string[];
  /** The agent's final answer text from last message */
  lastAgentOutput: string;
  /** Current task plan steps (from task_decomposer or tracker) */
  taskPlanSteps: Array<{ name: string; status: 'pending' | 'done'; description?: string }>;
  /** Timestamp of last activity */
  lastActivityAt: number;
  /** Session creation timestamp */
  createdAt: number;
}

const EMPTY_STATE: SessionState = {
  callHistory: [],
  writtenFiles: [],
  fileRecords: [],
  loadedSkills: [],
  taskDecomposerUsed: false,
  toolCallCounts: {},
  categoryCallCounts: {},
  lastUserMessage: '',
  actionSummary: [],
  lastAgentOutput: '',
  taskPlanSteps: [],
  lastActivityAt: Date.now(),
  createdAt: Date.now(),
};

export class SessionStateManager {
  private state: SessionState = { ...EMPTY_STATE };
  private loaded = false;
  private currentProjectId: string | null = null;

  /**
   * Load session state from disk. Returns true if a valid (non-expired) session was restored.
   */
  public async load(): Promise<boolean> {
    try {
      if (!await fs.pathExists(STATE_FILE)) {
        this.state = { ...EMPTY_STATE, createdAt: Date.now(), lastActivityAt: Date.now() };
        this.loaded = true;
        return false;
      }

      const data = await fs.readJson(STATE_FILE);

      // Check if session is expired (idle too long)
      const elapsed = Date.now() - (data.lastActivityAt || 0);
      if (elapsed > SESSION_TIMEOUT_MS) {
        console.log(`[Session] ⏰ Session expired (${ (elapsed / 60000).toFixed(1) } min idle). Starting fresh.`);
        this.state = { ...EMPTY_STATE, createdAt: Date.now(), lastActivityAt: Date.now() };
        this.loaded = true;
        await this.save();
        return false;
      }

      // BUG FIX: Check if session is TOO OLD (absolute age, not just idle time)
      // This catches the case where the app was running for hours but a session
      // from a completely different task is still "active"
      const absoluteAge = Date.now() - (data.createdAt || 0);
      const MAX_SESSION_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours absolute max
      if (absoluteAge > MAX_SESSION_AGE_MS) {
        console.log(`[Session] 🕐 Session too old (${ (absoluteAge / 60000).toFixed(1) } min absolute age). Starting fresh.`);
        this.state = { ...EMPTY_STATE, createdAt: Date.now(), lastActivityAt: Date.now() };
        this.loaded = true;
        await this.save();
        return false;
      }

      this.state = {
        callHistory: Array.isArray(data.callHistory) ? data.callHistory : [],
        writtenFiles: Array.isArray(data.writtenFiles) ? data.writtenFiles : [],
        fileRecords: Array.isArray(data.fileRecords) ? data.fileRecords : [],
        loadedSkills: Array.isArray(data.loadedSkills) ? data.loadedSkills : [],
        taskDecomposerUsed: !!data.taskDecomposerUsed,
        toolCallCounts: data.toolCallCounts || {},
        categoryCallCounts: data.categoryCallCounts || {},
        lastUserMessage: data.lastUserMessage || '',
        actionSummary: Array.isArray(data.actionSummary) ? data.actionSummary : [],
        lastAgentOutput: data.lastAgentOutput || '',
        taskPlanSteps: Array.isArray(data.taskPlanSteps) ? data.taskPlanSteps : [],
        lastActivityAt: Date.now(),
        createdAt: data.createdAt || Date.now(),
      };
      this.loaded = true;
      this.currentProjectId = data._projectId || null;

      const sessionAge = ((Date.now() - this.state.createdAt) / 60000).toFixed(1);
      console.log(`[Session] ✅ Restored session (${ sessionAge } min old, project: ${ this.currentProjectId || 'unknown' }) — ${ this.state.callHistory.length } calls, ${ this.state.fileRecords.length } files tracked, ${ this.state.loadedSkills.length } skills`);
      return true;
    } catch (err: any) {
      console.warn(`[Session] ⚠️ Failed to load session: ${ err.message }`);
      this.state = { ...EMPTY_STATE, createdAt: Date.now(), lastActivityAt: Date.now() };
      this.loaded = true;
      return false;
    }
  }

  /**
   * Load session for a specific project/conversation.
   * If the stored session belongs to a DIFFERENT project, reset it.
   * This prevents stale state from old conversations bleeding into new ones.
   */
  public async loadForProject(projectId: string): Promise<boolean> {
    const restored = await this.load();

    // If the session was from a DIFFERENT project/conversation, reset it
    if (restored && this.currentProjectId && this.currentProjectId !== projectId) {
      console.log(`[Session] 🔄 Project changed (${ this.currentProjectId } → ${ projectId }). Clearing stale session.`);
      this.state = { ...EMPTY_STATE, createdAt: Date.now(), lastActivityAt: Date.now() };
      this.currentProjectId = projectId;
      await this.save();
      return false;
    }

    this.currentProjectId = projectId;
    return restored;
  }

  /** Get the current project ID this session is bound to */
  public getCurrentProjectId(): string | null {
    return this.currentProjectId;
  }

  /**
   * Save current session state to disk.
   */
  public async save(): Promise<void> {
    try {
      this.state.lastActivityAt = Date.now();
      await fs.ensureDir(SESSION_DIR);
      // Save with _projectId metadata so loadForProject can detect project changes
      await fs.writeJson(STATE_FILE, { ...this.state, _projectId: this.currentProjectId }, { spaces: 2 });
    } catch (err: any) {
      console.warn(`[Session] ⚠️ Failed to save session: ${ err.message }`);
    }
  }

  /**
   * Hydrate ReAct loop state from the persisted session.
   */
  public hydrate(): {
    callHistory: Set<string>;
    writtenFiles: Set<string>;
    loadedSkills: Set<string>;
    taskDecomposerUsed: boolean;
    toolCallCounts: Map<string, number>;
    categoryCallCounts: Map<string, number>;
  } {
    return {
      callHistory: new Set(this.state.callHistory),
      writtenFiles: new Set(this.state.writtenFiles),
      loadedSkills: new Set(this.state.loadedSkills),
      taskDecomposerUsed: this.state.taskDecomposerUsed,
      toolCallCounts: new Map(Object.entries(this.state.toolCallCounts)),
      categoryCallCounts: new Map(Object.entries(this.state.categoryCallCounts)),
    };
  }

  /**
   * Persist the current loop state back to the session.
   */
  public updateFromLoop(data: {
    callHistory: Set<string>;
    writtenFiles: Set<string>;
    loadedSkills: Set<string>;
    taskDecomposerUsed: boolean;
    toolCallCounts: Map<string, number>;
    categoryCallCounts: Map<string, number>;
  }): void {
    this.state.callHistory = Array.from(data.callHistory);
    this.state.writtenFiles = Array.from(data.writtenFiles);
    this.state.loadedSkills = Array.from(data.loadedSkills);
    this.state.taskDecomposerUsed = data.taskDecomposerUsed;
    this.state.toolCallCounts = Object.fromEntries(data.toolCallCounts);
    this.state.categoryCallCounts = Object.fromEntries(data.categoryCallCounts);
  }

  /** Record the user's message for "continue" context. */
  public setLastUserMessage(message: string): void {
    this.state.lastUserMessage = message;
  }

  /** Get the last user message (for "continue" routing). */
  public getLastUserMessage(): string {
    return this.state.lastUserMessage;
  }

  /** Store the agent's final answer so it can review its own output. */
  public setLastAgentOutput(output: string): void {
    // Keep last 1500 chars for meaningful context on follow-up messages
    this.state.lastAgentOutput = output.substring(0, 1500);
  }

  /** Get the agent's last output. */
  public getLastAgentOutput(): string {
    return this.state.lastAgentOutput;
  }

  /**
   * Track a file with rich metadata — what was done and why.
   * Called from the ReAct loop when workspace_write_file or workspace_edit_file succeeds.
   */
  public trackFile(filename: string, action: 'created' | 'edited' | 'deleted', purpose: string, content?: string): void {
    // Remove existing record for this file (update in place)
    this.state.fileRecords = this.state.fileRecords.filter(r => r.filename !== filename);

    this.state.fileRecords.push({
      filename,
      action,
      purpose: purpose.substring(0, 100),
      contentPreview: (content || '').substring(0, 150).replace(/\n/g, ' '),
      sizeBytes: content ? content.length : 0,
      timestamp: Date.now(),
    });

    // Cap at 15 most recent file records
    if (this.state.fileRecords.length > 15) {
      this.state.fileRecords = this.state.fileRecords.slice(-15);
    }
  }

  /**
   * Store the current task plan steps for progress tracking.
   */
  public setTaskPlan(steps: Array<{ name: string; status: 'pending' | 'done'; description?: string }>): void {
    this.state.taskPlanSteps = steps.slice(0, 20); // Cap at 20 steps
  }

  /** Add a human-readable action summary entry. */
  public addAction(action: string): void {
    this.state.actionSummary.push(action);
    if (this.state.actionSummary.length > 15) {
      this.state.actionSummary = this.state.actionSummary.slice(-15);
    }
  }

  /** Get the human-readable action summary. */
  public getActions(): string[] {
    return this.state.actionSummary || [];
  }

  /**
   * SELF-REVIEW: Read back the actual files the agent created in this session.
   * Returns a compact summary of each file's current content.
   * This lets the agent "see" its own work when the user says "work more on it".
   */
  public async selfReview(): Promise<string> {
    if (this.state.fileRecords.length === 0) return '';

    const reviews: string[] = [];

    for (const record of this.state.fileRecords.slice(-8)) { // Review last 8 files max
      try {
        const fullPath = path.isAbsolute(record.filename)
          ? record.filename
          : path.resolve(process.cwd(), record.filename);

        if (await fs.pathExists(fullPath)) {
          const content = await fs.readFile(fullPath, 'utf-8');
          const lines = content.split('\n');
          const lineCount = lines.length;
          const sizeKB = (content.length / 1024).toFixed(1);

          // Smart preview: first 5 lines + last 2 lines for context
          let preview: string;
          if (lineCount <= 10) {
            preview = content.substring(0, 300);
          } else {
            const head = lines.slice(0, 5).join('\n');
            const tail = lines.slice(-2).join('\n');
            preview = `${ head }\n... (${ lineCount - 7 } more lines) ...\n${ tail }`;
            if (preview.length > 400) preview = preview.substring(0, 400);
          }

          reviews.push(`📄 ${ record.filename } (${ record.action }, ${ lineCount } lines, ${ sizeKB }KB):\n${ preview }`);
        } else {
          reviews.push(`⚠️ ${ record.filename } — file no longer exists`);
        }
      } catch {
        reviews.push(`⚠️ ${ record.filename } — could not read`);
      }
    }

    return reviews.length > 0
      ? `━━━ SELF-REVIEW: Your Previous Output ━━━\n${ reviews.join('\n\n') }\n━━━ END REVIEW ━━━`
      : '';
  }

  /**
   * Generate a concise session summary for injection into system prompt.
   * Returns empty string if nothing meaningful happened yet.
   */
  public getSessionSummary(): string {
    if (this.state.actionSummary.length === 0 && this.state.fileRecords.length === 0 && !this.state.lastUserMessage) {
      return '';
    }

    const parts: string[] = [];

    if (this.state.lastUserMessage) {
      parts.push(`Previous task: "${ this.state.lastUserMessage.substring(0, 120) }"`);
    }

    // Rich file summary — shows what was created and what it contains
    if (this.state.fileRecords.length > 0) {
      const fileSummary = this.state.fileRecords.slice(-8).map(r =>
        `  • ${ r.filename } (${ r.action }) — ${ r.purpose || r.contentPreview || 'no description' }`
      ).join('\n');
      parts.push(`Files in this session:\n${ fileSummary }`);
    }

    if (this.state.loadedSkills.length > 0) {
      parts.push(`Skills loaded: ${ this.state.loadedSkills.join(', ') } (DO NOT reload)`);
    }

    if (this.state.taskDecomposerUsed) {
      parts.push(`Task decomposer already used (DO NOT call again)`);
    }

    // Task plan progress
    if (this.state.taskPlanSteps.length > 0) {
      const done = this.state.taskPlanSteps.filter(s => s.status === 'done').length;
      const total = this.state.taskPlanSteps.length;
      const pending = this.state.taskPlanSteps.filter(s => s.status === 'pending');
      parts.push(`Task plan: ${ done }/${ total } steps done${ pending.length > 0 ? `. Next: "${ pending[0].name }"` : ' — ALL COMPLETE' }`);
    }

    if (this.state.actionSummary.length > 0) {
      const recent = this.state.actionSummary.slice(-6);
      parts.push(`Recent actions:\n${ recent.map((a, i) => `  ${ i + 1 }. ${ a }`).join('\n') }`);
    }

    // Brief mention of last output
    if (this.state.lastAgentOutput) {
      parts.push(`Last output preview: "${ this.state.lastAgentOutput.substring(0, 100) }..."`);
    }

    return parts.length > 0
      ? `\n━━━ SESSION MEMORY ━━━\n${ parts.join('\n') }\n\nIMPORTANT: If user says "work more", "add more", "continue" — enhance the FILES LISTED ABOVE. Use workspace_read_file to review them, then workspace_edit_file to improve. Do NOT recreate from scratch.\n━━━ END SESSION ━━━`
      : '';
  }

  /**
   * Clear the session completely.
   */
  public async clear(): Promise<void> {
    this.state = { ...EMPTY_STATE, createdAt: Date.now(), lastActivityAt: Date.now() };
    try {
      if (await fs.pathExists(STATE_FILE)) {
        await fs.remove(STATE_FILE);
      }
    } catch { /* silent */ }
  }

  /**
   * Check if we have an active session with meaningful state.
   */
  public hasActiveSession(): boolean {
    return this.state.callHistory.length > 0 || this.state.fileRecords.length > 0;
  }
}

// Singleton instance
export const globalSessionManager = new SessionStateManager();
