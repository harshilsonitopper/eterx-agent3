import React, { useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Mic, StopCircle, FileText, X } from 'lucide-react';
import { Tooltip } from '../ui/tooltip';

interface Attachment {
  file: File;
  preview: string;
}

interface ChatInputProps {
  inputValue: string;
  setInputValue: (val: string) => void;
  isThinking: boolean;
  isRecording: boolean;
  handleSend: () => void;
  handleStop: () => void;
  toggleSpeech: () => void;
  attachments: Attachment[];
  setAttachments: React.Dispatch<React.SetStateAction<Attachment[]>>;
  greeting: string;
  traceLogsLength: number;
}

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue, setInputValue, isThinking, isRecording, handleSend, handleStop,
  toggleSpeech, attachments, setAttachments, greeting, traceLogsLength
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).map(file => ({
        file,
        preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : ''
      }));
      setAttachments(prev => [...prev, ...newFiles]);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeAttachment = (index: number) => {
    setAttachments(prev => {
      const newArr = [...prev];
      if (newArr[index].preview) URL.revokeObjectURL(newArr[index].preview);
      newArr.splice(index, 1);
      return newArr;
    });
  };

  return (
    <div className={`absolute left-0 right-0 w-full flex flex-col items-center z-30 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${ traceLogsLength === 0
      ? 'top-[45%] -translate-y-1/2 px-4 sm:px-12'
      : 'bottom-0 pb-6 pt-12 px-4 sm:px-12 bg-gradient-to-t from-[#0A0A0A] via-[#0A0A0A]/90 to-transparent'
      }`}>

      <AnimatePresence>
        {traceLogsLength === 0 && !isThinking && (
          <motion.div
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20, filter: 'blur(5px)', scale: 0.95 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center mb-8 w-full max-w-[800px] pointer-events-none"
          >
            <div className="flex items-center gap-4">
              <div className="w-[48px] h-[48px] relative drop-shadow-[0_0_15px_rgba(226,118,90,0.5)]">
                <img src="/logo.png" alt="EterX Logo" className="w-full h-full object-contain" />
              </div>
              <h1 className="text-[44px] text-[#E8E6E3] font-serif tracking-tight leading-none font-medium text-transparent bg-clip-text bg-gradient-to-r from-white to-[#A3A19E]">
                {greeting}, harshil
              </h1>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="w-full max-w-[800px] flex flex-col pointer-events-auto relative">
        <AnimatePresence>
          {attachments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: 10, height: 0 }}
              className="flex flex-wrap gap-2 px-1 mb-2"
            >
              {attachments.map((att, i) => (
                <div key={i} className="relative group rounded-xl border border-white/10 bg-black/40 backdrop-blur-md p-1.5 pr-3 shadow-sm hover:shadow-md hover:border-[#E2765A]/40 transition-all duration-300 h-12 flex items-center gap-2.5 hover:-translate-y-0.5 cursor-pointer">
                  {att.preview ? (
                    <div className="w-8 h-8 rounded-lg overflow-hidden flex-shrink-0 border border-white/10 group-hover:border-white/20 transition-colors">
                      <img src={att.preview} alt="preview" className="w-full h-full object-cover transform group-hover:scale-110 transition-transform duration-500" />
                    </div>
                  ) : (
                    <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center flex-shrink-0 border border-white/5">
                      <FileText className="w-4 h-4 text-[#A3A19E]" />
                    </div>
                  )}
                  <div className="flex flex-col overflow-hidden max-w-[120px]">
                    <span className="text-[11.5px] text-[#E8E6E3] font-medium truncate">{att.file.name}</span>
                    <span className="text-[9.5px] text-[#8C8A88]">{(att.file.size / 1024).toFixed(1)} KB</span>
                  </div>
                  <button
                    onClick={() => removeAttachment(i)}
                    className="absolute -top-2 -right-2 bg-[#E2765A] text-white rounded-full p-1 opacity-0 group-hover:opacity-100 transition-opacity shadow-md hover:scale-110 active:scale-90"
                  >
                    <X className="w-[10px] h-[10px]" strokeWidth={3} />
                  </button>
                </div>
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        <div className={`w-full bg-[#1A1A1A] rounded-[32px] shadow-2xl flex flex-col pt-4 pb-2 transition-all duration-300 ${ isRecording ? 'border-[#E2765A]/50 ring-2 ring-[#E2765A]/20' : 'border border-white/5 focus-within:border-white/10' }`}>
          <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />

          <div className="px-5 pb-2">
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={isRecording ? "Listening..." : "Ask EterX to generate"}
              className={`w-full bg-transparent text-[16px] placeholder:text-[#8C8A88] focus:outline-none placeholder:font-normal min-h-[44px] max-h-[250px] resize-none overflow-y-auto custom-scrollbar leading-relaxed ${ isRecording ? 'text-[#E2765A]' : 'text-[#E8E6E3]' }`}
              rows={Math.min(6, Math.max(1, inputValue.split('\n').length))}
              style={{ caretColor: '#E2765A' }}
            />
          </div>

          <div className="flex items-center justify-between px-3 mt-1">
            <div className="flex items-center gap-1.5">
              <Tooltip text="Attach files" side="top">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="p-2 text-[#A3A19E] hover:text-white rounded-full transition-all group"
                >
                  <Plus className="w-[18px] h-[18px]" strokeWidth={2.5} />
                </button>
              </Tooltip>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip text="Voice input" side="top">
                 <button onClick={toggleSpeech} className={`p-2.5 rounded-full hover:bg-white/5 transition-all text-[#A3A19E] hover:text-white ${isRecording ? 'text-[#E2765A] animate-pulse' : ''}`}>
                    <Mic className="w-[18px] h-[18px]" strokeWidth={2} />
                 </button>
              </Tooltip>
              {isThinking ? (
                <Tooltip text="Stop generation" side="top">
                  <button onClick={handleStop} className="w-[34px] h-[34px] ml-1 flex items-center justify-center rounded-full text-white bg-white/10 hover:bg-white/20 transition-all shadow-sm">
                    <StopCircle className="w-[16px] h-[16px]" strokeWidth={2.5} />
                  </button>
                </Tooltip>
              ) : (
                <Tooltip text={inputValue.trim() || attachments.length > 0 ? "Send message" : "Use voice input"} side="top">
                  <button
                    onClick={() => {
                      if (!inputValue.trim() && attachments.length === 0) return;
                      handleSend();
                    }}
                    className={`w-[34px] h-[34px] ml-1 flex items-center justify-center rounded-full transition-all duration-500 ease-out ${ (inputValue.trim() || attachments.length > 0) ? 'bg-white text-black hover:scale-105 active:scale-95 shadow-md' : 'bg-white/10 text-[#555350] opacity-50 cursor-pointer' }`}
                  >
                     <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14m-7-7 7 7-7 7" /></svg>
                  </button>
                </Tooltip>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
