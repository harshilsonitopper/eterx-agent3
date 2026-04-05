import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { MessageCircleQuestion, Send, Check, ChevronRight, Clock, Zap } from 'lucide-react';

interface AskUserOption {
  label: string;
  description?: string;
  value: string;
}

interface AskUserProps {
  question: string;
  mode: 'choice' | 'text' | 'confirm';
  options?: AskUserOption[];
  context?: string;
  defaultValue?: string;
  urgent?: boolean;
  timestamp: number;
  onAnswer: (answer: string, selectedOption?: AskUserOption) => void;
}

export const AskUserPrompt: React.FC<AskUserProps> = ({
  question,
  mode,
  options = [],
  context,
  defaultValue,
  urgent,
  timestamp,
  onAnswer
}) => {
  const [textInput, setTextInput] = useState(defaultValue || '');
  const [selectedOption, setSelectedOption] = useState<AskUserOption | null>(null);
  const [answered, setAnswered] = useState(false);
  const [answeredValue, setAnsweredValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    // Auto-focus input when shown
    setTimeout(() => {
      if (mode === 'text') {
        textareaRef.current?.focus();
      }
    }, 300);
  }, [mode]);

  const handleSubmit = (answer: string, option?: AskUserOption) => {
    if (answered) return;
    setAnswered(true);
    setAnsweredValue(answer);
    
    // Send answer to the API
    fetch('/api/agent/answer', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        responseKey: `ask_user_${timestamp}`,
        answer,
        selectedOption: option || null
      })
    }).catch(err => console.error('[AskUser] Failed to send answer:', err));

    onAnswer(answer, option);
  };

  if (answered) {
    return (
      <motion.div
        initial={{ opacity: 1 }}
        animate={{ opacity: 0.7 }}
        className="w-full bg-[#1A1A1A]/60 backdrop-blur-sm rounded-2xl border border-white/5 p-4 my-3"
      >
        <div className="flex items-center gap-2 text-[13px] text-[#8C8A88]">
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-[#A3A19E]">Answered:</span>
          <span className="text-[#E8E6E3] font-medium">{answeredValue}</span>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className={`w-full rounded-2xl border backdrop-blur-xl my-4 overflow-hidden ${
        urgent 
          ? 'bg-gradient-to-br from-[#2A1A1A] to-[#1A1A1A] border-amber-500/30 shadow-[0_0_20px_rgba(245,158,11,0.1)]' 
          : 'bg-gradient-to-br from-[#1A1F2E] to-[#1A1A1A] border-blue-500/20 shadow-[0_8px_30px_rgba(0,0,0,0.3)]'
      }`}
    >
      {/* Header */}
      <div className="flex items-center gap-3 px-5 pt-4 pb-2">
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${
          urgent 
            ? 'bg-amber-500/15 text-amber-400' 
            : 'bg-blue-500/15 text-blue-400'
        }`}>
          {urgent ? <Zap className="w-4 h-4" /> : <MessageCircleQuestion className="w-4 h-4" />}
        </div>
        <div className="flex-1">
          <div className={`text-[11px] font-semibold uppercase tracking-wider ${
            urgent ? 'text-amber-400/70' : 'text-blue-400/60'
          }`}>
            {urgent ? 'Agent needs your input (urgent)' : 'Agent has a question'}
          </div>
        </div>
      </div>

      {/* Question */}
      <div className="px-5 py-3">
        <p className="text-[15px] text-[#E8E6E3] leading-relaxed font-medium">
          {question}
        </p>
        {context && (
          <p className="text-[12px] text-[#8C8A88] mt-2 leading-relaxed italic">
            {context}
          </p>
        )}
      </div>

      {/* Answer Area */}
      <div className="px-5 pb-5 pt-1">
        <AnimatePresence mode="wait">
          {/* CHOICE MODE */}
          {mode === 'choice' && options.length > 0 && (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-2"
            >
              {options.map((option, i) => (
                <motion.button
                  key={option.value}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.08, duration: 0.3 }}
                  onClick={() => handleSubmit(option.value, option)}
                  className={`w-full text-left px-4 py-3 rounded-xl border transition-all duration-200 group flex items-center gap-3 ${
                    selectedOption?.value === option.value
                      ? 'bg-blue-500/15 border-blue-500/40 text-white'
                      : 'bg-white/[0.03] border-white/[0.06] text-[#C8C6C3] hover:bg-white/[0.07] hover:border-white/[0.12] hover:text-white active:scale-[0.98]'
                  }`}
                >
                  <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                    selectedOption?.value === option.value
                      ? 'bg-blue-500/25 text-blue-400'
                      : 'bg-white/5 text-[#555350] group-hover:bg-white/10 group-hover:text-[#A3A19E]'
                  }`}>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[14px] font-medium">{option.label}</div>
                    {option.description && (
                      <div className="text-[12px] text-[#8C8A88] mt-0.5 truncate">{option.description}</div>
                    )}
                  </div>
                </motion.button>
              ))}
            </motion.div>
          )}

          {/* TEXT MODE */}
          {mode === 'text' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="space-y-3"
            >
              <div className="relative">
                <textarea
                  ref={textareaRef}
                  value={textInput}
                  onChange={(e) => setTextInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (textInput.trim()) handleSubmit(textInput.trim());
                    }
                  }}
                  placeholder={defaultValue ? `Default: ${defaultValue}` : 'Type your answer...'}
                  rows={2}
                  className="w-full bg-white/[0.04] border border-white/[0.08] rounded-xl px-4 py-3 text-[14px] text-[#E8E6E3] placeholder:text-[#555350] resize-none focus:outline-none focus:border-blue-500/30 focus:ring-1 focus:ring-blue-500/20 transition-all"
                />
              </div>
              <div className="flex items-center gap-2 justify-end">
                {defaultValue && (
                  <button
                    onClick={() => handleSubmit(defaultValue)}
                    className="px-3 py-1.5 text-[12px] text-[#8C8A88] hover:text-[#E8E6E3] hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5"
                  >
                    <Clock className="w-3 h-3" />
                    Use default
                  </button>
                )}
                <button
                  onClick={() => textInput.trim() && handleSubmit(textInput.trim())}
                  disabled={!textInput.trim()}
                  className={`px-4 py-2 rounded-xl text-[13px] font-medium flex items-center gap-2 transition-all ${
                    textInput.trim()
                      ? 'bg-blue-500/20 text-blue-300 hover:bg-blue-500/30 border border-blue-500/30 active:scale-95'
                      : 'bg-white/5 text-[#555350] border border-white/5 cursor-not-allowed'
                  }`}
                >
                  <Send className="w-3.5 h-3.5" />
                  Send
                </button>
              </div>
            </motion.div>
          )}

          {/* CONFIRM MODE */}
          {mode === 'confirm' && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="flex items-center gap-3"
            >
              <button
                onClick={() => handleSubmit('yes')}
                className="flex-1 px-4 py-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-[14px] font-medium hover:bg-emerald-500/20 hover:border-emerald-500/30 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              >
                <Check className="w-4 h-4" />
                Yes, proceed
              </button>
              <button
                onClick={() => handleSubmit('no')}
                className="flex-1 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-[14px] font-medium hover:bg-red-500/20 hover:border-red-500/30 transition-all active:scale-[0.97] flex items-center justify-center gap-2"
              >
                No, skip
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
};
