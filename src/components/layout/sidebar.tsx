import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, LayoutDashboard, Bot, Layers, FolderOpen, Code2, PanelLeft, Download, X } from 'lucide-react';
import { Tooltip } from '../ui/tooltip';

interface ChatSession {
  id: string;
  title: string;
  updatedAt: number;
  traceLogs: any[];
}

interface SidebarProps {
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  createNewChat: () => void;
  chats: ChatSession[];
  activeChatId: string | null;
  loadChat: (id: string) => void;
  deleteChat: (id: string) => void;
  onSearchClick: () => void;
  activeView: 'chat' | 'code';
  setActiveView: (view: 'chat' | 'code') => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen, setIsOpen, createNewChat, chats, activeChatId, loadChat, deleteChat, onSearchClick, activeView, setActiveView
}) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 280, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          className="border-r border-white/5 bg-[#0A0A0A] flex flex-col flex-shrink-0 z-[60] h-full rounded-tr-[32px] rounded-br-[32px] overflow-visible"
        >
          <div className="p-3">
            <div className="px-3 py-3 font-serif text-[20px] text-[#E8E6E3] font-medium flex items-center justify-between cursor-pointer transition-opacity tracking-tight">
              <span className="hover:opacity-80 transition-opacity">EterX</span>
              <div
                onClick={(e) => { e.stopPropagation(); setIsOpen(false); }}
                className="p-1.5 rounded-md hover:bg-white/10 active:bg-white/20 active:scale-95 transition-all duration-300 ease-out text-[#8C8A88] hover:text-white flex items-center justify-center cursor-pointer"
              >
                <PanelLeft className="w-[18px] h-[18px]" />
              </div>
            </div>

            <div className="space-y-[2px] mt-2">
              <Tooltip text="Start a fresh conversation" side="right">
                <button
                  onClick={() => { createNewChat(); setActiveView('chat'); }}
                  className="w-full flex items-center justify-between px-3 py-2.5 text-[14px] font-medium text-[#E8E6E3] bg-white/[0.03] border border-white/5 rounded-lg transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] hover:bg-white/[0.08] hover:border-white/20 active:scale-95 shadow-[0_4px_20px_rgba(0,0,0,0.3)] group"
                >
                  <div className="flex items-center gap-3">
                    <Plus className="w-[18px] h-[18px] text-[#E8E6E3] group-hover:rotate-90 transition-transform duration-500" /> New chat
                  </div>
                  <span className="text-[10px] text-white/20 tracking-widest font-mono group-hover:text-white/40 transition-colors">Ctrl+⇧+O</span>
                </button>
              </Tooltip>

              <div className="h-2"></div>

              <Tooltip text="Search conversations" side="right">
                <button
                  onClick={onSearchClick}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-white/40 hover:text-white hover:bg-white/[0.04] rounded-lg transition-all duration-500 ease-out active:scale-95 group border border-transparent hover:border-white/5"
                >
                  <Search className="w-[18px] h-[18px] text-white/20 group-hover:text-white transition-all duration-500 group-hover:drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]" /> Search
                </button>
              </Tooltip>
              <Tooltip text="Manage workspace" side="right">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 active:bg-white/10 rounded-lg transition-all duration-300 ease-out active:scale-95 group">
                  <LayoutDashboard className="w-[18px] h-[18px] text-[#8C8A88] group-hover:text-[#E8E6E3]" /> Workspace
                </button>
              </Tooltip>



              <Tooltip text="Manage agents" side="right">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 active:bg-white/10 rounded-lg transition-all duration-300 ease-out active:scale-95 group">
                  <Bot className="w-[18px] h-[18px] text-[#8C8A88] group-hover:text-[#E8E6E3]" /> Agents
                </button>
              </Tooltip>
              <Tooltip text="View channels" side="right">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 active:bg-white/10 rounded-lg transition-all duration-300 ease-out active:scale-95 group">
                  <Layers className="w-[18px] h-[18px] text-[#8C8A88] group-hover:text-[#E8E6E3]" /> Channels
                </button>
              </Tooltip>
              <Tooltip text="File Manager" side="right">
                <button className="w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 active:bg-white/10 rounded-lg transition-all duration-300 ease-out active:scale-95 group">
                  <FolderOpen className="w-[18px] h-[18px] text-[#8C8A88] group-hover:text-[#E8E6E3]" /> File Manager
                </button>
              </Tooltip>
              <Tooltip text="Open code editor" side="right">
                <button
                  onClick={() => setActiveView('code')}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 text-[14px] font-medium rounded-lg transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] active:scale-95 group border ${ activeView === 'code'
                    ? 'bg-[#E2765A]/10 text-[#E2765A] border-[#E2765A]/30 shadow-[0_0_20px_rgba(226,118,90,0.1)]'
                    : 'text-white/40 hover:text-white hover:bg-white/[0.04] border-transparent hover:border-white/5'
                    }`}
                >
                  <Code2 className={`w-[18px] h-[18px] transition-all duration-500 ${ activeView === 'code' ? 'text-[#E2765A] drop-shadow-[0_0_8px_rgba(226,118,90,0.6)]' : 'text-white/20 group-hover:text-white'
                    }`} /> Code
                </button>
              </Tooltip>
            </div>
          </div>

          {/* Recents List */}
          <div className="flex-1 mt-0 mx-[6px] mb-[6px] bg-gradient-to-b from-[#151515]/80 to-[#0A0A0A]/90 backdrop-blur-2xl rounded-[20px] border border-white/[0.03] shadow-[0_4px_30px_rgba(0,0,0,0.4)] flex flex-col py-3 overflow-hidden relative">
            <div className="text-[10px] font-bold text-[#555350] px-4 mb-2 uppercase tracking-[0.2em] shrink-0">Chats</div>
            <div className="flex-1 overflow-y-auto custom-scrollbar px-1.5 space-y-[4px]">
              {chats.length === 0 ? (
                <div className="px-3 py-2 text-[13px] text-[#555350] italic">No active projects</div>
              ) : (
                chats.map((chat) => (
                  <div
                    key={chat.id}
                    onClick={() => { loadChat(chat.id); setActiveView('chat'); }}
                    className={`w-full text-left px-3 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex items-center justify-between group cursor-pointer active:scale-[0.98] ${ activeChatId === chat.id && activeView === 'chat' ? 'bg-[#181818]/80 backdrop-blur-xl border border-white/[0.08] text-[#E8E6E3] font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.5)] rounded-[12px] py-3 text-[13.5px] relative z-10 overflow-hidden' : 'py-2.5 text-[13px] rounded-lg border border-transparent text-[#A3A19E] hover:bg-white/5 active:bg-white/10 hover:text-[#E8E6E3]' }`}
                  >
                    <span className="truncate pr-2">{chat.title}</span>
                    <X
                      className="w-3.5 h-3.5 opacity-0 group-hover:opacity-100 text-[#8C8A88] hover:text-[#E2765A] transition-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteChat(chat.id);
                      }}
                    />
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Bottom Profile Area */}
          <div className="p-3 border-t border-white/5 bg-[#050505] rounded-br-[32px]">
            <Tooltip text="User settings & plan" side="right">
              <div className="flex items-center justify-between cursor-pointer group px-2 py-2 hover:bg-white/5 rounded-xl w-full transition-colors border border-transparent hover:border-white/5">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#32312F] to-[#1C1B1A] flex items-center justify-center text-[#E8E6E3] font-semibold text-xs shrink-0 border border-white/10 shadow-inner">
                    H
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-white group-hover:text-[#E8E6E3]">harshil</span>
                    <span className="text-[11px] text-[#A3A19E]"></span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Download className="w-4 h-4 text-[#8C8A88] group-hover:text-white transition-colors" />
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(52,211,153,0.6)]"></div>
                </div>
              </div>
            </Tooltip>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
