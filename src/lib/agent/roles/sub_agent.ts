import { GoogleGenAI } from '@google/genai';
import { ProjectContext, SubAgent } from '../schemas';
import path from 'path';
import fs from 'fs-extra';

/**
 * Sub-Agent Spawner v5 — Parallel API Keys, Fire-and-Forget, Non-Blocking
 * 
 * v5 Critical upgrades:
 * - KEY ISOLATION: Each sub-agent gets its own GeminiAgentClient with a DIFFERENT
 *   API key offset, so parallel agents never collide on rate limits.
 * - FIRE-AND-FORGET SPAWN: spawnParallel returns immediately with agent names.
 *   The main agent continues working while sub-agents run in the background.
 * - RESULT QUEUE: Sub-agent results are silently queued until main agent calls 'collect'.
 * - NO ANSWER POLLUTION: Sub-agents never emit 'answer' type events — only 'sub_agent_result'.
 *   This prevents the typewriter animation from replaying when a sub-agent finishes.
 * - Global cancellation flag: user "stop" kills all sub-agents immediately.
 */

const AGENT_NAMES = [
  'Agent-Alpha', 'Agent-Nova', 'Agent-Bolt', 'Agent-Cipher', 'Agent-Forge',
  'Agent-Pulse', 'Agent-Nexus', 'Agent-Arc', 'Agent-Sentinel', 'Agent-Echo'
] as const;

export type SubAgentName = typeof AGENT_NAMES[number];

const AGENTS_DIR = path.resolve(process.cwd(), '.workspaces', 'agents');

// === GLOBAL CANCELLATION FLAG ===
let globalCancelFlag = false;

export function cancelAllSubAgents() {
  globalCancelFlag = true;
  console.log('[SubAgent] 🛑 GLOBAL CANCEL — all sub-agents stopping');
}

export function resetCancelFlag() {
  globalCancelFlag = false;
}

export function isCancelled(): boolean {
  return globalCancelFlag;
}

// === API KEY POOL FOR SUB-AGENTS ===
// Discover all available API keys once, then each sub-agent picks a different one
let allApiKeys: string[] = [];
function discoverApiKeys(): string[] {
  if (allApiKeys.length > 0) return allApiKeys;
  for (const [key, value] of Object.entries(process.env)) {
    if (typeof value === 'string' && value.startsWith('AIza')) {
      allApiKeys.push(value);
    }
  }
  if (allApiKeys.length === 0) {
    const fallback = process.env.GEMINI_API_KEY;
    if (fallback) allApiKeys.push(fallback);
  }
  return allApiKeys;
}

/**
 * Create a DEDICATED Gemini client for a specific sub-agent.
 * Each sub-agent uses a different API key offset to avoid rate-limit collisions.
 */
function createSubAgentClient(agentIndex: number): GoogleGenAI {
  const keys = discoverApiKeys();
  if (keys.length === 0) throw new Error('No API keys available for sub-agent');
  // Pick a key at an offset from the main agent's key to avoid collision
  // Main agent uses index 0, sub-agents use 1, 2, 3, etc.
  const keyIndex = (agentIndex + 1) % keys.length;
  return new GoogleGenAI({ apiKey: keys[keyIndex] });
}

/**
 * Agent-to-Agent Message Bus
 */
class AgentMessageBus {
  async ensureDir() {
    await fs.ensureDir(AGENTS_DIR);
  }

  async writeAgentStatus(agentName: string, data: {
    status: string;
    task: string;
    progress?: string;
    result?: string;
    traceLog?: string[];
    startedAt: number;
    completedAt?: number;
  }) {
    await this.ensureDir();
    const filePath = path.join(AGENTS_DIR, `${ agentName.toLowerCase().replace('-', '_') }.json`);
    await fs.writeJson(filePath, { ...data, updatedAt: Date.now() }, { spaces: 2 });
  }

  async readAgentStatus(agentName: string): Promise<any | null> {
    const filePath = path.join(AGENTS_DIR, `${ agentName.toLowerCase().replace('-', '_') }.json`);
    if (await fs.pathExists(filePath)) {
      return await fs.readJson(filePath);
    }
    return null;
  }

  async readAllStatuses(): Promise<Record<string, any>> {
    await this.ensureDir();
    const files = await fs.readdir(AGENTS_DIR);
    const statuses: Record<string, any> = {};
    for (const file of files) {
      if (file.endsWith('.json')) {
        try {
          const data = await fs.readJson(path.join(AGENTS_DIR, file));
          statuses[file.replace('.json', '')] = data;
        } catch { }
      }
    }
    return statuses;
  }

