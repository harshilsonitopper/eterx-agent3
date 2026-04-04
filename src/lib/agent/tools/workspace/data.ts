import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import Papa from 'papaparse';
import fs from 'fs-extra';
import path from 'path';

export const csvAnalyzerTool: ToolDefinition = {
  name: 'csv_data_analyzer',
  description: 'Read and analyze CSV files from the workspace. Returns basic statistics and the first N rows.',
  category: 'workspace',
  inputSchema: z.object({
    filename: z.string().describe('The CSV filename in the workspace to analyze'),
    previewRows: z.number().default(5).describe('How many rows to preview')
  }),
  outputSchema: z.object({
    totalRows: z.number(),
    columns: z.array(z.string()),
    preview: z.array(z.any()),
    error: z.string().optional()
  }),
  execute: async (input: { filename: string, previewRows: number }) => {
    const safePath = path.resolve(process.cwd(), '.workspaces/temp', input.filename); 
    console.log(`[Tool: csv_analyzer] Analyzing ${safePath}`);
    
    try {
      const fileContent = await fs.readFile(safePath, 'utf-8');
      const parsed = Papa.parse(fileContent, { header: true, skipEmptyLines: true });
      
      if (parsed.errors.length > 0) {
        console.warn('[Tool: csv_analyzer] Parsing warnings:', parsed.errors);
      }

      const rows: any[] = parsed.data;
      const columns = parsed.meta.fields || [];

      return {
        totalRows: rows.length,
        columns,
        preview: rows.slice(0, input.previewRows)
      };
    } catch (error: any) {
      return { totalRows: 0, columns: [], preview: [], error: error.message };
    }
  }
};
