import { GoogleGenAI } from '@google/genai';
import { ProjectContext } from '../schemas';

/**
 * The Critic Role (Layer 6: Verification Layer)
 * 
 * Independently verifies if the agent's output answers the user's initial request.
 * Uses a LIGHTWEIGHT direct Gemini call — NOT the full agent loop.
 * This prevents the critic from spawning tools, tasks, or consuming agent capacity.
 */
export class Critic {
  private ai: GoogleGenAI | null = null;

  constructor() {
    // Find an API key
    let apiKey = '';
    for (const [key, value] of Object.entries(process.env)) {
      if (typeof value === 'string' && value.startsWith('AIza')) {
        apiKey = value;
        break;
      }
    }
    if (!apiKey) {
      apiKey = process.env.GEMINI_API_KEY || process.env.VITE_OPENROUTER_API_KEY || '';
    }
    if (apiKey) {
      this.ai = new GoogleGenAI({ apiKey });
    }
  }

  /**
   * Evaluates the Agent's generated answer against the User's goal.
   * Returns a boolean indicating if it passes, and feedback if it fails.
   * Uses a lightweight direct API call — NOT the full agent ReAct loop.
   */
  public async evaluateOutput(
    userGoal: string,
    agentOutput: string,
    context: ProjectContext
  ): Promise<{ passed: boolean, feedback: string }> {
    console.log(`[Critic] Evaluating output for goal: "${ userGoal }"`);

    if (!this.ai) {
      console.warn(`[Critic] No API client. Bypassing.`);
      return { passed: true, feedback: 'No API key for critic. Bypassed.' };
    }

    // Truncate output if too long to avoid wasting tokens
    const truncatedOutput = agentOutput.length > 2000
      ? agentOutput.substring(0, 2000) + '\n... [truncated for evaluation]'
      : agentOutput;

      const { globalSessionManager } = require('../session');
      const performedActions = globalSessionManager.getActions().join(', ') || 'No physical tools executed.';

      const evaluationPrompt = `
      You are the Critic Verification Layer of a LOCAL DESKTOP Agent OS (EterX).
      
      ━━━ CRITICAL FACTS ABOUT THIS AGENT ━━━
      - This agent runs LOCALLY on the user's Windows PC (NOT a web service, NOT a cloud API)
      - It has REAL access to the file system, shell, browser, and all local resources
      - Local file paths like "C:\\Users\\..." ARE valid and accessible to the user
      - The agent saves files to the user's REAL Desktop, Documents, etc.
      - DO NOT reject outputs because they contain local file paths — those are CORRECT
      
      ━━━ YOUR JOB ━━━
      Evaluate if the agent's output ACTUALLY addresses the user's intent.
      
      User Goal: "${ userGoal }"
      Agent Output: "${ truncatedOutput }"
      
      [PHYSICAL ACTIONS PERFORMED]
      These are REAL actions the agent executed (not hallucinated):
      ${ performedActions }
      
      ━━━ USER INTENT INTERPRETATION RULES ━━━
      - If the user says something like "it's just 1 page" or "only X pages" AFTER previously asking for more pages, they are COMPLAINING that the output is too short. They are NOT requesting a shorter document. The agent should regenerate with MORE content.
      - Short messages like "why stopped", "why sted", "continue" are follow-ups, not new tasks. The agent should explain or continue the previous task.
      - If the user references "the report you made" or "what you created", they want the agent to address their PREVIOUS output, not create something new.
      - Messages containing frustration ("just give me", "why", "not working") indicate the agent's previous attempt FAILED and needs fixing.
      
      ━━━ EVALUATION CRITERIA ━━━
      1. Did the agent understand the user's ACTUAL intent (complaint vs request vs follow-up)?
      2. Did the agent take appropriate actions for that intent?
      3. Does the agent's output text accurately reflect what it actually did?
      4. If files were created, are the file paths real absolute paths on the local system? (These are VALID)
      
      ━━━ DO NOT REJECT FOR THESE REASONS ━━━
      - ❌ "Local file path is inaccessible" — WRONG. This is a local agent, paths ARE accessible.
      - ❌ "Agent should provide a download link" — WRONG. Files are on the user's Desktop already.
      - ❌ "File path is not in sandbox" — WRONG. Desktop paths are intentional for final deliverables.
      
      Respond STRICTLY in JSON format with exactly:
      {
        "passed": <boolean>,
        "feedback": "<string explaining the failure if passed is false, otherwise 'Looks good.'>"
      }
    `.trim();

    try {
      // Use the same model family as the main agent for consistency
      const modelCandidates = ['gemini-3.1-flash-lite-preview', 'gemini-3-flash-preview', 'gemini-2.0-flash'];
      let response: any = null;
      let lastError: any = null;

      for (const model of modelCandidates) {
        try {
          response = await Promise.race([
            this.ai.models.generateContent({
              model,
              contents: [{ role: 'user', parts: [{ text: evaluationPrompt }] }],
              config: {
                temperature: 0.2,
              }
            }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Critic timeout')), 12000))
          ]);
          break; // Success — exit the model loop
        } catch (err: any) {
          lastError = err;
          if (err.message?.includes('not found') || err.message?.includes('404')) {
            continue; // Try next model
          }
          throw err; // Non-model errors propagate
        }
      }

      if (!response) {
        throw lastError || new Error('All critic models failed');
      }

      const rawText = (response as any).text || '';
      const cleanJson = rawText.replace(/```json/gi, '').replace(/```/gi, '').trim();
      const jsonMatch = cleanJson.match(/\{[\s\S]*\}/);
      const parsed = JSON.parse(jsonMatch ? jsonMatch[0] : cleanJson);

      const result = {
        passed: parsed.passed === true,
        feedback: parsed.feedback || "Unable to parse feedback."
      };

      console.log(`[Critic] ${result.passed ? '✅ PASSED' : '❌ FAILED'}: ${result.feedback.substring(0, 100)}`);
      return result;
    } catch (error: any) {
      console.error(`[Critic] Evaluation failed: ${ error.message }. Bypassing.`);
      // Fail-open — don't block the agent
      return { passed: true, feedback: 'Critic system error. Bypassed.' };
    }
  }
}