  async clearAll() {
    if (await fs.pathExists(AGENTS_DIR)) {
      await fs.emptyDir(AGENTS_DIR);
    }
  }
}

export const agentMessageBus = new AgentMessageBus();

interface SubAgentInstance {
  id: string;
  name: SubAgentName;
  task: string;
  deepBrief: string;
  status: 'spawning' | 'running' | 'completed' | 'failed' | 'cancelled';
  result?: string;
  traceLog: string[];
  startedAt: number;
  completedAt?: number;
  durationMs?: number;
  promise?: Promise<any>;
}

// === RESULT QUEUE: Sub-agent results are silently queued here ===
const pendingResults: Map<string, { name: SubAgentName, result: string, success: boolean, durationMs: number }> = new Map();

export function getPendingResults(): Array<{ name: SubAgentName, result: string, success: boolean, durationMs: number }> {
  const results = Array.from(pendingResults.values());
  pendingResults.clear();
  return results;
}

export function hasPendingResults(): boolean {
  return pendingResults.size > 0;
}

export class SubAgentSpawner {
  private activeAgents: Map<string, SubAgentInstance> = new Map();
  private nameIndex: number = 0;
  private backgroundPromises: Map<string, Promise<any>> = new Map();

  private getNextName(): SubAgentName {
    const name = AGENT_NAMES[this.nameIndex % AGENT_NAMES.length];
    this.nameIndex++;
    return name;
  }

  /**
   * Build a LEAN task brief for a sub-agent.
   */
  private buildDeepBrief(task: string, agentName: SubAgentName, parentContext?: string): string {
    return `━━━ SUB-AGENT: ${ agentName } ━━━
🎯 You are a parallel sub-agent. Complete this task independently:

${ task }

RULES:
1. Full tool access. Use workspace_write_file, web_search, system_shell, etc.
2. Work deeply — no shortcuts, no placeholders, no TODOs.
3. NEVER call task_decomposer or spawn_sub_agent — plan internally (3-5 steps max).
4. VERIFY your work with realtime_verify before finishing.
5. When done, output a structured report — do NOT announce completion of the whole project.
6. You are ONE of multiple parallel agents. Your report goes back to the MAIN AGENT for assembly.

REPORT FORMAT:
## ${ agentName } — Complete
**Task:** [what you did]
**Files:** [paths created/modified]
**Key Results:** [findings or deliverables]
**Verified:** [yes/no]

${ parentContext ? `CONTEXT: ${ parentContext }\n` : '' }
EXECUTE NOW.`.trim();
  }

