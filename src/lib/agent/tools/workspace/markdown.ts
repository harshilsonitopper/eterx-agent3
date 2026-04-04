import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import path from 'path';
import fs from 'fs/promises';
import fse from 'fs-extra';
import { resolveWorkspacePath } from '../../workspace/path_resolver';

/**
 * Markdown → HTML Converter
 * 
 * Converts markdown to styled HTML pages. Perfect for generating
 * preview-ready documentation, reports, and formatted output.
 */
export const markdownTool: ToolDefinition = {
  name: 'markdown_to_html',
  description: 'Convert Markdown text to a beautifully styled HTML page. Creates a self-contained HTML file with embedded CSS. Use for report previews, documentation, or sharing formatted content.',
  category: 'workspace',
  inputSchema: z.object({
    markdown: z.string().describe('Markdown content to convert'),
    title: z.string().optional().default('Document').describe('HTML page title'),
    filename: z.string().optional().describe('Output filename (default: auto-generated)'),
    theme: z.enum(['light', 'dark', 'github']).optional().default('dark').describe('Visual theme')
  }),
  outputSchema: z.object({ success: z.boolean(), filePath: z.string(), message: z.string() }),
  execute: async (input: any) => {
    const filename = input.filename || `doc_${Date.now()}.html`;
    const filePath = resolveWorkspacePath(filename);
    await fse.ensureDir(path.dirname(filePath));
    const theme = input.theme || 'dark';

    // Convert markdown to HTML (basic but comprehensive)
    let html = input.markdown
      // Code blocks
      .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code class="language-$1">$2</code></pre>')
      // Inline code
      .replace(/`([^`]+)`/g, '<code>$1</code>')
      // Headers
      .replace(/^### (.*$)/gm, '<h3>$1</h3>')
      .replace(/^## (.*$)/gm, '<h2>$1</h2>')
      .replace(/^# (.*$)/gm, '<h1>$1</h1>')
      // Bold and italic
      .replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>')
      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.*?)\*/g, '<em>$1</em>')
      // Links and images
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" style="max-width:100%">')
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>')
      // Lists
      .replace(/^\- (.*$)/gm, '<li>$1</li>')
      .replace(/^\d+\. (.*$)/gm, '<li>$1</li>')
      // Blockquotes
      .replace(/^> (.*$)/gm, '<blockquote>$1</blockquote>')
      // Horizontal rules
      .replace(/^---$/gm, '<hr>')
      // Paragraphs (lines not already wrapped)
      .replace(/^(?!<[hpuolibcda])(.*\S.*)$/gm, '<p>$1</p>')
      // Wrap consecutive <li> in <ul>
      .replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

    const colors = {
      dark: { bg: '#0d1117', text: '#c9d1d9', heading: '#58a6ff', code: '#161b22', border: '#30363d', link: '#58a6ff' },
      light: { bg: '#ffffff', text: '#24292f', heading: '#0550ae', code: '#f6f8fa', border: '#d0d7de', link: '#0550ae' },
      github: { bg: '#0d1117', text: '#e6edf3', heading: '#79c0ff', code: '#161b22', border: '#30363d', link: '#79c0ff' }
    };
    const c = colors[theme as keyof typeof colors] || colors.dark;

    const fullHtml = `<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${input.title || 'Document'}</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:'Segoe UI',system-ui,sans-serif;background:${c.bg};color:${c.text};line-height:1.7;padding:2rem}
.container{max-width:860px;margin:0 auto}
h1,h2,h3{color:${c.heading};margin:1.5rem 0 0.8rem;font-weight:600}
h1{font-size:2rem;border-bottom:1px solid ${c.border};padding-bottom:0.5rem}
h2{font-size:1.5rem} h3{font-size:1.2rem}
p{margin:0.5rem 0} a{color:${c.link}}
code{background:${c.code};padding:2px 6px;border-radius:4px;font-size:0.9em;font-family:'Cascadia Code','Fira Code',monospace}
pre{background:${c.code};border:1px solid ${c.border};border-radius:8px;padding:1rem;overflow-x:auto;margin:1rem 0}
pre code{padding:0;background:none}
ul,ol{padding-left:1.5rem;margin:0.5rem 0}
li{margin:0.3rem 0} blockquote{border-left:3px solid ${c.heading};padding-left:1rem;margin:1rem 0;opacity:0.85}
hr{border:none;border-top:1px solid ${c.border};margin:1.5rem 0}
table{border-collapse:collapse;width:100%;margin:1rem 0}
th,td{border:1px solid ${c.border};padding:8px 12px;text-align:left}
th{background:${c.code}}
</style></head>
<body><div class="container">${html}</div></body></html>`;

    await fs.writeFile(filePath, fullHtml, 'utf-8');
    return { success: true, filePath, message: `📄 HTML generated: ${filename} (theme: ${theme})` };
  }
};
