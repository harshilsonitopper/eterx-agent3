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
      You are the Critic Verification Layer of an Agent OS.
      Your job is to evaluate if the agent successfully completed the user's task.
      
      User Goal: "${ userGoal }"
      Agent Output: "${ truncatedOutput }"
      
      [CRITICAL CONTEXT]
      The agent is NOT a simple text model — it is an OS-level agent with file system, shell, and browser tools.
      During this task, the agent successfully performed these physical actions:
      ${ performedActions }
      
      Did the agent output accurately reflect its actions AND fully answer the goal?
      (Do NOT reject the output as an "AI hallucination" if the agent claims to have created files or run code, because it actually has tools to do so).
      
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