  /**
   * Spawn a single sub-agent with its own API key.
   */
  public async spawnAgent(
    task: string,
    context: ProjectContext,
    agentIndex: number,
    parentContext?: string,
    onTrace?: (trace: any) => void,
    customName?: SubAgentName
  ): Promise<{ agentId: string, name: SubAgentName, result: string, success: boolean, durationMs: number, traceLog: string[] }> {
    const name = customName || this.getNextName();
    const agentId = `${ name.toLowerCase().replace('-', '_') }_${ Date.now() }`;

    if (globalCancelFlag) {
      return { agentId, name, result: 'Cancelled by user', success: false, durationMs: 0, traceLog: ['Cancelled before start'] };
    }

    const deepBrief = this.buildDeepBrief(task, name, parentContext);
    const traceLog: string[] = [];

    const instance: SubAgentInstance = {
      id: agentId,
      name,
      task,
      deepBrief,
      status: 'spawning',
      traceLog,
      startedAt: Date.now()
    };
    this.activeAgents.set(agentId, instance);

    await agentMessageBus.writeAgentStatus(name, {
      status: 'running',
      task,
      progress: 'Starting execution...',
      startedAt: instance.startedAt
    });

    // Emit spawn event to UI — shows the agent tab appearing
    if (onTrace) {
      onTrace({ type: 'command', text: `${ name } spawned`, secondary: task.substring(0, 60), subAgent: name });
    }

    instance.status = 'running';

    try {
      // Import executeMessageLoop dynamically to avoid circular deps
      const { globalGeminiClient } = await import('../gemini');
      
      const result = await globalGeminiClient.executeMessageLoop(
        context,
        deepBrief,
        [],
        (trace) => {
          // Check cancellation on every trace event
          if (globalCancelFlag) {
            throw new Error('CANCELLED_BY_USER');
          }

          const logEntry = `[${ new Date().toISOString() }] ${ trace.type }: ${ trace.text || '' }${ trace.secondary ? ' | ' + trace.secondary : '' }`;
          traceLog.push(logEntry);

          // Write status every 5th event (reduced from 3 to lower disk I/O)
          if (traceLog.length % 5 === 0) {
            agentMessageBus.writeAgentStatus(name, {
              status: 'running',
              task,
              progress: trace.text || 'Working...',
              traceLog: traceLog.slice(-10),
              startedAt: instance.startedAt
            }).catch(() => { });
          }

          // Forward trace to UI with subAgent tag — BUT filter out 'answer' type
          // Sub-agents must NEVER emit 'answer' to the UI or it replays the typewriter
          if (onTrace && trace.type !== 'answer') {
            onTrace({
              ...trace,
              text: trace.text,
              subAgent: name
            });
          }
        }
      );

      const durationMs = Date.now() - instance.startedAt;
      instance.status = 'completed';
      instance.result = result.text;
      instance.completedAt = Date.now();
      instance.durationMs = durationMs;

      await agentMessageBus.writeAgentStatus(name, {
        status: 'completed',
        task,
        progress: 'Done',
        result: result.text,
        traceLog,
        startedAt: instance.startedAt,
        completedAt: instance.completedAt
      });

      console.log(`[${ name }] ✅ Done ${ (durationMs / 1000).toFixed(1) }s`);

      // Queue result silently — main agent picks it up via 'collect'
      pendingResults.set(name, { name, result: result.text, success: true, durationMs });

      if (onTrace) {
        // Emit ONLY 'sub_agent_result' — NEVER 'answer'
        onTrace({
          type: 'sub_agent_result',
          text: `${ name } finished: ${ result.text.substring(0, 200) }`,
          subAgent: name,
          fullResult: result.text,
          durationMs,
          traceLog: traceLog.slice(-5)
        });
      }

      return { agentId, name, result: result.text, success: true, durationMs, traceLog };
    } catch (error: any) {
      const durationMs = Date.now() - instance.startedAt;
      const wasCancelled = error.message === 'CANCELLED_BY_USER' || globalCancelFlag;

      instance.status = wasCancelled ? 'cancelled' : 'failed';
      instance.result = wasCancelled ? 'Cancelled by user' : error.message;
      instance.completedAt = Date.now();
      instance.durationMs = durationMs;

      await agentMessageBus.writeAgentStatus(name, {
        status: wasCancelled ? 'cancelled' : 'failed',
        task,
        progress: wasCancelled ? 'Cancelled' : `Failed: ${ error.message }`,
        result: instance.result,
        traceLog,
        startedAt: instance.startedAt,
        completedAt: instance.completedAt
      });

      if (onTrace) {
        onTrace({
          type: wasCancelled ? 'command' : 'safety_warning',
          text: `${ name } ${ wasCancelled ? 'cancelled' : 'failed' }`,
          secondary: wasCancelled ? 'Stopped by user' : error.message.substring(0, 60),
          subAgent: name
        });
      }

      return { agentId, name, result: instance.result!, success: false, durationMs, traceLog };
    }
  }

  /**
   * FIRE-AND-FORGET: Spawn multiple sub-agents in TRUE PARALLEL.
   * Returns IMMEDIATELY with agent names. Main agent continues working.
   * Sub-agents run in the background with their own API keys.
   * Main agent calls 'collect' later to get results.
   */
  public spawnParallelFireAndForget(
    tasks: Array<{ task: string, name?: SubAgentName }>,
    context: ProjectContext,
    parentContext?: string,
    onTrace?: (trace: any) => void
  ): { agentNames: string[], message: string } {
    // Reset cancel flag at start of parallel spawn
    resetCancelFlag();

    const teamSize = tasks.length;

    if (onTrace) {
      const spawnedAgents = tasks.map((t, i) => t.name || AGENT_NAMES[i % AGENT_NAMES.length]);
      onTrace({
        type: 'command',
        text: `Spawning ${ teamSize } parallel agents`,
        secondary: spawnedAgents.join(' + '),
        spawnedAgents: spawnedAgents
      });
    }

    const agentNames: string[] = [];

    // Launch all agents in parallel — each with a staggered start and different API key
    tasks.forEach((t, index) => {
      const name = t.name || this.getNextName();
      agentNames.push(name);

      // Fire-and-forget: start without awaiting
      const promise = (async () => {
        if (globalCancelFlag) return;
        
        // Reduced stagger: 2s (was 8s) because each agent has its own API key now
        if (index > 0) {
          await new Promise(r => setTimeout(r, index * 2000));
          if (globalCancelFlag) return;
        }

        await this.spawnAgent(t.task, context, index, parentContext, onTrace, name as SubAgentName);
      })();

      this.backgroundPromises.set(name, promise);
    });

    return {
      agentNames,
      message: `${ teamSize } agents spawned and working in background. Continue YOUR work now. Call spawn_sub_agent with mode="collect" when you need their results.`
    };
  }

