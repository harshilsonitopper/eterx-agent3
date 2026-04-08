import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import { tavily } from "@tavily/core";

// Use environment variable if magically available, otherwise strictly use user's explicit deployment key
const TAVILY_API_KEY = process.env.VITE_TAVILY_API_KEY || process.env.TAVILY_API_KEY || "";

let tvlyClient: any = null;
try {
  tvlyClient = tavily({ apiKey: TAVILY_API_KEY });
} catch (e: any) {
  console.error("[Tool: web_search] Failed to initialize Tavily Search Client:", e.message);
}

export const webSearchTool: ToolDefinition = {
  name: 'web_search',
  description: 'Search the web using Tavily AI Search for accurate, research-grade, up-to-date information.',
  category: 'research',
  inputSchema: z.object({
    query: z.string().describe('The search query string'),
    searchDepth: z.enum(['basic', 'advanced']).optional().default('basic').describe('Search depth. Advanced uses more AI processing for deeper research.'),
    includeAnswer: z.boolean().optional().default(true).describe('Generate a concise AI-summarized answer from the results'),
    numResults: z.number().optional().default(5).describe('Number of raw search results to return')
  }),
  outputSchema: z.any(),
  execute: async (input: { query: string, searchDepth?: 'basic' | 'advanced', includeAnswer?: boolean, numResults?: number }) => {
    console.log(`[Tool: web_search] Searching via Tavily AI for: "${input.query}"`);
    try {
      if (!tvlyClient) {
        throw new Error("Tavily client is not properly initialized with a valid API key.");
      }

      const response = await tvlyClient.search(input.query, {
        searchDepth: input.searchDepth || 'basic',
        includeAnswer: input.includeAnswer !== false, // default true to give agent a fast digested answer
        maxResults: input.numResults || 5,
      });
      
      // Safety handling of empty payloads
      if (!response || !response.results || response.results.length === 0) {
         return [{ title: "No Results", url: "", content: "Search returned no results. Try modifying your query." }];
      }
      
      // We pass the whole Tavily object back so Gemini reads the AI answer + the individual sources natively
      return {
        ai_summary: response.answer || null,
        results: response.results.map((r: any) => ({
          title: r.title,
          url: r.url,
          content: r.content,
          score: r.score
        }))
      };
      
    } catch (error: any) {
      console.warn('[Tool: web_search] Tavily AI search failed. Error:', error.message);
      return [{ 
        title: "Search Error", 
        url: "", 
        content: `Web search failed: ${error.message}. Try relying on your native internal knowledge or write a specific script instead.` 
      }];
    }
  }
};
