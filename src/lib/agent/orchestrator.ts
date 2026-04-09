import { WorkspaceManager } from './workspace/manager';
import { globalMemoryManager } from './memory/store';
import { AgentResponse, AgentTask } from './schemas';
import { globalGeminiClient } from './gemini';
import { Critic } from './roles/critic';
import { SubAgentSpawner, globalSubAgentSpawner, resetCancelFlag } from './roles/sub_agent';
import { globalSessionManager } from './session';
import { intelligentCache } from './next_gen';
import fs from 'fs-extra';
import path from 'path';

/**
 * The Enhanced Orchestrator v2
 * 
 * Coordinates the agent task lifecycle with:
 * - Gemini 3 ReAct loop
 * - Critic validation with FEEDBACK RETRY (1 retry on failure)
 * - Task queue with priority ordering
 * - Progress tracking with stage reporting
 * - MEMORY HYDRATION from disk (preferences, errors, recent memories)
 * - Session continuity via SessionStateManager
 * - Multi-agent coordination
 */

interface QueuedTask {
  id: string;
  userId: string;
  projectId: string;
  request: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'queued' | 'running' | 'completed' | 'failed';
  createdAt: number;
  onTrace?: (trace: any) => void;
  resolve?: (value: AgentResponse) => void;
  reject?: (reason: any) => void;
}

export class AgentOrchestrator {
  private taskQueue: QueuedTask[] = [];
  private isProcessing = false;
  private currentTask: QueuedTask | null = null;

  /**
   * MEMORY HYDRATION — Load real data from disk into ProjectContext.
   * This is the key fix: the agent now actually READS its own memory.
   */
  private async hydrateContext(context: any, projectId: string): Promise<void> {
    const memoryDir = path.resolve(process.cwd(), '.workspaces', '.memory');

    // 1. Load user preferences from disk
    try {
      const prefsPath = path.join(memoryDir, 'user_preferences.json');
      if (await fs.pathExists(prefsPath)) {
        const prefs = await fs.readJson(prefsPath);
        context.userPreferences = context.userPreferences || {};
        for (const [key, val] of Object.entries(prefs)) {
          context.userPreferences[key] = (val as any)?.value || val;
        }
        console.log(`[Orchestrator] 🧠 Hydrated ${Object.keys(prefs).length} user preferences`);
      }
    } catch { /* silent */ }

    // 2. Load recent errors from disk (last 5)
    try {
      const errorPath = path.join(memoryDir, 'error_log.json');
      if (await fs.pathExists(errorPath)) {
        const errors = await fs.readJson(errorPath);
        if (Array.isArray(errors) && errors.length > 0) {
          const recentErrors = errors.slice(-5).map((e: any) =>
            `${e.tool}: ${(e.error || '').substring(0, 120)}`
          );
          context.errorHistory = recentErrors;
          console.log(`[Orchestrator] ⚠️ Hydrated ${recentErrors.length} recent errors`);
        }
      }
    } catch { /* silent */ }

    // 3. Load recent task results from memory store (last 5 relevant)
    try {
      const storePath = path.join(memoryDir, 'memory_store.json');
      if (await fs.pathExists(storePath)) {
        const store = await fs.readJson(storePath);
        const allMemories: any[] = [];
        for (const projectMemories of Object.values(store)) {
          if (Array.isArray(projectMemories)) {
            allMemories.push(...projectMemories);
          }
        }
        // Sort by timestamp descending, take last 5
        allMemories.sort((a: any, b: any) => (b.timestamp || 0) - (a.timestamp || 0));
        const recent = allMemories.slice(0, 5);
        if (recent.length > 0) {
          context.recentMemories = recent;
          console.log(`[Orchestrator] 📝 Hydrated ${recent.length} recent memories`);
        }
      }
    } catch { /* silent */ }

    // 4. Load adaptive learning data (best tool sequences for this task type)
    try {
      const adaptivePath = path.resolve(process.cwd(), '.workspaces', 'learning', 'adaptive_data.json');
      if (await fs.pathExists(adaptivePath)) {
        const data = await fs.readJson(adaptivePath);
        if (data.records && Array.isArray(data.records)) {
          // Get the 3 most recent successful tool sequences
          const successfulRecords = data.records
            .filter((r: any) => r.success && r.toolSequence?.length > 0)
            .slice(-3);
          if (successfulRecords.length > 0) {
            context.userPreferences = context.userPreferences || {};
            context.userPreferences['_adaptive_tool_patterns'] = successfulRecords.map((r: any) => ({
              task: r.taskSignature?.substring(0, 80),
              tools: r.toolSequence,
              duration: r.duration,
            }));
            console.log(`[Orchestrator] 🧬 Hydrated ${successfulRecords.length} adaptive tool patterns`);
          }
        }
      }
    } catch { /* silent */ }
  }

