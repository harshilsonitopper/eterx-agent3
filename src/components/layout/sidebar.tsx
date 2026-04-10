import React from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Search, LayoutDashboard, Bot, Layers, FolderOpen, Code2, PanelLeft, Download, X, Loader2, MoreHorizontal, Share, Edit2, Star, FolderInput, Trash2, ChevronRight } from 'lucide-react';
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
  isThinking?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  isOpen, setIsOpen, createNewChat, chats, activeChatId, loadChat, deleteChat, onSearchClick, activeView, setActiveView, isThinking
}) => {
  const [menuState, setMenuState] = React.useState<{ id: string, x: number, y: number, dropUp: boolean } | null>(null);

  React.useEffect(() => {
    const handleClickOutside = () => setMenuState(null);
    if (menuState) {
      document.addEventListener('click', handleClickOutside);
    }
    return () => document.removeEventListener('click', handleClickOutside);
  }, [menuState]);

  return (
    <>
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
                    <div className="w-[28px] h-[28px] flex items-center justify-center bg-white/[0.04] border border-white/[0.08] rounded-full group-hover:bg-white/[0.1] group-hover:border-white/[0.15] transition-all duration-500 shadow-sm">
                      <Plus className="w-[16px] h-[16px] text-[#E8E6E3] group-hover:rotate-90 transition-transform duration-500" strokeWidth={2.5} />
                    </div>
                    New chat
                  </div>
                  <span className="text-[10px] text-white/20 tracking-widest font-mono group-hover:text-white/40 transition-colors"></span>
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
                chats.map((chat, index) => {
                  const isActive = activeChatId === chat.id && activeView === 'chat';
                  const isWorking = isActive && isThinking;
                  const isMenuOpen = menuState?.id === chat.id;

                  return (
                    <div
                      key={chat.id}
                      onClick={() => { loadChat(chat.id); setActiveView('chat'); }}
                      className={`w-full text-left px-3 transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] flex items-center justify-between group cursor-pointer active:scale-[0.98] ${ isActive ? 'bg-[#181818]/80 backdrop-blur-xl border border-white/[0.08] text-[#E8E6E3] font-semibold shadow-[0_8px_20px_rgba(0,0,0,0.5)] rounded-[12px] py-3 text-[13.5px] relative z-10 overflow-visible' : 'py-2.5 text-[13px] rounded-lg border border-transparent text-[#A3A19E] hover:bg-white/5 active:bg-white/10 hover:text-[#E8E6E3] relative z-0' }`}
                    >
                      {isWorking ? (
                        <motion.span
                          animate={{ backgroundPosition: ["200% 50%", "-200% 50%"] }}
                          transition={{ duration: 3, repeat: Infinity, ease: "linear" }}
                          style={{ backgroundSize: '300% auto' }}
                          className="truncate pr-2 relative z-10 bg-gradient-to-r from-[#555350] via-[#E8E6E3] to-[#555350] bg-clip-text text-transparent font-medium"
                        >
                          {chat.title}
                        </motion.span>
                      ) : (
                        <span className="truncate pr-2 relative z-10 text-[#E8E6E3]">{chat.title}</span>
                      )}
                      
                      {/* Modern right-side Loading 'Fume' with Custom Spinner */}
                      {isWorking ? (
                        <div className="absolute right-0 top-0 bottom-0 w-[4.5rem] bg-gradient-to-l from-[#181818] via-[#181818]/95 to-transparent pointer-events-none z-20 flex items-center justify-end pr-3">
                          <div className="w-[14px] h-[14px] rounded-full border-[2px] border-[#1e3a8a] border-r-[#3b82f6] animate-[spin_0.8s_linear_infinite]" />
                        </div>
                      ) : (
                        <div className="relative">
                          <div 
                            className={`p-1 rounded-md transition-colors ${isMenuOpen ? 'opacity-100 bg-white/10 text-[#E8E6E3]' : 'opacity-0 group-hover:opacity-100 text-[#8C8A88] hover:bg-white/10 hover:text-[#E8E6E3]'} transition-all relative z-40`}
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isMenuOpen) {
                                setMenuState(null);
                              } else {
                                const rect = e.currentTarget.getBoundingClientRect();
                                const dropUp = rect.bottom + 240 > window.innerHeight;
                                setMenuState({ id: chat.id, x: rect.right, y: dropUp ? rect.top : rect.bottom, dropUp });
                              }
                            }}
                          >
                            <MoreHorizontal className="w-4 h-4" />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
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

    {menuState && typeof document !== 'undefined' && createPortal(
      <div 
        className="fixed inset-0 z-[999999]" 
        onClick={(e) => { e.stopPropagation(); setMenuState(null); }}
        onContextMenu={(e) => { e.stopPropagation(); setMenuState(null); }}
      >
        <AnimatePresence>
          <motion.div
            initial={{ opacity: 0, y: menuState.dropUp ? 5 : -5, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            onClick={(e) => e.stopPropagation()}
            style={{
              position: 'fixed',
              left: menuState.x + 8,
              ...(menuState.dropUp ? { bottom: window.innerHeight - menuState.y + 4 } : { top: menuState.y + 4 }),
            }}
            className="w-48 bg-[#181818] border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.8)] py-1.5 flex flex-col"
          >
            <button className="w-full px-3 py-2 text-[13px] text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 flex items-center gap-3 transition-colors text-left group/btn">
              <Share className="w-3.5 h-3.5 text-[#8C8A88] group-hover/btn:text-[#E8E6E3]" /> Share
            </button>
            <button className="w-full px-3 py-2 text-[13px] text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 flex items-center gap-3 transition-colors text-left group/btn">
              <Edit2 className="w-3.5 h-3.5 text-[#8C8A88] group-hover/btn:text-[#E8E6E3]" /> Rename
            </button>
            <button className="w-full px-3 py-2 text-[13px] text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 flex items-center gap-3 transition-colors text-left group/btn">
              <Star className="w-3.5 h-3.5 text-[#8C8A88] group-hover/btn:text-[#E8E6E3]" /> Add to favorites
            </button>
            <button className="w-full px-3 py-2 text-[13px] text-[#A3A19E] hover:text-[#E8E6E3] hover:bg-white/5 flex items-center gap-3 transition-colors text-left justify-between group/btn">
              <div className="flex items-center gap-3">
                <FolderInput className="w-3.5 h-3.5 text-[#8C8A88] group-hover/btn:text-[#E8E6E3]" /> Move to project
              </div>
              <ChevronRight className="w-3.5 h-3.5 text-[#555350] group-hover/btn:text-[#8C8A88]" />
            </button>
            
            <div className="h-[1px] w-full bg-white/5 my-1" />
            
            <button 
              className="w-full px-3 py-2 text-[13px] text-[#EF4444]/90 hover:text-red-400 hover:bg-red-500/10 flex items-center gap-3 transition-colors text-left"
              onClick={(e) => {
                e.stopPropagation();
                deleteChat(menuState.id);
                setMenuState(null);
              }}
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete
            </button>
          </motion.div>
        </AnimatePresence>
      </div>,
      document.body
    )}
    </>
  );
};
