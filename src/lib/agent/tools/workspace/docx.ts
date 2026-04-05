import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle,
  Header, Footer, PageNumber, PageBreak
} from 'docx';
import fs from 'fs/promises';
import fse from 'fs-extra';
import path from 'path';
import os from 'os';
import { resolveWorkspacePath } from '../../workspace/path_resolver';

/**
 * Rich DOCX Generator — creates professional Word documents with:
 * - Headings (H1/H2/H3)
 * - Tables with zebra-striped rows
 * - Bold/italic/underline text formatting
 * - Headers and footers with page numbers
 * - Page breaks between major sections
 * - Proper font sizing and spacing
 * - Saves to ANY user-specified path
 */

// Cleaned out the complex JSON schema. Now using a massive raw Markdown string to let the LLM breathe.

export const docxGeneratorTool: ToolDefinition = {
  name: 'docx_generator',
  description: `Generate a PROFESSIONAL Microsoft Word (.docx) document with rich formatting. Supports headings (H1-H3), paragraphs, tables, and bullet lists.

IMPORTANT: When creating a document, you MUST provide DEEP, SUBSTANTIAL content:
- 1 page ≈ 500 words.
- Write MASSIVE, comprehensive paragraphs of real content, NOT placeholder text.
- Formatted purely in standard Markdown.
- Include tables with real data, not empty rows.

The file is saved to the EXACT path you specify — use full paths like C:\\Users\\AAYUSHI\\Desktop\\report.docx`,

  category: 'workspace',
  inputSchema: z.object({
    filepath: z.string().describe('Full file path including filename, e.g. C:\\Users\\AAYUSHI\\Desktop\\report.docx'),
    title: z.string().describe('Document title shown on cover page'),
    subtitle: z.string().optional().describe('Optional subtitle or description'),
    author: z.string().optional().describe('Document author name'),
    target_pages: z.number().optional().describe('Target number of pages. If set, content is validated to ensure minimum ~450 words per page. Use this to prevent thin documents.'),
    source_md_path: z.string().optional().describe('Path to a workspace .md draft file to compile into the DOCX. Use this if you drafted the report incrementally.'),
    markdown: z.string().optional().describe('The ENTIRE document content written as a massive Markdown string. Use if not using source_md_path.'),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    path: z.string(),
    pages_estimate: z.number().optional(),
    error: z.string().optional()
  }),
  execute: async (input: any) => {
    console.log(`[Tool: docx_generator] Building professional document: ${ input.filepath }`);

    try {
      let markdown = input.markdown || '';

      if (input.source_md_path) {
         // Try multiple locations since workspace_write_file resolves to Desktop
         // but source_md_path might be a relative path from CWD
         const candidatePaths = [
           input.source_md_path,
           path.resolve(process.cwd(), input.source_md_path),
           path.resolve(os.homedir(), 'OneDrive', 'Desktop', input.source_md_path),
           path.resolve(os.homedir(), 'Desktop', input.source_md_path),
           resolveWorkspacePath(input.source_md_path),
         ];
         
         let loaded = false;
         for (const candidatePath of candidatePaths) {
           try {
             markdown = await fs.readFile(candidatePath, 'utf8');
             console.log(`[Tool: docx_generator] Loaded document content from: ${ candidatePath }`);
             loaded = true;
             break;
           } catch { /* try next */ }
         }
         
         if (!loaded) {
           console.warn(`[Tool: docx_generator] ⚠️ Could not find source draft at any of ${candidatePaths.length} paths. Using inline markdown if available.`);
           if (!markdown) {
             throw new Error(`Failed to read source draft "${input.source_md_path}" — tried ${candidatePaths.length} locations. Use 'markdown' parameter instead.`);
           }
         }
      }

      if (!markdown) {
         throw new Error('No content provided. You must provide either "markdown" string or a "source_md_path" pointing to a valid .md draft file.');
      }

      // ═══ CONTENT DEPTH VALIDATOR ═══
      // Ensures the content is ACTUALLY deep enough before building the document.
      // This forces the agent to use chunked writing for long documents.
      const wordCount = markdown.split(/\s+/).filter((w: string) => w.length > 0).length;
      const targetPages = input.target_pages || 0;
      const WORDS_PER_PAGE = 450; // Standard threshold
      
      if (targetPages > 0) {
        const minWords = targetPages * WORDS_PER_PAGE;
        if (wordCount < minWords * 0.6) { // Allow 40% tolerance
          const shortfall = minWords - wordCount;
          console.warn(`[Tool: docx_generator] ⚠️ Content too thin: ${wordCount} words for ${targetPages} pages (need ~${minWords})`);
          return {
            success: false,
            path: '',
            error: `CONTENT TOO SHORT: You provided ~${wordCount} words but need ~${minWords} words for ${targetPages} pages. You are ${shortfall} words short. ` +
                   `Use the CHUNKED WRITING workflow: write each section separately into .workspaces/sandbox/draft.md using workspace_write_file (first section) and workspace_edit_file (append remaining sections), then call docx_generator with source_md_path=".workspaces/sandbox/draft.md". ` +
                   `Each page needs ~${WORDS_PER_PAGE} words of REAL content (3-5 paragraphs of 4-6 sentences each).`
          };
        }
      } else if (wordCount < 200) {
        // Even without target_pages, reject extremely thin content
        console.warn(`[Tool: docx_generator] ⚠️ Very thin content: only ${wordCount} words`);
      }
      
      console.log(`[Tool: docx_generator] 📝 Content: ${wordCount} words${targetPages ? ` (target: ${targetPages} pages)` : ''}`);

      const docChildren: any[] = [];

      // ═══ COVER PAGE ═══
      docChildren.push(
        new Paragraph({ spacing: { before: 4000 } }), 
        new Paragraph({
          children: [new TextRun({ text: input.title, bold: true, size: 56, color: '1E2761', font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        }),
      );

      if (input.subtitle) {
        docChildren.push(
          new Paragraph({ spacing: { before: 200 } }),
          new Paragraph({
            children: [new TextRun({ text: input.subtitle, size: 28, color: '666666', font: 'Calibri', italics: true })],
            alignment: AlignmentType.CENTER,
          }),
        );
      }

      docChildren.push(
        new Paragraph({ spacing: { before: 600 } }),
        new Paragraph({
          children: [new TextRun({ text: `Prepared by: ${ input.author || 'EterX AI' }`, size: 22, color: '999999', font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({
          children: [new TextRun({ text: `Date: ${ new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' }) }`, size: 22, color: '999999', font: 'Calibri' })],
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ children: [new PageBreak()] }), 
      );

      // ═══ NATIVE MARKDOWN PARSER ═══
      let tableMode = false;
      let tableRows: TableRow[] = [];
      let isHeaderRow = false;

      // Inline Markdown Parser: parses **bold**, *italics*, and `code` into TextRuns
      const parseMarkdownInline = (text: string, overrideSize = 22, overrideColor?: string): TextRun[] => {
        const runs: TextRun[] = [];
        const pattern = /(\*\*.*?\*\*|\*.*?\*|`.*?`)/g;
        const tokens = text.split(pattern);

        for (const token of tokens) {
          if (!token) continue;
          if (token.startsWith('**') && token.endsWith('**') && token.length > 4) {
             runs.push(new TextRun({ text: token.slice(2, -2), bold: true, size: overrideSize, font: 'Inter, Calibri', color: overrideColor }));
          } else if (token.startsWith('*') && token.endsWith('*') && token.length > 2) {
             runs.push(new TextRun({ text: token.slice(1, -1), italics: true, size: overrideSize, font: 'Inter, Calibri', color: overrideColor }));
          } else if (token.startsWith('`') && token.endsWith('`') && token.length > 2) {
             runs.push(new TextRun({ text: token.slice(1, -1), font: 'Consolas', size: overrideSize - 2, color: 'D63384', shading: { type: ShadingType.CLEAR, fill: 'F8F9FA' } }));
          } else {
             runs.push(new TextRun({ text: token, size: overrideSize, font: 'Inter, Calibri', color: overrideColor }));
          }
        }
        return runs;
      };

      const flushTable = () => {
        if (tableRows.length > 0) {
          docChildren.push(new Paragraph({ spacing: { before: 100 } }));
          docChildren.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));
          docChildren.push(new Paragraph({ spacing: { after: 200 } }));
          tableRows = [];
        }
        tableMode = false;
      };

      // Remove duplicate Title if the LLM typed it at the very top of its markdown
      let cleanMarkdown = markdown;
      const firstLineMatch = cleanMarkdown.split('\n')[0]?.trim();
      if (firstLineMatch && firstLineMatch.replace(/^#+\s*/, '').toLowerCase() === input.title.toLowerCase()) {
         cleanMarkdown = cleanMarkdown.split('\n').slice(1).join('\n');
      }

      const lines = cleanMarkdown.split('\n');

      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        // Table Parsing
        if (line.startsWith('|') && line.endsWith('|')) {
          if (!tableMode) {
            tableMode = true;
            isHeaderRow = true;
          }

          if (line.match(/^\|[\s-:]+\|/)) {
            isHeaderRow = false;
            continue;
          }

          const cells = line.split('|').map((c: string) => c.trim()).filter((_: string, idx: number, arr: string[]) => idx > 0 && idx < arr.length - 1);
          
          tableRows.push(new TableRow({
            children: cells.map((cellText: string) => new TableCell({
              children: [new Paragraph({
                children: parseMarkdownInline(cellText, 20, isHeaderRow ? 'FFFFFF' : '000000'),
                alignment: isHeaderRow ? AlignmentType.CENTER : AlignmentType.LEFT,
              })],
              shading: isHeaderRow ? { fill: '1E2761', type: ShadingType.CLEAR } : (tableRows.length % 2 === 0 ? { fill: 'F6F8FA', type: ShadingType.CLEAR } : undefined),
              margins: { top: 120, bottom: 120, left: 150, right: 150 }
            })),
          }));

          isHeaderRow = false;
          continue;
        } else if (tableMode) {
          flushTable();
        }

        // Headings
        if (line.startsWith('# ')) {
          docChildren.push(new Paragraph({ children: parseMarkdownInline(line.replace(/^#+\s*/, ''), 32, '1E2761'), heading: HeadingLevel.HEADING_1, spacing: { before: 400, after: 120 } }));
        } else if (line.startsWith('## ')) {
          docChildren.push(new Paragraph({ children: parseMarkdownInline(line.replace(/^#+\s*/, ''), 28, '2A367D'), heading: HeadingLevel.HEADING_2, spacing: { before: 300, after: 100 } }));
        } else if (line.match(/^###+\s/)) { // Captures ###, ####, ##### 
          docChildren.push(new Paragraph({ children: parseMarkdownInline(line.replace(/^#+\s*/, ''), 24, '4A55A2'), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 80 } }));
        } 
        // Blockquotes
        else if (line.startsWith('> ')) {
          docChildren.push(new Paragraph({
             children: parseMarkdownInline(line.replace(/^>\s*/, ''), 22, '555555'),
             indent: { left: 720 },
             border: { left: { color: 'E2765A', space: 15, style: BorderStyle.SINGLE, size: 18 } },
             spacing: { line: 360, after: 200 }
          }));
        }
        // Unordered Lists
        else if (line.startsWith('- ') || line.startsWith('* ')) {
          docChildren.push(new Paragraph({ children: parseMarkdownInline(line.slice(2)), bullet: { level: 0 }, spacing: { line: 320, after: 100 } }));
        }
        // Ordered Lists (e.g. 1. 2. 3.)
        else if (/^\d+\.\s/.test(line)) {
          const match = line.match(/^\d+\.\s(.*)/);
          docChildren.push(new Paragraph({ children: parseMarkdownInline(match ? match[1] : line), numbering: { reference: "default-numbering", level: 0 }, spacing: { line: 320, after: 100 } }));
        }
        // Page break
        else if (line === '---' || line === '***') {
          docChildren.push(new Paragraph({ children: [new PageBreak()] }));
        }
        // Standard Paragraph
        else {
          docChildren.push(new Paragraph({ children: parseMarkdownInline(line), spacing: { line: 360, after: 240 } }));
        }
      }

      flushTable();

      // ═══ BUILD DOCUMENT ═══
      const doc = new Document({
        title: input.title,
        creator: input.author || 'EterX AI',
        sections: [{
          properties: {
            page: {
              margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 }, // 1 inch margins
              size: { width: 12240, height: 15840 }, // Letter size
            },
          },
          headers: {
            default: new Header({
              children: [new Paragraph({
                children: [new TextRun({ text: input.title, italics: true, size: 16, color: '999999', font: 'Calibri' })],
                alignment: AlignmentType.RIGHT,
              })],
            }),
          },
          footers: {
            default: new Footer({
              children: [new Paragraph({
                children: [
                  new TextRun({ text: 'Page ', size: 16, color: '999999', font: 'Calibri' }),
                  new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '999999', font: 'Calibri' }),
                  new TextRun({ text: ' | Generated by EterX AI', size: 16, color: '999999', font: 'Calibri' }),
                ],
                alignment: AlignmentType.CENTER,
              })],
            }),
          },
          children: docChildren,
        }],
      });

      const buffer = await Packer.toBuffer(doc);

      // Save to the EXACT path specified by the user or default to Desktop
      let targetPath = resolveWorkspacePath(input.filepath);
      if (!targetPath.endsWith('.docx')) targetPath += '.docx';

      // Ensure parent directory exists
      await fse.ensureDir(path.dirname(targetPath));
      await fs.writeFile(targetPath, buffer);

      // Estimate pages using word count (~500 words per page is standard)
      const totalWords = cleanMarkdown.split(/\s+/).filter((w: string) => w.length > 0).length;
      const estimatedPages = Math.max(1, Math.ceil(totalWords / 500) + 1); // +1 for cover page

      console.log(`[Tool: docx_generator] ✅ Created ${ estimatedPages }-page document (~${totalWords} words) at: ${ targetPath }`);
      return { success: true, path: targetPath, pages_estimate: estimatedPages, word_count: totalWords };
    } catch (error: any) {
      console.error(`[Tool: docx_generator] ❌ Error:`, error.message);
      return { success: false, path: '', error: error.message };
    }
  }
};
