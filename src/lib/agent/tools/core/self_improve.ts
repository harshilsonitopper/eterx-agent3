import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import { globalMemoryManager } from '../../memory/store';

/**
 * Self-Improvement Logger
 * 
 * The agent can explicitly log learnings, patterns, mistakes, and insights.
 * This feeds into the memory system and makes the agent smarter over time.
 */
export const selfImproveTool: ToolDefinition = {
  name: 'self_improve',
  description: `Log insights, patterns, mistakes, and learnings for self-improvement. The agent becomes smarter over time by tracking what worked, what failed, and what it learned. Also retrieve past learnings to inform current decisions.
  
  Use this to:
  - Log a successful approach: "Using workspace_verify_code after every edit catches errors early"
  - Log a mistake: "Don't use rm -rf without confirming the path first"  
  - Log a user preference: "User prefers TypeScript over JavaScript"
  - Retrieve past learnings before making decisions`,
  category: 'core',
  inputSchema: z.object({
    action: z.enum(['log_learning', 'log_mistake', 'log_preference', 'get_learnings', 'get_mistakes', 'get_preferences', 'get_stats'])
      .describe('Self-improvement action'),
    content: z.string().optional().describe('The learning, mistake, or preference to log'),
    category: z.string().optional().describe('Category tag (e.g., "coding", "research", "devops")'),
    projectId: z.string().optional().default('global').describe('Project context (default: global)')
  }),
  outputSchema: z.object({ success: z.boolean(), message: z.string(), data: z.any().optional() }),
  execute: async (input: any) => {
    const projectId = input.projectId || 'global';
    
    try {
      switch (input.action) {
        case 'log_learning': {
          if (!input.content) return { success: false, message: 'content required' };
          globalMemoryManager.saveEpisodicMemory(
            projectId, `✅ LEARNING: ${input.content}`, 'learned_pattern', 8,
            ['learning', input.category || 'general']
          );
          return { success: true, message: `🧠 Learning logged: "${input.content.substring(0, 80)}"` };
        }
        case 'log_mistake': {
          if (!input.content) return { success: false, message: 'content required' };
          globalMemoryManager.saveEpisodicMemory(
            projectId, `❌ MISTAKE: ${input.content}`, 'error_log', 9,
            ['mistake', input.category || 'general']
          );
          globalMemoryManager.logError('self_improve', input.content, projectId);
          return { success: true, message: `📝 Mistake logged: "${input.content.substring(0, 80)}" — will avoid in future.` };
        }
        case 'log_preference': {
          if (!input.content || !input.category) return { success: false, message: 'content and category required' };
          globalMemoryManager.learnPreference('user', input.category, input.content, true);
          return { success: true, message: `👤 Preference logged: [${input.category}] ${input.content}` };
        }
        case 'get_learnings': {
          const memories = globalMemoryManager.searchMemories(projectId, 'LEARNING');
          return {
            success: true,
            message: `${memories.length} learnings found`,
            data: memories.map(m => ({ content: m.content, timestamp: new Date(m.timestamp).toISOString(), tags: m.tags }))
          };
        }
        case 'get_mistakes': {
          const errors = globalMemoryManager.getErrorPatterns();
          return {
            success: true,
            message: `${errors.length} error patterns found`,
            data: errors
          };
        }
        case 'get_preferences': {
          const prefs = globalMemoryManager.getAllPreferences('user');
          return {
            success: true,
            message: `${Object.keys(prefs).length} preferences stored`,
            data: prefs
          };
        }
        case 'get_stats': {
          const stats = globalMemoryManager.getStats();
          return { success: true, message: 'Memory statistics', data: stats };
        }
        default:
          return { success: false, message: 'Unknown action' };
      }
    } catch (err: any) {
      return { success: false, message: `Self-improve error: ${err.message}` };
    }
  }
};
