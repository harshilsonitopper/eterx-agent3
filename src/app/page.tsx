"use client";

import React, { useState, useEffect, useRef } from 'react';
import { Sidebar } from '../components/layout/sidebar';
import { CommandPalette } from '../components/layout/command-palette';
import { ChatInput } from '../components/layout/chat-input';
import { ChatFeed } from '../components/chat/chat-feed';
import { ChevronDown, Code2, GraduationCap, MessageSquare, PenTool, PanelLeft, SquarePen, Search, X } from 'lucide-react';
import { Tooltip } from '../components/ui/tooltip';
import { motion, AnimatePresence } from 'framer-motion';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  traceLogs: any[];
}

const getCatchyGreeting = () => {
  const hour = new Date().getHours();
  // Professional yet engaging variations
  if (hour >= 5 && hour < 12) {
    const morningGreetings = [
      "Good morning",
      "Ready to innovate",
      "System initialized",
      "Morning focus mode",
      "Let's build something great",
      "Fresh start",
      "Ready for deep work",
      "Time to unlock potential"
    ];
    return morningGreetings[Math.floor(Math.random() * morningGreetings.length)];
  }
  if (hour >= 12 && hour < 17) {
    const afternoonGreetings = [
      "Good afternoon",
      "Midday momentum",
      "Afternoon deep work",
      "Keep shipping",
      "Optimal performance",
      "Peak productivity hours",
      "Let's keep the flow",
      "Afternoon sync"
    ];
    return afternoonGreetings[Math.floor(Math.random() * afternoonGreetings.length)];
  }
  if (hour >= 17 && hour < 22) {
    const eveningGreetings = [
      "Good evening",
      "Evening review",
      "Wrapping up",
      "Sunset coding",
      "Steady progress",
      "Evening focus",
      "Reflect and refine",
      "Closing out strong"
    ];
    return eveningGreetings[Math.floor(Math.random() * eveningGreetings.length)];
  }
  const nightGreetings = [
    "Late night focus",
    "Midnight oil burning",
    "Quiet hours initialized",
    "Deep logic mode",
    "Nightshift activated",
    "Zero distractions",
    "The code never sleeps",
    "Late night architect"
  ];
  return nightGreetings[Math.floor(Math.random() * nightGreetings.length)];
};

