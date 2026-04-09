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
    const { prompt, history = [], mediaAttachments = [], userId = 'default_user', projectId = 'default_project', mode = 'think', pinnedContext = null } = await req.json();

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
          // Pre-process media: save to workspace AND prepare for Gemini upload
          const fs = require('fs');
          const path = require('path');

          // Gemini files.upload ONLY supports these MIME types
          const GEMINI_NATIVE_MIMES = new Set([
            'image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif', 'image/heic', 'image/heif',
            'application/pdf', 'application/json',
            'text/plain', 'text/html', 'text/css', 'text/xml', 'text/csv', 'text/rtf', 'text/javascript',
            'audio/mp3', 'audio/wav', 'audio/mpeg', 'audio/ogg',
            'video/mp4', 'video/mpeg', 'video/webm', 'video/mov',
          ]);

          // Workspace temp directory — agent can access these with tools
          const workspaceTemp = path.resolve(process.cwd(), '.workspaces', 'temp');
          if (!fs.existsSync(workspaceTemp)) fs.mkdirSync(workspaceTemp, { recursive: true });

          const mediaFiles: { path: string, mimeType: string, name: string, fileUri?: string }[] = [];

          if (mediaAttachments && mediaAttachments.length > 0) {
            for (const att of mediaAttachments) {
              const safeName = (att.name || `upload_${Date.now()}`).replace(/[<>:"/\\|?*]/g, '_');
              const destPath = path.join(workspaceTemp, safeName);

              // If file was already pre-uploaded (background), use its data directly
              if (att.fileUri) {
                // Already uploaded to Gemini — just ensure local copy exists
                if (att.path && fs.existsSync(att.path)) {
                  if (!fs.existsSync(destPath)) fs.copyFileSync(att.path, destPath);
                }
                mediaFiles.push({ 
                  path: att.path || destPath, 
                  mimeType: att.mimeType || 'application/octet-stream', 
                  name: safeName,
                  fileUri: att.fileUri 
                });
              } else if (att.path) {
                // Electron native path — copy to workspace so agent tools can find it
                if (!fs.existsSync(destPath) || att.path !== destPath) {
                  fs.copyFileSync(att.path, destPath);
                }
                mediaFiles.push({ path: destPath, mimeType: att.mimeType || 'application/octet-stream', name: safeName });
              } else if (att.data) {
                // Browser clipboard base64 blob — write to workspace
                fs.writeFileSync(destPath, Buffer.from(att.data, 'base64'));
                mediaFiles.push({ path: destPath, mimeType: att.mimeType || 'application/octet-stream', name: safeName });
              }
            }
          }

          // Split: pre-uploaded files go directly, native files for re-upload, rest get text-injected
          const preUploadedFiles = mediaFiles.filter(f => f.fileUri);
          const needsUploadFiles = mediaFiles.filter(f => !f.fileUri && GEMINI_NATIVE_MIMES.has(f.mimeType));
          const geminiNativeFiles = [...preUploadedFiles, ...needsUploadFiles];
          const textFallbackFiles = mediaFiles.filter(f => !f.fileUri && !GEMINI_NATIVE_MIMES.has(f.mimeType));

          // ═══════════════════════════════════════════════════════════
          // UNIVERSAL FILE CONTENT EXTRACTION ENGINE
          // For every non-native file, extract text content locally
          // so the agent receives the actual data, not just a path.
          // ═══════════════════════════════════════════════════════════

          // Helper: extract text from a DOCX by unzipping its XML
          async function extractDocxText(filePath: string): Promise<string> {
            try {
              const AdmZip = require('adm-zip');
              const zip = new AdmZip(filePath);
              const entry = zip.getEntry('word/document.xml');
              if (!entry) return '[Could not read DOCX content]';
              const xml = entry.getData().toString('utf-8');
              // Strip XML tags to get raw text
              return xml.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 50000);
            } catch {
              // Fallback: try reading raw bytes for any readable content
              try {
                const raw = fs.readFileSync(filePath);
                const text = raw.toString('utf-8').replace(/[^\x20-\x7E\n\r\t]/g, '').trim();
                return text.slice(0, 30000) || '[Binary file — use smart_file_analyzer tool]';
              } catch { return '[Could not extract content]'; }
            }
          }

          // Helper: extract text from PDF using pdf-parse
          async function extractPdfText(filePath: string): Promise<string> {
            try {
              const pdfParse = require('pdf-parse');
              const dataBuffer = fs.readFileSync(filePath);
              const data = await pdfParse(dataBuffer);
              return data.text?.slice(0, 50000) || '[Empty PDF]';
            } catch { return '[PDF parsing failed — use parse_pdf tool]'; }
          }

          // Build enriched prompt with file context
          let enrichedPrompt = '';
          if (mediaFiles.length > 0) {
            const fileList = mediaFiles.map(f => `  • ${f.name} (${f.mimeType}) → saved at ${f.path}`).join('\n');
            enrichedPrompt += `[USER ATTACHED FILES]\nThe user has uploaded the following files to your workspace (.workspaces/temp/):\n${fileList}\n\nYou can re-read any of these files anytime using workspace_read_file (for text) or parse_pdf (for PDFs). The files persist in the workspace.\n\n`;
          }

          // Text-readable extensions
          const TEXT_EXTS = new Set([
            '.txt', '.md', '.json', '.csv', '.js', '.ts', '.tsx', '.jsx', '.py', '.java', '.c', '.cpp', '.h',
            '.html', '.css', '.xml', '.yaml', '.yml', '.env', '.log', '.ini', '.cfg', '.sh', '.bat', '.ps1',
            '.sql', '.rb', '.go', '.rs', '.php', '.swift', '.kt', '.r', '.m', '.lua', '.toml', '.conf',
            '.gitignore', '.dockerignore', '.editorconfig', '.prettierrc', '.eslintrc',
          ]);

          // Extract content from non-native files
          for (const file of textFallbackFiles) {
            try {
              const ext = path.extname(file.name).toLowerCase();

              if (ext === '.pdf') {
                const pdfText = await extractPdfText(file.path);
                enrichedPrompt += `[Attached PDF: ${file.name}]\n\`\`\`\n${pdfText}\n\`\`\`\n\n`;
              } else if (ext === '.docx') {
                const docxText = await extractDocxText(file.path);
                enrichedPrompt += `[Attached DOCX: ${file.name}]\n\`\`\`\n${docxText}\n\`\`\`\n\n`;
              } else if (ext === '.xlsx' || ext === '.xls') {
                enrichedPrompt += `[Attached Spreadsheet: ${file.name}] — Saved at ${file.path}. Use csv_analyzer or smart_file_analyzer tool to read and analyze this spreadsheet.\n\n`;
              } else if (ext === '.pptx' || ext === '.ppt') {
                enrichedPrompt += `[Attached Presentation: ${file.name}] — Saved at ${file.path}. Use smart_file_analyzer tool to examine this file.\n\n`;
              } else if (TEXT_EXTS.has(ext) || file.mimeType.startsWith('text/')) {
                const content = fs.readFileSync(file.path, 'utf-8').slice(0, 50000);
                enrichedPrompt += `[Attached File: ${file.name}]\n\`\`\`\n${content}\n\`\`\`\n\n`;
              } else {
                enrichedPrompt += `[Attached File: ${file.name}] — Binary file saved at ${file.path}. Use smart_file_analyzer or appropriate tools to process it.\n\n`;
              }
            } catch {
              enrichedPrompt += `[Attached File: ${file.name}] — Saved at ${file.path}. Use workspace tools to read it.\n\n`;
            }
          }

          // For native image files, ALSO add inline base64 as backup in case files.upload fails
          // This ensures images ALWAYS reach the model even if the upload API has issues
          const imageBackupParts: { inlineData: { mimeType: string, data: string } }[] = [];
          for (const file of geminiNativeFiles) {
            if (file.mimeType.startsWith('image/')) {
              try {
                const imgBuffer = fs.readFileSync(file.path);
                const b64 = imgBuffer.toString('base64');
                // Only inline if < 4MB (Gemini inline limit)
                if (imgBuffer.length < 4 * 1024 * 1024) {
                  imageBackupParts.push({ inlineData: { mimeType: file.mimeType, data: b64 } });
                }
              } catch { /* skip */ }
            }
          }

          enrichedPrompt += `[USER REQUEST]\n${prompt}`;

          const response = await orchestrator.executePipeline(userId, projectId, enrichedPrompt, history, (traceEvent) => {
            sendEvent({ type: 'trace', data: traceEvent });
          }, mode, pinnedContext, geminiNativeFiles, imageBackupParts);
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
