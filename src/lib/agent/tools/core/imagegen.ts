import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import path from 'path';
import fs from 'fs/promises';
import fse from 'fs-extra';
import axios from 'axios';
import { resolveWorkspacePath } from '../../workspace/path_resolver';

/**
 * AI Image Generator Tool — Enhanced Prompt Engineering
 * 
 * Uses Pollinations AI with advanced prompt composition.
 * Automatically enhances user prompts with style, quality, and composition modifiers.
 * 
 * For DATA VISUALIZATION / CHARTS → use chart_generator instead (Python/matplotlib)
 * This tool is for CREATIVE / PHOTOGRAPHIC / ILLUSTRATION images.
 */

// Prompt enhancement templates by style
const STYLE_ENHANCERS: Record<string, string> = {
  realistic: 'photorealistic, 8k UHD, DSLR quality, natural lighting, sharp focus, detailed textures, professional photography',
  illustration: 'digital illustration, vibrant colors, clean lines, artstation trending, concept art, detailed, beautiful composition',
  diagram: 'technical diagram, clean layout, labeled, professional, minimalist, infographic style, clear typography',
  icon: 'flat design icon, clean vector, minimal, geometric, professional, app icon style, centered composition',
  abstract: 'abstract art, vibrant gradients, flowing shapes, creative, dynamic composition, modern art, bold colors',
  photo: 'professional photograph, high resolution, natural lighting, bokeh background, editorial quality, magazine style',
  '3d': '3D render, octane render, detailed, volumetric lighting, subsurface scattering, professional 3D, cinema quality',
  anime: 'anime style, detailed, studio quality, vibrant, beautiful lighting, trending on pixiv, masterpiece',
  logo: 'professional logo design, clean, minimal, vector style, brand identity, modern, scalable, centered',
  ui: 'UI design, clean interface, modern web design, glassmorphism, premium, professional, dark theme',
  product: 'product photography, studio lighting, white background, professional, commercial, high detail, centered',
  landscape: 'landscape photography, golden hour, panoramic, breathtaking, nature, high resolution, cinematic',
};

// Quality boosters applied to all prompts
const QUALITY_BOOSTERS = [
  'masterpiece', 'best quality', 'highly detailed'
];

// Negative prompt to avoid common issues
const NEGATIVE_PROMPT = 'blurry, low quality, distorted, deformed, watermark, text overlay, cropped, bad anatomy';

