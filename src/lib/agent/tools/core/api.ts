import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import axios from 'axios';

export const apiCallerTool: ToolDefinition = {
  name: 'api_caller',
  description: 'Universal API Caller. Make any HTTP request (GET, POST, PUT, DELETE) to external services. Use this to interact with REST APIs, fetch JSON, or trigger webhooks.',
  category: 'core',
  inputSchema: z.object({
    url: z.string().url().describe('The full URL of the API endpoint'),
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']).default('GET').describe('HTTP method'),
    headers: z.record(z.string()).optional().describe('Key-value pairs for HTTP headers (e.g., Authorization)'),
    body: z.any().optional().describe('The JSON payload or body for POST/PUT requests')
  }),
  outputSchema: z.object({
    status: z.number(),
    data: z.any(),
    error: z.string().optional()
  }),
  execute: async (input: { url: string, method: string, headers?: Record<string, string>, body?: any }) => {
    console.log(`[Tool: api_caller] Requesting ${input.method} ${input.url}`);
    try {
      const response = await axios({
        method: input.method as any,
        url: input.url,
        headers: input.headers || {},
        data: input.body
      });
      return { status: response.status, data: response.data };
    } catch (error: any) {
      return { 
        status: error.response?.status || 500, 
        data: error.response?.data || null,
        error: error.message 
      };
    }
  }
};
