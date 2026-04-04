import { z } from 'zod';
import { ToolDefinition } from '../../schemas';
import fs from 'fs-extra';
import path from 'path';

// Lazy-load telegram (GramJS) — webpack-invisible dynamic require
let TelegramClient: any = null;
let StringSession: any = null;
let telegramAvailable = false;

try {
  // eval('require') hides this from webpack's static analysis
  const dynamicRequire = eval('require');
  const telegram = dynamicRequire('telegram');
  const sessions = dynamicRequire('telegram/sessions');
  TelegramClient = telegram.TelegramClient;
  StringSession = sessions.StringSession;
  telegramAvailable = true;
} catch {
  console.warn('[Telegram] GramJS (telegram) package not installed. Telegram tool will be unavailable.');
}

/**
 * Native Telegram Controller (GramJS MTProto)
 * Automates the user's personal Telegram account directly (acting as a human user, not a bot).
 */

const SESSION_FILE = path.resolve(process.cwd(), '.workspaces', '.telegram_session');
let stringSession: any = telegramAvailable ? new StringSession('') : null;
let tgClient: any = null;
let tgReady = false;

// We need a Telegram API ID and Hash. (Providing placeholder default that user can override)
const apiId = process.env.TELEGRAM_API_ID ? parseInt(process.env.TELEGRAM_API_ID) : 2040; // Default test ID
const apiHash = process.env.TELEGRAM_API_HASH || 'b18441a1ff607e10a989891a5462e627';

// GramJS Authentication Promisers
let resolvePhone: ((phone: string) => void) | null = null;
let resolveCode: ((code: string) => void) | null = null;
let resolvePassword: ((pw: string) => void) | null = null;

let authState = 'NOT_STARTED';

export const telegramUserControllerTool: ToolDefinition = {
  name: 'telegram_user_controller',
  description: `Native Telegram MTProto Controller — acts as YOUR personal Telegram account.
  
  Actions:
  - init: Starts the Telegram client. Returns authState (e.g. WAITING_FOR_PHONE).
  - provide_phone: Supply your phone number (e.g. +1234567890) to get an OTP code via Telegram.
  - provide_code: Supply the OTP code you received on Telegram to log in.
  - provide_password: If you have 2FA enabled, supply the password.
  - status: Check connection status.
  - dialogs: List recent chats to get their IDs or usernames.
  - send: Send a message to a username or chat ID.
  - read: Read messages from a chat.`,
  category: 'communication',
  inputSchema: z.object({
    action: z.enum(['init', 'status', 'provide_phone', 'provide_code', 'provide_password', 'dialogs', 'send', 'read']),
    data: z.string().optional().describe('Phone number, OTP code, password, or the chat ID/username to send to'),
    message: z.string().optional().describe('Text message to send'),
    limit: z.number().optional().default(10)
  }),
  outputSchema: z.object({
    success: z.boolean(),
    status: z.string(),
    state: z.string().optional(),
    results: z.any().optional()
  }),
  execute: async (input: any) => {
    try {
      // Load saved session if exists
      if (!tgClient && await fs.pathExists(SESSION_FILE)) {
        const saved = await fs.readFile(SESSION_FILE, 'utf-8');
        stringSession = new StringSession(saved);
      }

      if (!telegramAvailable) {
        return { success: false, status: 'Telegram (GramJS) package is not installed. Run: npm install telegram' };
      }

      if (!tgClient && (input.action === 'init' || input.action === 'status')) {
        tgClient = new TelegramClient(stringSession, apiId, apiHash, {
          connectionRetries: 5,
        });
      }

      if (input.action === 'init') {
        if (tgReady) return { success: true, status: 'Telegram is already connected.' };
        
        console.log('[Telegram] Attempting connection...');
        authState = 'CONNECTING';
        
        // Start login flow asynchronously
        // Does not await here because it blocks waiting for phone/code
        tgClient!.start({
          phoneNumber: async () => {
            authState = 'WAITING_FOR_PHONE';
            return new Promise((resolve) => { resolvePhone = resolve; });
          },
          password: async () => {
            authState = 'WAITING_FOR_PASSWORD';
            return new Promise((resolve) => { resolvePassword = resolve; });
          },
          phoneCode: async () => {
            authState = 'WAITING_FOR_CODE';
            return new Promise((resolve) => { resolveCode = resolve; });
          },
          onError: (err: any) => console.log('[Telegram Auth Error]', err),
        }).then(async () => {
          console.log('[Telegram] Successfully logged in!');
          tgReady = true;
          authState = 'CONNECTED';
          await fs.writeFile(SESSION_FILE, tgClient!.session.save() as unknown as string, 'utf-8');
        }).catch(() => {
          authState = 'FAILED';
        });

        // Wait a few seconds to let it connect if auth is already saved
        await new Promise(r => setTimeout(r, 3000));
        
        return { success: true, status: 'Initialization started', state: authState };
      }

      if (input.action === 'status') {
        return { success: true, status: `Current Telegram Auth State: ${authState}`, state: authState };
      }

      if (input.action === 'provide_phone') {
        if (authState !== 'WAITING_FOR_PHONE' || !resolvePhone) return { success: false, status: `Wrong state: ${authState}` };
        if (!input.data) return { success: false, status: 'Missing phone in data field' };
        resolvePhone(input.data);
        await new Promise(r => setTimeout(r, 2000)); // allow state to update
        return { success: true, status: 'Phone submitted', state: authState };
      }

      if (input.action === 'provide_code') {
        if (authState !== 'WAITING_FOR_CODE' || !resolveCode) return { success: false, status: `Wrong state: ${authState}` };
        if (!input.data) return { success: false, status: 'Missing code in data field' };
        resolveCode(input.data);
        await new Promise(r => setTimeout(r, 3000));
        return { success: true, status: 'Code submitted', state: authState };
      }

      if (input.action === 'provide_password') {
        if (authState !== 'WAITING_FOR_PASSWORD' || !resolvePassword) return { success: false, status: `Wrong state: ${authState}` };
        if (!input.data) return { success: false, status: 'Missing password in data field' };
        resolvePassword(input.data);
        await new Promise(r => setTimeout(r, 3000));
        return { success: true, status: 'Password submitted', state: authState };
      }

      // Actions below require connection
      if (!tgReady || !tgClient) {
        return { success: false, status: 'Telegram is not authenticated. Current state: ' + authState };
      }

      if (input.action === 'dialogs') {
        const dialogs = await tgClient.getDialogs({ limit: input.limit || 15 });
        const res = dialogs.map((d: any) => ({
          id: d.id?.toString(),
          title: d.title,
          isGroup: d.isGroup,
          unread: d.unreadCount
        }));
        return { success: true, status: 'Dialogs retrieved', results: res };
      }

      if (input.action === 'send') {
        if (!input.data || !input.message) return { success: false, status: 'Missing target(data) or message' };
        await tgClient.sendMessage(input.data, { message: input.message });
        return { success: true, status: `Message sent to ${input.data}` };
      }

      if (input.action === 'read') {
        if (!input.data) return { success: false, status: 'Missing target chat in data parameter' };
        const history = await tgClient.getMessages(input.data, { limit: input.limit || 10 });
        const res = history.map((m: any) => ({
          id: m.id,
          text: m.message,
          sender: m.senderId?.toString(),
          date: new Date(m.date * 1000).toISOString()
        }));
        return { success: true, status: `Read ${res.length} items from ${input.data}`, results: res };
      }

      return { success: false, status: 'Unknown action' };
    } catch (err: any) {
      return { success: false, status: `Telegram Error: ${err.message}` };
    }
  }
};
