import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Pre-upload media files to Gemini's Files API.
 * Called immediately when the user attaches a file, so by the time they hit Send
 * the file is already cached in Gemini's servers.
 * 
 * Accepts a JSON body with:
 *   - filePath: absolute path (from Electron)
 *   - fileData: base64 string (from clipboard/browser)
 *   - fileName: original filename
 *   - mimeType: MIME type
 * 
 * Returns:
 *   - fileUri: Gemini file URI (if upload succeeded)
 *   - localPath: workspace path where file is saved
 *   - mimeType: confirmed MIME type
 */

// Gemini files.upload ONLY supports these MIME types
const GEMINI_NATIVE_MIMES = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/bmp', 'image/gif', 'image/heic', 'image/heif',
  'application/pdf', 'application/json',
  'text/plain', 'text/html', 'text/css', 'text/xml', 'text/csv', 'text/rtf', 'text/javascript',
  'audio/mp3', 'audio/wav', 'audio/mpeg', 'audio/ogg',
  'video/mp4', 'video/mpeg', 'video/webm', 'video/mov',
]);

export async function POST(req: NextRequest) {
  try {
    const { filePath, fileData, fileName, mimeType } = await req.json();
    const fs = require('fs');
    const path = require('path');
    const { GoogleGenAI } = require('@google/genai');

    // Save file to workspace
    const workspaceTemp = path.resolve(process.cwd(), '.workspaces', 'temp');
    if (!fs.existsSync(workspaceTemp)) fs.mkdirSync(workspaceTemp, { recursive: true });

    const safeName = (fileName || `upload_${Date.now()}`).replace(/[<>:"/\\|?*]/g, '_');
    const destPath = path.join(workspaceTemp, safeName);

    if (filePath) {
      if (!fs.existsSync(destPath) || filePath !== destPath) {
        fs.copyFileSync(filePath, destPath);
      }
    } else if (fileData) {
      fs.writeFileSync(destPath, Buffer.from(fileData, 'base64'));
    } else {
      return NextResponse.json({ error: 'No file data provided' }, { status: 400 });
    }

    // Attempt native Gemini upload for supported types
    let fileUri = null;
    let uploadedMimeType = mimeType;

    if (GEMINI_NATIVE_MIMES.has(mimeType)) {
      try {
        // Auto-discover API key (same pattern as gemini.ts)
        const keys: string[] = [];
        for (const [, value] of Object.entries(process.env)) {
          if (typeof value === 'string' && value.startsWith('AIza')) {
            keys.push(value);
          }
        }
        const apiKey = keys[Math.floor(Math.random() * keys.length)] || process.env.GEMINI_API_KEY || '';
        const ai = new GoogleGenAI({ apiKey });

        const uploadedMedia = await ai.files.upload({
          file: destPath,
          config: { mimeType }
        });

        if (uploadedMedia && uploadedMedia.uri) {
          fileUri = uploadedMedia.uri;
          uploadedMimeType = uploadedMedia.mimeType || mimeType;
          console.log(`[MediaUpload] ✅ Pre-uploaded: ${uploadedMedia.name} (${uploadedMimeType})`);
        }
      } catch (err: any) {
        console.warn(`[MediaUpload] ⚠️ Native upload failed for ${safeName}: ${err.message?.substring(0, 100)}`);
        // Non-fatal — file is still saved locally
      }
    }

    // For images that couldn't be natively uploaded, prepare inline base64
    let inlineData = null;
    if (!fileUri && mimeType.startsWith('image/')) {
      try {
        const imgBuffer = fs.readFileSync(destPath);
        if (imgBuffer.length < 4 * 1024 * 1024) { // < 4MB
          inlineData = { mimeType, data: imgBuffer.toString('base64') };
        }
      } catch { /* skip */ }
    }

    return NextResponse.json({
      success: true,
      fileUri,
      localPath: destPath,
      mimeType: uploadedMimeType,
      fileName: safeName,
      inlineData,
      isNative: GEMINI_NATIVE_MIMES.has(mimeType),
    });
  } catch (error: any) {
    console.error('[MediaUpload] Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
