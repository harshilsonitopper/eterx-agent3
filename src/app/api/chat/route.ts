import { NextRequest, NextResponse } from 'next/server';
import { AgentOrchestrator } from '../../../lib/agent/orchestrator';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Agent reasoning can take time

// Ensure tools are bootstrapped into the registry
import '../../../lib/agent/tools/index'; 

// Singleton orchestrator to preserve task queue state across requests
const orchestrator = new AgentOrchestrator();

export async function POST(req: NextRequest) {
  try {
    const { prompt, history = [], userId = 'default_user', projectId = 'default_project' } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt is required' }, { status: 400 });
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const sendEvent = (data: any) => {
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`));
          } catch (e) {
            // Client likely closed the tab/socket connection early. Ignore to prevent server crash.
          }
        };

        try {
          const response = await orchestrator.executePipeline(userId, projectId, prompt, history, (traceEvent) => {
            sendEvent({ type: 'trace', data: traceEvent });
          });
          sendEvent({ type: 'done', data: response });
        } catch (error: any) {
          console.error(error);
          sendEvent({ type: 'error', data: error.message });
        } finally {
          controller.close();
        }
      }
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      },
    });
  } catch (error: any) {
    console.error('API Error:', error);
    return NextResponse.json(
      { error: 'Internal Agent Error', details: error.message },
      { status: 500 }
    );
  }
}
