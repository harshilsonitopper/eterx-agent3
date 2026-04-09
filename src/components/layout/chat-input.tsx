import React, { useRef, useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Mic, StopCircle, FileText, X, ArrowUp, Check, Brain, Zap, Pin, Folder, File as FileIcon, Loader2 } from 'lucide-react';
import { Tooltip } from '../ui/tooltip';

interface Attachment {
  file: File;
  preview: string;
  uploadStatus?: 'uploading' | 'done' | 'error';
  fileUri?: string;
  localPath?: string;
  inlineData?: { mimeType: string; data: string };
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
  agentMode?: 'think' | 'fast';
  onModeChange?: (mode: 'think' | 'fast') => void;
  pinnedItems?: any[];
  setPinnedItems?: (items: any[]) => void;
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
            <X className="w-4 h-4" />
          </button>
          <button onClick={acceptVoice} className="p-2 text-[#8C8A88] hover:text-emerald-400 rounded-full transition-colors active:scale-95">
            <Check className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
};

export const ChatInput: React.FC<ChatInputProps> = ({
  inputValue, setInputValue, isThinking, isRecording, handleSend, handleStop,
  toggleSpeech, attachments, setAttachments, greeting, traceLogsLength,
  isProcessingVoice = false, audioVolume = 0, cancelVoice = () => {}, acceptVoice = () => {},
  agentMode = 'think', onModeChange = () => {},
  pinnedItems = [], setPinnedItems = () => {}
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [showPinMenu, setShowPinMenu] = useState(false);
  const [openPillDrop, setOpenPillDrop] = useState<'files' | 'folders' | null>(null);
  const [isOverflowing, setIsOverflowing] = useState(false);

  // Pre-upload a file to Gemini in the background
  const preUploadFile = useCallback(async (file: File, index: number) => {
    try {
      const filePath = (file as any).path;
      let body: any = { fileName: file.name, mimeType: file.type || 'application/octet-stream' };

      if (filePath) {
        body.filePath = filePath;
      } else {
        // Convert to base64 for clipboard/browser files
        const arrayBuffer = await file.arrayBuffer();
        const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
        body.fileData = base64;
      }

      const res = await fetch('/api/media/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });

      if (res.ok) {
        const data = await res.json();
        setAttachments(prev => prev.map((att, i) => i === index ? {
          ...att,
          uploadStatus: 'done' as const,
          fileUri: data.fileUri || undefined,
          localPath: data.localPath,
          inlineData: data.inlineData || undefined
        } : att));
      } else {
        setAttachments(prev => prev.map((att, i) => i === index ? { ...att, uploadStatus: 'error' as const } : att));
      }
    } catch {
      setAttachments(prev => prev.map((att, i) => i === index ? { ...att, uploadStatus: 'error' as const } : att));
    }
  }, [setAttachments]);

  // Attach files and immediately start pre-upload
  const addFilesAndUpload = useCallback((files: File[]) => {
    const startIdx = attachments.length;
    const newAttachments = files.map(file => ({
      file,
      preview: file.type.startsWith('image/') ? URL.createObjectURL(file) : '',
      uploadStatus: 'uploading' as const,
    }));
    setAttachments(prev => [...prev, ...newAttachments]);

    // Fire pre-uploads in parallel
    files.forEach((file, i) => {
      preUploadFile(file, startIdx + i);
    });
  }, [attachments.length, setAttachments, preUploadFile]);

  useEffect(() => {
    const handleClickOutside = () => {
      setOpenPillDrop(null);
      setShowPinMenu(false);
    };
    if (openPillDrop || showPinMenu) {
      window.addEventListener('click', handleClickOutside);
    }
    return () => window.removeEventListener('click', handleClickOutside);
  }, [openPillDrop, showPinMenu]);

  // Auto-resize textarea dynamically based on scrollHeight
  useEffect(() => {
    if (textareaRef.current) {
      // Reset height to correctly recalculate
      textareaRef.current.style.height = '1px';
      const scrollHeight = textareaRef.current.scrollHeight;
      const newHeight = Math.max(24, Math.min(scrollHeight, 250)); // Min 24px, Max 250px
      textareaRef.current.style.height = `${newHeight}px`;
      setIsOverflowing(scrollHeight > 250);
    }
  }, [inputValue]);

  // Generate a random ID for items
  const genId = () => Math.random().toString(36).substr(2, 9);

  const handlePinFolder = async () => {
    setShowPinMenu(false);
    if ((window as any).electronAPI) {
      const folderPath = await (window as any).electronAPI.selectFolder();
      if (folderPath && !pinnedItems.find(i => i.path === folderPath)) {
        setPinnedItems([
          ...pinnedItems,
          {
            id: genId(),
            type: 'folder',
            path: folderPath,
            name: folderPath.split(/[/\\]/).pop() || 'Folder'
          }
        ]);
      }
    } else {
      alert("Folder pinning requires the EterX desktop app.");
    }
  };

  const handlePinFiles = async () => {
    setShowPinMenu(false);
    if ((window as any).electronAPI) {
      const filePaths = await (window as any).electronAPI.selectFiles();
      if (filePaths && filePaths.length > 0) {
        const newItems = filePaths
          .filter((fp: string) => !pinnedItems.find(i => i.path === fp))
          .map((fp: string) => ({
            id: genId(),
            type: 'file',
            path: fp,
            name: fp.split(/[/\\]/).pop() || 'File'
          }));
        
        if (newItems.length > 0) {
          setPinnedItems([...pinnedItems, ...newItems]);
        }
      }
    } else {
      alert("File pinning requires the EterX desktop app.");
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      addFilesAndUpload(Array.from(e.target.files));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    if (e.clipboardData.files && e.clipboardData.files.length > 0) {
      e.preventDefault();
      addFilesAndUpload(Array.from(e.clipboardData.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      addFilesAndUpload(Array.from(e.dataTransfer.files));
    }
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

        <div className={`w-full bg-[#161616] rounded-[32px] flex flex-col ${attachments.length > 0 ? 'pt-1' : 'pt-4'} pb-2 transition-all duration-300 ease-out shadow-[0_10px_30px_rgba(0,0,0,0.5)] ${ isRecording ? 'border-[#E2765A]/50 ring-4 ring-[#E2765A]/10' : 'border border-white/5 hover:border-white/10 focus-within:border-white/20 focus-within:shadow-[0_10px_40px_rgba(0,0,0,0.7)]' }`}>
          <input type="file" multiple ref={fileInputRef} onChange={handleFileSelect} className="hidden" />

          <AnimatePresence>
            {attachments.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 5, height: 0 }}
                animate={{ opacity: 1, y: 0, height: 'auto' }}
                exit={{ opacity: 0, y: 5, height: 0 }}
                className="relative w-full pt-1"
              >
                {/* Horizontal Scrolling Fumes */}
                <div className="absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-[#161616] to-transparent pointer-events-none z-10 rounded-tl-[32px]" />
                <div className="absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-[#161616] to-transparent pointer-events-none z-10 rounded-tr-[32px]" />

                <div className="flex items-center gap-3 px-5 pb-3 pt-2 overflow-x-auto w-full [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
                  {attachments.map((att, i) => {
                    const isImage = !!att.preview;
                    const extension = att.file.name.split('.').pop()?.toUpperCase() || 'FILE';
                    const isPdf = extension === 'PDF';
                    const isUploading = att.uploadStatus === 'uploading';
                    const isDone = att.uploadStatus === 'done';

                    if (isImage) {
                      return (
                        <div key={i} className="relative group w-[56px] h-[56px] shrink-0 rounded-2xl shadow-sm hover:shadow-md transition-all cursor-pointer border border-white/10">
                          <img src={att.preview} alt="preview" className={`w-full h-full object-cover rounded-2xl transition-all ${isUploading ? 'opacity-60' : 'opacity-100'}`} />
                          {/* Upload Status Overlay */}
                          {isUploading && (
                            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-black/30">
                              <Loader2 className="w-5 h-5 text-white animate-spin" />
                            </div>
                          )}
                          {isDone && (
                            <motion.div
                              initial={{ opacity: 1, scale: 1.2 }}
                              animate={{ opacity: 0, scale: 0.8 }}
                              transition={{ duration: 1.2, delay: 0.3 }}
                              className="absolute inset-0 flex items-center justify-center rounded-2xl bg-emerald-500/20"
                            >
                              <Check className="w-4 h-4 text-emerald-400" strokeWidth={3} />
                            </motion.div>
                          )}
                          <button
                            onClick={() => removeAttachment(i)}
                            className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] flex items-center justify-center bg-white border border-[#2A2A2A] text-black hover:scale-110 rounded-full transition-all shadow-[0_4px_10px_rgba(0,0,0,0.5)] z-20"
                          >
                            <X className="w-2.5 h-2.5" strokeWidth={3} />
                          </button>
                        </div>
                      );
                    }

                    return (
                      <div key={i} className="relative group w-[200px] shrink-0 h-[56px] rounded-2xl bg-[#2A2A2A] border border-white/[0.08] shadow-sm hover:border-white/[0.15] transition-all flex items-center p-2 cursor-pointer">
                        <div className={`w-[40px] h-[40px] rounded-[10px] flex items-center justify-center shrink-0 border border-white/5 ${isPdf ? 'bg-[#EF4444]' : 'bg-[#007AFF]'}`}>
                          {isUploading ? (
                            <Loader2 className="w-5 h-5 text-white animate-spin" />
                          ) : (
                            <FileText className="w-5 h-5 text-white" strokeWidth={2} />
                          )}
                        </div>
                        
                        <div className="flex flex-col overflow-hidden ml-3 justify-center h-full w-full pr-1">
                          <span className="text-[13px] font-medium text-[#E8E6E3] truncate tracking-wide leading-tight">{att.file.name}</span>
                          <span className={`text-[11px] font-medium truncate mt-0.5 ${isUploading ? 'text-blue-400' : isDone ? 'text-emerald-400' : 'text-[#8C8A88]'}`}>
                            {isUploading ? 'Uploading...' : isDone ? 'Ready' : extension}
                          </span>
                        </div>
                        
                        <button
                          onClick={() => removeAttachment(i)}
                          className="absolute -top-1.5 -right-1.5 w-[18px] h-[18px] flex items-center justify-center bg-white border border-[#2A2A2A] text-black hover:scale-110 rounded-full transition-all shadow-[0_4px_10px_rgba(0,0,0,0.5)] z-20"
                        >
                          <X className="w-2.5 h-2.5" strokeWidth={3} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

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
                <div className="relative w-full">
                  {isOverflowing && (
                    <div className="absolute -top-1 left-0 right-3 h-10 bg-gradient-to-b from-[#161616] via-[#161616]/90 to-transparent pointer-events-none z-10" />
                  )}
                  <motion.textarea
                    ref={textareaRef}
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
                    onPaste={handlePaste}
                    onDragOver={handleDragOver}
                    onDrop={handleDrop}
                    placeholder="Ask EterX to Work"
                    className="w-full bg-transparent text-[16px] text-[#E8E6E3] placeholder:text-[#555350] focus:outline-none placeholder:font-normal min-h-[24px] max-h-[250px] resize-none overflow-y-auto custom-scrollbar leading-relaxed transition-colors duration-300 relative z-0 py-1"
                    style={{ caretColor: '#E2765A', height: '24px' }}
                  />
                  {isOverflowing && (
                    <div className="absolute -bottom-1 left-0 right-3 h-10 bg-gradient-to-t from-[#161616] via-[#161616]/90 to-transparent pointer-events-none z-10" />
                  )}
                </div>
              )}
            </AnimatePresence>
          </div>

          <div className="flex items-center justify-between px-3 mt-1 relative z-10 transition-all duration-300">
            <div className="flex items-center gap-1.5">
              <Tooltip text="Attach files" side="top">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-[34px] h-[34px] flex items-center justify-center text-[#A3A19E] bg-white/[0.04] border border-white/[0.06] hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] active:bg-white/[0.12] active:scale-95 rounded-full transition-all duration-300 group shadow-sm"
                >
                  <Plus className="w-[18px] h-[18px] transition-transform duration-300 group-hover:scale-110" strokeWidth={2.5} />
                </button>
              </Tooltip>
              <div className="relative">
                <Tooltip text="Pin folder or files" side="top">
                  <button
                    onClick={(e) => { e.stopPropagation(); setShowPinMenu(!showPinMenu); }}
                    className={`w-[34px] h-[34px] flex items-center justify-center rounded-full transition-all duration-300 group shadow-sm border ${showPinMenu || pinnedItems.length > 0 ? 'bg-white/[0.1] border-white/[0.15] text-white' : 'text-[#A3A19E] bg-white/[0.04] border-white/[0.06] hover:text-white hover:bg-white/[0.08] hover:border-white/[0.12] active:bg-white/[0.12] active:scale-95'}`}
                  >
                    <Pin className="w-[16px] h-[16px] transition-transform duration-300 group-hover:scale-110" strokeWidth={2.5} />
                  </button>
                </Tooltip>

                <AnimatePresence>
                  {showPinMenu && (
                    <motion.div
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute bottom-full left-0 mb-3 w-[160px] bg-[#1A1A1A]/95 backdrop-blur-xl border border-white/10 rounded-xl shadow-[0_10px_40px_rgba(0,0,0,0.5)] overflow-hidden z-50 flex flex-col p-1.5"
                    >
                      <button onClick={handlePinFolder} className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-[#E8E6E3] hover:bg-white/10 rounded-lg transition-colors text-left w-full">
                        <Folder className="w-4 h-4 text-[#A78BFA]" /> Pin Folder
                      </button>
                      <button onClick={handlePinFiles} className="flex items-center gap-2.5 px-3 py-2 text-[13px] font-medium text-[#E8E6E3] hover:bg-white/10 rounded-lg transition-colors text-left w-full">
                        <FileIcon className="w-4 h-4 text-[#FCD34D]" /> Pin Files
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Folders and Files Pills */}
              <AnimatePresence>
                {(() => {
                  const folders = pinnedItems.filter(i => i.type === 'folder');
                  const files = pinnedItems.filter(i => i.type === 'file');
                  
                  return (
                    <div className="flex items-center gap-1.5 ml-1.5 flex-wrap">
                      {/* FOLDERS PILL */}
                      {folders.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, width: 0, scale: 0.9 }}
                          animate={{ opacity: 1, width: 'auto', scale: 1 }}
                          exit={{ opacity: 0, width: 0, scale: 0.9 }}
                          className="flex items-center h-[34px] group relative"
                        >
                          <div className="flex items-center gap-2 px-3 h-full bg-white/[0.06] border border-white/[0.1] rounded-full shadow-sm hover:bg-white/[0.08] transition-colors cursor-pointer"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (folders.length > 1) {
                                   setOpenPillDrop(openPillDrop === 'folders' ? null : 'folders');
                                 }
                               }}
                          >
                            <Folder className="w-[14px] h-[14px] text-[#A78BFA] shrink-0" strokeWidth={2.5} />
                            <span className="text-[12px] font-medium text-[#E8E6E3] truncate max-w-[120px] tracking-wide">
                              {folders.length === 1 ? folders[0].name : `${folders.length} folders`}
                            </span>
                            <button onClick={(e) => { 
                                e.stopPropagation(); 
                                if (folders.length === 1) {
                                  setPinnedItems(pinnedItems.filter(i => i.type !== 'folder'));
                                } else {
                                  // Clicking X on a multi-item pill removes all of them
                                  setPinnedItems(pinnedItems.filter(i => i.type !== 'folder'));
                                  setOpenPillDrop(null);
                                }
                              }} className="ml-0.5 p-0.5 text-[#8C8A88] hover:text-[#E2765A] rounded-full transition-colors shrink-0">
                              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                            </button>
                          </div>
                          
                          {/* Folder Click Menu */}
                          <AnimatePresence>
                            {openPillDrop === 'folders' && folders.length > 1 && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="absolute bottom-full left-0 mb-2 flex flex-col bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-[12px] shadow-[0_10px_30px_rgba(0,0,0,0.7)] z-50 p-1 w-max max-w-[220px] max-h-[300px] overflow-y-auto custom-scrollbar overflow-x-hidden"
                              >
                                {folders.map(f => (
                                  <div key={f.id} className="flex items-center px-2 py-1.5 hover:bg-white/5 rounded-[8px] group/item transition-colors">
                                    <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-2">
                                      <Folder className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />
                                      <span className="text-[11px] text-[#E8E6E3] truncate">{f.name}</span>
                                    </div>
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      const newItems = pinnedItems.filter(i => i.id !== f.id);
                                      setPinnedItems(newItems);
                                      if (newItems.filter(i => i.type === 'folder').length <= 1) setOpenPillDrop(null);
                                    }} className="ml-auto flex-shrink-0 text-[#8C8A88] hover:text-[#E2765A] opacity-0 group-hover/item:opacity-100 transition-opacity">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}

                      {/* FILES PILL */}
                      {files.length > 0 && (
                        <motion.div
                          initial={{ opacity: 0, width: 0, scale: 0.9 }}
                          animate={{ opacity: 1, width: 'auto', scale: 1 }}
                          exit={{ opacity: 0, width: 0, scale: 0.9 }}
                          className="flex items-center h-[34px] group relative"
                        >
                          <div className="flex items-center gap-2 px-3 h-full bg-white/[0.06] border border-white/[0.1] rounded-full shadow-sm hover:bg-white/[0.08] transition-colors cursor-pointer"
                               onClick={(e) => {
                                 e.stopPropagation();
                                 if (files.length > 1) {
                                   setOpenPillDrop(openPillDrop === 'files' ? null : 'files');
                                 }
                               }}
                          >
                            <FileIcon className="w-[14px] h-[14px] text-[#FCD34D] shrink-0" strokeWidth={2.5} />
                            <span className="text-[12px] font-medium text-[#E8E6E3] truncate max-w-[120px] tracking-wide">
                              {files.length === 1 ? files[0].name : `${files.length} files`}
                            </span>
                            <button onClick={(e) => { 
                                e.stopPropagation(); 
                                if (files.length === 1) {
                                  setPinnedItems(pinnedItems.filter(i => i.type !== 'file'));
                                } else {
                                  setPinnedItems(pinnedItems.filter(i => i.type !== 'file'));
                                  setOpenPillDrop(null);
                                }
                              }} className="ml-0.5 p-0.5 text-[#8C8A88] hover:text-[#E2765A] rounded-full transition-colors shrink-0">
                              <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                            </button>
                          </div>
                          
                          {/* Files Click Menu */}
                          <AnimatePresence>
                            {openPillDrop === 'files' && files.length > 1 && (
                              <motion.div 
                                initial={{ opacity: 0, y: 10, scale: 0.95 }}
                                animate={{ opacity: 1, y: 0, scale: 1 }}
                                exit={{ opacity: 0, y: 10, scale: 0.95 }}
                                transition={{ duration: 0.2 }}
                                className="absolute bottom-full left-0 mb-2 flex flex-col bg-[#1A1A1A]/95 backdrop-blur-2xl border border-white/10 rounded-[12px] shadow-[0_10px_30px_rgba(0,0,0,0.7)] z-50 p-1 w-max max-w-[220px] max-h-[300px] overflow-y-auto custom-scrollbar overflow-x-hidden"
                              >
                                {files.map(f => (
                                  <div key={f.id} className="flex items-center px-2 py-1.5 hover:bg-white/5 rounded-[8px] group/item transition-colors">
                                    <div className="flex items-center gap-2 overflow-hidden min-w-0 pr-2">
                                      <FileIcon className="w-3.5 h-3.5 text-[#FCD34D] shrink-0" />
                                      <span className="text-[11px] text-[#E8E6E3] truncate">{f.name}</span>
                                    </div>
                                    <button onClick={(e) => {
                                      e.stopPropagation();
                                      const newItems = pinnedItems.filter(i => i.id !== f.id);
                                      setPinnedItems(newItems);
                                      if (newItems.filter(i => i.type === 'file').length === 0) setOpenPillDrop(null);
                                    }} className="ml-auto flex-shrink-0 text-[#8C8A88] hover:text-[#E2765A] opacity-0 group-hover/item:opacity-100 transition-opacity">
                                      <X className="w-3 h-3" />
                                    </button>
                                  </div>
                                ))}
                              </motion.div>
                            )}
                          </AnimatePresence>
                        </motion.div>
                      )}
                    </div>
                  );
                })()}
              </AnimatePresence>
            </div>

            <div className="flex items-center gap-1">
              {/* Think / Fast Mode Selector */}
              <Tooltip text={agentMode === 'think' ? 'Switch to Fast mode' : 'Switch to Think mode'} side="top">
                <button
                  onClick={() => onModeChange(agentMode === 'think' ? 'fast' : 'think')}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.06] hover:border-white/[0.12] backdrop-blur-sm transition-all duration-300 group mr-1"
                >
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={agentMode}
                      initial={{ opacity: 0, scale: 0.8, rotate: -20 }}
                      animate={{ opacity: 1, scale: 1, rotate: 0 }}
                      exit={{ opacity: 0, scale: 0.8, rotate: 20 }}
                      transition={{ duration: 0.2 }}
                      className="flex items-center gap-1.5"
                    >
                      {agentMode === 'think' ? (
                          <span className="text-[12px] font-medium text-[#E8E6E3] group-hover:text-white tracking-wide transition-colors">Think</span>
                      ) : (
                          <span className="text-[12px] font-medium text-[#E8E6E3] group-hover:text-white tracking-wide transition-colors">Fast</span>
                      )}
                    </motion.div>
                  </AnimatePresence>
                </button>
              </Tooltip>
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
                    className={`w-[34px] h-[34px] ml-1 flex items-center justify-center rounded-full transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${ (inputValue.trim() || attachments.length > 0) ? 'bg-white text-black hover:bg-[#E8E6E3] hover:scale-105 active:scale-95 shadow-sm' : 'bg-white/5 text-[#555350] hover:bg-white/10 hover:text-[#8C8A88] cursor-not-allowed opacity-50' }`}
                  >
                    <ArrowUp className={`w-[18px] h-[18px] transition-all duration-300 ${ (inputValue.trim() || attachments.length > 0) ? 'text-black scale-110' : 'text-white/20' }`} strokeWidth={2.5} />
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