export default function DeepWorkUI() {
  const [inputValue, setInputValue] = useState("");
  const [isThinking, setIsThinking] = useState(false);
  const [traceLogs, setTraceLogs] = useState<any[]>([]);
  const [greeting, setGreeting] = useState("Evening");

  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);

  const [attachments, setAttachments] = useState<{ file: File, preview: string }[]>([]);
  const [isRecording, setIsRecording] = useState(false);
  const [audioVolume, setAudioVolume] = useState<number>(0);
  const [isProcessingVoice, setIsProcessingVoice] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  const [headerMenuOpen, setHeaderMenuOpen] = useState(false);
  const [headerSearchOpen, setHeaderSearchOpen] = useState(false);
  const [headerSearchQuery, setHeaderSearchQuery] = useState("");
  const [activeView, setActiveView] = useState<'chat' | 'code'>('chat');

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  
  // Custom Speech Media Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<BlobPart[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const silenceIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const transcriptBufferRef = useRef('');
  const lastSpeechTimeRef = useRef(0);
  const isManualStopRef = useRef(false);
  const hasSpokenRef = useRef(false);
  const isCancelledRef = useRef(false);

  const cancelVoice = () => {
    isCancelledRef.current = true;
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
    setIsProcessingVoice(false);
    setAudioVolume(0);
  };

  const acceptVoice = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
  };

  useEffect(() => {
    setGreeting(getCatchyGreeting());
  }, []);

  useEffect(() => {
    if (!headerMenuOpen) {
      setHeaderSearchOpen(false);
      setHeaderSearchQuery("");
    }
  }, [headerMenuOpen]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('eterx_chats');
      if (saved) {
        const parsed = JSON.parse(saved);
        setChats(parsed.sort((a: any, b: any) => b.updatedAt - a.updatedAt));
      }
    } catch (e) { }
  }, []);

  useEffect(() => {
    if (traceLogs.length > 0) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traceLogs.length, isThinking]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        setCmdPaletteOpen(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeChatId) {
      const activeChat = chats.find(c => c.id === activeChatId);
      if (activeChat && activeChat.title && activeChat.title !== "New chat") {
        document.title = activeChat.title;
        return;
      }
    }
    document.title = "EterX";
  }, [activeChatId, chats]);

  const updateActiveChatLogs = (updater: any[] | ((prev: any[]) => any[])): any[] => {
    let finalLogs: any[] = [];
    setTraceLogs(prev => {
      finalLogs = typeof updater === 'function' ? updater(prev) : updater;
      if (activeChatId) {
        setChats(currentChats => {
          const updated = currentChats.map(c =>
            c.id === activeChatId ? { ...c, traceLogs: finalLogs, updatedAt: Date.now() } : c
          );
          localStorage.setItem('eterx_chats', JSON.stringify(updated));
          return updated.sort((a, b) => b.updatedAt - a.updatedAt);
        });
      }
      return finalLogs;
    });
    return finalLogs;
  };

  const loadChat = (id: string) => {
    const chat = chats.find(c => c.id === id);
    if (chat) {
      setActiveChatId(id);
      setTraceLogs(chat.traceLogs);
      if (window.innerWidth < 768) setSidebarOpen(false);
      setTimeout(() => {
        const container = document.getElementById('chat-container');
        if (container) container.scrollTop = container.scrollHeight;
      }, 50);
    }
  };

  const createNewChat = () => {
    setActiveChatId(null);
    setTraceLogs([]);
    setInputValue('');
  };

  const deleteChat = (id: string) => {
    const updatedChats = chats.filter(c => c.id !== id);
    setChats(updatedChats);
    localStorage.setItem('eterx_chats', JSON.stringify(updatedChats));
    if (activeChatId === id) createNewChat();
  };

  const generateTitle = async (chatId: string, history: any[], currentTitle?: string) => {
    try {
      // Use passed title or fall back to finding in current state (for background updates)
      const existingTitle = currentTitle || chats.find(c => c.id === chatId)?.title || "New chat";

      const res = await fetch('/api/chat/title', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history,
          currentTitle: existingTitle
        })
      });
      if (res.ok) {
        const data = await res.json();
        if (data.title && data.title !== existingTitle) {
          setChats(prev => {
            const updated = prev.map(c =>
              c.id === chatId ? { ...c, title: data.title, updatedAt: Date.now() } : c
            );
            localStorage.setItem('eterx_chats', JSON.stringify(updated));
            return updated;
          });
        }
      }
    } catch (e) {
      console.warn('[Naming] Background naming failed:', e);
    }
  };

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    setShowScrollBottom(scrollHeight - scrollTop - clientHeight > 100);
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsThinking(false);
    updateActiveChatLogs(prev => [...prev, { type: 'thought', text: "\n\n*Generation stopped by user.*" }]);
  };

  const toggleSpeech = () => {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return alert("Microphone access is not supported in this environment.");
    }

    if (isRecording) {
      isManualStopRef.current = true;
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.stop();
      }
      return;
    }

    transcriptBufferRef.current = inputValue;
    if (transcriptBufferRef.current && !transcriptBufferRef.current.endsWith(' ')) {
      transcriptBufferRef.current += ' ';
    }
    
    lastSpeechTimeRef.current = Date.now();
    isManualStopRef.current = false;
    hasSpokenRef.current = false;
    isCancelledRef.current = false;
    audioChunksRef.current = [];

    const startRecording = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
        mediaRecorderRef.current = mediaRecorder;
        
        // Setup Silence Detection via AudioContext
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        audioContextRef.current = audioContext;
        const source = audioContext.createMediaStreamSource(stream);
        const analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        source.connect(analyser);
        
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            audioChunksRef.current.push(e.data);
          }
        };

        const cleanupAndTranscribe = async () => {
           setIsRecording(false);
           setAudioVolume(0);
           if (silenceIntervalRef.current) clearInterval(silenceIntervalRef.current);
           if (audioContextRef.current) {
             audioContextRef.current.close().catch(()=>{});
             audioContextRef.current = null;
           }
           stream.getTracks().forEach(track => track.stop());
           
           if (isCancelledRef.current) {
             setInputValue(transcriptBufferRef.current);
             return;
           }

           if (audioChunksRef.current.length === 0) return;
           
           const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
           if (audioBlob.size < 1000) return; // Too short to matter

           setIsProcessingVoice(true);

           const formData = new FormData();
           formData.append('file', audioBlob, 'audio.webm');
           formData.append('model', 'whisper-large-v3-turbo');
           formData.append('response_format', 'json');
           formData.append('language', 'en');

           try {
             const res = await fetch('/api/whisper', {
               method: 'POST',
               body: formData
             });
             
             if (!res.ok) throw new Error("Whisper API Error");
             const data = await res.json();
             
             if (data.text) {
               setInputValue(transcriptBufferRef.current + data.text);
             } else {
               setInputValue(transcriptBufferRef.current);
             }
            } catch (e) {
              console.error(e);
              setInputValue(transcriptBufferRef.current);
              alert("Whisper Transcription Error: Could not connect to Groq.");
           } finally {
              setIsProcessingVoice(false);
           }
        };

        mediaRecorder.onstop = () => {
          cleanupAndTranscribe();
        };

        silenceIntervalRef.current = setInterval(() => {
          if (isManualStopRef.current) {
             if (mediaRecorder.state === 'recording') mediaRecorder.stop();
             return;
          }

          analyser.getByteFrequencyData(dataArray);
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
          const averageVolume = sum / dataArray.length;
          setAudioVolume(averageVolume);
          
          if (averageVolume > 15) {
            hasSpokenRef.current = true;
            lastSpeechTimeRef.current = Date.now();
          }

          const timeSinceLast = Date.now() - lastSpeechTimeRef.current;
          const limit = hasSpokenRef.current ? 4000 : 15000;
          
          if (timeSinceLast >= limit) {
            if (mediaRecorder.state === 'recording') mediaRecorder.stop();
          }
        }, 100);

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Microphone Error:", err);
        alert("Microphone Error: Please grant microphone permissions.");
      }
    };
    
    startRecording();
  };

  const handleSend = async () => {
    if (isRecording && mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    if (!inputValue.trim() && attachments.length === 0) return;
    if (isThinking) return;

    const prompt = inputValue || "Processing attached files...";
    setInputValue("");
    setIsThinking(true);
    setAttachments([]);

    let chatIdToUse = activeChatId;
    if (!chatIdToUse) {
      chatIdToUse = crypto.randomUUID();
      setActiveChatId(chatIdToUse);

      const newChat: ChatSession = {
        id: chatIdToUse,
        title: "New chat",
        updatedAt: Date.now(),
        traceLogs: [{ type: 'user_action', text: prompt }]
      };

      setChats(prev => {
        const updated = [newChat, ...prev];
        localStorage.setItem('eterx_chats', JSON.stringify(updated));
        return updated;
      });
      setTraceLogs([{ type: 'user_action', text: prompt }]);

      // Initial parallel naming
      generateTitle(chatIdToUse, [{ role: 'user', parts: [{ text: prompt }] }], "New chat");
    } else {
      const updatedLogs = updateActiveChatLogs(prev => [...prev, { type: 'user_action', text: prompt }]);

      // Adaptive renaming logic (every 5 messages)
      const userMessageCount = updatedLogs.filter(l => l.type === 'user_action').length;
      if (userMessageCount > 1 && userMessageCount % 5 === 0) {
        const chatHistory = updatedLogs
          .filter(log => log.type === 'user_action' || log.type === 'thought' || log.type === 'answer')
          .map(log => ({
            role: log.type === 'user_action' ? 'user' : 'model',
            parts: [{ text: log.text }]
          }));
        generateTitle(chatIdToUse, chatHistory);
      }
    }

    if (window.innerWidth < 768) setSidebarOpen(false);

    const chatHistory = traceLogs
      .filter(log => log.type === 'user_action' || log.type === 'thought')
      .map(log => ({
        role: log.type === 'user_action' ? 'user' : 'model',
        parts: [{ text: log.text }]
      }));

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: chatHistory, userId: 'default', projectId: chatIdToUse }),
        signal: controller.signal
      });

      if (!response.body) throw new Error("No readable stream");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        const chunks = decoder.decode(value).split('\n\n').filter(Boolean);
        for (const chunk of chunks) {
          if (chunk.trim() && chunk.startsWith('data:')) {
            try {
              const parsed = JSON.parse(chunk.replace(/^data:\s*/, ''));

              if (parsed.type === 'trace') {
                if (parsed.data.type === 'thought_stream') {
                  updateActiveChatLogs(prev => {
                    const newLogs = [...prev];
                    const lastLog = newLogs[newLogs.length - 1];
                    if (lastLog && lastLog.type === 'thought_stream') {
                      newLogs[newLogs.length - 1] = { ...lastLog, text: parsed.data.text, endTime: Date.now() };
                    } else {
                      newLogs.push({ type: 'thought_stream', text: parsed.data.text, startTime: Date.now(), endTime: Date.now() });
                    }
                    return newLogs;
                  });
                } else if (parsed.data.type === 'answer') {
                  updateActiveChatLogs(prev => {
                    const newLogs = [...prev];
                    const answerIdx = newLogs.findLastIndex(l => l.type === 'answer');
                    if (answerIdx >= 0) {
                      newLogs[answerIdx] = { ...newLogs[answerIdx], text: parsed.data.text };
                    } else {
                      newLogs.push(parsed.data);
                    }
                    return newLogs;
                  });
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                } else {
                  updateActiveChatLogs(prev => [...prev, { ...parsed.data, startTime: Date.now(), endTime: Date.now() }]);
                  messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
                }
              } else if (parsed.type === 'done') {
                setIsThinking(false);
              } else if (parsed.type === 'error') {
                updateActiveChatLogs(prev => [...prev, { type: 'thought_stream', text: `Error: ${ parsed.data }` }]);
                setIsThinking(false);
              }
            } catch (e) { }
          }
        }
      }

    } catch (error: any) {
      if (error.name !== 'AbortError') {
        updateActiveChatLogs(prev => [...prev, { type: 'thought', text: "Error connecting to EterX engine." }]);
      }
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  };

  const suggestions = [
    { icon: <Code2 className="w-3.5 h-3.5" />, text: "Code" },
    { icon: <PenTool className="w-3.5 h-3.5" />, text: "Write" },
    { icon: <GraduationCap className="w-3.5 h-3.5" />, text: "Learn" },
    { icon: <MessageSquare className="w-3.5 h-3.5" />, text: "Life stuff" },
    { icon: <img src="/logo.png" alt="Logo" className="w-4 h-4 object-contain brightness-0 invert opacity-80" />, text: "EterX's choice" }
  ];

  return (
    <div className="flex h-screen bg-[#050505] text-[#E8E6E3] font-sans overflow-hidden selection:bg-[#E2765A]/30 transition-colors relative">
      {/* Background Volumetric Glow (Sits globally behind the apps so curves reveal it) */}
      <div className={`absolute bottom-0 left-0 right-0 h-[45vh] pointer-events-none overflow-hidden z-0 flex items-end justify-center ${ traceLogs.length === 0 ? 'opacity-100 transition-all duration-[1000ms] ease-out' : 'opacity-0 transition-none' }`}>
        {/* Base Color Plasma */}
        <div className="absolute w-[130%] h-[30vh] -bottom-[15vh] flex justify-center items-center opacity-90 blur-[80px] animate-breathe">
          <div className="absolute left-[0%] w-[35vw] h-[25vh] bg-[#FF82E6] rounded-[100%] animate-blob mix-blend-screen"></div>
          <div className="absolute left-[25%] w-[40vw] h-[30vh] bg-[#10b981] rounded-[100%] animate-blob animation-delay-2000 mix-blend-screen"></div>
          <div className="absolute right-[25%] w-[40vw] h-[30vh] bg-[#5F8EFE] rounded-[100%] animate-blob animation-delay-4000 mix-blend-screen"></div>
          <div className="absolute right-[0%] w-[35vw] h-[25vh] bg-[#C27CF7] rounded-[100%] animate-blob animation-delay-6000 mix-blend-screen"></div>

          {/* Volumetric Hot Cores */}
          <div className="absolute left-[15%] w-[20vw] h-[15vh] bg-white opacity-40 rounded-[100%] blur-[40px] animate-core-blob mix-blend-overlay"></div>
          <div className="absolute right-[15%] w-[20vw] h-[20vh] bg-[#a5f3fc] opacity-30 rounded-[100%] blur-[50px] animate-core-blob animation-delay-3000 mix-blend-overlay"></div>
        </div>
        {/* Tactile Grain Overlay */}
        <div className="absolute inset-0 z-10 mix-blend-overlay pointer-events-none opacity-[0.25]" style={{ background: 'url("data:image/svg+xml,%3Csvg viewBox=%220 0 200 200%22 xmlns=%22http://www.w3.org/2000/svg%22%3E%3Cfilter id=%22noiseFilter%22%3E%3CfeTurbulence type=%22fractalNoise%22 baseFrequency=%220.85%22 numOctaves=%223%22 stitchTiles=%22stitch%22/%3E%3C/filter%3E%3Crect width=%22100%25%22 height=%22100%25%22 filter=%22url(%23noiseFilter)%22/%3E%3C/svg%3E")', WebkitMaskImage: 'linear-gradient(to top, black 0%, transparent 100%)', maskImage: 'linear-gradient(to top, black 0%, transparent 100%)' }}></div>
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        setIsOpen={setSidebarOpen}
        createNewChat={createNewChat}
        chats={chats}
        activeChatId={activeChatId}
        loadChat={loadChat}
        deleteChat={deleteChat}
        onSearchClick={() => setCmdPaletteOpen(true)}
        activeView={activeView}
        setActiveView={setActiveView}
      />

      <div className="flex-1 flex flex-col relative bg-transparent overflow-hidden z-10">
        {/* Modern Fumes Background overlay */}
        <div
          className="absolute top-0 left-0 right-0 h-20 z-10 pointer-events-none"
          style={{
            background: 'linear-gradient(to bottom, #050505 0%, rgba(5,5,5,0.9) 30%, transparent 100%)'
          }}
        />

        {/* Absolute Header (Draggable Region for Electron) */}
        <div className="absolute top-0 left-0 right-0 h-14 flex items-center justify-between pl-4 pr-[140px] z-20 pointer-events-none [-webkit-app-region:drag]">
          <div className="flex items-center gap-2 pointer-events-auto [-webkit-app-region:no-drag] h-full pt-3">
            {!sidebarOpen && (
              <div className="flex items-center gap-1 mr-2 mt-0">
                <Tooltip text="Open sidebar" side="bottom">
                  <div onClick={() => setSidebarOpen(true)} className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all text-[#8C8A88] hover:text-white cursor-pointer">
                    <PanelLeft className="w-[18px] h-[18px]" />
                  </div>
                </Tooltip>
                <Tooltip text="New chat" side="bottom">
                  <div onClick={() => createNewChat()} className="p-1.5 rounded-full hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all text-[#8C8A88] hover:text-white cursor-pointer">
                    <SquarePen className="w-[18px] h-[18px]" />
                  </div>
                </Tooltip>
              </div>
            )}
            {(() => {
              const activeChat = activeChatId ? chats.find(c => c.id === activeChatId) : null;
              if (activeChat && activeChat.title) {
                return (
                  <div className="relative [-webkit-app-region:no-drag]">
                    <div
                      onClick={() => setHeaderMenuOpen(!headerMenuOpen)}
                      className={`flex items-center gap-2 text-[14px] text-[#A3A19E] font-medium cursor-pointer hover:bg-white/5 px-2 py-1 rounded-md transition-colors border border-transparent hover:border-white/5 backdrop-blur-sm ${ headerMenuOpen ? 'bg-white/5 text-[#E8E6E3]' : '' }`}
                    >
                      <span className="truncate max-w-[400px]">{activeChat.title}</span>
                      <ChevronDown className={`w-4 h-4 text-[#555350] shrink-0 transition-transform duration-200 ${ headerMenuOpen ? 'rotate-180' : '' }`} />
                    </div>
                    <AnimatePresence>
                      {headerMenuOpen && (
                        <>
                          <div className="fixed inset-0 z-40 cursor-default" onClick={(e) => { e.stopPropagation(); setHeaderMenuOpen(false); }}></div>
                          <motion.div
                            initial={{ opacity: 0, y: -5, scale: 0.98 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -5, scale: 0.98 }}
                            transition={{ duration: 0.15, ease: "easeOut" }}
                            className="absolute top-10 left-0 w-[300px] z-50 bg-[#1A1A1A]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_8px_30px_rgba(0,0,0,0.4)] p-2 flex flex-col max-h-[400px]"
                          >
                            <div className="flex items-center justify-between px-2 mb-2 mt-1 h-6">
                              {!headerSearchOpen ? (
                                <>
                                  <div className="text-[11px] font-semibold text-[#555350] uppercase tracking-wider">Threads</div>
                                  <Search
                                    className="w-3.5 h-3.5 text-[#555350] hover:text-[#E8E6E3] cursor-pointer transition-colors"
                                    onClick={(e) => { e.stopPropagation(); setHeaderSearchOpen(true); }}
                                  />
                                </>
                              ) : (
                                <motion.div
                                  initial={{ width: 0, opacity: 0 }}
                                  animate={{ width: "100%", opacity: 1 }}
                                  className="flex items-center gap-2 w-full bg-white/5 rounded-md px-2 py-1 h-full"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Search className="w-3 h-3 text-[#A3A19E]" />
                                  <input
                                    type="text"
                                    autoFocus
                                    placeholder="Search threads..."
                                    value={headerSearchQuery}
                                    onChange={(e) => setHeaderSearchQuery(e.target.value)}
                                    className="bg-transparent border-none outline-none text-[12px] text-[#E8E6E3] placeholder:text-[#555350] w-full"
                                  />
                                  <X
                                    className="w-3 h-3 text-[#555350] hover:text-[#E8E6E3] cursor-pointer"
                                    onClick={(e) => { e.stopPropagation(); setHeaderSearchOpen(false); setHeaderSearchQuery(""); }}
                                  />
                                </motion.div>
                              )}
                            </div>
                            <div className="overflow-y-auto custom-scrollbar flex-1 space-y-[2px]">
                              {(() => {
                                const filteredChats = chats.filter(c =>
                                  c.title &&
                                  c.title.toLowerCase().includes(headerSearchQuery.toLowerCase())
                                );

                                if (filteredChats.length === 0) {
                                  return <div className="px-2 py-2 text-[13px] text-[#555350] italic">No threads found</div>;
                                }

                                return filteredChats.map(chat => (
                                  <div
                                    key={chat.id}
                                    onClick={() => {
                                      loadChat(chat.id);
                                      setHeaderMenuOpen(false);
                                    }}
                                    className={`w-full text-left px-3 py-2 text-[13px] rounded-lg truncate transition-all duration-150 flex items-center group cursor-pointer border border-transparent active:scale-[0.98] ${ activeChatId === chat.id ? 'bg-white/10 text-white font-medium shadow-sm' : 'text-[#A3A19E] hover:bg-white/5 active:bg-white/10 hover:text-[#E8E6E3]' }`}
                                  >
                                    {chat.title}
                                  </div>
                                ));
                              })()}
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                );
              }
              return null;
            })()}
          </div>
        </div>

        <ChatFeed
          traceLogs={traceLogs}
          isThinking={isThinking}
          messagesEndRef={messagesEndRef}
          setSidebarOpen={setSidebarOpen}
          sidebarOpen={sidebarOpen}
          handleScroll={handleScroll}
          showScrollBottom={showScrollBottom}
        />

        <ChatInput
          inputValue={inputValue}
          setInputValue={setInputValue}
          isThinking={isThinking}
          isRecording={isRecording}
          handleSend={handleSend}
          handleStop={handleStop}
          toggleSpeech={toggleSpeech}
          attachments={attachments}
          setAttachments={setAttachments}
          greeting={greeting}
          traceLogsLength={traceLogs.length}
          isProcessingVoice={isProcessingVoice}
          audioVolume={audioVolume}
          cancelVoice={cancelVoice}
          acceptVoice={acceptVoice}
        />

        {/* Disclaimer Text exactly where user wanted it */}
        {traceLogs.length === 0 && !isThinking && (
          <div className="absolute bottom-6 left-0 right-0 flex flex-col items-center pointer-events-none z-40">
            <div className="text-center text-[12px] text-black/60 font-medium tracking-wide mix-blend-overlay">
              EterX is an AI agent and can make mistakes; please double-check its work.
            </div>
          </div>
        )}
      </div>

      <CommandPalette
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        createNewChat={createNewChat}
        chats={chats}
        loadChat={loadChat}
      />

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes color-shift {
          0% { filter: hue-rotate(0deg); }
          100% { filter: hue-rotate(360deg); }
        }
        @keyframes blob-movement {
          0%, 100% { transform: translate(0px, 0px) scale(1); }
          33% { transform: translate(30px, -30px) scale(1.05); }
          66% { transform: translate(-20px, 20px) scale(0.95); }
        }
        @keyframes breathe-container {
          0%, 100% { transform: scaleY(1); opacity: 0.85; }
          50% { transform: scaleY(1.03); opacity: 1; }
        }
        @keyframes core-movement {
          0%, 100% { transform: translate(0px, 0px) scale(0.8); }
          50% { transform: translate(40px, -15px) scale(1.1); }
        }
        .animate-blob { 
            animation: 
              blob-movement 25s cubic-bezier(0.4, 0, 0.2, 1) infinite,
              color-shift 35s linear infinite; 
        }
        .animate-breathe { animation: breathe-container 20s ease-in-out infinite; }
        .animate-core-blob { animation: core-movement 18s ease-in-out infinite; }
        .animation-delay-2000 { animation-delay: -5s, -7.5s; }
        .animation-delay-3000 { animation-delay: -7.5s, -10s; }
        .animation-delay-4000 { animation-delay: -10s, -15s; }
        .animation-delay-6000 { animation-delay: -15s, -22.5s; }
        .custom-scrollbar::-webkit-scrollbar {
          width: 8px;
        }
        .custom-scrollbar::-webkit-scrollbar-track {
          background: transparent;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb {
          background-color: #2b2b2b;
          border-radius: 20px;
          border: 2px solid #050505;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover {
          background-color: #444;
        }
        .code-span {
           font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
        }
      `}} />
    </div>
  );
}
