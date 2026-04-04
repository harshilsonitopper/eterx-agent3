import { Telegraf } from 'telegraf';
import * as dotenv from 'dotenv';
import { AgentOrchestrator } from './src/lib/agent/orchestrator';
import * as fs from 'fs';
import * as path from 'path';

// Load environment variables
dotenv.config();

// Use provided token from environment
const botToken = process.env.TELEGRAM_BOT_TOKEN;


if (!botToken) {
  console.error('❌ Error: TELEGRAM_BOT_TOKEN is missing.');
  process.exit(1);
}

const bot = new Telegraf(botToken);
const orchestrator = new AgentOrchestrator();

console.log('🚀 EterX Telegram Bot is starting...');

const MAX_MESSAGE_LENGTH = 4000;

// Helper to chunk long messages
async function sendChunkedMessage(ctx: any, text: string) {
  for (let i = 0; i < text.length; i += MAX_MESSAGE_LENGTH) {
    await ctx.reply(text.slice(i, i + MAX_MESSAGE_LENGTH), { parse_mode: 'Markdown' });
  }
}

// Standard Start Command
bot.start((ctx) => {
  ctx.reply('👋 Hello! I am **EterX**, your autonomous Deep Work AI Agent.\n\nSend me complex tasks, research requests, or ask me to generate files (PDF, Word, Code) and I will handle it all for you.', { parse_mode: 'Markdown' });
});

// Main Message Handler
bot.on('text', async (ctx) => {
  const userRequest = ctx.message.text;
  const userId = ctx.from.id.toString();
  const chatId = ctx.chat.id.toString();
  const projectId = 'tg-' + chatId;

  console.log(`[Telegram] Request from ${ctx.from.username || userId}: "${userRequest}"`);

  // Show status in Telegram
  let statusMessage = await ctx.reply('🧠 **Deep Work Initiated...**\n_Analyzing request..._', {
    reply_parameters: { message_id: ctx.message.message_id },
    parse_mode: 'Markdown'
  });

  try {
    const response = await orchestrator.executePipeline(
      userId,
      projectId,
      userRequest,
      [], 
      async (trace) => {
        // Real-time status updates mapping agent trace events to nice UI
        if (trace.type !== 'thought') {
            const statusText = `🧠 **Deep Work Initiated...**\n_🛠️ ${trace.text}: ${trace.secondary || ''}_`;
            try {
              await ctx.telegram.editMessageText(
                ctx.chat.id,
                statusMessage.message_id,
                undefined,
                statusText,
                { parse_mode: 'Markdown' }
              );
            } catch (e) { /* Ignore rate limits on rapid updates */ }
        }
      }
    );

    // 1. Send text response
    if (response.success) {
      await sendChunkedMessage(ctx, `✅ **Task Completed**\n\n${response.finalAnswer}`);
    } else {
      await sendChunkedMessage(ctx, `⚠️ **Task Failed or Rejected**\n\n${response.finalAnswer}`);
    }

    // 2. Send generated files (Artifacts)
    if (response.artifactsGenerated && response.artifactsGenerated.length > 0) {
      for (const filepath of response.artifactsGenerated) {
        if (fs.existsSync(filepath)) {
          const stats = fs.statSync(filepath);
          if (stats.isFile()) {
            await ctx.replyWithDocument({ source: filepath, filename: path.basename(filepath) });
          }
        }
      }
    }

    // 3. Cleanup status message
    await ctx.telegram.deleteMessage(ctx.chat.id, statusMessage.message_id).catch(() => {});

  } catch (error: any) {
    console.error('[Telegram Error]', error);
    await ctx.reply(`❌ Oops! I encountered a critical system error: ${error.message}`);
  }
});

// Launch Bot
bot.launch().then(() => {
  console.log('✅ EterX Agent is live on Telegram! Send a message to your bot.');
}).catch((err) => {
  console.error('❌ FATAL ERROR on Telegram Bot Launch:', err);
});


// Enable graceful stop
process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
