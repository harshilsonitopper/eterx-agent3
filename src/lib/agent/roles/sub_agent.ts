import { globalGeminiClient } from '../gemini';
import { ProjectContext, SubAgent } from '../schemas';
import path from 'path';
import fs from 'fs-extra';

/**
 * Sub-Agent Spawner v4 — Rate-Limited, Cancellable, Non-Blocking
 * 
 * Critical upgrades over v3:
 * - Global cancellation flag: user "stop" kills all sub-agents immediately
 * - Sub-agents run with reduced max iterations (15) to limit API usage
 * - Results stream back to main agent via traceLog in real-time
 * - Non-blocking spawn mode: main agent continues working while sub-agents run
 * - Detailed completion reports auto-injected into main agent on finish
 */

const AGENT_NAMES = [
  'Agent-Alpha', 'Agent-Nova', 'Agent-Bolt', 'Agent-Cipher', 'Agent-Forge',
  'Agent-Pulse', 'Agent-Nexus', 'Agent-Arc', 'Agent-Sentinel', 'Agent-Echo'
] as const;

export type SubAgentName = typeof AGENT_NAMES[number];

const AGENTS_DIR = path.resolve(process.cwd(), '.workspaces', 'agents');

// === GLOBAL CANCELLATION FLAG ===
// When set to true, all sub-agents abort at the next loop iteration
let globalCancelFlag = false;

export function cancelAllSubAgents() {
  globalCancelFlag = true;
  console.log('[SubAgent] 🛑 GLOBAL CANCEL — all sub-agents will stop at next iteration');
}

export function resetCancelFlag() {
  globalCancelFlag = false;
}

export function isCancelled(): boolean {
  return globalCancelFlag;
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

export class SubAgentSpawner {
  private activeAgents: Map<string, SubAgentInstance> = new Map();
  private nameIndex: number = 0;

  private getNextName(): SubAgentName {
    const name = AGENT_NAMES[this.nameIndex % AGENT_NAMES.length];
    this.nameIndex++;
    return name;
  }

  /**
   * Build a LEAN task brief for a sub-agent.
   * Reduced from v3's massive prompt to save tokens.
   */
  private buildDeepBrief(task: string, agentName: SubAgentName, parentContext?: string): string {
    return `━━━ SUB-AGENT: ${ agentName } ━━━
🎯 You are a parallel sub-agent. Complete this task independently:

${ task }

RULES:
1. Full tool access. Use workspace_write_file, web_search, system_shell, etc.
2. Work deeply — no shortcuts, no placeholders, no TODOs.
3. NEVER call task_decomposer — plan internally (3-5 steps max).
4. Limit web_search to 2 calls. Read files only ONCE each.
5. VERIFY your work with realtime_verify before finishing.
6. When done, output a structured report.

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
   * Spawn a single sub-agent with rate-limited execution.
   */
  public async spawnAgent(
    task: string,
    context: ProjectContext,
    parentContext?: string,
    onTrace?: (trace: any) => void,
    customName?: SubAgentName
  ): Promise<{ agentId: string, name: SubAgentName, result: string, success: boolean, durationMs: number, traceLog: string[] }> {
    const name = customName || this.getNextName();
    const agentId = `${ name.toLowerCase().replace('-', '_') }_${ Date.now() }`;

    // Check cancellation before starting
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

    console.log(`[${ name }] ⚡ Spawned for: "${ task.substring(0, 100) }..."`);

    await agentMessageBus.writeAgentStatus(name, {
      status: 'running',
      task,
      progress: 'Starting execution...',
      startedAt: instance.startedAt
    });

    if (onTrace) {
      onTrace({ type: 'command', text: `${ name } spawned`, secondary: task.substring(0, 60) });
    }

    instance.status = 'running';

    try {
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

          // Write status every 3rd event
          if (traceLog.length % 3 === 0) {
            agentMessageBus.writeAgentStatus(name, {
              status: 'running',
              task,
              progress: trace.text || 'Working...',
              traceLog: traceLog.slice(-10),
              startedAt: instance.startedAt
            }).catch(() => { });
          }

          if (onTrace) {
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

      console.log(`[${ name }] ✅ Completed in ${ (durationMs / 1000).toFixed(1) }s`);

      if (onTrace) {
        // Emit detailed completion event for the main agent and UI
        onTrace({ type: 'command', text: `${ name } completed`, secondary: `${ (durationMs / 1000).toFixed(1) }s` });
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

      if (wasCancelled) {
        console.log(`[${ name }] 🛑 Cancelled after ${ (durationMs / 1000).toFixed(1) }s`);
      } else {
        console.error(`[${ name }] ❌ Failed in ${ (durationMs / 1000).toFixed(1) }s: ${ error.message }`);
      }

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
   * Spawn multiple sub-agents in TRUE PARALLEL.
   * Increased stagger to 8s to reduce API pressure.
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
    // Reset cancel flag at start of parallel spawn
    resetCancelFlag();

    const teamSize = tasks.length;
    console.log(`\n[SubAgent] ━━━ SPAWNING ${ teamSize } PARALLEL AGENTS ━━━`);
    tasks.forEach((t, i) => {
      const name = t.name || AGENT_NAMES[i % AGENT_NAMES.length];
      console.log(`  ${ name }: ${ t.task.substring(0, 80) }`);
    });

    if (onTrace) {
      const spawnedAgents = tasks.map((t, i) => t.name || AGENT_NAMES[i % AGENT_NAMES.length]);
      onTrace({
        type: 'command',
        text: `Spawning ${ teamSize } parallel agents`,
        secondary: spawnedAgents.join(' + '),
        spawnedAgents: spawnedAgents
      });
    }

    const startTime = Date.now();

    // Stagger agent launches by 8s to avoid API rate-limit cascade
    const promises = tasks.map((t, index) => {
      const name = t.name || this.getNextName();
      return new Promise<any>(async (resolve) => {
        if (globalCancelFlag) {
          resolve({ agentId: '', name, result: 'Cancelled', success: false, durationMs: 0, traceLog: [] });
          return;
        }
        if (index > 0) {
          const staggerDelay = index * 8000; // 8s stagger (was 5s)
          console.log(`[SubAgent] ⏳ ${ name } staggered launch in ${ staggerDelay / 1000 }s...`);
          await new Promise(r => setTimeout(r, staggerDelay));
          // Re-check cancel after waiting
          if (globalCancelFlag) {
            resolve({ agentId: '', name, result: 'Cancelled', success: false, durationMs: 0, traceLog: [] });
            return;
          }
        }
        const result = await this.spawnAgent(t.task, context, parentContext, onTrace, name);
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

    console.log(`\n[SubAgent] ━━━ TEAM RESULTS ━━━`);
    console.log(`  Total: ${ teamSize } | Success: ${ successCount } | Failed: ${ failCount } | Duration: ${ (totalDurationMs / 1000).toFixed(1) }s`);

    if (onTrace) {
      onTrace({
        type: 'command',
        text: `${ successCount }/${ teamSize } agents completed`,
        secondary: `${ (totalDurationMs / 1000).toFixed(1) }s total`
      });
    }

    return { results, totalDurationMs, successCount, failCount };
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
}

export const globalSubAgentSpawner = new SubAgentSpawner();