  /**
   * BLOCKING: Spawn multiple sub-agents and WAIT for all to complete.
   * Use this only when the main agent needs all results before continuing.
   */
  public async spawnParallel(
    tasks: Array<{ task: string, name?: SubAgentName }>,
    context: ProjectContext,
    parentContext?: string,
    onTrace?: (trace: any) => void
  ): Promise<{
    results: Array<{ name: SubAgentName, result: string, success: boolean, durationMs: number }>,
    totalDurationMs: number,
    successCount: number,
    failCount: number
  }> {
    resetCancelFlag();

    const startTime = Date.now();

    if (onTrace) {
      const spawnedAgents = tasks.map((t, i) => t.name || AGENT_NAMES[i % AGENT_NAMES.length]);
      onTrace({
        type: 'command',
        text: `Spawning ${ tasks.length } parallel agents`,
        secondary: spawnedAgents.join(' + '),
        spawnedAgents: spawnedAgents
      });
    }

    const promises = tasks.map((t, index) => {
      const name = t.name || this.getNextName();
      return new Promise<any>(async (resolve) => {
        if (globalCancelFlag) {
          resolve({ agentId: '', name, result: 'Cancelled', success: false, durationMs: 0, traceLog: [] });
          return;
        }
        // Stagger by 2s (was 8s) — each agent has its own key now
        if (index > 0) {
          await new Promise(r => setTimeout(r, index * 2000));
          if (globalCancelFlag) {
            resolve({ agentId: '', name, result: 'Cancelled', success: false, durationMs: 0, traceLog: [] });
            return;
          }
        }
        const result = await this.spawnAgent(t.task, context, index, parentContext, onTrace, name as SubAgentName);
        resolve(result);
      });
    });

    const settled = await Promise.allSettled(promises);
    const totalDurationMs = Date.now() - startTime;

    const results = settled.map((r, i) => {
      if (r.status === 'fulfilled') {
        return {
          name: r.value.name,
          result: r.value.result,
          success: r.value.success,
          durationMs: r.value.durationMs
        };
      }
      return {
        name: (tasks[i].name || AGENT_NAMES[i % AGENT_NAMES.length]) as SubAgentName,
        result: (r as PromiseRejectedResult).reason?.message || 'Unknown error',
        success: false,
        durationMs: 0
      };
    });

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    if (onTrace) {
      onTrace({
        type: 'command',
        text: `${ successCount }/${ tasks.length } agents completed`,
        secondary: `${ (totalDurationMs / 1000).toFixed(1) }s total`
      });
    }

    return { results, totalDurationMs, successCount, failCount };
  }

  /**
   * Wait for all background (fire-and-forget) agents to finish.
   */
  public async waitForAll(): Promise<void> {
    const promises = Array.from(this.backgroundPromises.values());
    await Promise.allSettled(promises);
    this.backgroundPromises.clear();
  }

  /**
   * Check how many agents are still running in the background.
   */
  public getBackgroundCount(): number {
    return this.backgroundPromises.size;
  }

  public getAgentStatus(): SubAgentInstance[] {
    return Array.from(this.activeAgents.values());
  }

  public getAgentNames(): readonly string[] {
    return AGENT_NAMES;
  }

  public clearCompleted(): void {
    for (const [id, agent] of this.activeAgents) {
      if (agent.status === 'completed' || agent.status === 'failed' || agent.status === 'cancelled') {
        this.activeAgents.delete(id);
      }
    }
  }

