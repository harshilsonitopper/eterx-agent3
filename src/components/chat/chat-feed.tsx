import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Copy, RefreshCw, ChevronDown, ChevronUp } from 'lucide-react';
import { ThinkingProcess, ProfessionalThought } from '../chat/thought-sequence';
import { AskUserPrompt } from '../chat/ask-user-prompt';
import { Tooltip } from '../ui/tooltip';

interface ChatFeedProps {
  traceLogs: any[];
  isThinking: boolean;
  messagesEndRef: React.RefObject<HTMLDivElement>;
  setSidebarOpen: (o: boolean) => void;
  sidebarOpen: boolean;
  handleScroll: (e: any) => void;
  showScrollBottom: boolean;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  traceLogs, isThinking, messagesEndRef, setSidebarOpen, sidebarOpen, handleScroll: externalHandleScroll, showScrollBottom
}) => {
  const [activeMessageIdx, setActiveMessageIdx] = useState<number>(-1);

  const handleScrollWrap = (e: React.UIEvent<HTMLDivElement>) => {
    externalHandleScroll(e);
    
    const container = e.currentTarget;
    const messageElements = container.querySelectorAll('[id^="message-"]');
    let closestIdx = -1;
    let minDistance = Infinity;
    const targetY = window.innerHeight / 3;
    
    messageElements.forEach((el) => {
      const rect = el.getBoundingClientRect();
      const distance = Math.abs(rect.top - targetY);
      if (distance < minDistance) {
         minDistance = distance;
         const idxStr = el.id.replace('message-', '');
         closestIdx = parseInt(idxStr, 10);
      }
    });

    if (closestIdx !== -1 && closestIdx !== activeMessageIdx) {
      setActiveMessageIdx(closestIdx);
    }
  };

  const groups: any[][] = [];
  let currentGroup: any[] = [];
  traceLogs.forEach(log => {
    if (log.type === 'user_action') {
      if (currentGroup.length > 0) groups.push(currentGroup);
      groups.push([log]);
      currentGroup = [];
    } else {
      currentGroup.push(log);
    }
  });
  if (currentGroup.length > 0) groups.push(currentGroup);

  return (
    <div className="flex-1 w-full flex flex-col overflow-y-auto pb-44 px-4 sm:px-12 md:px-24 scrollbar-hide" id="chat-container" onScroll={handleScrollWrap}>

      {/* Scroll to Bottom Button */}
      <AnimatePresence>
        {showScrollBottom && (
          <motion.button
            initial={{ opacity: 0, scale: 0.8, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 10 }}
            onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })}
            className="fixed bottom-28 right-8 w-10 h-10 rounded-full border border-white/10 bg-black/80 backdrop-blur-md shadow-[0_8px_30px_rgba(0,0,0,0.5)] flex items-center justify-center text-[#E8E6E3] hover:bg-[#1A1A1A] hover:border-white/20 transition-all z-40 transform hover:-translate-y-1 active:scale-95"
          >
            <ChevronDown className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      {/* Interactive Minimap Scrubber */}
      {groups.length > 0 && (
        <div className="fixed right-0 top-1/2 -translate-y-1/2 flex flex-col items-end gap-2 z-30 py-4 hidden lg:flex opacity-70 hover:opacity-100 transition-opacity duration-300 pr-3">
          <button onClick={() => document.getElementById('chat-container')?.scrollTo({ top: 0, behavior: 'smooth' })} className="text-[#8C8A88] hover:text-[#E8E6E3] transition-colors p-1 mr-[2px]" title="Scroll to top">
            <ChevronUp className="w-4 h-4" />
          </button>
          
          <div className="flex flex-col items-end gap-[5px] my-1 w-[32px]">
            {groups.map((group, groupIdx) => {
              const first = group[0];
              const isUser = first?.type === 'user_action';
              if (!isUser) return null;
              
              const queryText = first.text.length > 65 ? first.text.substring(0, 62) + '...' : first.text;
              const isActive = activeMessageIdx === groupIdx;
              const isLonger = (groupIdx / 2) % 2 === 0;

              return (
                <div key={`minimap-${groupIdx}`} className="relative group/minimap flex items-center justify-end w-full">
                  <button
                    onClick={() => document.getElementById(`message-${groupIdx}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })}
                    className="w-full h-[14px] flex items-center justify-end cursor-pointer group/btn focus:outline-none"
                  >
                    <div className={`h-[2px] rounded-l-full transition-all duration-300 ease-out group-hover/btn:bg-[#E8E6E3] group-hover/btn:w-[24px] group-hover/btn:shadow-[0_0_8px_rgba(255,255,255,0.4)] ${isActive ? 'w-[24px] bg-[#E8E6E3] shadow-[0_0_8px_rgba(255,255,255,0.4)]' : (isLonger ? 'w-[14px] bg-[#8C8A88]' : 'w-[8px] bg-[#6E6C6A]')}`} />
                  </button>
                  <div className="absolute right-[32px] top-1/2 -translate-y-1/2 opacity-0 group-hover/minimap:opacity-100 transition-all duration-300 pointer-events-none transform translate-x-2 group-hover/minimap:translate-x-0 group-hover/minimap:delay-150 z-50">
                    <div className="bg-[#1A1A1A] text-[#E8E6E3] text-[13px] px-4 py-3 rounded-[18px] shadow-[0_4px_24px_rgba(0,0,0,0.5)] w-max max-w-[260px] whitespace-normal leading-relaxed border border-white/5 font-medium tracking-tight text-left">
                      <span className="line-clamp-2">{queryText}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          <button onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })} className="text-[#8C8A88] hover:text-[#E8E6E3] transition-colors p-1 mr-[2px]" title="Scroll to bottom">
            <ChevronDown className="w-4 h-4" />
          </button>
        </div>
      )}

      {traceLogs.length > 0 && (
          <div className="w-full max-w-3xl mx-auto pt-20 pb-4 relative">
            {groups.map((group, groupIdx) => {
              const first = group[0];
              if (first.type === 'user_action') {
                return (
                  <div key={`group-${ groupIdx }`} id={`message-${groupIdx}`} className="mt-10 mb-6 flex flex-col items-end w-full group/user scroll-m-20">
                    <div className="bg-[#2A2A2A] text-[#E8E6E3] px-5 py-3.5 rounded-[24px] rounded-tr-[8px] ml-auto max-w-[85%] text-[15.5px] shadow-[0_4px_20px_rgba(0,0,0,0.2)] leading-relaxed whitespace-pre-wrap relative border border-white/5 select-text selection:bg-[#E2765A]/30">
                      {first.text}
                      <div className="absolute -bottom-8 right-0 flex items-center gap-1 opacity-0 group-hover/user:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/user:pointer-events-auto">
                        <Tooltip text="Copy message">
                          <button onClick={() => navigator.clipboard.writeText(first.text)} className="p-1.5 text-[#8C8A88] hover:text-[#E8E6E3] bg-white/5 hover:bg-white/10 rounded-md transition-all border border-white/5 backdrop-blur-sm">
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </Tooltip>
                      </div>
                    </div>
                  </div>
                );
              }

              const isThinkingTurn = isThinking && groupIdx === groups.length - 1;
              let processLogs = group;
              let finalAnswer = null;
              let tailLogs: any[] = [];

              const answerIndices = group.map((l, i) => l.type === 'answer' ? i : -1).filter(i => i !== -1);
              if (answerIndices.length > 0) {
                const firstIdx = answerIndices[0];
                const lastIdx = answerIndices[answerIndices.length - 1];
                processLogs = group.slice(0, firstIdx);
                finalAnswer = { type: 'answer', text: answerIndices.map(i => group[i].text).join('\n\n') };
                tailLogs = group.slice(lastIdx + 1).filter(l => l.type !== 'answer');
              } else {
                const lastThoughtIdx = [...group].reverse().findIndex(l => l.type === 'thought');
                const actualLastThoughtIdx = lastThoughtIdx === -1 ? -1 : group.length - 1 - lastThoughtIdx;
                processLogs = actualLastThoughtIdx === -1 ? group : group.slice(0, actualLastThoughtIdx);
                finalAnswer = actualLastThoughtIdx === -1 ? null : group[actualLastThoughtIdx];
                tailLogs = actualLastThoughtIdx === -1 ? [] : group.slice(actualLastThoughtIdx + 1);
              }

              const displayProcessLogs = processLogs;
              const displayFinalAnswer = finalAnswer;

              // Extract ask_user events from process logs for inline rendering
              const askUserLogs = group.filter(l => l.type === 'ask_user');
              const nonAskLogs = displayProcessLogs.filter(l => l.type !== 'ask_user');

              return (
                <div key={`group-${ groupIdx }`} id={`message-${groupIdx}`} className="w-full flex flex-col mb-8 scroll-m-20 relative">
                  {nonAskLogs.length > 0 && (
                    <ThinkingProcess logs={nonAskLogs} isThinking={isThinkingTurn} isLast={groupIdx === groups.length - 1} />
                  )}

                  {/* Render Ask User prompts inline */}
                  {askUserLogs.map((askLog: any, askIdx: number) => (
                    <AskUserPrompt
                      key={`ask-${groupIdx}-${askIdx}`}
                      question={askLog.question}
                      mode={askLog.mode || 'text'}
                      options={askLog.options || []}
                      context={askLog.context}
                      defaultValue={askLog.defaultValue}
                      urgent={askLog.urgent}
                      timestamp={askLog.timestamp}
                      onAnswer={(answer) => {
                        console.log('[ChatFeed] User answered ask_user:', answer);
                      }}
                    />
                  ))}

                  {displayFinalAnswer && (
                    <div className="w-full group/assistant">
                      <div className="relative group/thought">
                        <div className="text-[15.5px] leading-relaxed text-[#E8E6E3] font-sans">
                          <ProfessionalThought
                            text={displayFinalAnswer.text}
                            isLatest={groupIdx === groups.length - 1 && !isThinking}
                            isThinking={false}
                            variant="answer"
                          />
                        </div>
                        <div className="flex items-center gap-1 mt-4 opacity-0 group-hover/thought:opacity-100 transition-opacity duration-300">
                          <Tooltip text="Regenerate">
                            <button className="p-1.5 text-[#8C8A88] hover:text-[#E8E6E3] hover:bg-white/10 rounded-md transition-colors"><RefreshCw className="w-4 h-4" /></button>
                          </Tooltip>
                          <Tooltip text="Copy output">
                            <button onClick={() => navigator.clipboard.writeText(displayFinalAnswer.text)} className="p-1.5 text-[#8C8A88] hover:text-[#E8E6E3] hover:bg-white/10 rounded-md transition-colors"><Copy className="w-4 h-4" /></button>
                          </Tooltip>
                        </div>
                      </div>
                    </div>
                  )}

                </div>
              );
            })}

            <div ref={messagesEndRef} className="h-[2px]" />
          </div>
        )}
    </div>
  );
};
