"use client";

import React, { useState, useRef, useEffect } from 'react';
import { Sidebar } from '@/components/layout/sidebar';
import { ChatInput } from '@/components/layout/chat-input';
import { CommandPalette } from '@/components/layout/command-palette';
import { ChatFeed } from '@/components/chat/chat-feed';
import { CodeView } from '@/components/code/code-view';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  traceLogs: any[];
}

export default function Home() {
  // Application State
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeView, setActiveView] = useState<'chat' | 'code'>('chat');
  const [workspacePath, setWorkspacePath] = useState('');
  const [cmdPaletteOpen, setCmdPaletteOpen] = useState(false);
  const [showScrollBottom, setShowScrollBottom] = useState(false);
  
  // Chat State
  const [chats, setChats] = useState<ChatSession[]>([]);
  const [activeChatId, setActiveChatId] = useState<string | null>(null);
  
  // Input State
  const [inputValue, setInputValue] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isThinking, setIsThinking] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  // Get active logs
  const activeChat = chats.find(c => c.id === activeChatId);
  const traceLogs = activeChat?.traceLogs || [];
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Load from local storage
  useEffect(() => {
    const saved = localStorage.getItem('eterx-chats');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        setChats(parsed);
        if (parsed.length > 0 && !activeChatId) {
          setActiveChatId(parsed[0].id);
        }
      } catch (e) {}
    }
  }, []);

  // Save to local storage
  useEffect(() => {
    if (chats.length > 0) {
      localStorage.setItem('eterx-chats', JSON.stringify(chats));
    }
  }, [chats]);
  
  // Command Palette Shortcut
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'k' && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setCmdPaletteOpen(open => !open);
      }
      if (e.key === 'O' && e.shiftKey && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        createNewChat();
        setActiveView('chat');
      }
    };
    window.addEventListener('keydown', down);
    return () => window.removeEventListener('keydown', down);
  }, []);

  // Auto-scroll logic when new messages arrive
  useEffect(() => {
    if (isThinking) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [traceLogs.length, isThinking]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const isAtBottom = target.scrollHeight - target.scrollTop <= target.clientHeight + 100;
    setShowScrollBottom(!isAtBottom);
  };

  const createNewChat = () => {
    const newChat: ChatSession = {
      id: crypto.randomUUID(),
      title: 'New Workspace',
      updatedAt: Date.now(),
      traceLogs: []
    };
    setChats(prev => [newChat, ...prev]);
    setActiveChatId(newChat.id);
  };

  const loadChat = (id: string) => {
    setActiveChatId(id);
  };

  const deleteChat = (id: string) => {
    setChats(prev => {
      const nextChats = prev.filter(c => c.id !== id);
      if (nextChats.length === 0) {
        localStorage.removeItem('eterx-chats');
      }
      return nextChats;
    });
    if (activeChatId === id) {
      setActiveChatId(null);
    }
  };

  const updateActiveChat = (updater: (chat: ChatSession) => ChatSession) => {
    setChats(prev => prev.map(c => {
      if (c.id === activeChatId) {
        return updater(c);
      }
      return c;
    }));
  };

  const handleSend = async () => {
    if (!inputValue.trim() && attachments.length === 0) return;
    
    let currentChatId = activeChatId;
    if (!currentChatId) {
      const newChat: ChatSession = {
        id: crypto.randomUUID(),
        title: inputValue.substring(0, 30) || 'New Chat',
        updatedAt: Date.now(),
        traceLogs: []
      };
      setChats(prev => [newChat, ...prev]);
      currentChatId = newChat.id;
      setActiveChatId(newChat.id);
    } else {
      updateActiveChat(c => {
        if (c.traceLogs.length === 0) {
          return { ...c, title: inputValue.substring(0, 30), updatedAt: Date.now() };
        }
        return { ...c, updatedAt: Date.now() };
      });
    }

    const currentInput = inputValue;
    setInputValue('');
    setIsThinking(true);
    
    // Add user message
    const userLog = { type: 'user_action', text: currentInput };
    setChats(prev => prev.map(c => {
      if (c.id === currentChatId) return { ...c, traceLogs: [...c.traceLogs, userLog] };
      return c;
    }));

    try {
      abortControllerRef.current = new AbortController();
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: currentInput,
          history: chats.find(c => c.id === currentChatId)?.traceLogs || [],
          userId: 'local',
          projectId: workspacePath || 'default'
        }),
        signal: abortControllerRef.current.signal
      });

      if (!response.body) throw new Error('No body returned from API');
      
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6));
              if (data.type === 'trace') {
                setChats(prev => prev.map(c => {
                  if (c.id === currentChatId) return { ...c, traceLogs: [...c.traceLogs, data.data] };
                  return c;
                }));
              } else if (data.type === 'error') {
                 console.error('API Error:', data.data);
              }
            } catch (e) {
              // Ignore incomplete JSON chunks, wait for next buffer
            }
          }
        }
      }
    } catch (e: any) {
      if (e.name !== 'AbortError') {
        console.error('Chat error:', e);
      }
    } finally {
      setIsThinking(false);
      abortControllerRef.current = null;
    }
  };

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setIsThinking(false);
  };

  const toggleSpeech = () => {
    setIsRecording(!isRecording);
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
  };

  return (
    <main className="flex h-screen w-full bg-[#050505] text-[#E8E6E3] overflow-hidden selection:bg-[#E2765A]/30">
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

      <div className={`flex flex-col flex-1 h-full relative transition-all duration-300`}>
        {activeView === 'chat' ? (
          <>
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
              greeting={getGreeting()}
              traceLogsLength={traceLogs.length}
            />
          </>
        ) : (
          <CodeView 
            workspacePath={workspacePath}
            onChangeWorkspace={setWorkspacePath}
          />
        )}
      </div>

      <CommandPalette 
        isOpen={cmdPaletteOpen}
        onClose={() => setCmdPaletteOpen(false)}
        createNewChat={createNewChat}
        chats={chats}
        loadChat={loadChat}
      />
    </main>
  );
}
