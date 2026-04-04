import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import { globalSubAgentSpawner, agentMessageBus, SubAgentName } from '../../roles/sub_agent';

/**
 * Spawn Sub-Agent Tool — Full-Power Parallel Agent Spawner
 * + Agent-to-Agent Protocol
 * 
 * The main agent uses this to spawn parallel workers when it identifies
 * independent tasks. Sub-agents are FULL CLONES with ALL tools.
 * 
 * MODES:
 * - spawn: Launch sub-agents (parallel or single). Returns immediately with agent names.
 * - status: Check what sub-agents are doing right now (read their progress).
 * - collect: Get final results from completed sub-agents (full content + trace log).
 * - clear: Clean up completed agent files.
 * 
 * AGENT-TO-AGENT PROTOCOL:
 * The main agent spawns sub-agents → sub-agents write progress to .workspaces/agents/ → 
 * main agent can check status or collect results at any time.
 * 
 * WHEN TO USE:
 * - Multiple INDEPENDENT tasks that don't depend on each other
 * - Deep research + coding can happen simultaneously
 * - File creation in different dirs can be parallelized
 * - NOT for sequential/dependent tasks — do those in order yourself
 */
export const spawnSubAgentTool: ToolDefinition = {
  name: 'spawn_sub_agent',
  description: `Spawn full-power sub-agents for parallel execution, check their status, or collect results.

MODES:
- "spawn": Launch 1+ sub-agents in parallel. They have ALL tools (same as you). Give each a clear, detailed task. Returns agent names for tracking.
- "status": Check what sub-agents are doing right now. Returns their current progress and trace logs.
- "collect": Get final results from completed sub-agents. Returns their full output and what they did.
- "clear": Clean up completed agent data files.

NAMED AGENTS: Agent-Alpha, Agent-Nova, Agent-Bolt, Agent-Cipher, Agent-Forge, Agent-Pulse, Agent-Nexus, Agent-Arc, Agent-Sentinel, Agent-Echo

WORKFLOW:
1. Call with mode="spawn" and your tasks
2. Continue YOUR OWN work while sub-agents run
3. When you need their results, call mode="collect"

WHEN TO SPAWN: Only when tasks are INDEPENDENT (don't need each other's output). Example: researching topic A while writing code for topic B.`,
  category: 'core',
  inputSchema: z.object({
    mode: z.enum(['spawn', 'status', 'collect', 'clear'])
      .describe('spawn = launch agents, status = check progress, collect = get results, clear = cleanup'),
    tasks: z.array(z.object({
      task: z.string().describe('Detailed task description for this sub-agent'),
      name: z.string().optional().describe('Optional agent name (auto-assigned if not provided)')
    })).optional().describe('Array of tasks for spawn mode'),
    agentName: z.string().optional().describe('Specific agent name to check status/collect for (or omit for all)')
  }),
  outputSchema: z.object({
    mode: z.string(),
    agents: z.array(z.any()),
    message: z.string()
  }),
  execute: async (input: {
    mode: string,
    tasks?: Array<{ task: string, name?: string }>,
    agentName?: string
  }, context: any) => {
    console.log(`[Tool: spawn_sub_agent] Mode: ${ input.mode }`);

    // Extract the UI trace callback from context (injected by gemini.ts)
    const onTrace = context?._onTrace as ((t: any) => void) | undefined;

    switch (input.mode) {
      // ═══ SPAWN: Launch sub-agents in parallel ═══
      case 'spawn': {
        if (!input.tasks || input.tasks.length === 0) {
          return { mode: 'spawn', agents: [], message: 'ERROR: No tasks provided. Pass tasks array with {task, name?} objects.' };
        }

        const taskList = input.tasks.map(t => ({
          task: t.task,
          name: t.name as SubAgentName | undefined
        }));

        // Build parent context — what the main agent knows so far
        const parentContext = `Main agent spawned ${ taskList.length } parallel sub-agents. Each agent works independently on its assigned task.`;

        // Spawn all agents in parallel — pass onTrace so sub-agent activity streams to the UI live
        const results = await globalSubAgentSpawner.spawnParallel(
          taskList,
          context,
          parentContext,
          onTrace
        );

        return {
          mode: 'spawn',
          agents: results.results.map(r => ({
            name: r.name,
            success: r.success,
            durationMs: r.durationMs,
            resultPreview: r.result.substring(0, 500)
          })),
          message: `Spawned ${ results.results.length } agents. ${ results.successCount } succeeded, ${ results.failCount } failed. Total time: ${ (results.totalDurationMs / 1000).toFixed(1) }s.`,
          fullResults: results.results
        };
      }

      // ═══ STATUS: Check what sub-agents are doing ═══
      case 'status': {
        if (input.agentName) {
          const status = await agentMessageBus.readAgentStatus(input.agentName);
          if (!status) {
            return { mode: 'status', agents: [], message: `No status found for ${ input.agentName }` };
          }
          return {
            mode: 'status',
            agents: [{
              name: input.agentName,
              status: status.status,
              progress: status.progress,
              task: status.task,
              recentActions: status.traceLog?.slice(-5) || []
            }],
            message: `${ input.agentName }: ${ status.status } — ${ status.progress || 'working...' }`
          };
        }

        // Get all agent statuses
        const allStatuses = await agentMessageBus.readAllStatuses();
        const agents = Object.entries(allStatuses).map(([name, data]: [string, any]) => ({
          name,
          status: data.status,
          progress: data.progress,
          task: data.task?.substring(0, 80),
          recentActions: data.traceLog?.slice(-3) || []
        }));

        return {
          mode: 'status',
          agents,
          message: agents.length > 0
            ? `${ agents.length } agents tracked. ${ agents.filter((a: any) => a.status === 'running').length } running, ${ agents.filter((a: any) => a.status === 'completed').length } completed.`
            : 'No active sub-agents.'
        };
      }

      // ═══ COLLECT: Get final results from completed sub-agents ═══
      case 'collect': {
        if (input.agentName) {
          const status = await agentMessageBus.readAgentStatus(input.agentName);
          if (!status) {
            return { mode: 'collect', agents: [], message: `No data found for ${ input.agentName }` };
          }
          return {
            mode: 'collect',
            agents: [{
              name: input.agentName,
              status: status.status,
              result: status.result || 'No result yet',
              traceLog: status.traceLog || [],
              task: status.task,
              durationMs: status.completedAt ? status.completedAt - status.startedAt : null
            }],
            message: `${ input.agentName }: ${ status.status }. Full result and trace log returned.`
          };
        }

        // Collect ALL completed results
        const allStatuses = await agentMessageBus.readAllStatuses();
        const agents = Object.entries(allStatuses).map(([name, data]: [string, any]) => ({
          name,
          status: data.status,
          result: data.result || 'No result yet',
          traceLog: data.traceLog || [],
          task: data.task,
          durationMs: data.completedAt ? data.completedAt - data.startedAt : null
        }));

        return {
          mode: 'collect',
          agents,
          message: `Collected data from ${ agents.length } agents. ${ agents.filter((a: any) => a.status === 'completed').length } completed with results.`
        };
      }

      // ═══ CLEAR: Clean up agent files ═══
      case 'clear': {
        await agentMessageBus.clearAll();
        return { mode: 'clear', agents: [], message: 'All sub-agent data cleared.' };
      }

      default:
        return { mode: input.mode, agents: [], message: `Unknown mode: ${ input.mode }` };
    }
  }
};
