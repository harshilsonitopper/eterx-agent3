import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronRight, ShieldCheck, Terminal, Search, Code, MessageSquare, ShieldAlert, Cpu, Sparkles, Check, Loader2,
  FilePlus, FileEdit, FileSearch, FolderSearch, BookOpen, GitBranch, LayoutTemplate,
  MonitorPlay, Camera, Activity, Bell, FileText, Image as ImageIcon,
  Mail, Settings, Globe, FileArchive, Database, Link, Calculator, BarChart, Server,
  Youtube, Clipboard, Mic, Rss, Smartphone, ArrowRightLeft, FileJson, Hash, Settings2,
  Clock, Lock, RefreshCcw, Eye, PlayCircle, Split, Monitor
} from 'lucide-react';
// @ts-ignore
import ReactMarkdown from 'react-markdown';
import { markdownComponents, remarkPlugins, rehypePlugins } from './markdown-renderer';

const WorkingWaveform = ({ color }: { color: string }) => (
  <div className="flex items-center justify-center gap-[1.5px] h-[14px] w-3.5 shrink-0 opacity-90 mx-1">
    <motion.div animate={{ height: ["35%", "100%", "35%"] }} transition={{ repeat: Infinity, duration: 0.8, ease: "easeInOut" }} className={`w-[3px] rounded-full ${ color }`} />
    <motion.div animate={{ height: ["100%", "40%", "100%"] }} transition={{ repeat: Infinity, duration: 1.1, ease: "easeInOut", delay: 0.15 }} className={`w-[3px] rounded-full ${ color }`} />
    <motion.div animate={{ height: ["50%", "95%", "50%"] }} transition={{ repeat: Infinity, duration: 0.9, ease: "easeInOut", delay: 0.3 }} className={`w-[3px] rounded-full ${ color }`} />
    <motion.div animate={{ height: ["80%", "30%", "80%"] }} transition={{ repeat: Infinity, duration: 1.2, ease: "easeInOut", delay: 0.05 }} className={`w-[3px] rounded-full ${ color }`} />
  </div>
);

const IconMap: Record<string, any> = {
  Terminal, Search, Code, MessageSquare, Cpu, Sparkles, Check, FilePlus, FileEdit, FileSearch, FolderSearch, BookOpen, GitBranch, LayoutTemplate, MonitorPlay, Camera, Activity, Bell, FileText, Mail, Settings, Globe, FileArchive, Database, Link, Calculator, BarChart, Server, Youtube, Clipboard, Mic, Rss, Smartphone, ArrowRightLeft, FileJson, Hash, Settings2, Clock, Lock, RefreshCcw, Eye, PlayCircle, Split, Monitor
};