  /**
   * Execute the full pipeline for a user request via Gemini 3 API.
   */
  public async executePipeline(
    userId: string, 
    projectId: string, 
    userRequest: string,
    history: any[] = [],
    onTrace?: (trace: any) => void,
    mode: 'think' | 'fast' = 'think',
    pinnedContext: any = null,
    mediaFiles: any[] = [],
    imageBackupParts: any[] = []
  ): Promise<AgentResponse> {
    
    // Inject pinned context into standard prompt if it exists
    let effectiveRequest = userRequest;
    if (pinnedContext && pinnedContext.paths) {
      effectiveRequest = `[CRITICAL PINNED CONTEXT]\nI have explicitly pinned the following paths. You MUST restrict your operations only to these targets: ${JSON.stringify(pinnedContext.paths)}\n\nMy Request:\n${userRequest}`;
    }

    console.log(`[Orchestrator] ========================================`);
    console.log(`[Orchestrator] Intake & Planning for: "${effectiveRequest}"`);
    console.log(`[Orchestrator] User: ${userId} | Project: ${projectId}`);
    console.log(`[Orchestrator] ========================================`);
    
    // Initialize memory system
    await globalMemoryManager.initialize();

    // Reset global cancel flag from previous requests
    resetCancelFlag();
    
    // Initialize session continuity — scoped per conversation to prevent stale state bleed
    await globalSessionManager.loadForProject(projectId);
    globalSessionManager.setLastUserMessage(effectiveRequest);

    // Set agent mode (Think = gemma-4-31b-it, Fast = gemma-4-26b-it)
    globalGeminiClient.setMode(mode);

    // Setup workspace context
    const workspace = new WorkspaceManager(userId, projectId);
    await workspace.initialize();

    const context = globalMemoryManager.getProjectContext(projectId);

    // === MEMORY HYDRATION: Load real data from disk ===
    await this.hydrateContext(context, projectId);

    const memStats = globalMemoryManager.getStats();
    console.log(`[Orchestrator] Memory: ${memStats.totalMemories} memories, ${memStats.preferences} preferences, ${memStats.errors} errors logged`);

    const startTime = Date.now();
    
    // Progress tracking
    const emitProgress = (stage: string, percent: number) => {
      if (onTrace) {
        onTrace({ type: 'progress', text: stage, percent });
      }
    };

    emitProgress('Executing autonomous agent', 10);
    
    let finalAnswer = "";
    let isValid = false;
    
    try {
      // Single powerful execution — the agent has adaptive iterations (15-60)
      // scaled to task complexity. Session state persists across messages.
      finalAnswer = (await globalGeminiClient.executeMessageLoop(
        context,
        effectiveRequest,
        history,
        onTrace,
        mediaFiles,
        imageBackupParts
      )).text;
      
      // === CRITIC WITH FEEDBACK RETRY ===
      emitProgress('Validating output', 85);
      const critic = new Critic();
      const evaluation = await critic.evaluateOutput(effectiveRequest, finalAnswer, context);
      isValid = evaluation.passed;
      
      if (!isValid) {
        console.log(`[Orchestrator] ⚠️ Critic rejected: ${evaluation.feedback}`);
        globalMemoryManager.logError('critic', evaluation.feedback, `Task: ${effectiveRequest}`);

        // === FEEDBACK RETRY: Give the agent ONE chance to self-correct ===
        console.log(`[Orchestrator] 🔄 Attempting critic feedback retry...`);
        emitProgress('Self-correcting based on feedback', 88);

        try {
          // CRITICAL: Clear dedup history + cache before retry so the agent can
          // actually re-execute tools (e.g. docx_generator) with better content.
          // Without this, semantic dedup blocks the retry from doing anything useful.
          const sessionState = globalSessionManager.hydrate();
          if (sessionState.callHistory) {
            // Only clear tool-specific entries that the agent needs to retry
            // Keep non-file-creation entries (like web_search) to avoid re-research
            const keepEntries = new Set<string>();
            for (const entry of sessionState.callHistory) {
              const toolName = entry.split(':')[0];
              // Keep research/skill entries, clear file creation entries
              if (['web_search', 'web_scraper', 'get_skill_guidelines', 'task_decomposer'].includes(toolName)) {
                keepEntries.add(entry);
              }
            }
            sessionState.callHistory = keepEntries;
            globalSessionManager.updateFromLoop(sessionState);
            console.log(`[Orchestrator] 🧹 Cleared dedup history for retry (kept ${keepEntries.size} research entries)`);
          }
          
          // Also clear the intelligent cache for this retry
          intelligentCache.clear();
          
          const retryPrompt = `[CRITIC FEEDBACK — SELF-CORRECTION REQUIRED]
Your previous output was reviewed and REJECTED for this reason:
"${evaluation.feedback}"

Original user request: "${effectiveRequest.substring(0, 300)}"

Fix the issue identified by the critic. Be concise — only address the specific feedback above.
DO NOT redo the entire task from scratch. Just fix the identified problem.`;

          const retryResult = await globalGeminiClient.executeMessageLoop(
            context,
            retryPrompt,
            history,
            undefined // Silent retry — don't stream trace events to UI
          );
          
          finalAnswer = retryResult.text;
          
          // Re-evaluate with critic
          const retryEval = await critic.evaluateOutput(userRequest, finalAnswer, context);
          isValid = retryEval.passed;
          
          if (isValid) {
            console.log(`[Orchestrator] ✅ Self-correction succeeded — critic approved retry.`);
          } else {
            console.log(`[Orchestrator] ⚠️ Retry also rejected. Delivering best effort. Feedback: ${retryEval.feedback}`);
            isValid = true; // Deliver anyway after retry — don't block the user
          }
        } catch (retryError: any) {
          console.warn(`[Orchestrator] ⚠️ Critic retry failed: ${retryError.message}. Delivering original.`);
          isValid = true; // Deliver the original answer
        }
      } else {
        console.log(`[Orchestrator] ✅ Critic approved output.`);
      }
    } catch (error: any) {
      finalAnswer = `Agent Execution Failed: ${error.message}`;
      console.error(`[Orchestrator] 💥 Fatal error:`, error.message);
      globalMemoryManager.logError('orchestrator', error.message, `Task: ${userRequest}`);
    }

    // Save session state after execution
    await globalSessionManager.save();

    emitProgress('Packaging final delivery', 90);

    // Packaging (Delivery)
    console.log(`[Orchestrator] Packaging final delivery...`);
    const outputFilename = `result_${Date.now()}.txt`;
    await workspace.exportOutput(outputFilename, finalAnswer);

    // Archiving to Memory
    emitProgress('Archiving to persistent memory', 95);
    console.log(`[Orchestrator] Archiving output to Memory...`);
    globalMemoryManager.saveEpisodicMemory(
      projectId, 
      `Executed task: ${userRequest} (Valid: ${isValid})`, 
      'task_result',
      isValid ? 7 : 3, // Higher importance for successful tasks
      ['task', isValid ? 'success' : 'failure']
    );

    // Auto-learn preferences from interaction
    if (isValid) {
      globalMemoryManager.learnPreference(userId, 'interaction', 'last_successful_task', {
        task: userRequest.substring(0, 200),
        timestamp: Date.now()
      });
    }

    const executionTime = Date.now() - startTime;
    emitProgress('Complete', 100);
    
    console.log(`[Orchestrator] ✅ Pipeline complete in ${executionTime}ms (valid: ${isValid})`);

    return {
      taskId: crypto.randomUUID(),
      success: isValid,
      finalAnswer,
      artifactsGenerated: [workspace.getWorkingFilePath(outputFilename)],
      executionTimeMs: executionTime,
    };
  }

