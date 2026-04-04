import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import path from 'path';
import fs from 'fs-extra';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Fully bypass webpack — eval('require') prevents static analysis
let _pw: any = null;
function getPlaywright(): any {
  if (!_pw) {
    // eslint-disable-next-line no-eval
    _pw = eval('require')('playwright-core');
  }
  return _pw;
}

const SCREENSHOTS_DIR = path.resolve(process.cwd(), '.workspaces', 'temp', 'screenshots');
const BROWSER_LOG = path.resolve(process.cwd(), '.workspaces', 'temp', 'browser_actions.log');

/**
 * Browser Control — Real-Time Web Agent via Playwright + CDP
 * 
 * Three-Layer Architecture:
 * ═══════════════════════════════════════
 * Layer 1: AI Agent (Gemini) — interprets requests, reads screenshots + DOM
 * Layer 2: This Tool — parses AI decisions, executes actions, returns feedback  
 * Layer 3: Playwright + CDP — drives actual browser interaction
 * 
 * CAPABILITIES:
 * 🌐 Launch/connect to Chrome (local or remote debugging)
 * 📸 Screenshot any page
 * 🖱️ Click elements by selector, text, or coordinates
 * ⌨️ Type text into fields
 * 🔗 Navigate to URLs, go back/forward, reload
 * 📄 Read page content, DOM elements, text
 * 📋 Extract data from pages
 * 🔍 Find elements by text, selector, aria-label
 * 📱 Scroll pages
 * 🗂️ Manage tabs (new, switch, close)
 * ⏳ Wait for elements, navigation, network idle
 * 🖥️ Execute JavaScript in page context
 * 📥 Download detection
 * 
 * SAFETY: All actions logged. No credential storage. User visible.
 */

// ═══════════════════════════════════════
// BROWSER SESSION MANAGER — Singleton
// ═══════════════════════════════════════
class BrowserSession {
  private browser: any = null;
  private context: any = null;
  private pages: Map<string, any> = new Map();
  private activePageId: string = 'main';

  async ensureConnected(): Promise<any> {
    if (this.browser?.isConnected()) {
      const page = this.pages.get(this.activePageId);
      if (page && !page.isClosed()) return page;
    }

    const pw = getPlaywright();

    // Try connecting to existing Chrome with remote debugging
    try {
      const debugPort = await this.findChromeDebugPort();
      if (debugPort) {
        this.browser = await pw.chromium.connectOverCDP(`http://127.0.0.1:${debugPort}`);
        console.log(`[BrowserControl] 🔗 Connected to Chrome on port ${debugPort}`);
        const contexts = this.browser!.contexts();
        this.context = contexts[0] || await this.browser!.newContext();
        const pages = this.context!.pages();
        if (pages.length > 0) {
          this.pages.set('main', pages[0]);
          return pages[0];
        }
      }
    } catch (e) {
      console.log(`[BrowserControl] No existing Chrome debug instance, launching new...`);
    }

    // Launch new Chrome instance
    this.browser = await pw.chromium.launch({
      headless: false,
      channel: 'chrome',
      args: [
        '--start-maximized',
        '--disable-blink-features=AutomationControlled',
        '--no-first-run',
        '--no-default-browser-check',
      ],
    });
    this.context = await this.browser!.newContext({
      viewport: null,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
    });
    const page = await this.context!.newPage();
    this.pages.set('main', page);
    console.log(`[BrowserControl] 🚀 Launched new Chrome instance`);
    return page;
  }

  async getPage(tabId?: string): Promise<any> {
    const id = tabId || this.activePageId;
    const page = this.pages.get(id);
    if (page && !page.isClosed()) return page;
    return this.ensureConnected();
  }

  async newTab(url?: string): Promise<{ page: any; tabId: string }> {
    if (!this.context) await this.ensureConnected();
    const page = await this.context!.newPage();
    const tabId = `tab_${Date.now()}`;
    this.pages.set(tabId, page);
    this.activePageId = tabId;
    if (url) await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    return { page, tabId };
  }

  async switchTab(tabId: string): Promise<any> {
    const page = this.pages.get(tabId);
    if (page && !page.isClosed()) {
      this.activePageId = tabId;
      await page.bringToFront();
      return page;
    }
    return null;
  }

  async closeTab(tabId: string): Promise<boolean> {
    const page = this.pages.get(tabId);
    if (page && !page.isClosed()) {
      await page.close();
      this.pages.delete(tabId);
      // Switch to next available tab
      for (const [id, p] of this.pages) {
        if (!p.isClosed()) { this.activePageId = id; break; }
      }
      return true;
    }
    return false;
  }