const getLogStyle = (text: string, type: string, iconName?: string) => {
  const iconProps = { className: "w-3.5 h-3.5 text-[#8C8A88]", strokeWidth: 2 };

  if (iconName && IconMap[iconName]) {
    const IconComponent = IconMap[iconName];
    return <IconComponent {...iconProps} />;
  }

  const t = text || '';

  if (t === 'Running command' || t === 'Running project command') return <Terminal {...iconProps} />;
  if (t === 'Researching') return <Globe {...iconProps} />;
  if (t === 'Reading source') return <BookOpen {...iconProps} />;
  if (t === 'Scanning directory') return <FolderSearch {...iconProps} />;
  if (t === 'Reading file') return <FileText {...iconProps} />;
  if (t === 'Writing artifact') return <FilePlus {...iconProps} />;
  if (t === 'Editing file') return <FileEdit {...iconProps} />;
  if (t === 'Verifying code') return <Check {...iconProps} />;
  if (t === 'Searching codebase') return <FileSearch {...iconProps} />;
  if (t === 'Loading skill') return <BookOpen {...iconProps} />;
  if (t === 'Git operation') return <GitBranch {...iconProps} />;
  if (t === 'Capturing screen') return <Camera {...iconProps} />;
  if (t === 'Evaluating logic') return <PlayCircle {...iconProps} />;
  if (t === 'Monitoring system') return <Activity {...iconProps} />;
  if (t === 'Notifying') return <Bell {...iconProps} />;
  if (t === 'Decomposing task') return <Split {...iconProps} />;
  if (t === 'Reading PDF') return <FileText {...iconProps} />;
  if (t === 'Generating document') return <FileText {...iconProps} />;
  if (t === 'Generating image') return <ImageIcon {...iconProps} />;
  if (t === 'Managing email') return <Mail {...iconProps} />;
  if (t === 'Managing process') return <Settings {...iconProps} />;
  if (t === 'Network operation') return <Globe {...iconProps} />;
  if (t === 'Compressing files') return <FileArchive {...iconProps} />;
  if (t === 'Database query') return <Database {...iconProps} />;
  if (t === 'API request' || t === 'API call') return <Link {...iconProps} />;
  if (t === 'Calculating') return <Calculator {...iconProps} />;
  if (t === 'Analyzing data') return <BarChart {...iconProps} />;
  if (t === 'Executing chain') return <Settings2 {...iconProps} />;
  if (t === 'HTTP server') return <Server {...iconProps} />;
  if (t === 'Extracting transcript') return <Youtube {...iconProps} />;
  if (t === 'Clipboard') return <Clipboard {...iconProps} />;
  if (t === 'Generating speech') return <Mic {...iconProps} />;
  if (t === 'Reading RSS feed') return <Rss {...iconProps} />;
  if (t === 'WhatsApp' || t === 'Telegram') return <MessageSquare {...iconProps} />;
  if (t === 'Scaffolding project') return <LayoutTemplate {...iconProps} />;
  if (t === 'Self-improving') return <RefreshCcw {...iconProps} />;
  if (t === 'Comparing files') return <ArrowRightLeft {...iconProps} />;
  if (t === 'Converting markdown') return <FileText {...iconProps} />;
  if (t === 'Transforming data') return <FileJson {...iconProps} />;
  if (t === 'Processing text') return <Hash {...iconProps} />;
  if (t === 'System automation') return <Settings2 {...iconProps} />;
  if (t === 'Watching files') return <Eye {...iconProps} />;
  if (t === 'Safety check') return <ShieldAlert {...{ ...iconProps, className: "w-3.5 h-3.5 text-red-500" }} />;
  if (t === 'Crypto operation') return <Lock {...iconProps} />;
  if (t === 'Vault operation') return <Lock {...iconProps} />;
  if (t === 'Context operation') return <Database {...iconProps} />;
  if (t === 'Scheduled task') return <Clock {...iconProps} />;
  // Next-Gen tools
  if (t === 'Spawning sub-agents') return <Sparkles {...{ ...iconProps, className: "w-3.5 h-3.5 text-purple-400" }} />;
  if (t.includes('spawned') || t.includes('completed')) return <Sparkles {...{ ...iconProps, className: "w-3.5 h-3.5 text-green-400" }} />;
  if (t.includes('failed')) return <Sparkles {...{ ...iconProps, className: "w-3.5 h-3.5 text-red-400" }} />;
  if (t.includes('agents completed')) return <Sparkles {...{ ...iconProps, className: "w-3.5 h-3.5 text-green-400" }} />;
  if (t === 'Deep researching') return <Globe {...{ ...iconProps, className: "w-3.5 h-3.5 text-blue-400" }} />;
  if (t === 'Analyzing code') return <Code {...iconProps} />;
  if (t === 'Refactoring code') return <FileEdit {...iconProps} />;
  if (t === 'Generating docs') return <BookOpen {...iconProps} />;
  if (t === 'Managing environment') return <Lock {...iconProps} />;
  if (t === 'Generating chart') return <BarChart {...{ ...iconProps, className: "w-3.5 h-3.5 text-emerald-400" }} />;
  if (t === 'Analyzing files') return <FolderSearch {...iconProps} />;
  if (t === 'Background task') return <Clock {...iconProps} />;
  if (t === 'Verifying output') return <Check {...iconProps} />;
  if (t === 'Creating tool') return <Settings2 {...iconProps} />;
  if (t === 'Analyzing workspace') return <FileSearch {...iconProps} />;
  if (t === 'Running macro') return <Settings2 {...iconProps} />;
  if (t === 'Controlling desktop') return <Monitor {...{ ...iconProps, className: "w-3.5 h-3.5 text-cyan-400" }} />;
  if (t === 'Browsing web') return <Globe {...{ ...iconProps, className: "w-3.5 h-3.5 text-blue-400" }} />;

  // General fallbacks if unknown tool
  switch (type) {
    case 'command': return <Terminal {...iconProps} />;
    case 'exploration': return <Search {...iconProps} />;
    case 'file_edit': return <Code {...iconProps} />;
    case 'communication': return <MessageSquare {...iconProps} />;
    case 'safety_warning': return <ShieldAlert {...{ ...iconProps, className: "w-3.5 h-3.5 text-red-500" }} />;
    default: return <Cpu {...iconProps} />;
  }
};

/**
 * Robust typewriter hook for thought streaming.
 * Uses character-level tracking with refs to avoid stale closure issues.
 * When new text arrives mid-animation, it seamlessly continues from where it was.
 * No flashing, no resetting.
 */