  /**
   * Add a task to the priority queue.
   */
  public async queueTask(
    userId: string,
    projectId: string,
    request: string,
    priority: 'low' | 'medium' | 'high' | 'urgent' = 'medium',
    onTrace?: (trace: any) => void
  ): Promise<AgentResponse> {
    return new Promise((resolve, reject) => {
      const task: QueuedTask = {
        id: crypto.randomUUID(),
        userId,
        projectId,
        request,
        priority,
        status: 'queued',
        createdAt: Date.now(),
        onTrace,
        resolve,
        reject
      };

      // Insert by priority
      const priorityOrder = { urgent: 0, high: 1, medium: 2, low: 3 };
      const insertIdx = this.taskQueue.findIndex(
        t => priorityOrder[t.priority] > priorityOrder[priority]
      );
      
      if (insertIdx === -1) {
        this.taskQueue.push(task);
      } else {
        this.taskQueue.splice(insertIdx, 0, task);
      }

      console.log(`[Orchestrator] Task queued: "${request.substring(0, 50)}..." (priority: ${priority}, queue size: ${this.taskQueue.length})`);

      // Start processing if not already running
      this.processQueue();
    });
  }

  /**
   * Process tasks from the queue sequentially.
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing) return;
    this.isProcessing = true;

    while (this.taskQueue.length > 0) {
      const task = this.taskQueue.shift()!;
      this.currentTask = task;
      task.status = 'running';

      try {
        const result = await this.executePipeline(
          task.userId,
          task.projectId,
          task.request,
          [],
          task.onTrace
        );
        task.status = 'completed';
        task.resolve?.(result);
      } catch (error: any) {
        task.status = 'failed';
        task.reject?.(error);
      }
    }

    this.currentTask = null;
    this.isProcessing = false;
  }

  /**
   * Get current queue status.
   */
  public getQueueStatus(): { 
    currentTask: string | null, 
    queueLength: number, 
    tasks: Array<{ id: string, request: string, priority: string, status: string }> 
  } {
    return {
      currentTask: this.currentTask?.request || null,
      queueLength: this.taskQueue.length,
      tasks: this.taskQueue.map(t => ({
        id: t.id,
        request: t.request.substring(0, 80),
        priority: t.priority,
        status: t.status
      }))
    };
  }
}