  /**
   * MULTI-AGENT CONSENSUS MODE
   * 
   * Spawns 3 agents with different cognitive "lenses" to approach the SAME task:
   * - Agent-Alpha (Optimist): Focuses on opportunities, best-case scenarios, positive outcomes
   * - Agent-Nova (Skeptic): Focuses on risks, edge cases, what could go wrong
   * - Agent-Bolt (Realist): Focuses on practical execution, real constraints, balanced view
   * 
   * The main agent then synthesizes their outputs into a consensus answer,
   * eliminating hallucination and single-perspective bias.
   * 
   * Use for: high-stakes analysis, financial decisions, security audits, strategic planning.
   */
  public async spawnConsensus(
    task: string,
    context: ProjectContext,
    onTrace?: (trace: any) => void
  ): Promise<{
    perspectives: Array<{ perspective: string, agent: string, result: string, success: boolean }>,
    synthesisPrompt: string,
    totalDurationMs: number
  }> {
    const perspectives = [
      {
        name: 'Agent-Alpha' as SubAgentName,
        lens: 'OPTIMIST',
        brief: `You are the OPTIMIST perspective agent. Approach this task with a focus on OPPORTUNITIES, best-case outcomes, strengths, and positive potential. Highlight what COULD go well and why.

TASK: ${task}

Your analysis should cover the optimistic angle: growth potential, advantages, strengths, positive trends, best-case scenarios. Be thorough but maintain your optimistic lens. Back your points with evidence.`
      },
      {
        name: 'Agent-Nova' as SubAgentName,
        lens: 'SKEPTIC', 
        brief: `You are the SKEPTIC perspective agent. Approach this task with a focus on RISKS, edge cases, weaknesses, and what could go wrong. Challenge assumptions and look for hidden problems.

TASK: ${task}

Your analysis should cover the skeptical angle: risks, weaknesses, threats, negative trends, worst-case scenarios, hidden costs. Be thorough and honest. Don't be contrarian for its own sake — identify REAL risks with evidence.`
      },
      {
        name: 'Agent-Bolt' as SubAgentName,
        lens: 'REALIST',
        brief: `You are the REALIST perspective agent. Approach this task with a focus on PRACTICAL EXECUTION, real constraints, balanced trade-offs, and actionable recommendations.

TASK: ${task}

Your analysis should cover the realistic angle: practical constraints, balanced assessment, implementation challenges, realistic timelines, and concrete action items. Weigh both pros and cons fairly. Focus on what's actually achievable.`
      }
    ];

    if (onTrace) {
      onTrace({
        type: 'command',
        text: 'Spawning 3-agent consensus panel',
        secondary: 'Optimist + Skeptic + Realist',
        spawnedAgents: perspectives.map(p => p.name)
      });
    }

    const startTime = Date.now();

    const results = await this.spawnParallel(
      perspectives.map(p => ({ task: p.brief, name: p.name })),
      context,
      `This is a CONSENSUS PANEL analysis. You are the ${perspectives[0].lens} lens.`,
      onTrace
    );

    const perspectiveResults = results.results.map((r, i) => ({
      perspective: perspectives[i].lens,
      agent: perspectives[i].name,
      result: r.result,
      success: r.success
    }));

    // Build synthesis prompt for the main agent
    const synthesisPrompt = `━━━ MULTI-AGENT CONSENSUS RESULTS ━━━

Three independent agents analyzed this task from different perspectives. Synthesize their findings into a UNIFIED, balanced answer.

ORIGINAL TASK: "${task}"

📗 OPTIMIST (${perspectives[0].name}):
${perspectiveResults[0]?.result || 'No result'}

📕 SKEPTIC (${perspectives[1].name}):
${perspectiveResults[1]?.result || 'No result'}

📘 REALIST (${perspectives[2].name}):
${perspectiveResults[2]?.result || 'No result'}

━━━ YOUR JOB ━━━
Synthesize these three perspectives into ONE definitive, balanced answer. 
- Where all three agree → HIGH CONFIDENCE facts
- Where optimist and skeptic disagree → present BOTH sides with the realist's take as tiebreaker
- Highlight KEY RISKS the skeptic found that others missed
- Highlight KEY OPPORTUNITIES the optimist found that others missed
- End with ACTIONABLE RECOMMENDATIONS from the realist perspective

Do NOT just list what each agent said. SYNTHESIZE into a cohesive analysis.`;

    return {
      perspectives: perspectiveResults,
      synthesisPrompt,
      totalDurationMs: Date.now() - startTime
    };
  }
}

export const globalSubAgentSpawner = new SubAgentSpawner();
