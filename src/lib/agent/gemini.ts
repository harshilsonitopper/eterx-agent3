import { GoogleGenAI, Type, ThinkingLevel } from '@google/genai';
import { globalToolRegistry } from './tools/registry';
import './tools/index'; // Bootstrap all tools!
import { ProjectContext } from './schemas';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { SKILL_REGISTRY } from './skills';
import { workspaceIntelligence, agentReflection } from './engines';
import { agentMemory, ContextWindowManager } from './memory';
import {
  intelligentCache, smartQueryRouter, knowledgeEngine,
  multiStrategyRecovery, performanceAnalytics, initializeNextGenSystems
} from './next_gen';
import {
  adaptiveLearning, intentClassifier, sessionPersistence,
  ConversationCompressor, initializeAdaptiveIntelligence
} from './adaptive';
import { globalSessionManager } from './session';
import { isCancelled } from './roles/sub_agent';


export class GeminiAgentClient {
  private ai!: GoogleGenAI;
  private apiKeys: string[] = [];
  private currentKeyIndex = 0;
  private modelName = 'gemini-3.1-flash-lite-preview';
  private fallbackModel = 'gemini-3-flash-preview';
  private groundingEnabled = true;  // Auto-detect: tries Google Search grounding, disables if API rejects

  constructor() {
    // Auto-discover all valid Google API keys from the environment
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string' && value.startsWith('AIza')) {
        this.apiKeys.push(value);
      }
    }

    if (this.apiKeys.length === 0) {
      const fallback = process.env.GEMINI_API_KEY || process.env.VITE_OPENROUTER_API_KEY;
      if (!fallback) throw new Error('Missing GEMINI_API_KEY in environment.');
      this.apiKeys.push(fallback);
    }

    // Shuffle the keys to perfectly load-balance across all available keys 
    // rather than always slamming the first few keys and taking time to rotate past them
    for (let i = this.apiKeys.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.apiKeys[i], this.apiKeys[j]] = [this.apiKeys[j], this.apiKeys[i]];
    }

    this.currentKeyIndex = Math.floor(Math.random() * this.apiKeys.length);
    this.initializeClient();
  }

  private initializeClient() {
    this.ai = new GoogleGenAI({ apiKey: this.apiKeys[this.currentKeyIndex] });
  }

  private rotateKey() {
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    this.initializeClient();
    console.warn(`[GeminiClient] FAILED. Rotating to fallback API Key (Index ${ this.currentKeyIndex })`);
  }

  /**
   * Converts our Zod-based tool schemas into Gemini's function declaration format.
   */
  private cleanSchemaStructure(obj: any): any {
    if (!obj || typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.map(x => this.cleanSchemaStructure(x));

    const nextObj: any = {};
    for (const key in obj) {
      if (key === '$schema' || key === 'additionalProperties' || key === 'default') continue;

      // Gemini DOES NOT support 'const'. Convert to 'enum' with one element.
      if (key === 'const') {
        nextObj.enum = [obj[key]];
        continue;
      }

      // Gemini DOES NOT like 'anyOf' or 'oneOf' in most tool definitions.
      if (key === 'anyOf' || key === 'oneOf' || key === 'allOf') {
        const variants = obj[key] as any[];
        const firstVariant = variants[0];

        if (firstVariant && typeof firstVariant === 'object') {
          if (firstVariant.type === 'object') {
            const mergedProperties: any = {};
            for (const v of variants) {
              if (v.properties) {
                Object.assign(mergedProperties, v.properties);
              }
            }
            nextObj.type = 'object';
            nextObj.properties = this.cleanSchemaStructure(mergedProperties);
            continue;
          } else {
            Object.assign(nextObj, this.cleanSchemaStructure(firstVariant));
            continue;
          }
        }
      }

      nextObj[key] = this.cleanSchemaStructure(obj[key]);
    }
    return nextObj;
  }

  /**
   * Build function declarations for Gemini from our tool registry.
   */
  public buildFunctionDeclarations(): any[] {
    return globalToolRegistry.getAllTools().map(tool => {
      const rawSchema = zodToJsonSchema(tool.inputSchema);
      const cleaned = this.cleanSchemaStructure(rawSchema);

      if (cleaned && cleaned.type === 'object') {
        cleaned.properties = cleaned.properties || {};
        cleaned.properties.uiActionText = {
          type: 'string',
          description: 'A highly personalized 2-5 word summary of this exact action for the user interface. Examples: "Writing app.js", "Researching global trends", "Running build script". Avoid generic terms.'
        };
        cleaned.required = Array.isArray(cleaned.required) ? [...cleaned.required, 'uiActionText'] : ['uiActionText'];
      }

      return {
        name: tool.name,
        description: tool.description,
        parameters: cleaned
      };
    });
  }

  /**
   * Build the tools config for the new SDK.
   */
  public buildToolsConfig(): any[] {
    const tools: any[] = [{ functionDeclarations: this.buildFunctionDeclarations() }];
    if (this.groundingEnabled) {
      tools.push({ googleSearch: {} });
    }
    return tools;
  }

  /**
   * Reads the task tracker state from disk to inject progress into context.
   * This is the KEY fix — the agent reads its own progress on every loop iteration.
   */
  private readTaskTrackerState(): string {
    try {
      const fs = require('fs');
      const path = require('path');

      const mdPath = path.resolve(process.cwd(), '.agent_task_tracker.md');
      const jsonPath = path.resolve(process.cwd(), '.agent_task_tracker.json');

      // Prefer JSON for machine readability
      if (fs.existsSync(jsonPath)) {
        const rawContent = fs.readFileSync(jsonPath, 'utf-8');
        const cleanContent = rawContent.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
        const data = JSON.parse(cleanContent);
        const completedSteps = data.steps.filter((s: any) => s.status === 'done').length;
        const totalSteps = data.steps.length;
        const pendingSteps = data.steps.filter((s: any) => s.status === 'pending');
        const currentStep = pendingSteps[0]; // Next step to do

        if (completedSteps === totalSteps) {
          return `\n[TASK TRACKER] All ${ totalSteps } steps are COMPLETE. Deliver your final answer now.`;
        }

        let state = `\n[TASK TRACKER] Progress: ${ completedSteps }/${ totalSteps } steps done.`;
        if (currentStep) {
          state += `\n[NEXT STEP] Step ${ currentStep.step }: "${ currentStep.name }" — ${ currentStep.description }`;
          state += `\n[TOOLS TO USE] ${ currentStep.tools.join(', ') }`;
          state += `\n[DONE WHEN] ${ currentStep.done_when || currentStep.verification || 'Step completed' }`;
        }

        const doneNames = data.steps.filter((s: any) => s.status === 'done').map((s: any) => s.name);
        if (doneNames.length > 0) {
          state += `\n[ALREADY DONE] ${ doneNames.join(', ') } — DO NOT repeat these.`;
        }

        return state;
      }

      // Fallback: read the .md tracker
      if (fs.existsSync(mdPath)) {
        const md = fs.readFileSync(mdPath, 'utf-8');
        const checkedCount = (md.match(/\[x\]/gi) || []).length;
        const uncheckedCount = (md.match(/\[ \]/g) || []).length;
        return `\n[TASK TRACKER] Progress: ${ checkedCount }/${ checkedCount + uncheckedCount } steps done. Read .agent_task_tracker.md for details.`;
      }

      return ''; // No tracker exists
    } catch {
      return ''; // Silently fail
    }
  }

  /**
   * Updates the JSON task tracker to mark a step as done.
   * Matches by step name, description keywords, or tool usage.
   * Completely silent — no UI events, no trace emissions.
   */
  private markTrackerStepDone(hint: string, toolUsed?: string): void {
    try {
      const fs = require('fs');
      const path = require('path');
      const jsonPath = path.resolve(process.cwd(), '.agent_task_tracker.json');

      if (!fs.existsSync(jsonPath)) return;

      const rawContent = fs.readFileSync(jsonPath, 'utf-8');
      const cleanContent = rawContent.replace(/^```json\s*/, '').replace(/```\s*$/, '').trim();
      const data = JSON.parse(cleanContent);
      const lowerHint = hint.toLowerCase();

      // Find the first pending step that matches by name, description, or tool
      for (const step of data.steps) {
        if (step.status !== 'pending') continue;

        const nameMatch = step.name.toLowerCase().includes(lowerHint) || lowerHint.includes(step.name.toLowerCase());
        const descMatch = step.description && (
          step.description.toLowerCase().includes(lowerHint) ||
          lowerHint.includes(step.description.toLowerCase().substring(0, 30))
        );
        const toolMatch = toolUsed && Array.isArray(step.tools) && step.tools.some((t: string) => t === toolUsed);

        if (nameMatch || descMatch || toolMatch) {
          step.status = 'done';
          step.completedAt = Date.now();
          console.log(`[TaskTracker] ✅ Auto-marked step ${ step.step } done: "${ step.name }"`);
          break;
        }
      }

      // Also mark the first pending step if all its tools have been used
      const firstPending = data.steps.find((s: any) => s.status === 'pending');
      if (firstPending && toolUsed && Array.isArray(firstPending.tools) && firstPending.tools.includes(toolUsed)) {
        // If the primary tool for this step was just used, mark it done
        if (firstPending.tools[0] === toolUsed) {
          firstPending.status = 'done';
          firstPending.completedAt = Date.now();
          console.log(`[TaskTracker] ✅ Auto-marked first pending step ${ firstPending.step } done via primary tool: "${ firstPending.name }"`);
        }
      }

      fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2));

      // Sync completed steps to session for cross-message memory
      try {
        const planSteps = data.steps.map((s: any) => ({
          name: s.name,
          status: s.status === 'done' ? 'done' as const : 'pending' as const,
          description: s.description
        }));
        globalSessionManager.setTaskPlan(planSteps);
      } catch { /* silent */ }
    } catch {
      // Silently fail
    }
  }

  /**
   * Smart auto-detection: marks the right tracker step as done
   * based on what tool was just executed and what args it used.
   * This is COMPLETELY INVISIBLE to the user and the model.
   */
  private autoMarkProgress(toolName: string, args: any, success: boolean): void {
    if (!success) return;

    const filename = String(args?.filename || args?.path || '').toLowerCase();

    switch (toolName) {
      case 'workspace_write_file':
        // Match based on file extension / name
        if (filename.includes('.html') || filename.includes('index')) this.markTrackerStepDone('html', toolName);
        else if (filename.includes('.css') || filename.includes('style')) this.markTrackerStepDone('css', toolName);
        else if (filename.includes('.js') && !filename.includes('.json')) this.markTrackerStepDone('javascript', toolName);
        else if (filename.includes('.ts') && !filename.includes('.json')) this.markTrackerStepDone('typescript', toolName);
        else if (filename.includes('readme') || filename.includes('.md')) this.markTrackerStepDone('documentation', toolName);
        else this.markTrackerStepDone('write', toolName);
        break;
      case 'system_shell':
        const cmd = String(args?.command || '').toLowerCase();
        if (cmd.includes('mkdir') || cmd.includes('new-item') || cmd.includes('init')) this.markTrackerStepDone('directory', toolName);
        else if (cmd.includes('npm') || cmd.includes('install')) this.markTrackerStepDone('dependencies', toolName);
        else this.markTrackerStepDone('command', toolName);
        break;
      case 'web_search':
        this.markTrackerStepDone('research', toolName);
        break;
      case 'web_scraper':
        this.markTrackerStepDone('scrape', toolName);
        break;
      case 'get_skill_guidelines':
        this.markTrackerStepDone('skill', toolName);
        this.markTrackerStepDone('guideline', toolName);
        break;
      case 'workspace_verify_code':
        this.markTrackerStepDone('verify', toolName);
        this.markTrackerStepDone('test', toolName);
        break;
      case 'docx_generator':
        this.markTrackerStepDone('document', toolName);
        this.markTrackerStepDone('generate', toolName);
        break;
      case 'desktop_notification':
        this.markTrackerStepDone('notify', toolName);
        this.markTrackerStepDone('delivery', toolName);
        break;
      default:
        this.markTrackerStepDone(toolName, toolName);
        break;
    }
  }

  /**
   * Generates the dynamic system instruction prompt.
   */
  public generateSystemPrompt(context: ProjectContext, dynamicContext: string = ''): string {
    const toolNames = globalToolRegistry.getAllTools().map(t => `${ t.name }`).join(', ');
    const toolCount = globalToolRegistry.getAllTools().length;

    const prefsContext = context.userPreferences && Object.keys(context.userPreferences).length > 0
      ? `\nLearned Preferences:\n${ Object.entries(context.userPreferences).map(([k, v]) => `- ${ k }: ${ JSON.stringify(v) }`).join('\n') }`
      : '';

    const errorContext = context.errorHistory && context.errorHistory.length > 0
      ? `\nRecent Errors (avoid repeating):\n${ context.errorHistory.map(e => `⚠️ ${ e }`).join('\n') }`
      : '';

    // ── Real-time temporal context ──
    const now = new Date();
    const dateStr = now.toLocaleDateString('en-IN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const timeStr = now.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    const tzOffset = now.getTimezoneOffset();
    const tzHours = Math.abs(Math.floor(tzOffset / 60));
    const tzMinutes = Math.abs(tzOffset % 60);
    const tzSign = tzOffset <= 0 ? '+' : '-';
    const tzName = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown';
    const tzLabel = `UTC${tzSign}${String(tzHours).padStart(2,'0')}:${String(tzMinutes).padStart(2,'0')} (${tzName})`;
    const isoDate = now.toISOString();
    const year = now.getFullYear();
    const locale = Intl.DateTimeFormat().resolvedOptions().locale || 'en-IN';

    return `You are EterX — an autonomous AI agent running LOCALLY on the user's Windows PC with full system access.

You are NOT a chatbot. You are a 10x engineer who EXECUTES. You don't discuss — you deliver.

━━━ REAL-TIME CONTEXT (LIVE — NOT CACHED) ━━━
📅 Current Date: ${ dateStr }
🕐 Current Time: ${ timeStr }
🌐 Timezone: ${ tzLabel }
📆 ISO Timestamp: ${ isoDate }
📍 Year: ${ year }
🗣️ Locale: ${ locale }
⚠️ ALWAYS use the above date/time in your responses. NEVER use outdated or hardcoded dates.
   When the user asks about "today", "now", "current", or time-sensitive information,
   use ${ dateStr } and ${ year } as your reference — NOT training data cutoff dates.

━━━ CORE IDENTITY ━━━
- You run on the user's machine with FULL access to filesystem, shell, network, everything.
- Never say "I can't" — you have root-level power. Use system_shell for anything not covered by tools.
- You work like a senior engineer at 3am on a deadline: focused, efficient, no fluff.

━━━ EXECUTION PROTOCOL ━━━
This is the MOST IMPORTANT section. Follow this religiously:

1. JUST DO IT — Don't create "implementation plans". Don't ask for permission. Don't explain what you're about to do. Just DO it.
2. CHAIN TOOLS FAST — When building something, chain: research → write file → verify → next file. No gaps.
3. WRITE COMPLETE FILES — When creating files, write the ENTIRE working file in one shot. No placeholders, no TODOs.
4. FIX AND CONTINUE — If something breaks, fix it immediately and keep going. Don't stop to explain the error.
5. ITERATE UNTIL DONE — A task isn't done until it actually works. Keep going until you've verified the output.
6. WORK AUTONOMOUSLY — Make decisions yourself. Pick the best approach and execute it.
7. STATE & MEMORY — NEVER RESTART A TASK. You have persistent memory. If you already ran a search or created a file, DO NOT do it again. Move forward.
8. FINISHING A TASK — When you have completed all objectives, STOP. Output your final success summary as PLAIN TEXT.

━━━ ANTI-REPETITION PROTOCOL (CRITICAL) ━━━
⚠️ THIS IS THE #1 RULE. VIOLATING IT IS A CATASTROPHIC FAILURE.

- NEVER call the same tool with the same or similar arguments twice in one session.
- NEVER re-search for information you already found. Use what you have.
- NEVER re-load a skill you already loaded (get_skill_guidelines is ONE-TIME per skill name).
- NEVER re-decompose a task (task_decomposer is ONE-TIME per session — HARD BLOCKED after first use).
- NEVER re-research the same topic with different phrasing.
- If a tool returned results, USE THOSE RESULTS. Don't search again.
- If you created a file, don't create it again. Use workspace_edit_file to modify it.
- CHECK YOUR CONVERSATION HISTORY before every tool call. If you see you already did it, SKIP IT.

━━━ INVISIBLE TASK PROTOCOL (COMPLEX TASKS) ━━━
- For any complex or multi-layered task, use \`task_decomposer\` ONCE to create a step protocol.
- ⚠️ DO NOT print or explain this plan in the chat. Keep it completely internal.
- After decomposition, execute steps ONE AT A TIME in order.
- After completing each step, mark it done using workspace_edit_file on .agent_task_tracker.md
- NEVER call task_decomposer more than once per session — it is HARD BLOCKED after first use.

━━━ VIRTUAL SANDBOX PROTOCOL ━━━
- For intermediate work (drafts, temp files, data processing), use the .workspaces/sandbox/ directory.
- Write drafts and intermediate files there first.
- Only write to the user's real workspace when the final output is ready.
- For long documents: write page-by-page into sandbox .md files, then compile into final output.

━━━ ANTI-PATTERNS (NEVER DO THESE) ━━━
- ❌ "Let me create an implementation plan first" — NO. Just start building.
- ❌ Calling get_skill_guidelines("ui_engine") more than once — NO. Load it ONCE.
- ❌ Calling web_search with the same or similar query twice — NO. Use the first result.
- ❌ Calling task_decomposer more than once — NO. It's a one-shot tool.
- ❌ Reading 10 files before doing anything — NO. Read what you need, then ACT.
- ❌ Searching the same query 5 times hoping for different results — NO. Search once.
- ❌ Creating a file with placeholder content — NO. Create the real thing.
- ❌ Ending with "Would you like me to..." — NO. You already did it.
- ❌ Re-writing a file you already wrote — NO. Use workspace_edit_file instead.

━━━ TOOL MASTERY ━━━
You have ${ toolCount } tools. Use them like a pro:

📁 FILE OPERATIONS (do these the most):
- workspace_write_file: Create NEW files. Use for ALL new file creation.
- workspace_edit_file: MODIFY existing files. Use search/replace for surgical edits. DO NOT re-write entire files.
- workspace_read_file: Read a file ONCE, then act on it.
- workspace_list_directory: Quick scan, then dive into specific files.

🔍 RESEARCH (use sparingly, max 2 searches per task):
- Gemini has built-in Google Search — it activates automatically for factual queries.
- web_scraper: Scrape a SPECIFIC URL. More reliable than search.
- web_search: Last resort. If it returns nothing, DON'T retry — use your knowledge.

🖥️ EXECUTION:
- system_shell: PowerShell commands. Run installs, builds, scripts.
- workspace_run_command: Project-scoped commands.
- workspace_verify_code: Always verify after writing code.

📄 DOCUMENT CREATION:
- docx_generator: Creates REAL formatted .docx files.
- DRAFTING WORKFLOW: Write .md draft in sandbox → review → compile to final format.
- For massive reports: write section by section into sandbox, then merge.

🎨 UI/WEB DESIGN:
- Load ui_engine skill ONCE at the start of UI tasks.
- Load sub-skills only if needed (dark_mode_theming, etc.) — ONCE each.

✅ VERIFICATION (use AFTER completing work):
- realtime_verify: Self-check your work. Modes: file_exists, file_content, file_size, command_output, code_syntax, compare_files, port_check, json_valid, html_valid.
- ALWAYS verify after creating files: check file_exists + file_content.
- ALWAYS verify after writing code: use code_syntax mode.
- This is your internal quality control — use it proactively.

🤖 SUB-AGENTS (for complex parallel tasks):
- spawn_sub_agent: Spawn specialized sub-agents (researcher, coder, writer, verifier, security_auditor, devops, data_analyst).
- Use mode="team" to run multiple agents in parallel.
- Example: spawn researcher for info + coder for implementation simultaneously.
- Only use for genuinely parallelizable work — don't over-delegate simple tasks.

━━━ CONTENT DEPTH RULES ━━━
- 1 page = ~5 content blocks
- 5 pages = ~25 content blocks
- 10 pages = ~50+ content blocks  
- Each paragraph MUST be 4-8 sentences of REAL, substantive content.

━━━ THINKING RULES (ANTI-RECURSION + SUB-AGENT AWARENESS) ━━━
- Think ONCE per decision, then ACT. Maximum 2-3 sentences of reasoning.
- ⚠️ NEVER think about the same thing twice. If you already reasoned about it, EXECUTE.
- ⚠️ NEVER loop: "I should do X" → thinks more → "I should do X" → thinks more. STOP. Do X.
- Your thinking should be: [Assess situation] → [Check: parallelizable?] → [Decide action] → [Execute tool]. That's it.
- PARALLEL CHECK: On every complex task, ask yourself: "Are there 2+ independent parts I can send to sub-agents?" If YES, spawn them IMMEDIATELY instead of doing everything sequentially.
- If you catch yourself re-analyzing, STOP thinking and call the next tool immediately.
- DO NOT narrate your plan in thinking. Just decide and act.
- When sub-agents are running, CONTINUE YOUR OWN WORK on other parts of the task. Don't idle.

━━━ CONVERSATION INTELLIGENCE (CRITICAL — READ THIS) ━━━
The user often sends SHORT follow-up messages. You MUST handle them correctly:

🟢 ACKNOWLEDGMENTS: "thanks", "ok", "good", "nice", "cool", "thx", "ty"
   → Respond with a BRIEF friendly acknowledgment (1-2 sentences). DO NOT start a new task.
   → Example: "You're welcome! Let me know if you need anything else."

🟡 CONTINUATION SIGNALS: "continue", "work more", "more", "go on", "keep going", "next"
   → RESUME the previous task from where you left off. Check your conversation history.
   → DO NOT start a new unrelated task. DO NOT hallucinate a new objective.
   → If there's a task tracker, continue from the next pending step.

🔴 ERROR REPORTS: "it's not opening", "error", "not working", "broken", "failed"
   → The user is reporting a problem with YOUR LAST OUTPUT. Troubleshoot it.
   → DO NOT create a new task. Focus on fixing what you just delivered.

🟣 FOLLOW-UP REFERENCES: "on that", "the same", "that one", "it"
   → These refer to the PREVIOUS context. Look at conversation history to resolve "it".

⚠️ RULE: If the user message is < 5 words and matches any pattern above, NEVER start a complex multi-step task. NEVER call task_decomposer. NEVER do web_search. Just respond appropriately.

━━━ ANSWER QUALITY PROTOCOL ━━━
- Use proper Markdown formatting with BLANK LINES before and after headings and lists.
- Headings MUST be on their own line: "\\n\\n## Heading\\n\\n" — NEVER inline like "text.## Heading".
- Use bullet lists with proper "\\n\\n" before the first item.
- Use code blocks with language tags: \\\`\\\`\\\`python, \\\`\\\`\\\`javascript, etc.
- Structure long answers with clear sections using ## and ### headings.
- Keep answers focused and concise — quality over quantity.
- For MATH and EQUATIONS: Use LaTeX notation wrapped in $ for inline ($E = mc^2$) and $$ for display blocks ($$\\\\int_0^\\\\infty e^{-x} dx = 1$$). The UI renders KaTeX.
- For PHYSICS: Always show formulas with proper LaTeX: $F = ma$, $\\\\vec{F} = q(\\\\vec{E} + \\\\vec{v} \\\\times \\\\vec{B})$
- For CHEMISTRY: Use subscripts $H_2O$, superscripts $^{14}C$
- NEVER leave answers incomplete — finish every thought and section.
- NEVER output raw # symbols without proper Markdown spacing.

━━━ RESPONSE STYLE ━━━
- Concise. Sharp. No padding.
- Report what you DID, not what you could do.

━━━ SAFETY ━━━
Only warn for TRULY destructive operations: deleting system files, formatting drives.

━━━ AVAILABLE TOOLS ━━━
${ toolNames }

━━━ SUB-AGENT SYSTEM — DEEP TRAINING ━━━

You have 10 full-power sub-agents: Agent-Alpha, Agent-Nova, Agent-Bolt, Agent-Cipher, Agent-Forge, Agent-Pulse, Agent-Nexus, Agent-Arc, Agent-Sentinel, Agent-Echo.

Sub-agents are YOUR CLONES — same tools, same capabilities, same ReAct loop. They exist for PARALLEL EXECUTION.

🧠 WHEN TO SPAWN SUB-AGENTS:
- Task has 2+ INDEPENDENT parts that don't depend on each other
- Deep research needed while you also need to write code
- Multiple files need creation simultaneously in different directories
- Stock comparison: Agent-Alpha researches Stock A + Agent-Nova researches Stock B → you synthesize
- Full-stack app: Agent-Forge builds frontend + Agent-Bolt builds backend → you integrate
- Report writing: Agent-Nova researches Topic 1 + Agent-Cipher researches Topic 2 → you compile
- Always ask: "Can part X run WITHOUT waiting for part Y?" → If YES, spawn parallel agents.

❌ WHEN NOT TO SPAWN:
- Simple single-tool tasks (search, read file, etc.) — do it yourself
- Tasks with sequential dependencies (step 2 needs step 1's output) — do them in order yourself
- Very short tasks (<30 seconds) — overhead isn't worth it

📋 SUB-AGENT API — 4 MODES:

MODE 1: SPAWN — Launch parallel agents
\`\`\`
spawn_sub_agent({
  mode: "spawn",
  tasks: [
    { task: "Research Tesla stock performance 2024-2025, financial metrics, analyst ratings, recent news" },
    { task: "Research Apple stock performance 2024-2025, financial metrics, analyst ratings, recent news" }
  ]
})
\`\`\`
→ Agents run in TRUE PARALLEL. Each gets a deep task brief with your full tool set.
→ Returns results from ALL agents when ALL complete.

MODE 2: STATUS — Check progress while they work
\`\`\`
spawn_sub_agent({ mode: "status" })                          // All agents
spawn_sub_agent({ mode: "status", agentName: "Agent-Alpha" }) // Specific agent
\`\`\`

MODE 3: COLLECT — Get final results + trace logs of what they did
\`\`\`
spawn_sub_agent({ mode: "collect" })                          // All results
spawn_sub_agent({ mode: "collect", agentName: "Agent-Nova" }) // Specific agent
\`\`\`
→ Returns full output text + traceLog (every tool call they made)

MODE 4: CLEAR — Cleanup after collecting results
\`\`\`
spawn_sub_agent({ mode: "clear" })
\`\`\`

🔄 AGENT-TO-AGENT PROTOCOL:
- Sub-agents write status files to .workspaces/agents/ (JSON)
- You can read these files anytime to see what a sub-agent is doing
- After completion: status file contains full result + trace log
- Sub-agents can read each other's results for chained workflows

📝 REAL-WORLD EXAMPLES:

EXAMPLE 1 — Stock Comparison:
User: "Compare Tesla vs Apple stock"
→ spawn_sub_agent({ mode: "spawn", tasks: [
    { task: "Research Tesla (TSLA): current price, 52-week range, P/E ratio, market cap, revenue growth, analyst consensus, recent news. Use web_search and web_scraper." },
    { task: "Research Apple (AAPL): current price, 52-week range, P/E ratio, market cap, revenue growth, analyst consensus, recent news. Use web_search and web_scraper." }
  ]})
→ Wait for results
→ YOU synthesize into comparative analysis table

EXAMPLE 2 — Full Project Build:
User: "Build a weather dashboard app"
→ First: workspace_analyze to understand project structure
→ spawn_sub_agent({ mode: "spawn", tasks: [
    { task: "Create the frontend: src/components/WeatherDashboard.tsx with current weather display, 5-day forecast, search bar. Use React + TypeScript. Beautiful dark glassmorphic UI." },
    { task: "Create the API layer: src/lib/weather-api.ts with functions to fetch weather from OpenWeatherMap. Include TypeScript types, error handling, caching." },
    { task: "Create the styling: src/styles/weather.css with glassmorphic dark theme, responsive layout, smooth animations, gradient backgrounds." }
  ]})
→ After agents complete, YOU verify and integrate

EXAMPLE 3 — Research Report:
User: "Write a report on AI trends 2025"
→ spawn_sub_agent({ mode: "spawn", tasks: [
    { task: "Research and write section: 'LLM Advancements 2025' — cover GPT-5, Gemini 3, Claude 4, open-source models. Write to .workspaces/sandbox/section1.md" },
    { task: "Research and write section: 'AI in Industry 2025' — cover healthcare, finance, autonomous vehicles, robotics. Write to .workspaces/sandbox/section2.md" },
    { task: "Research and write section: 'AI Ethics & Regulation 2025' — cover EU AI Act, safety, alignment research. Write to .workspaces/sandbox/section3.md" }
  ]})
→ After agents complete, YOU compile sections into final report

EXAMPLE 4 — Multi-source Data:
User: "Analyze this CSV and also find industry benchmarks online"
→ spawn_sub_agent({ mode: "spawn", tasks: [
    { task: "Analyze data.csv using csv_analyzer: compute statistics, find trends, identify outliers. Write summary to .workspaces/sandbox/analysis.md" },
    { task: "Research industry benchmarks for [relevant industry]. Use web_search. Write findings to .workspaces/sandbox/benchmarks.md" }
  ]})
→ After agents complete, YOU cross-reference data with benchmarks

⚙️ DECISION TREE — Should I spawn sub-agents?
1. Is there MORE THAN ONE distinct task? → If NO, do it yourself
2. Are the tasks INDEPENDENT? → If NO (sequential), do them yourself in order
3. Would each task take >30 seconds? → If NO, just do them yourself sequentially
4. If YES to all 3 → SPAWN SUB-AGENTS for parallel execution

━━━ NEXT-GEN TOOLS — HOW TO USE ━━━

🔧 create_dynamic_tool: When you notice you're doing the same sequence of operations repeatedly, create a reusable tool.
   Example: You keep calculating compound interest → create a "compound_interest" tool.

⚡ run_macro: Chain multiple tools in sequence. Output of step N becomes available in step N+1.
   Example: web_search → web_scraper → workspace_write_file in one call.

🔍 workspace_analyze: Run at the START of coding tasks to understand the project (framework, deps, structure).

✅ realtime_verify: ALWAYS verify after creating files. Modes: file_exists, file_content, code_syntax, json_valid, html_valid.

📊 smart_file_analyzer: For logs use "tail", for large files use "head", for project overview use "tree".

🏃 background_task: For long installs/builds — launch in background and continue other work. Check later.

━━━ IMAGE & CHART CREATION — DEEP TRAINING ━━━

You have TWO image creation tools. Choose the RIGHT one:

📈 chart_generator (Python/Matplotlib) — For DATA VISUALIZATIONS:
   USE FOR: bar charts, line graphs, pie charts, scatter plots, histograms, heatmaps, comparisons
   Chart types: bar, line, pie, donut, scatter, histogram, heatmap, box, area, waterfall, grouped_bar, comparison
   Example:
   chart_generator({
     chartType: "comparison",
     title: "Tesla vs Apple Stock Performance",
     data: {
       labels: ["2022", "2023", "2024", "2025"],
       values: [113, 248, 180, 342],
       values2: [130, 192, 185, 228]
     },
     options: { ylabel: "Price ($)", label1: "TSLA", label2: "AAPL" }
   })
   → Dark themed, professional, pixel-perfect. Saves both PNG image + Python script.
   ⚠️ Requires Python + matplotlib installed. Falls back gracefully with script saved.

🎨 image_generator (AI/Pollinations) — For CREATIVE IMAGES:
   USE FOR: logos, illustrations, photos, UI mockups, product shots, art, icons, landscapes
   Styles: realistic, illustration, diagram, icon, abstract, photo, 3d, anime, logo, ui, product, landscape
   Example:
   image_generator({
     prompt: "A futuristic AI robot sitting at a desk coding, cyberpunk city visible through window, neon lights",
     style: "3d",
     width: 1024,
     height: 1024
   })
   → Auto-enhanced prompts with style-specific quality modifiers.

🎯 DECISION: Data with numbers? → chart_generator. Creative/visual? → image_generator.

PROMPT TIPS for image_generator:
- Be EXTREMELY SPECIFIC: describe subject, action, environment, lighting, colors, mood
- BAD:  "a dog" → generic, boring
- GOOD: "A golden retriever puppy playing in autumn leaves, golden hour sunlight, bokeh background, warm tones, professional pet photography"

━━━ ADVANCED TOOLS — DEEP TRAINING ━━━

🔬 deep_research: Multi-angle parallel research engine. Use for stock analysis, competitive research, market research.
   deep_research({ topic: "Tesla stock", angles: ["TSLA financials", "Tesla analyst ratings", "Tesla competition"] })
   → Runs parallel searches, scrapes top results, synthesizes into structured report with sources.

🧬 code_intelligence: Analyze code structure without reading full files.
   code_intelligence({ mode: "analyze", target: "src/lib/utils.ts" }) → imports, exports, functions, classes, complexity
   code_intelligence({ mode: "graph", target: "src/lib" }) → dependency graph, entry points, external deps
   USE BEFORE modifying unfamiliar code.

🔄 smart_refactor: 10 intelligent code refactoring operations.
   { operation: "rename", file: "src/app.ts", from: "oldName", to: "newName" } → symbol-level rename
   { operation: "add_import", file: "src/app.ts", code: "import x from 'y';" } → dedup-aware import
   { operation: "wrap_try_catch", file: "src/api.ts", functionName: "fetchData" } → auto-wraps
   Also: remove_import, insert_after, insert_before, add_to_top, add_to_bottom, comment_out, uncomment

🏗️ project_scaffolder: Generate complete projects in one shot.
   { template: "react", name: "my-app" } → Full React app with components, hooks, styles
   { template: "express-api", name: "my-api" } → Express API with routes, middleware, TypeScript
   { template: "html-landing", name: "MyBrand" } → Premium dark landing page
   { template: "python-package", name: "my_pkg" } → Python package with tests

🔐 env_manager: Smart .env management.
   { mode: "read", file: ".env" } → read all vars (masked)
   { mode: "set", file: ".env", key: "API_KEY", value: "..." } → set var
   { mode: "scan_usage" } → find env vars used in code vs defined in .env

📖 auto_docs: Auto-generate documentation from code.
   { mode: "readme", target: "." } → Generate README from project
   { mode: "api", target: "src/routes" } → Generate API docs from Express routes
   { mode: "functions", target: "src/utils.ts" } → Generate function docs

🔱 git_intelligence: Smart git with auto-generated messages.
   { mode: "status" } → categorized change summary
   { mode: "smart_commit" } → auto-generates commit message from diff
   { mode: "changelog", count: 20 } → generate changelog
   { mode: "conflict_check", branch: "main" } → check for merge conflicts

━━━ CONTEXT ━━━
Project: ${ context.projectId }
Files: ${ (context.uploadedFiles || []).join(', ') || 'None' }${ prefsContext }${ errorContext }${ dynamicContext ? '\n\n' + dynamicContext : '' }`.trim();
  }

  /**
   * The core execution loop with key rotation.
   */
  public async executeMessageLoop(
    context: ProjectContext,
    message: string,
    history: any[] = [],
    onTrace?: (t: any) => void
  ): Promise<{ text: string, trace: any[] }> {
    let attempts = 0;
    const maxAttempts = 99999; // Practically infinite retries

    while (attempts < maxAttempts) {
      try {
        return await this.runReActLoop(context, message, history, onTrace);
      } catch (error: any) {
        const errorMsg = error.message?.toLowerCase() || '';

        // If grounding is enabled, the FIRST failure might be because of it.
        if (this.groundingEnabled) {
          console.warn(`[GeminiClient] ⚠️ First attempt failed with grounding enabled. Disabling Google Search grounding and retrying...`);
          console.warn(`[GeminiClient] Error was: ${ error.message }`);
          this.groundingEnabled = false;
          continue;
        }

        if (
          errorMsg.includes('api_key_invalid') ||
          errorMsg.includes('429') ||
          errorMsg.includes('quota') ||
          errorMsg.includes('403') ||
          errorMsg.includes('forbidden') ||
          errorMsg.includes('leaked') ||
          errorMsg.includes('fetch failed') ||
          errorMsg.includes('network') ||
          errorMsg.includes('econnreset') ||
          errorMsg.includes('timeout') ||
          errorMsg.includes('503') ||
          errorMsg.includes('unavailable') ||
          errorMsg.includes('demand') ||
          errorMsg.includes('500') ||
          errorMsg.includes('404') ||
          errorMsg.includes('not found')
        ) {
          console.error(`[GeminiClient] 🔥 API/Network Error encountered: ${ errorMsg.substring(0, 200) }`);

          if (errorMsg.includes('503') || errorMsg.includes('unavailable') || errorMsg.includes('demand') || errorMsg.includes('500') || errorMsg.includes('404') || errorMsg.includes('not found')) {
            console.warn(`[GeminiClient] 🛑 Model ${this.modelName} unavailable. Swapping to fallback model: ${this.fallbackModel}`);
            const tempModel = this.modelName;
            this.modelName = this.fallbackModel;
            this.fallbackModel = tempModel;
            this.rotateKey();
            attempts++;
          } else if (errorMsg.includes('429') || errorMsg.includes('quota')) {
            if (this.apiKeys.length === 1) {
              // Single key — no wait, user demanded 0 delay
              console.warn(`[GeminiClient] 🚦 Rate limited (1 key). Bypassing cooldown (0s delay)...`);
              continue;
            } else {
              // Multiple keys — rotate immediately
              console.warn(`[GeminiClient] 🚦 Rate limited. Rotating key immediately (0s delay)...`);
                 this.rotateKey();
              attempts++;
            }
          } else {
            // Non-rate-limit errors — rotate immediately
            this.rotateKey();
            attempts++;
        }
        } else {
          console.error(`[GeminiClient] 💥 Fatal API exception: ${ errorMsg }`);
        throw error;
      }
    }
    }
    throw new Error('All configured API keys failed or were rate-limited.');
  }

  /**
   * Normalize a tool call signature for fuzzy dedup detection.
   * Catches cases where the model rephrases queries slightly.
   */
  private normalizeCallSignature(name: string, args: any): string {
    // For search-type tools, normalize the query to lowercase and remove extra whitespace
    const searchTools = ['web_search', 'web_scraper', 'workspace_search_text'];
    const skillTools = ['get_skill_guidelines'];

    if (searchTools.includes(name)) {
      const query = String(args?.query || args?.url || args?.pattern || '').toLowerCase().trim().replace(/\s+/g, ' ');
      // Remove common filler words for fuzzy matching
      const normalized = query.replace(/\b(the|a|an|and|or|of|for|in|on|with|to|from|by)\b/g, '').replace(/\s+/g, ' ').trim();
      return `${ name }:${ normalized }`;
    }

    if (skillTools.includes(name)) {
      return `${ name }:${ String(args?.skill_name || '').toLowerCase().trim() }`;
    }

    // For task_decomposer — always return the same key (it's ONE-TIME)
    if (name === 'task_decomposer') {
      return 'task_decomposer:*';
    }

    // For file write — normalize the filename
    if (name === 'workspace_write_file') {
      return `${ name }:${ String(args?.filename || '').toLowerCase().trim() }`;
    }

    // Default: exact match
    return `${ name }:${ JSON.stringify(args) }`;
  }

  /**
   * Check if a call signature is semantically similar to any existing signature.
   * Catches near-duplicate searches like "Space Race timeline 1957" vs "Space Race 1957 timeline"
   */
  private isSemanticallyDuplicate(normalizedSig: string, callHistory: Set<string>): boolean {
    // Exact match
    if (callHistory.has(normalizedSig)) return true;

    // For search-type calls, check word overlap
    const [toolName, ...queryParts] = normalizedSig.split(':');
    const query = queryParts.join(':');

    if (!query || query === '*') return false;

    const queryWords = new Set(query.split(' ').filter(w => w.length > 2));
    if (queryWords.size === 0) return false;

    for (const existing of callHistory) {
      if (!existing.startsWith(toolName + ':')) continue;
      const existingQuery = existing.substring(toolName.length + 1);
      const existingWords = new Set(existingQuery.split(' ').filter(w => w.length > 2));

      if (existingWords.size === 0) continue;

      // Count overlapping words
      let overlap = 0;
      for (const w of queryWords) {
        if (existingWords.has(w)) overlap++;
      }

      const overlapRatio = overlap / Math.min(queryWords.size, existingWords.size);
      if (overlapRatio > 0.6) {
        console.warn(`[GeminiClient] 🔍 Semantic dedup: "${ normalizedSig }" overlaps ${ (overlapRatio * 100).toFixed(0) }% with "${ existing }"`);
        return true;
      }
    }

    return false;
  }

  /**
   * The ReAct execution loop with LIVE Gemini 3 Flash thinking.
   * 
   * KEY IMPROVEMENTS over v1:
   * 1. Reads task tracker on every iteration for progress awareness
   * 2. Semantic dedup catches rephrased duplicate tool calls
   * 3. Category-level caps prevent tool abuse
   * 4. Automatic step marking in tracker
   * 5. Stronger idle detection with forced action nudges
   */
  private async runReActLoop(
    context: ProjectContext,
    message: string,
    history: any[] = [],
    onTrace?: (t: any) => void
  ): Promise<{ text: string, trace: any[] }> {
    console.log(`[GeminiClient] Sending objective to Gemini: "${ message }"`);

    const trace: any[] = [];

    // === SESSION CONTINUITY: Hydrate from previous messages ===
    const sessionHydrated = globalSessionManager.hasActiveSession();
    const sessionState = globalSessionManager.hydrate();
    const callHistory = sessionHydrated ? sessionState.callHistory : new Set<string>();
    const toolCallCounts = sessionHydrated ? sessionState.toolCallCounts : new Map<string, number>();
    const categoryCallCounts = sessionHydrated ? sessionState.categoryCallCounts : new Map<string, number>();
    const loadedSkills = sessionHydrated ? sessionState.loadedSkills : new Set<string>();
    const writtenFiles = sessionHydrated ? sessionState.writtenFiles : new Set<string>();
    let interactions = 0;
    let noToolCallStreak = 0;
    let taskDecomposerUsed = sessionHydrated ? sessionState.taskDecomposerUsed : false;

    if (sessionHydrated) {
      console.log(`[GeminiClient] 🔄 Session restored: ${callHistory.size} calls, ${writtenFiles.size} files, ${loadedSkills.size} skills, decomposer=${taskDecomposerUsed}`);
    }

    // Category definitions for rate limiting
    const toolCategories: Record<string, string> = {
      web_search: 'research', web_scraper: 'research',
      rss_feed_reader: 'research', youtube_transcript: 'research',
      get_skill_guidelines: 'skill_loading',
      task_decomposer: 'decomposition',
      workspace_write_file: 'file_write', workspace_edit_file: 'file_edit',
      workspace_read_file: 'file_read', workspace_list_directory: 'file_read',
      desktop_notification: 'notification',
    };

    // Category limits — will be scaled for complex tasks after intent is classified
    let categoryLimits: Record<string, number> = {
      research: 4,
      skill_loading: 3,
      decomposition: 1,
      notification: 2,
      file_write: 15,
      file_edit: 15,
      file_read: 10,
    };

    // === SMART QUERY ROUTING: Analyze the query for optimal strategy ===
    const queryAnalysis = smartQueryRouter.analyze(message);
    const routingHint = smartQueryRouter.getRoutingHint(queryAnalysis);
    if (routingHint) {
      console.log(`[GeminiClient] 🧭 Route: ${queryAnalysis.strategy} | Complexity: ${queryAnalysis.complexity} | Steps: ~${queryAnalysis.estimatedSteps}`);
    }

    // === INTENT CLASSIFICATION: Understand what user really wants ===
    const intent = intentClassifier.classify(message);
    const intentHint = intentClassifier.getIntentHint(intent);
    if (intentHint) {
      console.log(`[GeminiClient] 🎯 Intent: ${intent.primaryIntent} | Scope: ${intent.scope} | Urgency: ${intent.urgency}`);
    }

    // === ADAPTIVE LEARNING: Get tool recommendations from history ===
    adaptiveLearning.load().catch(() => {});
    const taskType = adaptiveLearning.classifyTask(message);
    const learningContext = adaptiveLearning.getLearningContext(message);
    if (learningContext) {
      console.log(`[GeminiClient] 🧠 Adaptive: Task type "${taskType}" — recommendations loaded`);
    }

    // Initialize knowledge engine (lazy, first call only)
    knowledgeEngine.load().catch(() => {});
    const knowledgeContext = knowledgeEngine.getRelevantContext(message);

    // === COMBINE ALL INTELLIGENCE SIGNALS ===
    const intelligenceSignals: string[] = [];
    if (learningContext) intelligenceSignals.push(learningContext);
    if (intentHint) intelligenceSignals.push(`[Intent: ${intent.primaryIntent} | Scope: ${intent.scope} | Urgency: ${intent.urgency}]`);
    if (routingHint) intelligenceSignals.push(`[Route: ${queryAnalysis.strategy} | ~${queryAnalysis.estimatedSteps} steps]`);
    if (knowledgeContext) intelligenceSignals.push(knowledgeContext);

    // Build the contents array — this is our conversation history
    // USER MESSAGE STAYS CLEAN — no enrichment in the message itself to prevent
    // memory compounding across loop iterations and follow-up messages.
    // Session + intelligence context goes into the system prompt (regenerated each iteration).
    let contents: any[] = [
      ...history,
      { role: 'user', parts: [{ text: message }] }
    ];

    // === BUILD DYNAMIC CONTEXT FOR SYSTEM PROMPT ===
    // This goes into the system prompt (regenerated per-call, NOT stored in history)
    // preventing the memory compounding bug where context stacks in contents[]
    const sessionSummary = globalSessionManager.getSessionSummary();
    const dynamicContextParts: string[] = [];
    if (sessionSummary) dynamicContextParts.push(sessionSummary);
    if (intelligenceSignals.length > 0) dynamicContextParts.push(intelligenceSignals.join('\n'));

    // === WORKSPACE INTELLIGENCE: Inject project stack info ===
    try {
      const wsContext = await workspaceIntelligence.getWorkspaceContext();
      if (wsContext) dynamicContextParts.push(wsContext);
    } catch { /* silent — workspace intel is optional */ }

    // === AGENT MEMORY: Inject user preferences + recent sessions ===
    try {
      await agentMemory.load();
      const memContext = agentMemory.getMemoryContext();
      if (memContext) dynamicContextParts.push(memContext);
    } catch { /* silent */ }

    // === SELF-REVIEW: For continuation/short messages, auto-review previous output ===
    const isContinuation = message.trim().split(/\s+/).length < 8 && 
      /\b(continue|more|go on|keep|next|work|add|improve|enhance|fix|better|update)\b/i.test(message);
    if (isContinuation && globalSessionManager.hasActiveSession()) {
      try {
        const selfReview = await globalSessionManager.selfReview();
        if (selfReview) {
          dynamicContextParts.push(selfReview);
          console.log(`[GeminiClient] 🔍 Self-review injected for continuation message`);
        }
      } catch { /* silent */ }
    }

    const dynamicContext = dynamicContextParts.join('\n\n');

    // Ensure sandbox directory exists
    try {
      const fs = require('fs-extra');
      const path = require('path');
      await fs.ensureDir(path.resolve(process.cwd(), '.workspaces', 'sandbox'));
    } catch { }

    const config: import('@google/genai').GenerateContentConfig = {
      tools: this.buildToolsConfig(),
      systemInstruction: this.generateSystemPrompt(context, dynamicContext),
      thinkingConfig: {
        thinkingLevel: ThinkingLevel.MEDIUM,
        includeThoughts: true,
      },
      temperature: 0.35,
    };

    // === ADAPTIVE MAX ITERATIONS: Scale based on task complexity ===
    let maxLoopIterations = 30; // default
    if (intent.scope === 'quick') maxLoopIterations = 15;
    else if (intent.scope === 'moderate') maxLoopIterations = 30;
    else if (intent.scope === 'large') maxLoopIterations = 50;
    else if (intent.scope === 'project') maxLoopIterations = 60;
    // If task decomposer was used (complex task), bump up
    if (taskDecomposerUsed) maxLoopIterations = Math.max(maxLoopIterations, 50);
    console.log(`[GeminiClient] 🔄 Max iterations: ${maxLoopIterations} (scope: ${intent.scope})`);

    // Scale category limits for complex tasks (now that intent is available)
    if (intent.scope === 'large' || intent.scope === 'project') {
      categoryLimits = {
        ...categoryLimits,
        research: 8, skill_loading: 5,
        file_write: 30, file_edit: 30, file_read: 20,
      };
    }

    // Track accumulated text at loop level for fallback message
    let loopAccumulatedText = '';

    while (interactions < maxLoopIterations) {
      interactions++;

      // === CANCELLATION CHECK: User pressed Stop ===
      if (isCancelled()) {
        console.log('[GeminiClient] \u{1F6D1} User cancelled — stopping main loop');
        const cancelText = loopAccumulatedText || 'Stopped by user.';
        const cancelEvt = { type: 'answer', text: cancelText };
        trace.push(cancelEvt);
        if (onTrace) onTrace(cancelEvt);
        globalSessionManager.setLastAgentOutput(cancelText);
        globalSessionManager.save().catch(() => {});
        return { text: cancelText, trace };
      }

      // === CONTEXT WINDOW MANAGEMENT: Trim if too large ===
      contents = ContextWindowManager.trimContents(contents);

      // === INJECT TASK TRACKER STATE into context (every 4th iteration, non-tool-response turns) ===
      if (interactions > 1 && interactions % 4 === 0) {
        const trackerState = this.readTaskTrackerState();
        if (trackerState) {
          const lastContent = contents[contents.length - 1];
          // Only inject on model turns (after model response), never on tool response turns
          if (lastContent?.role === 'model') {
            contents.push({ role: 'user', parts: [{ text: `[SYSTEM] ${ trackerState }\nContinue to the next pending step. Do NOT re-decompose.` }] });
          }
        }
      }

      // Use streaming to get live thinking + response
      // Fast failover: rotate key + fallback model on failure
      let stream: any;
      let streamAttempts = 0;
      const maxStreamAttempts = Math.min(this.apiKeys.length + 1, 4); // Try up to 4 keys
      let currentModel = this.modelName;

      while (streamAttempts < maxStreamAttempts) {
        streamAttempts++;
        try {
          stream = await this.ai.models.generateContentStream({
            model: currentModel,
            contents,
            config,
          });
          break; // Success — exit retry loop
        } catch (streamErr: any) {
          const errMsg = streamErr.message || '';
          const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
          const isServerError = errMsg.includes('503') || errMsg.includes('500') || errMsg.includes('UNAVAILABLE');
          const isModelError = errMsg.includes('not found') || errMsg.includes('404');
          const isTimeout = errMsg.includes('timeout') || errMsg.includes('DEADLINE_EXCEEDED');

          console.warn(`[GeminiClient] ⚡ Stream attempt ${streamAttempts}/${maxStreamAttempts} failed: ${errMsg.substring(0, 80)}`);

          if (isModelError && currentModel === this.modelName) {
            // Switch to fallback model immediately
            currentModel = this.fallbackModel;
            console.log(`[GeminiClient] 🔄 Switching to fallback model: ${this.fallbackModel}`);
          } else if (isRateLimit || isServerError || isTimeout) {
            // Rotate API key immediately (no delay — speed is priority)
             this.rotateKey();
          } else {
            // Unknown error — rotate key and try
             this.rotateKey();
          }

          if (streamAttempts >= maxStreamAttempts) {
            throw new Error(`All ${maxStreamAttempts} API attempts failed. Last error: ${errMsg.substring(0, 100)}`);
          }
        }
      }

      // Accumulate the full response parts for function calling
      let accumulatedText = '';
      let accumulatedThought = '';
      let functionCalls: any[] = [];
      let fullResponseContent: any = null;

      // Process stream chunks LIVE
      const allResponseParts: any[] = [];

      for await (const chunk of stream) {
        const candidates = chunk.candidates;
        if (!candidates || candidates.length === 0) continue;

        const parts = candidates[0].content?.parts;
        if (!parts) continue;

        for (const part of parts) {
          allResponseParts.push(part);

          // THINKING parts — stream to UI
          if (part.thought && part.text) {
            accumulatedThought += part.text;
            const thoughtEvt = { type: 'thought_stream', text: accumulatedThought, isDelta: false };
            if (onTrace) onTrace(thoughtEvt);
          }

          // Regular TEXT parts (Chain of Thought for standard models, or final answers)
          if (!part.thought && part.text) {
            accumulatedText += part.text;
          }

          // FUNCTION CALL parts
          if (part.functionCall) {
            functionCalls.push(part.functionCall);
          }
        }
      }

      // Build the full response content for history
      fullResponseContent = { role: 'model', parts: allResponseParts };

      // === NATIVE MODEL REASONING CAPTURE ===
      // Standard models (like Gemini 3.1 Pro High) output their chain of thought 
      // as standard text just prior to emitting a tool call payload.
      if (accumulatedText && functionCalls.length > 0 && !accumulatedThought) {
        const thoughtEvt = { type: 'thought_stream', text: accumulatedText, isDelta: false };
        trace.push(thoughtEvt);
        if (onTrace) onTrace(thoughtEvt);
      }

      // If no function calls, we're done — emit final answer
      if (functionCalls.length === 0) {
        noToolCallStreak++;

        if (accumulatedText) {
          // === REFLECTION: Self-evaluate before delivery ===
          const toolsUsed = Array.from(callHistory).map(s => s.split(':')[0]);
          const reflection = await agentReflection.reflect(message, accumulatedText, toolsUsed);

          if (reflection.suggestions.length > 0) {
            console.log(`[GeminiClient] 🪞 Reflection: ${reflection.quality} quality`);
            reflection.suggestions.forEach(s => console.log(`   → ${s}`));
          }

          // Final answer — emit
          const finalText = accumulatedText;
          loopAccumulatedText = finalText; // Track for fallback
          const answerEvt = { type: 'answer', text: finalText };
          const existingIdx = trace.findIndex(t => t.type === 'answer');
          if (existingIdx >= 0) trace[existingIdx] = answerEvt;
          else trace.push(answerEvt);
          if (onTrace) onTrace(answerEvt);

          // Reset reflection counter for next message
          agentReflection.reset();

          // === ADAPTIVE LEARNING: Record this interaction for future improvement ===
          const toolsUsedList = Array.from(callHistory).map(s => s.split(':')[0]);
          const taskDuration = Date.now() - (Date.now() - interactions * 2000); // Approximate
          adaptiveLearning.recordTask(message, toolsUsedList, true, taskDuration).catch(() => {});

          // Log performance stats
          const perfStats = performanceAnalytics.getSummary();
          console.log(`[GeminiClient] 📊 Session stats: ${perfStats.totalToolCalls} tool calls | ${perfStats.overallSuccessRate} success rate`);

          // Store final output in session for self-review on continuation
          globalSessionManager.setLastAgentOutput(finalText);

          return { text: finalText, trace };
        }

        // Model stalling detection — graduated response
        if (noToolCallStreak >= 5) {
          console.warn(`[GeminiClient] ⚠️ Model stalled for ${ noToolCallStreak } iterations. Force-breaking.`);
          const stuckText = accumulatedText || accumulatedThought || 'The agent was unable to complete this task. Please try rephrasing your request.';
          const fallback = { type: 'answer', text: stuckText };
          trace.push(fallback);
          if (onTrace) onTrace(fallback);
          globalSessionManager.setLastAgentOutput(stuckText);
          globalSessionManager.save().catch(() => {});
          return { text: stuckText, trace };
        }

        // Push nudge to get the model to ACT — escalating urgency
        console.log(`[GeminiClient] Iteration ${ interactions }: thoughts only, no tools/answer. Streak: ${ noToolCallStreak }`);
        if (fullResponseContent) contents.push(fullResponseContent);

        const trackerState = this.readTaskTrackerState();
        let nudge: string;
        if (noToolCallStreak >= 3) {
          // Aggressive nudge
          nudge = trackerState
            ? `CRITICAL: You've been thinking for ${noToolCallStreak} rounds WITHOUT acting. EXECUTE NOW. Use tools. ${ trackerState }`
            : 'CRITICAL: You are stuck in a thinking loop. STOP THINKING. Call a tool RIGHT NOW or give your final answer.';
        } else {
          nudge = trackerState
            ? `You are overthinking. Use your tools NOW. Execute the next step. ${ trackerState }`
            : 'You are thinking but not acting. Use your tools NOW. Execute the task.';
        }
        contents.push({ role: 'user', parts: [{ text: nudge }] });
        continue;
      }

      // Reset no-tool streak since we got tool calls
      noToolCallStreak = 0;

      // Push the model's response into history
      if (fullResponseContent) {
        contents.push(fullResponseContent);
      }

      // ═══════════════════════════════════════════════════════
      // PARALLEL TOOL EXECUTION with DEDUP & RATE LIMITING
      // ═══════════════════════════════════════════════════════

      // Compact tool label lookup
      const toolLabels: Record<string, { text: string, type: string, argKey?: string }> = {
        system_shell: { text: 'Running command', type: 'command', argKey: 'command' },
        web_search: { text: 'Researching', type: 'exploration', argKey: 'query' },
        web_scraper: { text: 'Reading source', type: 'exploration', argKey: 'url' },
        workspace_list_directory: { text: 'Scanning directory', type: 'exploration', argKey: 'directory' },
        workspace_read_file: { text: 'Reading file', type: 'exploration', argKey: 'filename' },
        workspace_write_file: { text: 'Writing artifact', type: 'file_edit', argKey: 'filename' },
        workspace_edit_file: { text: 'Editing file', type: 'file_edit', argKey: 'filename' },
        workspace_run_command: { text: 'Running project command', type: 'command', argKey: 'command' },
        workspace_verify_code: { text: 'Verifying code', type: 'command', argKey: 'checkType' },
        workspace_search_text: { text: 'Searching codebase', type: 'exploration', argKey: 'pattern' },
        get_skill_guidelines: { text: 'Loading skill', type: 'exploration', argKey: 'skill_name' },
        git_operations: { text: 'Git operation', type: 'command', argKey: 'operation' },
        screenshot_capture: { text: 'Capturing screen', type: 'exploration', argKey: 'target' },
        code_execution_js: { text: 'Evaluating logic', type: 'command' },
        system_monitor: { text: 'Monitoring system', type: 'exploration', argKey: 'check' },
        desktop_notification: { text: 'Notifying', type: 'command', argKey: 'title' },
        task_decomposer: { text: 'Decomposing task', type: 'command', argKey: 'complexTask' },
        pdf_parser: { text: 'Reading PDF', type: 'exploration', argKey: 'filePath' },
        docx_generator: { text: 'Generating document', type: 'file_edit', argKey: 'filename' },
        image_generator: { text: 'Generating image', type: 'file_edit', argKey: 'prompt' },
        email_manager: { text: 'Managing email', type: 'command', argKey: 'subject' },
        process_manager: { text: 'Managing process', type: 'command', argKey: 'command' },
        network_tools: { text: 'Network operation', type: 'exploration', argKey: 'target' },
        file_compression: { text: 'Compressing files', type: 'file_edit', argKey: 'source' },
        local_database: { text: 'Database query', type: 'command', argKey: 'table' },
        api_caller: { text: 'API request', type: 'exploration', argKey: 'url' },
        calculator: { text: 'Calculating', type: 'command', argKey: 'expression' },
        csv_analyzer: { text: 'Analyzing data', type: 'exploration', argKey: 'filename' },
        smart_api_hub: { text: 'API call', type: 'exploration', argKey: 'connector' },
        chain_executor: { text: 'Executing chain', type: 'command' },
        http_server: { text: 'HTTP server', type: 'command', argKey: 'action' },
        youtube_transcript: { text: 'Extracting transcript', type: 'exploration', argKey: 'videoUrl' },
        clipboard_manager: { text: 'Clipboard', type: 'command', argKey: 'action' },
        text_to_speech: { text: 'Generating speech', type: 'command', argKey: 'text' },
        rss_feed_reader: { text: 'Reading RSS feed', type: 'exploration', argKey: 'feedUrl' },
        whatsapp_controller: { text: 'WhatsApp', type: 'communication', argKey: 'action' },
        telegram_user_controller: { text: 'Telegram', type: 'communication', argKey: 'action' },
        code_generator: { text: 'Scaffolding project', type: 'file_edit', argKey: 'template' },
        self_improve: { text: 'Self-improving', type: 'command', argKey: 'action' },
        diff_patch: { text: 'Comparing files', type: 'exploration' },
        markdown_to_html: { text: 'Converting markdown', type: 'file_edit', argKey: 'title' },
        json_yaml_transform: { text: 'Transforming data', type: 'command', argKey: 'operation' },
        regex_text_processor: { text: 'Processing text', type: 'command', argKey: 'operation' },
        system_automation: { text: 'System automation', type: 'command', argKey: 'action' },
        file_watcher: { text: 'Watching files', type: 'exploration', argKey: 'path' },
        safety_guard: { text: 'Safety check', type: 'command', argKey: 'action' },
        crypto_utils: { text: 'Crypto operation', type: 'command', argKey: 'operation' },
        api_key_vault: { text: 'Vault operation', type: 'command', argKey: 'action' },
        context_manager: { text: 'Context operation', type: 'command', argKey: 'action' },
        task_scheduler: { text: 'Scheduled task', type: 'command', argKey: 'taskName' },
        // Next-Gen tools
        spawn_sub_agent: { text: 'Spawning sub-agents', type: 'command', argKey: 'mode' },
        deep_research: { text: 'Deep researching', type: 'exploration', argKey: 'topic' },
        code_intelligence: { text: 'Analyzing code', type: 'exploration', argKey: 'target' },
        smart_refactor: { text: 'Refactoring code', type: 'file_edit', argKey: 'file' },
        project_scaffolder: { text: 'Scaffolding project', type: 'file_edit', argKey: 'name' },
        env_manager: { text: 'Managing environment', type: 'command', argKey: 'mode' },
        auto_docs: { text: 'Generating docs', type: 'file_edit', argKey: 'target' },
        git_intelligence: { text: 'Git operation', type: 'command', argKey: 'mode' },
        chart_generator: { text: 'Generating chart', type: 'file_edit', argKey: 'title' },
        smart_file_analyzer: { text: 'Analyzing files', type: 'exploration', argKey: 'path' },
        background_task: { text: 'Background task', type: 'command', argKey: 'command' },
        realtime_verify: { text: 'Verifying output', type: 'command', argKey: 'target' },
        create_dynamic_tool: { text: 'Creating tool', type: 'command', argKey: 'toolName' },
        workspace_analyze: { text: 'Analyzing workspace', type: 'exploration', argKey: 'directory' },
        run_macro: { text: 'Running macro', type: 'command', argKey: 'macroName' },
      };

      // Safety detection pattern
      const dangerousPatterns = /\b(rm\s+-rf|Remove-Item|del\s+\/|rmdir|format\s+[a-z]:|Clear-Content|Set-Content.*system|Stop-Process\s+-Force)\b/i;

      // Process ALL function calls in parallel with enhanced dedup
      const executionPromises = functionCalls.map(async (call) => {
        const args = call.args as any;
        const normalizedSig = this.normalizeCallSignature(call.name, args);

        // Get label from compact lookup
        const label = toolLabels[call.name] || { text: call.name, type: 'command' };
        const argKey = label.argKey;
        let secondary = argKey ? String(args?.[argKey] || args?.path || '').substring(0, 100) : call.name;

        // Special: spawn_sub_agent shows agent names + task summaries
        if (call.name === 'spawn_sub_agent' && args?.mode === 'spawn' && args?.tasks) {
          const taskNames = args.tasks.map((t: any) => t.name || 'Agent').join(' + ');
          const taskSummary = args.tasks.map((t: any) => (t.task || '').substring(0, 30)).join(' | ');
          secondary = `${taskNames}: ${taskSummary}`;
        } else if (call.name === 'spawn_sub_agent' && args?.mode === 'status') {
          secondary = args?.agentName ? `Check ${args.agentName}` : 'All agents status';
        } else if (call.name === 'spawn_sub_agent' && args?.mode === 'collect') {
          secondary = args?.agentName ? `Collect ${args.agentName}` : 'Collect all results';
        }

        // Emit INSTANT UI feedback
        // Use the model's dynamically generated personalized action text if provided
        const displayText = args?.uiActionText || label.text;

        const evt = {
          type: label.type,
          text: displayText,
          secondary,
          filename: args?.filename || args?.path || 'system',
          add: args?.content?.split?.('\n')?.length || 0,
          remove: 0
        };
        trace.push(evt);
        if (onTrace) onTrace(evt);

        // Safety detection
        if (call.name === 'system_shell' && args?.command && dangerousPatterns.test(String(args.command))) {
          const safetyEvt = {
            type: 'safety_warning',
            text: '⚠️ Destructive operation detected',
            secondary: String(args.command).substring(0, 120),
            command: String(args.command)
          };
          trace.push(safetyEvt);
          if (onTrace) onTrace(safetyEvt);
        }

        // === HARD BLOCK: task_decomposer one-shot enforcement ===
        if (call.name === 'task_decomposer' && taskDecomposerUsed) {
          console.warn(`[GeminiClient] 🚫 HARD BLOCKED: task_decomposer already used this session`);
          return {
            functionResponse: {
              name: call.name,
              response: { output: { error: `HARD BLOCKED: task_decomposer has ALREADY been called this session. The plan exists in .agent_task_tracker.json. Read it with workspace_read_file if needed. DO NOT decompose again. Execute the NEXT pending step NOW.` } },
              ...(call.id ? { id: call.id } : {})
            }
          };
        }

        // === ENHANCED DEDUP CHECK ===
        // 1. Semantic dedup (catches rephrased queries)
        if (this.isSemanticallyDuplicate(normalizedSig, callHistory)) {
          console.warn(`[GeminiClient] 🚫 BLOCKED DUPLICATE: ${ call.name } (semantic match)`);
          return {
            functionResponse: {
              name: call.name,
              response: { output: { error: `DUPLICATE DETECTED. You already made this call (or a very similar one). Check your conversation history — the result is already there. DO NOT retry. Move to the NEXT step.` } },
              ...(call.id ? { id: call.id } : {})
            }
          };
        }

        // 2. Per-tool call cap
        const currentCount = (toolCallCounts.get(call.name) || 0) + 1;
        toolCallCounts.set(call.name, currentCount);

        const perToolLimits: Record<string, number> = {
          task_decomposer: 1,
          web_search: 3,
          web_scraper: 3,
          get_skill_guidelines: 3,
          desktop_notification: 2,
        };
        const maxCalls = perToolLimits[call.name] || 8;

        if (currentCount > maxCalls) {
          console.warn(`[GeminiClient] 🚫 TOOL CAP: ${ call.name } hit ${ currentCount }/${ maxCalls }`);
          return {
            functionResponse: {
              name: call.name,
              response: { output: { error: `TOOL LIMIT REACHED for ${ call.name }. You've called it ${ currentCount } times. DO NOT call it again. Use the results you already have and MOVE FORWARD to the next step.` } },
              ...(call.id ? { id: call.id } : {})
            }
          };
        }

        // 3. Category-level cap
        const category = toolCategories[call.name];
        if (category) {
          const catCount = (categoryCallCounts.get(category) || 0) + 1;
          categoryCallCounts.set(category, catCount);
          const catLimit = categoryLimits[category] || 20;

          if (catCount > catLimit) {
            console.warn(`[GeminiClient] 🚫 CATEGORY CAP: ${ category } hit ${ catCount }/${ catLimit }`);
            return {
              functionResponse: {
                name: call.name,
                response: { output: { error: `CATEGORY LIMIT REACHED for "${ category }" tools. You've used ${ catCount } calls in this category. STOP researching/loading and START building.` } },
                ...(call.id ? { id: call.id } : {})
              }
            };
          }
        }

        // 4. Skill dedup — track loaded skills specifically
        if (call.name === 'get_skill_guidelines') {
          const skillName = String(args?.skill_name || '').toLowerCase().trim();
          if (loadedSkills.has(skillName)) {
            console.warn(`[GeminiClient] 🚫 SKILL ALREADY LOADED: ${ skillName }`);
            return {
              functionResponse: {
                name: call.name,
                response: { output: { error: `Skill "${ skillName }" is ALREADY LOADED in this session. Use the guidelines you already received. DO NOT load it again.` } },
                ...(call.id ? { id: call.id } : {})
              }
            };
          }
          loadedSkills.add(skillName);
        }

        // 5. File write dedup — prevent re-writing same file + RICH TRACKING
        if (call.name === 'workspace_write_file') {
          const filename = String(args?.filename || '').toLowerCase().trim();
          if (writtenFiles.has(filename)) {
            console.warn(`[GeminiClient] ⚠️ FILE ALREADY WRITTEN: ${ filename } — redirecting to edit`);
          }
          writtenFiles.add(filename);
          // Rich file tracking: store content preview + purpose
          const content = typeof args?.content === 'string' ? args.content : '';
          const purpose = args?.uiActionText || `Created via ${call.name}`;
          globalSessionManager.trackFile(filename, 'created', purpose, content);
          globalSessionManager.addAction(`Created: ${filename}`);
        }

        // 6. File edit tracking
        if (call.name === 'workspace_edit_file') {
          const filename = String(args?.filename || args?.path || '').toLowerCase().trim();
          const purpose = args?.uiActionText || `Edited via ${call.name}`;
          globalSessionManager.trackFile(filename, 'edited', purpose, args?.newContent || args?.replacement || '');
          globalSessionManager.addAction(`Edited: ${filename}`);
        }

        // === EXECUTE THE TOOL ===
        callHistory.add(normalizedSig);
        if (call.name === 'task_decomposer') {
          taskDecomposerUsed = true;
        }
        console.log(`[GeminiClient] ⚡ ${ call.name } (#${ currentCount })`);
        const tool = globalToolRegistry.getTool(call.name);

        let toolOutput: any;
        if (tool) {
          // === INTELLIGENT CACHE: Check for cached result first ===
          const cachedResult = intelligentCache.get(call.name, call.args);
          if (cachedResult) {
            toolOutput = cachedResult;
            toolOutput._cached = true;
            performanceAnalytics.recordToolCall(call.name, 0, true);
          } else {
            const execStart = Date.now();
            try {
              // Wrap tool execution in a hard timeout to prevent hanging
              toolOutput = await Promise.race([
                tool.execute(call.args as any, { _onTrace: onTrace }),
                new Promise((_, reject) => setTimeout(() => reject(new Error('Tool execution timeout (45s max)')), 45000))
              ]);
              const execDuration = Date.now() - execStart;

              // Track performance
              performanceAnalytics.recordToolCall(call.name, execDuration, true);

              // Auto-progress tracking
              this.autoMarkProgress(call.name, args, true);

              // Cache the result for future use
              intelligentCache.set(call.name, call.args, toolOutput);

              // Extract knowledge from results
              knowledgeEngine.extractFromToolResult(call.name, args, toolOutput).catch(() => {});

              // Auto-verify file writes
              if (call.name === 'workspace_write_file' && toolOutput && !toolOutput.error) {
                const filename = args?.filename || args?.path || '';
                if (filename) {
                  try {
                    const fsCheck = require('fs-extra');
                    const pathLib = require('path');
                    const fullPath = pathLib.isAbsolute(filename)
                      ? filename
                      : pathLib.resolve(process.cwd(), filename);
                    const exists = await fsCheck.pathExists(fullPath);
                    if (exists) {
                      const stat = await fsCheck.stat(fullPath);
                      console.log(`[GeminiClient] ✅ AUTO-VERIFY: ${filename} exists (${(stat.size / 1024).toFixed(1)} KB)`);
                      toolOutput._verified = true;
                      toolOutput._fileSize = stat.size;
                    } else {
                      console.warn(`[GeminiClient] ⚠️ AUTO-VERIFY: ${filename} NOT FOUND after write!`);
                      toolOutput._verified = false;
                    }
                  } catch { /* silent */ }
                }
              }

            } catch (err: any) {
              const execDuration = Date.now() - execStart;
              performanceAnalytics.recordToolCall(call.name, execDuration, false);
              console.warn(`[GeminiClient] ⚠️ Tool ${call.name} failed: ${err.message}`);

              // === MULTI-STRATEGY RECOVERY ===
              const recovery = multiStrategyRecovery.attemptRecovery(call.name, call.args, err.message);
              if (recovery) {
                const altTool = globalToolRegistry.getTool(recovery.newTool);
                if (altTool) {
                  try {
                    toolOutput = await altTool.execute(recovery.newArgs, {});
                    console.log(`[GeminiClient] ✅ Recovery succeeded via ${recovery.newTool}`);
                    performanceAnalytics.recordToolCall(recovery.newTool, Date.now() - execStart, true);
                  } catch (recoveryErr: any) {
                    toolOutput = { error: recoveryErr.message, _retryFailed: true,
                      _suggestion: `Tool ${call.name} failed. Recovery via ${recovery.newTool} also failed.` };
                  }
                }
              } else {
                // Standard retry
                try {
                  toolOutput = await tool.execute(call.args as any, {});
                  console.log(`[GeminiClient] ✅ Retry succeeded for ${call.name}`);
                } catch (retryErr: any) {
                  toolOutput = { error: retryErr.message, _retryFailed: true,
                    _suggestion: `Tool ${call.name} failed twice. Try a different approach.` };
                }
              }

              // Learn from error — both knowledge and persistent memory
              knowledgeEngine.extractFromToolResult(call.name, args, toolOutput).catch(() => {});
              agentMemory.recordError(
                call.name,
                err.message,
                toolOutput?._retryFailed ? 'Retry also failed' : 'Recovered via retry/alt tool'
              );
            }
          }
        } else {
          toolOutput = { error: `Tool ${call.name} not found in registry.` };
        }

        return {
          functionResponse: {
            name: call.name,
            response: { output: toolOutput },
            ...(call.id ? { id: call.id } : {})
          }
        };
      });

      // Execute ALL tools in parallel and collect results
      const functionResponseParts = await Promise.all(executionPromises);

      // Push all function responses back to contents
      console.log(`[GeminiClient] ⚡ ${ functionResponseParts.length } tools completed (parallel). Returning to Gemini.`);

      // Push tool responses back to contents — clean, no fake function injections
      contents.push({ role: 'user', parts: functionResponseParts });

      // === SESSION PERSISTENCE: Save state after each tool round ===
      globalSessionManager.updateFromLoop({
        callHistory, writtenFiles, loadedSkills,
        taskDecomposerUsed, toolCallCounts, categoryCallCounts
      });
      globalSessionManager.save().catch(() => {});
    }

    // Max iterations reached — summarize what was accomplished
    const filesCreated = Array.from(writtenFiles);
    const toolCallTotal = Array.from(toolCallCounts.values()).reduce((a, b) => a + b, 0);
    let fallbackText = `Reached maximum iterations (${maxLoopIterations}). `;
    if (filesCreated.length > 0) {
      fallbackText += `Files created/modified: ${filesCreated.join(', ')}. `;
    }
    if (toolCallTotal > 0) {
      fallbackText += `${toolCallTotal} tool calls executed. `;
    }
    fallbackText += loopAccumulatedText ? `\n\n${loopAccumulatedText}` : 'Say "continue" to resume from where I left off.';

    const fallbackEvt = { type: 'answer', text: fallbackText };
    trace.push(fallbackEvt);
    if (onTrace) onTrace(fallbackEvt);
    globalSessionManager.setLastAgentOutput(fallbackText);
    globalSessionManager.save().catch(() => {});
    return { text: fallbackText, trace };
  }
}

export const globalGeminiClient = new GeminiAgentClient();
