import React, { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Mic, StopCircle, FileText, X, ArrowUp, Check } from 'lucide-react';
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
  isProcessingVoice?: boolean;
  audioVolume?: number;
  cancelVoice?: () => void;
  acceptVoice?: () => void;
}

const VoiceWaveform = ({ volume, isProcessing, cancelVoice, acceptVoice }: { volume: number, isProcessing: boolean, cancelVoice: () => void, acceptVoice: () => void }) => {
  const [volumes, setVolumes] = useState<number[]>(new Array(50).fill(2));
  
  useEffect(() => {
    if (!isProcessing) {
       // Scale volume to match max height of ~24px
       setVolumes(prev => [...prev.slice(1), Math.max(2, Math.min(24, volume / 2.5))]);
    }
  }, [volume, isProcessing]);

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="flex items-center justify-between w-full px-2 py-0.5 min-h-[44px]"
    >
      <div className="flex-1 flex items-center justify-center gap-[3px] h-[30px] overflow-hidden px-4">
        {isProcessing ? (
           <motion.div 
             initial={{opacity: 0}} animate={{opacity: 1}} 
             className="flex items-center justify-center gap-1.5 h-full"
           >
             {[0, 1, 2].map((dot) => (
               <motion.div
                 key={dot}
                 className="w-2 h-2 bg-[#E8E6E3] rounded-full opacity-70"
                 animate={{ scale: [1, 1.4, 1], opacity: [0.7, 1, 0.7] }}
                 transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut', delay: dot * 0.2 }}
               />
             ))}
           </motion.div>
        ) : (
           volumes.map((v, i) => (
             <motion.div 
               key={i} 
               className="w-[3px] rounded-full"
               style={{ backgroundColor: v > 15 ? '#E2765A' : '#A3A19E' }} 
               animate={{ height: v + 'px' }} 
               transition={{ type: 'tween', duration: 0.08, ease: 'linear' }}
             />
           ))
        )}
      </div>
      
      {!isProcessing && (
        <div className="flex items-center gap-1">
          <button onClick={cancelVoice} className="p-2 text-[#8C8A88] hover:text-[#E2765A] rounded-full transition-colors active:scale-95">
            <X className="w-[18px] h-[18px]" strokeWidth={2.5} />
          </button>
          <button onClick={acceptVoice} className="p-2 text-[#8C8A88] hover:text-white rounded-full transition-colors active:scale-95">
            <Check className="w-[18px] h-[18px]" strokeWidth={2.5} />
          </button>
        </div>
      )}
    </motion.div>
  );
};

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue, setInputValue, isThinking, isRecording, handleSend, handleStop,
  toggleSpeech, attachments, setAttachments, greeting, traceLogsLength,
  isProcessingVoice = false, audioVolume = 0, cancelVoice = () => {}, acceptVoice = () => {}
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
    <div className={`absolute left-0 right-0 w-full flex flex-col items-center z-30 ${ traceLogsLength === 0
      ? 'top-[45%] -translate-y-1/2 px-4 sm:px-12'
      : 'bottom-0 pb-6 pt-12 px-4 sm:px-12 bg-gradient-to-t from-[#050505] via-[#050505]/95 to-transparent'
      }`}>

      {traceLogsLength === 0 && !isThinking && (
        <div className="flex flex-col items-center mb-8 w-full max-w-[800px] pointer-events-none">
          <div className="flex items-center gap-4">
            <div className="w-[48px] h-[48px] relative">
              <img src="/logo.png" alt="EterX Logo" className="w-full h-full object-contain" />
            </div>
            <h1 className="text-[44px] text-[#E8E6E3] font-serif tracking-tight leading-[1.2] pb-1 font-medium text-transparent bg-clip-text bg-gradient-to-r from-white to-[#A3A19E]">
              {greeting}, harshil
            </h1>
          </div>
        </div>
      )}

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

        <div className={`w-full bg-[#161616] rounded-[32px] flex flex-col pt-4 pb-2 transition-all duration-300 ease-out shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${ isRecording ? 'border-[#E2765A]/50 ring-4 ring-[#E2765A]/10' : 'border border-white/5 hover:border-white/10 focus-within:border-white/20 focus-within:shadow-[0_10px_40px_rgba(0,0,0,0.7)]' }`}>
          <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />

          <div className="px-5 pb-2 min-h-[44px] flex items-center">
            <AnimatePresence mode="wait">
              {(isRecording || isProcessingVoice) ? (
                <VoiceWaveform 
                  key="waveform"
                  volume={audioVolume} 
                  isProcessing={isProcessingVoice} 
                  cancelVoice={cancelVoice} 
                  acceptVoice={acceptVoice} 
                />
              ) : (
                <motion.textarea
                  key="textarea"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder="Ask EterX to Work"
                  className="w-full bg-transparent text-[16px] text-[#E8E6E3] placeholder:text-[#555350] focus:outline-none placeholder:font-normal min-h-[24px] max-h-[250px] resize-none overflow-y-auto custom-scrollbar leading-relaxed transition-colors duration-300"
                  rows={Math.min(6, Math.max(1, inputValue.split('\n').length))}
                  style={{ caretColor: '#E2765A' }}
                />
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between px-3 mt-1 relative z-10 transition-all duration-300">
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
                <button onClick={toggleSpeech} className={`p-2.5 rounded-full hover:bg-white/5 transition-all text-[#A3A19E] hover:text-white ${ isRecording ? 'text-[#E2765A] animate-pulse' : '' }`}>
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
                    className={`w-[34px] h-[34px] ml-1 flex items-center justify-center rounded-full transition-all duration-500 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${ (inputValue.trim() || attachments.length > 0) ? 'bg-gradient-to-tr from-white to-[#E8E6E3] text-[#0A0A0A] hover:scale-[1.12] active:scale-[0.88] shadow-[0_5px_20px_rgba(255,255,255,0.3)]' : 'bg-white/5 text-[#555350] hover:bg-white/10 hover:text-[#8C8A88] cursor-not-allowed opacity-50' }`}
                  >
                    <ArrowUp className={`w-[18px] h-[18px] transition-all duration-500 ${ (inputValue.trim() || attachments.length > 0) ? 'text-black scale-110' : 'text-white/20' }`} strokeWidth={3} />
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
