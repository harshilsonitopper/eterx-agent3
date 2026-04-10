import { WorkspaceManager } from './workspace/manager';
import { globalMemoryManager } from './memory/store';
import { AgentResponse, AgentTask } from './schemas';
import { globalGeminiClient } from './gemini';
import { globalSubAgentSpawner, resetCancelFlag } from './roles/sub_agent';
import { globalSessionManager } from './session';
import { Critic } from './roles/critic';
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
  private critic = new Critic();

  /**
   * Classify task complexity to decide if auto-parallel or critic loop is needed.
   * Returns: 'trivial' | 'standard' | 'complex' | 'critical'
   */
  private classifyComplexity(request: string): 'trivial' | 'standard' | 'complex' | 'critical' {
    const words = request.trim().split(/\s+/).length;
    const lower = request.toLowerCase();

    // Trivial: short acknowledgments, greetings, simple questions
    if (words < 8 && /\b(thanks|ok|cool|hi|hello|hey|good|nice|yes|no|ty|thx)\b/i.test(lower)) return 'trivial';

    // Critical: explicit high-stakes keywords
    if (/\b(deploy|production|publish|release|security audit|penetration|financial|legal|compliance)\b/i.test(lower)) return 'critical';

    // Complex: multi-part tasks, long requests, project-level work
    if (words > 60) return 'complex';
    if (/\b(build.*app|create.*system|full.*stack|entire|complete|comprehensive|compare.*vs|analyze.*and.*analyze)\b/i.test(lower)) return 'complex';
    if ((lower.match(/\band\b/g) || []).length >= 3) return 'complex'; // 3+ "and" = multi-part

    return 'standard';
  }

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

    console.log(`[Orchestrator] ▶ "${effectiveRequest.substring(0, 80)}" | User: ${userId}`);
    
    await globalMemoryManager.initialize();
    resetCancelFlag();
    await globalSessionManager.loadForProject(projectId);
    globalSessionManager.setLastUserMessage(effectiveRequest);
    globalGeminiClient.setMode(mode);

    const workspace = new WorkspaceManager(userId, projectId);
    await workspace.initialize();
    const context = globalMemoryManager.getProjectContext(projectId);
    await this.hydrateContext(context, projectId);

    const startTime = Date.now();
    const complexity = this.classifyComplexity(userRequest);
    console.log(`[Orchestrator] 🧠 Task complexity: ${complexity}`);
    
    // Progress tracking
    const emitProgress = (stage: string, percent: number) => {
      if (onTrace) {
        onTrace({ type: 'progress', text: stage, percent });
      }
    };

    emitProgress('Executing autonomous agent', 10);
    
    let finalAnswer = "";
    
    try {
      // ═══════════════════════════════════════════════════════
      // PHASE 1: PRIMARY EXECUTION
      // ═══════════════════════════════════════════════════════
      finalAnswer = (await globalGeminiClient.executeMessageLoop(
        context,
        effectiveRequest,
        history,
        onTrace,
        mediaFiles,
        imageBackupParts
      )).text;

      // ═══════════════════════════════════════════════════════
      // PHASE 2: CRITIC SELF-CORRECTION LOOP (complex+ tasks only)
      // Skipped for trivial/standard to keep speed.
      // The critic evaluates the output. If it fails, the agent
      // gets ONE retry with the critic's feedback injected.
      // ═══════════════════════════════════════════════════════
      if (complexity === 'complex' || complexity === 'critical') {
        try {
          emitProgress('Quality verification', 85);
          if (onTrace) onTrace({ type: 'thought_stream', text: 'Running quality verification...', isDelta: false });

          const criticResult = await this.critic.evaluateOutput(userRequest, finalAnswer, context);

          if (!criticResult.passed) {
            console.log(`[Orchestrator] 🔄 Critic REJECTED output. Feedback: ${criticResult.feedback.substring(0, 120)}`);
            if (onTrace) onTrace({ type: 'thought_stream', text: `Self-correction: ${criticResult.feedback.substring(0, 100)}...`, isDelta: false });

            // Build a self-correction prompt with critic feedback
            const correctionHistory = [
              ...history,
              { role: 'user', parts: [{ text: effectiveRequest }] },
              { role: 'model', parts: [{ text: finalAnswer }] },
            ];

            const correctionPrompt = `[SELF-CORRECTION — CRITIC FEEDBACK]\nYour previous answer was evaluated and REJECTED by the quality system.\n\nCritic Feedback: "${criticResult.feedback}"\n\nOriginal Request: "${userRequest}"\n\nFix the issues identified above. Produce an improved, complete answer. Do NOT explain what was wrong — just deliver the corrected output.`;

            emitProgress('Self-correcting...', 90);

            const correctedResult = await globalGeminiClient.executeMessageLoop(
              context,
              correctionPrompt,
              correctionHistory,
              onTrace,
              [], // No media on retry
              []
            );

            finalAnswer = correctedResult.text;
            console.log(`[Orchestrator] ✅ Self-correction complete.`);
          } else {
            console.log(`[Orchestrator] ✅ Critic APPROVED output.`);
          }
        } catch (criticError: any) {
          // Critic failure is non-fatal — original answer stands
          console.warn(`[Orchestrator] ⚠️ Critic loop error (non-fatal): ${criticError.message}`);
        }
      }
      
    } catch (error: any) {
      finalAnswer = `Agent Execution Failed: ${error.message}`;
      console.error(`[Orchestrator] 💥 Fatal error:`, error.message);
      globalMemoryManager.logError('orchestrator', error.message, `Task: ${userRequest}`);
    }

    // Save session state after execution
    await globalSessionManager.save();

    // Packaging (Delivery)
    const outputFilename = `result_${Date.now()}.txt`;
    await workspace.exportOutput(outputFilename, finalAnswer);

    // Archiving to Memory
    globalMemoryManager.saveEpisodicMemory(
      projectId, 
      `Executed task: ${userRequest}`, 
      'task_result',
      7,
      ['task', 'success']
    );

    globalMemoryManager.learnPreference(userId, 'interaction', 'last_successful_task', {
      task: userRequest.substring(0, 200),
      timestamp: Date.now()
    });

    const executionTime = Date.now() - startTime;
    console.log(`[Orchestrator] ✅ Pipeline complete in ${executionTime}ms (complexity: ${complexity})`);

    return {
      taskId: crypto.randomUUID(),
      success: true,
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