  getTabList(): { id: string; title: string; url: string }[] {
    const tabs: { id: string; title: string; url: string }[] = [];
    for (const [id, page] of this.pages) {
      if (!page.isClosed()) {
        tabs.push({ id, title: page.url(), url: page.url() });
      }
    }
    return tabs;
  }

  async disconnect() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
      this.context = null;
      this.pages.clear();
    }
  }

  private async findChromeDebugPort(): Promise<number | null> {
    try {
      const { stdout } = await execAsync(
        `netstat -ano | findstr "LISTENING" | findstr "9222"`,
        { shell: 'cmd.exe', timeout: 3000 }
      );
      if (stdout.includes('9222')) return 9222;
    } catch {}
    return null;
  }
}

const session = new BrowserSession();

// ═══════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════
async function logAction(action: string, details: any) {
  try {
    await fs.ensureDir(path.dirname(BROWSER_LOG));
    const entry = `[${new Date().toISOString()}] ${action}: ${JSON.stringify(details)}\n`;
    await fs.appendFile(BROWSER_LOG, entry);
  } catch {}
}

async function takeScreenshot(page: any, label: string): Promise<string> {
  try {
    await fs.ensureDir(SCREENSHOTS_DIR);
    const filePath = path.join(SCREENSHOTS_DIR, `browser_${label}_${Date.now()}.png`);
    await page.screenshot({ path: filePath, fullPage: false });
    return filePath;
  } catch { return ''; }
}

function fail(action: string, msg: string) {
  return { success: false, action, result: msg };
}

