import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import { globalToolRegistry } from '../registry';

/**
 * Deep Research Engine — Multi-Source Parallel Research
 * 
 * NEXT-GEN CONCEPT: Instead of single web_search calls, this tool
 * orchestrates DEEP research across multiple sources:
 * 
 * 1. Runs multiple search queries simultaneously (different angles)
 * 2. Scrapes top results for detailed content
 * 3. Synthesizes findings into a structured research report
 * 4. Saves the full report to .workspaces/sandbox/
 * 
 * USE FOR: Stock analysis, competitive research, market research,
 * technology comparisons, academic research, product reviews, etc.
 */
export const deepResearchTool: ToolDefinition = {
  name: 'deep_research',
  description: `Run deep multi-angle research on a topic. Automatically searches from multiple angles, scrapes top results, and synthesizes findings into a structured report.

USE FOR: stock analysis, competitive analysis, market research, technology comparison, product review, academic research

INPUT:
- topic: What to research
- angles: Different search angles/queries to explore (2-5 recommended)
- depth: "quick" (search only) | "medium" (search + scrape top results) | "deep" (full multi-source analysis)
- outputFile: Where to save the research report (optional, default: .workspaces/sandbox/research_<timestamp>.md)

EXAMPLE:
{
  topic: "Tesla stock analysis 2025",
  angles: ["TSLA stock price performance 2025", "Tesla revenue earnings 2025", "Tesla analyst ratings forecast"],
  depth: "medium"
}

Returns a structured research synthesis with sources.`,
  category: 'research',
  inputSchema: z.object({
    topic: z.string().describe('The main research topic'),
    angles: z.array(z.string()).describe('Different search queries/angles to explore (2-5 recommended)'),
    depth: z.enum(['quick', 'medium', 'deep']).optional().default('medium')
      .describe('Research depth: quick=search only, medium=search+scrape, deep=full analysis'),
    outputFile: z.string().optional().describe('Path to save research report')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    report: z.string(),
    sources: z.array(z.string()),
    savedTo: z.string()
  }),
  execute: async (input: {
    topic: string,
    angles: string[],
    depth?: string,
    outputFile?: string
  }) => {
    const depth = input.depth || 'medium';
    const angles = input.angles.slice(0, 5);  // Cap at 5 angles

    console.log(`[DeepResearch] 🔬 Topic: "${input.topic}" | ${angles.length} angles | Depth: ${depth}`);

    const webSearch = globalToolRegistry.getTool('web_search');
    const webScraper = globalToolRegistry.getTool('web_scraper');

    if (!webSearch) {
      return { success: false, report: '', sources: [], savedTo: '', error: 'web_search tool not available' };
    }

    // Phase 1: Run all search queries in parallel
    console.log(`[DeepResearch] Phase 1: Searching ${angles.length} angles...`);
    const searchPromises = angles.map(async (angle) => {
      try {
        const result = await webSearch.execute({ query: angle }, {});
        return { angle, result, success: true };
      } catch (err: any) {
        return { angle, result: null, success: false, error: err.message };
      }
    });

    const searchResults = await Promise.allSettled(searchPromises);
    const successfulSearches = searchResults
      .filter(r => r.status === 'fulfilled' && (r as any).value?.success)
      .map(r => (r as PromiseFulfilledResult<any>).value);

    console.log(`[DeepResearch] Phase 1 complete: ${successfulSearches.length}/${angles.length} successful searches`);

    // Phase 2: If medium/deep, scrape top results
    let scrapedContent: Array<{ url: string, content: string }> = [];
    if ((depth === 'medium' || depth === 'deep') && webScraper) {
      console.log(`[DeepResearch] Phase 2: Scraping top results...`);

      // Extract URLs from search results (heuristic — depends on search tool output format)
      const urls: string[] = [];
      for (const search of successfulSearches) {
        const resultText = JSON.stringify(search.result);
        // Extract URLs from results
        const urlMatches = resultText.match(/https?:\/\/[^\s"'<>]+/g);
        if (urlMatches) {
          for (const url of urlMatches.slice(0, 2)) {  // Top 2 per search
            if (!url.includes('google.com') && !url.includes('bing.com') && !urls.includes(url)) {
              urls.push(url);
            }
          }
        }
      }

      // Scrape top URLs (max 4)
      const scrapePromises = urls.slice(0, 4).map(async (url) => {
        try {
          const result = await webScraper.execute({ url, maxLength: 3000 }, {});
          return { url, content: typeof result === 'string' ? result : JSON.stringify(result).substring(0, 3000), success: true };
        } catch {
          return { url, content: '', success: false };
        }
      });

      const scrapeResults = await Promise.allSettled(scrapePromises);
      scrapedContent = scrapeResults
        .filter(r => r.status === 'fulfilled' && (r as any).value?.success)
        .map(r => (r as PromiseFulfilledResult<any>).value);

      console.log(`[DeepResearch] Phase 2 complete: ${scrapedContent.length} pages scraped`);
    }

    // Phase 3: Synthesize into report
    console.log(`[DeepResearch] Phase 3: Synthesizing report...`);

    const sources: string[] = [];
    let report = `# Research Report: ${input.topic}\n\n`;
    report += `**Date:** ${new Date().toLocaleDateString('en-IN', { year: 'numeric', month: 'long', day: 'numeric' })}\n`;
    report += `**Depth:** ${depth} | **Angles:** ${angles.length} | **Sources:** ${successfulSearches.length + scrapedContent.length}\n\n`;
    report += `---\n\n`;

    // Add findings from each angle
    for (let i = 0; i < successfulSearches.length; i++) {
      const search = successfulSearches[i];
      report += `## ${i + 1}. ${search.angle}\n\n`;

      const resultStr = typeof search.result === 'string'
        ? search.result
        : JSON.stringify(search.result, null, 2);

      // Clean up and format the finding
      const cleanResult = resultStr.substring(0, 2000).replace(/[{}"[\]]/g, '').trim();
      report += `${cleanResult}\n\n`;

      // Extract source URLs
      const urlMatches = resultStr.match(/https?:\/\/[^\s"'<>]+/g);
      if (urlMatches) {
        sources.push(...urlMatches.slice(0, 3));
        report += `**Sources:**\n${urlMatches.slice(0, 3).map((u: string) => `- ${u}`).join('\n')}\n\n`;
      }
    }

    // Add scraped content sections
    if (scrapedContent.length > 0) {
      report += `## Detailed Source Analysis\n\n`;
      for (const scraped of scrapedContent) {
        report += `### Source: ${scraped.url}\n\n`;
        report += `${scraped.content.substring(0, 1500)}\n\n`;
        sources.push(scraped.url);
      }
    }

    // Summary section
    report += `---\n\n`;
    report += `## Sources Used\n\n`;
    const uniqueSources = [...new Set(sources)].slice(0, 15);
    report += uniqueSources.map((s, i) => `${i + 1}. ${s}`).join('\n');
    report += '\n';

    // Save report
    const path = require('path');
    const fs = require('fs-extra');
    const outputFile = input.outputFile || path.resolve(
      process.cwd(), '.workspaces', 'sandbox', `research_${Date.now()}.md`
    );
    try {
      await fs.ensureDir(path.dirname(outputFile));
      await fs.writeFile(outputFile, report, 'utf-8');
    } catch { }

    console.log(`[DeepResearch] ✅ Report complete: ${report.length} chars | ${uniqueSources.length} sources | Saved to: ${outputFile}`);

    return {
      success: true,
      report: report.substring(0, 5000),  // Cap return to 5KB
      sources: uniqueSources,
      savedTo: outputFile
    };
  }
};