const useTypewriter = (targetText: string, isActive: boolean, speed: 'fast' | 'medium' | 'slow' = 'fast') => {
  // Use refs to avoid stale closures in setInterval
  // Initialize at full length if not active, so re-mounts never "replay"
  const revealedCountRef = useRef(isActive ? 0 : targetText.length);
  const targetTextRef = useRef(targetText);
  const [, forceRender] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const prevLengthRef = useRef(isActive ? 0 : targetText.length);

  // Sync the latest text so the running interval always sees the dynamic length
  targetTextRef.current = targetText;

  // Fluctuating characters per tick for natural feel (avg ~4)
  const getCharsPerTick = () => {
    const base = speed === 'fast' ? 4 : speed === 'medium' ? 2 : 1;
    const variance = Math.max(1, Math.floor(base * 0.6));
    return base + Math.floor(Math.random() * (variance * 2 + 1)) - variance; // e.g. fast: 2-6
  };
  const tickMs = speed === 'fast' ? 12 : speed === 'medium' ? 20 : 35;

  useEffect(() => {
    if (!isActive) {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      revealedCountRef.current = targetText.length;
      prevLengthRef.current = targetText.length;
      forceRender(n => n + 1);
      return;
    }

    const targetLen = targetText.length;
    const prevLen = prevLengthRef.current;

    if (targetLen < prevLen * 0.5 && prevLen > 20) {
      revealedCountRef.current = targetLen;
      prevLengthRef.current = targetLen;
      forceRender(n => n + 1);
      return;
    }

    if (revealedCountRef.current > targetLen) {
      revealedCountRef.current = targetLen;
      prevLengthRef.current = targetLen;
      forceRender(n => n + 1);
      return;
    }

    prevLengthRef.current = targetLen;

    if (revealedCountRef.current >= targetLen) return;

    if (timerRef.current) return; // Keep running the unified interval

    timerRef.current = setInterval(() => {
      revealedCountRef.current = Math.min(
        revealedCountRef.current + getCharsPerTick(),
        targetTextRef.current.length // Real-time updated sync from the ref!
      );
      forceRender(n => n + 1);

      if (revealedCountRef.current >= targetTextRef.current.length) {
        if (timerRef.current) {
          clearInterval(timerRef.current);
          timerRef.current = null;
        }
      }
    }, tickMs);

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [targetText, isActive]);

  useEffect(() => {
    if (isActive && timerRef.current === null && revealedCountRef.current < targetText.length) {
      // New text arrived after timer randomly finished — restart unified animation sync
      timerRef.current = setInterval(() => {
        revealedCountRef.current = Math.min(
          revealedCountRef.current + getCharsPerTick(),
          targetTextRef.current.length
        );
        forceRender(n => n + 1);

        if (revealedCountRef.current >= targetTextRef.current.length) {
          if (timerRef.current) {
            clearInterval(timerRef.current);
            timerRef.current = null;
          }
        }
      }, tickMs);
    }

    return () => {
      // Don't clear on every text change — only on unmount
    };
  }, [targetText.length, isActive]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  const displayedText = targetText.slice(0, revealedCountRef.current);
  return { displayedText };
};

export const ProfessionalThought = ({ text, isLatest, isThinking, variant = 'thought' }: { text: string, isLatest: boolean, isThinking: boolean, variant?: 'thought' | 'answer' }) => {
  // Use typewriter for thinking thoughts (not answers — answers use their own streaming)
  const shouldTypewrite = variant === 'thought' && isLatest && isThinking;
  const { displayedText } = useTypewriter(text, shouldTypewrite, 'fast');

  const rawText = shouldTypewrite ? displayedText : text;

  /**
   * Pre-process markdown to fix common model output issues:
   * 1. Inline headings: "some text.### Heading" → "some text.\n\n### Heading"
   * 2. Inline list items: "text.* Item" → "text.\n\n* Item"  
   * 3. Missing blank lines before headings
   * 4. Fix ".\n#" → ".\n\n#"
   */
  const renderText = useMemo(() => {
    if (!rawText) return rawText;
    let fixed = rawText;
    
    // aggressively scrub hallucinations mimicking system prompts
    fixed = fixed.replace(/!\[.*?\]\(\/absolute.*?\.png\)/gi, '');
    fixed = fixed.replace(/<\/?thought>/gi, '');
    
    // Fix inline headings: any text immediately before # (with or without newline)
    fixed = fixed.replace(/([^\n])(#{1,6}\s)/g, '$1\n\n$2');
    // Fix headings after period/punctuation without blank line
    fixed = fixed.replace(/([.!?:])(\s*\n)(#{1,6}\s)/g, '$1\n\n$3');
    // Fix inline bullet list items: "text.* " or "text.\n* " without blank line
    fixed = fixed.replace(/([.!?:])(\s*\n)?(\*\s)/g, '$1\n\n$3');
    // Fix inline numbered list items: "text.1. " 
    fixed = fixed.replace(/([.!?:])(\s*\n)?(\d+\.\s)/g, '$1\n\n$3');
    // Ensure blank line before headings that have just a single \n
    fixed = fixed.replace(/([^\n])\n(#{1,6}\s)/g, '$1\n\n$2');
    
    return fixed.trim();
  }, [rawText]);

  return (
    <motion.div
      initial={isLatest ? { opacity: 0, y: 5 } : false}
      animate={{ opacity: 1, y: 0 }}
      className={`relative w-full leading-relaxed font-sans font-normal selection:bg-[#E2765A]/30 select-text ${ variant === 'answer'
        ? 'text-[#E8E6E3] text-[15.5px]'
        : 'text-[#D2D0CD] text-[14px]'
        }`}
    >
      <ReactMarkdown remarkPlugins={remarkPlugins} rehypePlugins={rehypePlugins} components={{
        ...markdownComponents,
        p: ({ node, ...props }: any) => variant === 'answer'
          ? <p className="mb-4 last:mb-0 font-normal text-[15.5px]" {...props} />
          : <p className="text-[#A3A19E] mb-2 font-sans font-medium leading-relaxed break-words tracking-wide" {...props} />,
        strong: ({ node, ...props }: any) => variant === 'answer'
          ? <strong className="font-semibold text-[#E8E6E3]" {...props} />
          : <strong className="font-semibold text-[#c4c2c0]" {...props} />,
        b: ({ node, ...props }: any) => variant === 'answer'
          ? <strong className="font-semibold text-[#E8E6E3]" {...props} />
          : <strong className="font-semibold text-[#c4c2c0]" {...props} />,
        h1: ({ node, ...props }: any) => variant === 'answer'
          ? <h3 className="font-semibold mb-3 text-[20px] text-[#E8E6E3] mt-6" {...props} />
          : <h3 className="text-[#8C8A88] font-bold mb-2 mt-4 text-[14px]" {...props} />,
        h2: ({ node, ...props }: any) => variant === 'answer'
          ? <h4 className="font-semibold mb-3 text-[18px] text-[#E8E6E3] mt-5" {...props} />
          : <h4 className="text-[#8C8A88] font-bold mb-2 mt-3 text-[13px]" {...props} />,
        h3: ({ node, ...props }: any) => variant === 'answer'
          ? <h5 className="font-semibold mb-2 text-[16px] text-[#E8E6E3] mt-4" {...props} />
          : <h5 className="text-[#8C8A88] font-bold mb-1 mt-2 text-[12px]" {...props} />,
        ul: ({ node, ...props }: any) => variant === 'answer'
          ? <ul className="list-none mb-4 space-y-2.5 ml-0" {...props} />
          : <ul className="list-disc mb-3 space-y-1 ml-4 text-[#A3A19E]" {...props} />,
        ol: ({ node, ...props }: any) => variant === 'answer'
          ? <ol className="list-decimal pl-6 mb-4 space-y-1.5 marker:text-[#8C8A88]" {...props} />
          : <ol className="list-decimal pl-5 mb-3 space-y-1 text-[#A3A19E] marker:text-[#8C8A88]" {...props} />,
        li: ({ node, ...props }: any) => variant === 'answer'
          ? (
            <li className="flex items-start">
              <span className="mr-3 text-[#555350] mt-[5px] text-[10px]">●</span>
              <span className="flex-1 break-words" {...props} />
            </li>
          )
          : <li className="pl-1 break-words" {...props} />,
        blockquote: ({ node, ...props }: any) => variant === 'answer'
          ? <blockquote className="border-l-[3px] border-[#E2765A]/50 bg-[#2A2927] py-2 px-4 italic text-[#A3A19E] my-4 rounded-r-lg" {...props} />
          : <blockquote className="border-l-2 border-[#555350] pl-3 italic text-[#8C8A88] my-3" {...props} />,
        table: ({ node, ...props }: any) => variant === 'answer'
          ? (
            <div className="my-5 overflow-x-auto rounded-xl border border-white/10 shadow-sm">
              <table className="w-full border-collapse text-[14px]" {...props} />
            </div>
          )
          : (
            <div className="my-3 overflow-x-auto overflow-y-hidden rounded border border-white/5">
              <table className="w-full border-collapse text-[12px] text-[#A3A19E]" {...props} />
            </div>
          ),
        thead: ({ node, ...props }: any) => <thead className="bg-[#1C1B1A]" {...props} />,
        th: ({ node, ...props }: any) => <th className="border border-white/5 px-4 py-2 text-left font-bold text-[#E8E6E3]" {...props} />,
        td: ({ node, ...props }: any) => <td className="border border-white/5 px-4 py-2 text-[#D2D0CD]" {...props} />,
        tr: ({ node, ...props }: any) => <tr className="hover:bg-white/5 transition-colors" {...props} />,
        a: ({ node, ...props }: any) => variant === 'answer'
          ? <a className="text-[#E2765A] hover:underline underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />
          : <a className="text-[#E2765A]/70 hover:text-[#E2765A] underline-offset-2" target="_blank" rel="noopener noreferrer" {...props} />,
      }}>
        {renderText}
      </ReactMarkdown>
    </motion.div>
  );
};

export const ThinkingProcess = ({ logs, isThinking, isLast }: { logs: any[], isThinking: boolean, isLast: boolean }) => {
  const [isOpen, setIsOpen] = useState(isThinking && isLast);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const autoScrollEnabled = React.useRef(true);
  const [activeTab, setActiveTab] = useState<string>('Main');

  const flowLogs = logs.filter(l => ['thought_stream', 'command', 'exploration', 'file_edit', 'safety_warning', 'communication', 'sub_agent_answer'].includes(l.type));

  const getSubAgentStatus = (agentName: string) => {
    if (agentName === 'Main') {
      const mainLogs = flowLogs.filter(l => !l.subAgent);
      if (mainLogs.length === 0) return 'Orchestrating...';
      const last = mainLogs[mainLogs.length - 1];
      if (last.type === 'thought_stream') return 'Thinking';
      return last.text || 'Working...';
    }
    const agentLogs = flowLogs.filter(l => l.subAgent === agentName);
    const lastLog = agentLogs[agentLogs.length - 1];
    if (!lastLog) return 'Initializing...';
    if (lastLog.type === 'sub_agent_answer') return 'Completed task.';
    if (lastLog.type === 'thought_stream') return 'Thinking';
    return lastLog.text || 'Working...';
  };

  // Extract Agents from logs that were sub-agents OR logs that explicitly spawned agents
  const agentsFromSubAgents = flowLogs.map(l => l.subAgent).filter(Boolean);
  const agentsFromSpawns = flowLogs.flatMap(l => l.spawnedAgents || []);
  const agents = Array.from(new Set([...agentsFromSubAgents, ...agentsFromSpawns])) as string[];

  const activeLogs = activeTab === 'Main'
    ? flowLogs.filter(l => !l.subAgent)
    : flowLogs.filter(l => l.subAgent === activeTab);

  const lastLogText = activeLogs[activeLogs.length - 1]?.text;

  // Auto-open when thinking starts, stay open
  React.useEffect(() => {
    if (isThinking && isLast && !isOpen) {
      setIsOpen(true);
    }
  }, [isThinking, isLast]);

  React.useEffect(() => {
    if (isOpen && isThinking && containerRef.current && autoScrollEnabled.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [lastLogText, flowLogs.length, isThinking, isOpen]);

  const handleScroll = () => {
    if (!containerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    // Pause auto-scroll if user scrolls up more than 50px from the bottom
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    autoScrollEnabled.current = isAtBottom;
  };

  const getDurationString = () => {
    if (flowLogs.length === 0) return '';
    const start = flowLogs[0].startTime;
    const end = flowLogs[flowLogs.length - 1].endTime;
    if (!start || !end) return '';
    const seconds = ((end - start) / 1000);
    if (seconds < 2) return '';
    if (seconds > 60) return `${Math.floor(seconds / 60)}m ${(seconds % 60).toFixed(0)}s`;
    return `${seconds.toFixed(1)}s`;
  };

  const getDynamicThoughtHeading = () => {
    const mainLogs = flowLogs.filter(l => !l.subAgent);
    const duration = getDurationString();
    const timeStr = duration && !isThinking ? ` for ${duration}` : '';
    const hasToolUse = mainLogs.some(l => l.type !== 'thought_stream');

    // If the latest log is a tool execution from the MAIN agent, vividly display it
    const lastLog = mainLogs[mainLogs.length - 1];
    if (lastLog && lastLog.type !== 'thought_stream') {
      if (lastLog.text?.includes('Spawning')) return 'Orchestrating agents...';
      if (!isThinking) return `Worked${timeStr}`;
      return lastLog.text + '...';
    }

    if (isThinking) return 'Thinking';
    
    return hasToolUse ? `Worked${timeStr}` : `Thought${timeStr}`;
  };

  const activitySummary = getDynamicThoughtHeading();

  return (
    <div className="w-full flex items-start gap-5 mt-8 mb-6 group/process max-w-full">
      {/* Dynamic left side icon with Gyroscopic Deep-Work Animation */}
      <div className="mt-1.5 w-6 h-6 flex items-center justify-center shrink-0 relative">
        <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
          {/* Loading arc indicator - logo colors, partial ring */}
          <motion.div
            className="absolute inset-0 rounded-full"
            style={{
              background: 'conic-gradient(from 0deg, #EA4335 0deg, #FBBC05 90deg, #34A853 180deg, #4285F4 250deg, transparent 290deg)',
              WebkitMask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #fff calc(100% - 2px))',
              mask: 'radial-gradient(farthest-side, transparent calc(100% - 2px), #fff calc(100% - 2px))',
            }}
            initial={{ opacity: 0 }}
            animate={isThinking ? {
              opacity: 1,
              rotate: [0, 360]
            } : { opacity: 0, rotate: 0 }}
            transition={isThinking ? {
              rotate: { duration: 0.7, repeat: Infinity, ease: "linear" },
              opacity: { duration: 0.3 }
            } : { duration: 0.8, ease: "easeOut" }}
          />

          {/* Unified Brand Core - Rotates when thinking, Settles with a weighted spring when complete */}
          <motion.img
            src="/logo.png"
            alt="Logo"
            className="object-contain z-10"
            initial={false}
            animate={isThinking ? {
              rotate: [0, 360],
              scale: [1, 1.08, 1],
              width: "18px",
              height: "18px",
              opacity: 1
            } : {
              rotate: 0,
              scale: 1,
              width: "22px",
              height: "22px",
              opacity: 1,
              filter: "drop-shadow(0 0 12px rgba(255, 255, 255, 0.15))"
            }}
            transition={isThinking ? {
              rotate: { duration: 2.5, repeat: Infinity, ease: "linear" },
              scale: { duration: 2, repeat: Infinity, ease: "easeInOut" }
            } : {
              type: "spring",
              damping: 20,
              stiffness: 150,
              mass: 0.8
            }}
          />
        </div>
      </div>

      <div className="flex-1 flex flex-col pt-[1px] min-w-0">
        {/* Animated Live Header */}
        <div
          onClick={() => setIsOpen(!isOpen)}
          className={`flex items-center gap-2 cursor-pointer transition-all duration-300 self-start max-w-full group px-3 py-1.5 -ml-3 rounded-2xl border ${ isOpen ? 'opacity-100 bg-[#1A1A1A]/80 backdrop-blur-xl border-white/[0.06] shadow-sm' : 'opacity-90 bg-[#111111]/60 backdrop-blur-md border-white/[0.03] hover:opacity-100 hover:bg-[#1A1A1A]/80 hover:border-white/[0.06] hover:shadow-sm' }`}
        >
          <div className="flex-1 min-h-[24px] flex items-center">
            <AnimatePresence mode="wait">
              <motion.span
                key={activitySummary}
                initial={{ opacity: 0, x: -10, filter: 'blur(8px)' }}
                animate={isThinking
                  ? { opacity: 1, x: 0, filter: 'blur(0px)', backgroundPosition: ["200% 50%", "-200% 50%"] }
                  : { opacity: 1, x: 0, filter: 'blur(0px)', backgroundPosition: "0% 50%" }
                }
                exit={{ opacity: 0, x: 10, filter: 'blur(8px)' }}
                transition={{
                  opacity: { duration: 0.3 },
                  x: { duration: 0.4, type: "spring", stiffness: 100 },
                  filter: { duration: 0.3 },
                  backgroundPosition: { duration: 3, repeat: Infinity, ease: "linear" }
                }}
                style={isThinking ? { backgroundSize: '300% auto' } : {}}
                className={`text-[15px] inline-block tracking-tight font-sans pr-2 ${ isThinking
                  ? 'bg-gradient-to-r from-[#8C8A88] via-[#E8E6E3] to-[#8C8A88] bg-clip-text text-transparent font-medium'
                  : 'text-[#8C8A88] group-hover:text-[#E8E6E3]'
                  }`}
              >
                {activitySummary}
              </motion.span>
            </AnimatePresence>
          </div>
          <ChevronRight className={`w-3.5 h-3.5 shrink-0 transition-transform duration-500 text-[#555350] group-hover:text-[#8C8A88] ${ isOpen ? 'rotate-90' : '' }`} />
        </div>

        {/* The expanded tool details area - DEEP WORK STRUCTURE */}
        <AnimatePresence>
          {isOpen && (flowLogs.length > 0 || isThinking) && (
            <motion.div
              initial={{ height: 0, opacity: 0, y: -10 }}
              animate={{ height: 'auto', opacity: 1, y: 0 }}
              exit={{ height: 0, opacity: 0, y: -10 }}
              transition={{ type: "spring", damping: 20, stiffness: 120 }}
              className="mt-1 overflow-visible mb-2 min-w-0 -ml-3 rounded-t-[32px] rounded-b-xl bg-[#080808]/80 border border-white/[0.03] backdrop-blur-2xl shadow-[0_20px_50px_-12px_rgba(0,0,0,0.8)] relative"
            >
              <div className="flex flex-col relative w-full h-full">
                {agents.length > 0 && (
                  <div className="flex items-center gap-1 pb-3 pt-4 px-6 border-b border-white/[0.05] overflow-visible z-20 w-full shrink-0 rounded-t-[32px]">
                    <div className="flex bg-[#111111]/80 border border-white/[0.05] p-1 rounded-[14px]">
                      <div
                        onClick={() => setActiveTab('Main')}
                        className={`group relative px-4 py-1.5 text-[13px] font-medium rounded-xl cursor-pointer transition-colors duration-300 z-10 ${ activeTab === 'Main' ? 'text-white' : 'text-[#8C8A88] hover:text-[#E8E6E3]' }`}
                      >
                        {activeTab === 'Main' && (
                          <motion.div
                            layoutId="activeTabPill"
                            className="absolute inset-0 bg-white/10 rounded-xl shadow-sm"
                            transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                          />
                        )}
                        <span className="relative z-20">Main</span>

                        {/* Real-time Hover Tooltip (Organic Thought Bubble) */}
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 flex flex-col items-center justify-center translate-y-2 group-hover:translate-y-0">
                          <motion.div
                            animate={{
                              borderRadius: [
                                "24px 32px 18px 30px / 30px 24px 34px 22px",
                                "32px 20px 34px 18px / 22px 36px 20px 30px",
                                "24px 32px 18px 30px / 30px 24px 34px 22px"
                              ]
                            }}
                            transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                            className="bg-black/90 backdrop-blur-xl text-[#E8E6E3] font-medium text-[11.5px] px-5 py-2.5 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.9)] whitespace-nowrap max-w-[250px] flex items-center gap-1.5 relative"
                          >
                            <WorkingWaveform color="bg-orange-400 shadow-[0_0_8px_rgba(251,146,60,0.6)]" />
                            <motion.span
                              animate={{ backgroundPosition: ["200% 50%", "-200% 50%"] }}
                              transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                              style={{ backgroundSize: '300% auto' }}
                              className="truncate tracking-wide bg-gradient-to-r from-[#A3A19E] via-white to-[#A3A19E] bg-clip-text text-transparent"
                            >
                              {getSubAgentStatus('Main')}
                            </motion.span>
                          </motion.div>

                          {/* Floating Thought Dots Tail */}
                          <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-black/90 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]"></div>
                          <div className="absolute -bottom-4 left-[46%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-black/90 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)] opacity-80"></div>
                          <div className="absolute -bottom-[22px] left-[42%] -translate-x-1/2 w-[4px] h-[4px] rounded-full bg-black/90 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)] opacity-50"></div>
                        </div>
                      </div>

                      {agents.map(agent => {
                        const shortName = agent.replace(/^Agent-/, '');
                        return (
                          <div
                            key={agent}
                            onClick={() => setActiveTab(agent)}
                            className={`group relative px-4 py-1.5 text-[13px] font-medium rounded-xl cursor-pointer transition-colors duration-300 z-10 whitespace-nowrap ${ activeTab === agent ? 'text-white' : 'text-[#8C8A88] hover:text-[#E8E6E3]' }`}
                          >
                            {activeTab === agent && (
                              <motion.div
                                layoutId="activeTabPill"
                                className="absolute inset-0 bg-[#4285F4]/20 rounded-xl border border-[#4285F4]/30 shadow-[0_0_15px_rgba(66,133,244,0.15)]"
                                transition={{ type: "spring", duration: 0.5, bounce: 0.2 }}
                              />
                            )}
                            <span className="relative z-20">{shortName}</span>

                            {/* Real-time Hover Tooltip (Organic Thought Bubble) */}
                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-4 opacity-0 group-hover:opacity-100 transition-all duration-300 pointer-events-none z-50 flex flex-col items-center justify-center translate-y-2 group-hover:translate-y-0">
                              <motion.div
                                animate={{
                                  borderRadius: [
                                    "24px 32px 18px 30px / 30px 24px 34px 22px",
                                    "32px 20px 34px 18px / 22px 36px 20px 30px",
                                    "24px 32px 18px 30px / 30px 24px 34px 22px"
                                  ]
                                }}
                                transition={{ repeat: Infinity, duration: 4, ease: "easeInOut" }}
                                className="bg-black/90 backdrop-blur-xl text-[#E8E6E3] font-medium text-[11.5px] px-5 py-2.5 border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.9)] whitespace-nowrap max-w-[250px] flex items-center gap-1.5 relative"
                              >
                                <WorkingWaveform color="bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]" />
                                <motion.span
                                  animate={{ backgroundPosition: ["200% 50%", "-200% 50%"] }}
                                  transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                                  style={{ backgroundSize: '300% auto' }}
                                  className="truncate tracking-wide bg-gradient-to-r from-[#A3A19E] via-white to-[#A3A19E] bg-clip-text text-transparent"
                                >
                                  {getSubAgentStatus(agent)}
                                </motion.span>
                              </motion.div>

                              {/* Floating Thought Dots Tail */}
                              <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-2.5 h-2.5 rounded-full bg-black/90 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)]"></div>
                              <div className="absolute -bottom-4 left-[46%] -translate-x-1/2 w-1.5 h-1.5 rounded-full bg-black/90 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)] opacity-80"></div>
                              <div className="absolute -bottom-[22px] left-[42%] -translate-x-1/2 w-[4px] h-[4px] rounded-full bg-black/90 border border-white/10 shadow-[0_2px_10px_rgba(0,0,0,0.5)] opacity-50"></div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div
                  ref={containerRef}
                  onScroll={handleScroll}
                  className={`${ agents.length > 0 ? 'h-[400px]' : 'max-h-[400px]' } overflow-y-auto custom-scrollbar scroll-smooth p-6 pt-4 flex flex-col gap-6 relative z-10 w-full transition-all duration-300 rounded-b-xl`}
                >

                  {activeLogs.map((log, idx) => {
                    const isThought = log.type === 'thought_stream';

                    if (isThought) {
                      return (
                        <div key={idx} className="w-full pl-1 break-words">
                          <ProfessionalThought text={log.text} isLatest={isLast && idx === activeLogs.length - 1} isThinking={isThinking} />
                        </div>
                      );
                    }

                    if (log.type === 'sub_agent_answer') {
                      return (
                        <motion.div
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          key={idx}
                          className="w-full mt-4 p-5 rounded-2xl bg-[#0F0F0F] border border-white/10 shadow-2xl relative overflow-hidden"
                        >
                          <div className="absolute top-0 left-0 w-full h-[1px] bg-gradient-to-r from-transparent via-[#4285F4]/50 to-transparent"></div>
                          <div className="flex items-center gap-2 mb-3 pb-3 border-b border-white/[0.05]">
                            <span className="text-[#E8E6E3] text-sm font-semibold flex items-center gap-2 tracking-wide">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.5)]"></span>
                              {log.subAgent?.replace(/^Agent-/, '')} Output
                            </span>
                          </div>
                          <div className="text-[14.5px]">
                            <ProfessionalThought text={log.text} isLatest={false} isThinking={false} variant="answer" />
                          </div>
                        </motion.div>
                      );
                    }

                    const nextLog = activeLogs[idx + 1];
                    const endTime = nextLog ? nextLog.startTime : (isThinking ? Date.now() : log.endTime);
                    const seconds = endTime && log.startTime ? ((endTime - log.startTime) / 1000) : 0;

                    return (
                      <motion.div
                        key={idx}
                        initial={isLast ? { opacity: 0, x: -12, scale: 0.97 } : false}
                        animate={{ opacity: 1, x: 0, scale: 1 }}
                        transition={isLast ? {
                          type: "spring",
                          stiffness: 400,
                          damping: 25,
                          mass: 0.5,
                          delay: 0.03
                        } : { duration: 0 }}
                        className="flex items-center gap-3.5 py-2.5 bg-[#111111] hover:bg-[#1A1A1A] border border-white/[0.08] rounded-xl px-4 w-max transition-colors max-w-full shadow-[0_2px_8px_rgba(0,0,0,0.2)]"
                      >
                        {getLogStyle(log.text, log.type, log.icon)}
                        <div className="flex items-baseline gap-[14px] overflow-hidden truncate">
                          <span className="text-[14px] font-semibold text-[#F5F5F3] shrink-0 tracking-wide">{log.text}</span>
                          {log.secondary && (
                            <motion.span
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              transition={{ delay: 0.15, duration: 0.2 }}
                              className="text-[13px] text-[#8C8A88] font-mono truncate tracking-tight"
                            >
                              {log.secondary}
                            </motion.span>
                          )}
                          {seconds > 1 && (
                            <span className="text-[11.5px] text-[#8C8A88]/60 font-mono italic ml-2 shrink-0">
                              {seconds.toFixed(1)}s
                            </span>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}

                  {isThinking && flowLogs.length === 0 && (
                    <div className="text-[14px] text-[#A3A19E] italic mt-1 font-serif pl-1 animate-pulse">Analyzing...</div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