// ═══════════════════════════════════════
// TOOL DEFINITION
// ═══════════════════════════════════════
export const browserControlTool: ToolDefinition = {
  name: 'browser_control',
  description: `🌐 REAL-TIME BROWSER CONTROL via Playwright + Chrome DevTools Protocol.
  
Opens real Chrome, navigates pages, clicks buttons, fills forms, reads content, takes screenshots, manages tabs. Works like a human browsing the web.

WORKFLOW for any web task:
1. navigate → go to the URL
2. screenshot → SEE the page
3. read_dom / get_text → understand content
4. click / type / select → interact with elements
5. screenshot → verify result

USE THIS when the user asks to:
- Open/browse any website
- Fill out forms, click buttons
- Search the web visually
- Read/extract webpage content
- Login to services
- Download files
- Interact with web apps

ELEMENT TARGETING (in order of reliability):
1. selector: CSS selector (#id, .class, button[type="submit"])
2. text: visible text content ("Sign In", "Submit")
3. x,y: screen coordinates (last resort)`,
  category: 'core',
  inputSchema: z.object({
    action: z.enum([
      // Navigation
      'navigate', 'go_back', 'go_forward', 'reload',
      // Interaction
      'click', 'type', 'press_key', 'select_option', 'hover', 'scroll',
      // Reading
      'screenshot', 'get_text', 'get_html', 'read_dom', 'get_url', 'get_title',
      // Element queries
      'find_elements', 'get_element_text', 'get_attribute',
      // Tab management
      'new_tab', 'switch_tab', 'close_tab', 'list_tabs',
      // Waiting
      'wait_for_element', 'wait_for_navigation', 'wait',
      // JavaScript
      'evaluate', 'evaluate_handle',
      // Session
      'connect', 'disconnect', 'launch_chrome',
      // File/Download
      'upload_file',
    ]).describe('Browser action to perform'),

    // Navigation
    url: z.string().optional().describe('URL to navigate to'),

    // Element targeting
    selector: z.string().optional().describe('CSS selector: #id, .class, button, [aria-label="..."]'),
    text: z.string().optional().describe('Text to type, or visible text to find element by'),
    index: z.number().optional().describe('Index of element if multiple matches (0-based)'),

    // Click coordinates (fallback)
    x: z.number().optional().describe('X coordinate for click'),
    y: z.number().optional().describe('Y coordinate for click'),

    // Keyboard
    key: z.string().optional().describe('Key to press: Enter, Tab, Escape, ArrowDown, etc.'),
    modifiers: z.array(z.string()).optional().describe('Key modifiers: ["Control", "Shift"]'),

    // Select
    value: z.string().optional().describe('Option value to select in dropdown'),

    // Scroll
    direction: z.enum(['up', 'down', 'left', 'right']).optional().default('down'),
    amount: z.number().optional().describe('Scroll amount in pixels (default 300) or wait ms'),

    // JavaScript
    script: z.string().optional().describe('JavaScript to evaluate in page context'),

    // Tabs
    tabId: z.string().optional().describe('Tab ID for tab operations'),

    // File upload
    filePath: z.string().optional().describe('Path to file for upload'),

    // Screenshot options
    fullPage: z.boolean().optional().default(false),
    captureAfter: z.boolean().optional().default(true),
  }),
  outputSchema: z.object({
    success: z.boolean(),
    action: z.string(),
    result: z.any(),
    screenshotPath: z.string().optional(),
    currentUrl: z.string().optional(),
    pageTitle: z.string().optional(),
  }),
  execute: async (input: any) => {
    const { action } = input;
    const shouldCapture = input.captureAfter !== false;

    console.log(`[BrowserControl] 🌐 ${action} | url:"${(input.url || '').substring(0, 60)}" sel:"${input.selector || ''}" text:"${(input.text || '').substring(0, 40)}"`);
    await logAction(action, { url: input.url, selector: input.selector, text: input.text });

    try {
      let result: any = {};
      let page: any;

      // Actions that don't need a page
      if (action === 'disconnect') {
        await session.disconnect();
        return { success: true, action, result: 'Browser disconnected' };
      }
      if (action === 'list_tabs') {
        return { success: true, action, result: { tabs: session.getTabList() } };
      }

      // Ensure browser is connected for all other actions
      page = await session.getPage(input.tabId);

      switch (action) {
        // ═══════════════════════════════
        // 🔗 NAVIGATION
        // ═══════════════════════════════
        case 'connect':
        case 'launch_chrome': {
          page = await session.ensureConnected();
          if (input.url) {
            await page.goto(input.url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          }
          result = { connected: true, url: page.url() };
          break;
        }

        case 'navigate': {
          if (!input.url) return fail(action, 'url required');
          let url = input.url;
          // Auto-add protocol
          if (!url.startsWith('http') && !url.startsWith('file:')) {
            url = url.includes('.') ? `https://${url}` : `https://www.google.com/search?q=${encodeURIComponent(url)}`;
          }
          await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
          result = { navigated: url, title: await page.title() };
          break;
        }

        case 'go_back': {
          await page.goBack({ waitUntil: 'domcontentloaded', timeout: 15000 });
          result = { navigated: 'back', url: page.url() };
          break;
        }

        case 'go_forward': {
          await page.goForward({ waitUntil: 'domcontentloaded', timeout: 15000 });
          result = { navigated: 'forward', url: page.url() };
          break;
        }

        case 'reload': {
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 });
          result = { reloaded: true, url: page.url() };
          break;
        }

        // ═══════════════════════════════
        // 🖱️ INTERACTION
        // ═══════════════════════════════
        case 'click': {
          if (input.selector) {
            const el = input.index != null
              ? (await page.$$(input.selector))[input.index]
              : await page.$(input.selector);
            if (!el) return fail(action, `Element not found: ${input.selector}`);
            await el.scrollIntoViewIfNeeded();
            await el.click({ timeout: 5000 });
            result = { clicked: input.selector };
          } else if (input.text) {
            // Click by visible text
            const el = await page.getByText(input.text, { exact: false }).first();
            await el.scrollIntoViewIfNeeded();
            await el.click({ timeout: 5000 });
            result = { clicked: `text:"${input.text}"` };
          } else if (input.x != null && input.y != null) {
            await page.mouse.click(input.x, input.y);
            result = { clicked: { x: input.x, y: input.y } };
          } else {
            return fail(action, 'selector, text, or x/y required');
          }
          await page.waitForTimeout(500); // Let page react
          break;
        }

        case 'type': {
          if (!input.text) return fail(action, 'text required');
          if (input.selector) {
            const el = await page.$(input.selector);
            if (!el) return fail(action, `Element not found: ${input.selector}`);
            await el.scrollIntoViewIfNeeded();
            await el.click();
            await el.fill(input.text);
            result = { typed: input.text.substring(0, 60), into: input.selector };
          } else {
            // Type into currently focused element
            await page.keyboard.type(input.text, { delay: 30 });
            result = { typed: input.text.substring(0, 60), into: 'focused_element' };
          }
          break;
        }

        case 'press_key': {
          const key = input.key || input.text || 'Enter';
          if (input.modifiers && input.modifiers.length > 0) {
            const combo = [...input.modifiers, key].join('+');
            await page.keyboard.press(combo);
            result = { pressed: combo };
          } else {
            await page.keyboard.press(key);
            result = { pressed: key };
          }
          await page.waitForTimeout(300);
          break;
        }

        case 'select_option': {
          if (!input.selector) return fail(action, 'selector required');
          const val = input.value || input.text || '';
          await page.selectOption(input.selector, val);
          result = { selected: val, in: input.selector };
          break;
        }

        case 'hover': {
          if (input.selector) {
            await page.hover(input.selector);
            result = { hovered: input.selector };
          } else if (input.x != null && input.y != null) {
            await page.mouse.move(input.x, input.y);
            result = { hovered: { x: input.x, y: input.y } };
          } else {
            return fail(action, 'selector or x/y required');
          }
          break;
        }

        case 'scroll': {
          const dir = input.direction || 'down';
          const amt = input.amount || 300;
          const deltaX = dir === 'left' ? -amt : dir === 'right' ? amt : 0;
          const deltaY = dir === 'up' ? -amt : dir === 'down' ? amt : 0;
          
          if (input.selector) {
            const el = await page.$(input.selector);
            if (el) {
              await el.scrollIntoViewIfNeeded();
              result = { scrolled: 'to_element', selector: input.selector };
              break;
            }
          }
          await page.mouse.wheel(deltaX, deltaY);
          result = { scrolled: dir, amount: amt };
          break;
        }

        // ═══════════════════════════════
        // 📸 READING
        // ═══════════════════════════════
        case 'screenshot': {
          const screenshotPath = await takeScreenshot(page, 'view');
          return {
            success: !!screenshotPath,
            action,
            result: screenshotPath ? `Screenshot saved: ${screenshotPath}` : 'Failed',
            screenshotPath,
            currentUrl: page.url(),
            pageTitle: await page.title(),
          };
        }

        case 'get_text': {
          let text: string;
          if (input.selector) {
            const el = await page.$(input.selector);
            text = el ? (await el.textContent()) || '' : 'Element not found';
          } else {
            // Get all visible text from page
            text = await page.evaluate(() => {
              return document.body.innerText.substring(0, 8000);
            });
          }
          result = { text: text.substring(0, 5000) };
          break;
        }

        case 'get_html': {
          let html: string;
          if (input.selector) {
            const el = await page.$(input.selector);
            html = el ? (await el.innerHTML()) : 'Element not found';
          } else {
            html = await page.content();
          }
          result = { html: html.substring(0, 8000) };
          break;
        }

        case 'read_dom': {
          // Get a structured, truncated view of clickable/interactive elements
          const dom = await page.evaluate(() => {
            const elements: any[] = [];
            const interactiveSelectors = 'a, button, input, textarea, select, [role="button"], [role="link"], [role="tab"], [onclick], [href]';
            const els = document.querySelectorAll(interactiveSelectors);
            
            els.forEach((el, i) => {
              if (i > 80) return; // Cap at 80 elements
              const rect = el.getBoundingClientRect();
              if (rect.width === 0 || rect.height === 0) return;
              
              const tag = el.tagName.toLowerCase();
              const text = (el.textContent || '').trim().substring(0, 60);
              const href = (el as HTMLAnchorElement).href || '';
              const type = (el as HTMLInputElement).type || '';
              const placeholder = (el as HTMLInputElement).placeholder || '';
              const ariaLabel = el.getAttribute('aria-label') || '';
              const id = el.id || '';
              const className = (el.className || '').toString().substring(0, 40);
              const value = (el as HTMLInputElement).value || '';

              elements.push({
                index: elements.length,
                tag,
                text: text || placeholder || ariaLabel || `[${tag}]`,
                id: id ? `#${id}` : '',
                selector: id ? `#${id}` : className ? `.${className.split(' ')[0]}` : `${tag}:nth-of-type(${i + 1})`,
                type,
                href: href ? href.substring(0, 80) : '',
                rect: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) },
                value: value ? value.substring(0, 30) : '',
              });
            });
            return elements;
          });
          result = { elements: dom, count: dom.length, url: page.url() };
          break;
        }

        case 'get_url': {
          result = { url: page.url() };
          break;
        }

        case 'get_title': {
          result = { title: await page.title(), url: page.url() };
          break;
        }

        // ═══════════════════════════════
        // 🔍 ELEMENT QUERIES
        // ═══════════════════════════════
        case 'find_elements': {
          if (!input.selector && !input.text) return fail(action, 'selector or text required');
          
          let found: any[] = [];
          if (input.selector) {
            const els = await page.$$(input.selector);
            for (let i = 0; i < Math.min(els.length, 20); i++) {
              const text = await els[i].textContent();
              const box = await els[i].boundingBox();
              found.push({ index: i, text: (text || '').trim().substring(0, 60), box });
            }
          } else if (input.text) {
            const els = await page.getByText(input.text, { exact: false }).all();
            for (let i = 0; i < Math.min(els.length, 20); i++) {
              const text = await els[i].textContent();
              const box = await els[i].boundingBox();
              found.push({ index: i, text: (text || '').trim().substring(0, 60), box });
            }
          }
          result = { found, count: found.length };
          break;
        }

        case 'get_element_text': {
          if (!input.selector) return fail(action, 'selector required');
          const el = await page.$(input.selector);
          result = { text: el ? (await el.textContent())?.trim().substring(0, 2000) : 'not found' };
          break;
        }

        case 'get_attribute': {
          if (!input.selector || !input.value) return fail(action, 'selector and value (attribute name) required');
          const el = await page.$(input.selector);
          result = { attribute: input.value, value: el ? await el.getAttribute(input.value) : 'not found' };
          break;
        }

        // ═══════════════════════════════
        // 🗂️ TABS
        // ═══════════════════════════════
        case 'new_tab': {
          const { page: newPage, tabId } = await session.newTab(input.url);
          page = newPage;
          result = { opened: true, tabId, url: page.url() };
          break;
        }

        case 'switch_tab': {
          if (!input.tabId) return fail(action, 'tabId required');
          const switched = await session.switchTab(input.tabId);
          if (!switched) return fail(action, `Tab ${input.tabId} not found`);
          page = switched;
          result = { switched: input.tabId, url: page.url() };
          break;
        }

        case 'close_tab': {
          if (!input.tabId) return fail(action, 'tabId required');
          const closed = await session.closeTab(input.tabId);
          result = { closed, tabId: input.tabId };
          break;
        }

        // ═══════════════════════════════
        // ⏳ WAITING
        // ═══════════════════════════════
        case 'wait_for_element': {
          if (!input.selector) return fail(action, 'selector required');
          const timeout = input.amount || 10000;
          try {
            await page.waitForSelector(input.selector, { timeout, state: 'visible' });
            result = { found: true, selector: input.selector };
          } catch {
            result = { found: false, selector: input.selector, message: 'Timeout' };
          }
          break;
        }

        case 'wait_for_navigation': {
          const timeout = input.amount || 15000;
          try {
            await page.waitForNavigation({ timeout, waitUntil: 'domcontentloaded' });
            result = { navigated: true, url: page.url() };
          } catch {
            result = { navigated: false, url: page.url(), message: 'Timeout' };
          }
          break;
        }

        case 'wait': {
          const ms = Math.min(input.amount || 1000, 15000);
          await page.waitForTimeout(ms);
          result = { waited: `${ms}ms` };
          break;
        }

        // ═══════════════════════════════
        // 🧩 JAVASCRIPT EXECUTION
        // ═══════════════════════════════
        case 'evaluate': {
          if (!input.script) return fail(action, 'script required');
          const evalResult = await page.evaluate(input.script);
          result = { output: typeof evalResult === 'object' ? JSON.stringify(evalResult).substring(0, 3000) : String(evalResult).substring(0, 3000) };
          break;
        }

        case 'evaluate_handle': {
          if (!input.script) return fail(action, 'script required');
          const handle = await page.evaluateHandle(input.script);
          const json = await handle.jsonValue().catch(() => 'non-serializable');
          await handle.dispose();
          result = { output: typeof json === 'object' ? JSON.stringify(json).substring(0, 3000) : String(json) };
          break;
        }

        // ═══════════════════════════════
        // 📁 FILE UPLOAD
        // ═══════════════════════════════
        case 'upload_file': {
          if (!input.selector || !input.filePath) return fail(action, 'selector and filePath required');
          const fileInput = await page.$(input.selector);
          if (!fileInput) return fail(action, `File input not found: ${input.selector}`);
          await (fileInput as any).setInputFiles(input.filePath);
          result = { uploaded: input.filePath, to: input.selector };
          break;
        }

        default:
          return fail(action, `Unknown action: ${action}`);
      }

      // Auto-screenshot after action
      let screenshotPath: string | undefined;
      if (shouldCapture && !['screenshot', 'get_text', 'get_html', 'read_dom', 'get_url', 'get_title', 'find_elements', 'get_element_text', 'get_attribute', 'list_tabs', 'wait', 'evaluate', 'evaluate_handle', 'disconnect'].includes(action)) {
        await page.waitForTimeout(400);
        screenshotPath = await takeScreenshot(page, action);
      }

      return {
        success: true,
        action,
        result,
        screenshotPath,
        currentUrl: page.url(),
        pageTitle: await page.title().catch(() => ''),
      };

    } catch (error: any) {
      console.error(`[BrowserControl] ❌ ${action}:`, error.message?.substring(0, 300));
      return { success: false, action, result: `Failed: ${error.message?.substring(0, 300)}` };
    }
  }
};
