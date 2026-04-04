import { NextRequest, NextResponse } from 'next/server';
import { cancelAllSubAgents } from '../../../../lib/agent/roles/sub_agent';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * POST /api/agent/stop — Emergency stop for all sub-agents.
 * Called when the user clicks "Stop" in the UI.
 */
export async function POST(req: NextRequest) {
  try {
    cancelAllSubAgents();
    console.log('[API] 🛑 User-initiated stop — all sub-agents cancelling');
    return NextResponse.json({ success: true, message: 'All sub-agents stopping' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