export const imageGenTool: ToolDefinition = {
  name: 'image_generator',
  description: `Generate AI images from text descriptions with enhanced prompt engineering.

STYLES: realistic, illustration, diagram, icon, abstract, photo, 3d, anime, logo, ui, product, landscape

⚠️ For DATA CHARTS (bar, pie, line, scatter, etc.) → use chart_generator instead. It uses Python/matplotlib for pixel-perfect data visualization.

This tool is for CREATIVE images — logos, illustrations, photos, UI mockups, product shots, etc.

Tips for better results:
- Be SPECIFIC about content, composition, colors, mood
- Mention lighting: "soft ambient light", "golden hour", "studio lighting"
- Mention style references: "in the style of...", "trending on artstation"
- For people: describe pose, expression, clothing
- For scenes: describe foreground, midground, background`,
  category: 'core',
  inputSchema: z.object({
    prompt: z.string().describe('Detailed description of the image to generate. Be specific about content, style, colors, composition, lighting.'),
    style: z.enum(['realistic', 'illustration', 'diagram', 'icon', 'abstract', 'photo', '3d', 'anime', 'logo', 'ui', 'product', 'landscape'])
      .optional().default('illustration').describe('Visual style preset'),
    width: z.number().optional().default(1024).describe('Width in pixels (512-1920)'),
    height: z.number().optional().default(1024).describe('Height in pixels (512-1920)'),
    filename: z.string().optional().describe('Custom filename (default: generated_<timestamp>.png)'),
    enhancePrompt: z.boolean().optional().default(true).describe('Auto-enhance the prompt with quality modifiers (recommended true)')
  }),
  outputSchema: z.object({
    success: z.boolean(),
    filePath: z.string(),
    message: z.string(),
    enhancedPrompt: z.string()
  }),
  execute: async (input: {
    prompt: string, style?: string, width?: number, height?: number,
    filename?: string, enhancePrompt?: boolean
  }) => {
    const filename = input.filename || `generated_${Date.now()}.png`;
    const filePath = resolveWorkspacePath(filename);
    const outputDir = path.dirname(filePath);
    await fse.ensureDir(outputDir);
    const w = Math.min(1920, Math.max(512, input.width || 1024));
    const h = Math.min(1920, Math.max(512, input.height || 1024));
    const style = input.style || 'illustration';

    // Build the enhanced prompt
    let finalPrompt = input.prompt;

    if (input.enhancePrompt !== false) {
      const styleEnhancer = STYLE_ENHANCERS[style] || STYLE_ENHANCERS.illustration;
      const qualityBoost = QUALITY_BOOSTERS.join(', ');
      finalPrompt = `${input.prompt}, ${styleEnhancer}, ${qualityBoost}`;
    }

    console.log(`[Tool: image_generator] Generating (${style}): "${input.prompt.substring(0, 60)}..."`);
    console.log(`[Tool: image_generator] Enhanced: "${finalPrompt.substring(0, 100)}..."`);

    try {
      // Pollinations AI — free, no API key
      const encodedPrompt = encodeURIComponent(finalPrompt);
      const negativeEncoded = encodeURIComponent(NEGATIVE_PROMPT);
      const imageUrl = `https://image.pollinations.ai/prompt/${encodedPrompt}?width=${w}&height=${h}&nologo=true&negative=${negativeEncoded}`;

      const response = await axios.get(imageUrl, {
        responseType: 'arraybuffer',
        timeout: 90000, // 90s timeout
        headers: { 'User-Agent': 'EterX-Agent/2.0' }
      });

      await fs.writeFile(filePath, Buffer.from(response.data));
      const stats = await fs.stat(filePath);

      console.log(`[Tool: image_generator] ✅ Image saved: ${filename} (${(stats.size / 1024).toFixed(1)} KB)`);

      return {
        success: true,
        filePath,
        enhancedPrompt: finalPrompt,
        message: `Image generated: ${filename} (${(stats.size / 1024).toFixed(1)} KB, ${w}x${h}px, style: ${style}). Saved at: ${filePath}`
      };

    } catch (apiError: any) {
      console.warn(`[Tool: image_generator] API failed: ${apiError.message}. Creating SVG placeholder.`);

      // Create a professional SVG placeholder
      const svgFilename = filename.replace('.png', '.svg');
      const svgPath = path.join(outputDir, svgFilename);

      const gradients: [string, string][] = [
        ['#667eea', '#764ba2'], ['#f093fb', '#f5576c'],
        ['#4facfe', '#00f2fe'], ['#43e97b', '#38f9d7'],
        ['#fa709a', '#fee140'], ['#a18cd1', '#fbc2eb']
      ];
      const [c1, c2] = gradients[Math.floor(Math.random() * gradients.length)];

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:${c1};stop-opacity:1" />
      <stop offset="100%" style="stop-color:${c2};stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="100%" height="100%" fill="url(#bg)" rx="12"/>
  <text x="50%" y="42%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui, sans-serif" font-size="24" fill="white" opacity="0.95" font-weight="bold">
    ${escapeXml(input.prompt.substring(0, 50))}
  </text>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui, sans-serif" font-size="14" fill="white" opacity="0.6">
    Image Generation Placeholder — Style: ${style}
  </text>
  <text x="50%" y="60%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui, sans-serif" font-size="11" fill="white" opacity="0.4">
    Generated by EterX Agent OS v5
  </text>
</svg>`;

      await fs.writeFile(svgPath, svg, 'utf-8');
      return {
        success: true,
        filePath: svgPath,
        enhancedPrompt: finalPrompt,
        message: `SVG placeholder generated: ${svgFilename} (API unavailable). Original prompt saved for retry.`
      };
    }
  }
};

function escapeXml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
