import React, { useState } from 'react';
import { X, Plus, Pin, Mic, ArrowUp, Folder } from 'lucide-react';

const FileChip = ({ name, type, onRemove }) => (
  <div className="flex items-center bg-[#1e1e1e] border border-[#333] rounded-2xl px-3 py-2 mr-3 mb-3 group relative hover:border-[#444] transition-all cursor-pointer">
    <div className="bg-blue-500 p-2 rounded-lg mr-3">
      <div className="text-white w-4 h-4 flex items-center justify-center">
        <svg fill="none" stroke="currentColor" viewBox="0 0 24 24" className="w-4 h-4"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
      </div>
    </div>
    <div className="flex flex-col">
      <span className="text-white text-sm font-medium truncate max-w-[120px]">{name}</span>
      <span className="text-gray-500 text-[10px] uppercase">{type}</span>
    </div>
    <button 
      onClick={onRemove}
      className="absolute -top-2 -right-2 bg-[#333] text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity border border-[#444]"
    >
      <X size={12} />
    </button>
  </div>
);

const App = () => {
  const [files, setFiles] = useState([
    { name: 'Professional_Repo...', type: 'DOCX' },
    { name: 'SKILL (1).md', type: 'MD' },
    { name: 'SKILL.md', type: 'MD' },
  ]);
  const [inputValue, setInputValue] = useState('');

  const removeFile = (index) => {
    setFiles(files.filter((_, i) => i !== index));
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-white font-sans p-8 flex flex-col items-center justify-end">
      {/* Chat Area */}
      <div className="w-full max-w-4xl flex-1 flex flex-col justify-end mb-8 overflow-y-auto">
        <div className="space-y-6 mb-20">
          <div className="text-gray-300 font-mono text-sm leading-relaxed max-w-3xl">
            <p className="mb-2">google/gemma-4-26b-it</p>
            <p className="mb-4">•</p>
            <p className="mb-2">google/gemma-4-26b</p>
            <p className="mb-2">3. Configuration Summary</p>
            <p className="mb-4">If you are putting this into a .env or config.json file, use this:</p>
            <pre className="bg-[#151515] p-4 rounded-xl border border-[#222] text-blue-400">
{`{
  "model_name": "gemma-4-26b-it",
  "temperature": 0.7,
}`}
            </pre>
          </div>
        </div>
      </div>

      {/* Main Input Container */}
      <div className="w-full max-w-4xl relative">
        {/* File Bar */}
        <div className="flex flex-wrap mb-4">
          {files.map((file, i) => (
            <FileChip key={i} {...file} onRemove={() => removeFile(i)} />
          ))}
        </div>

        {/* Input Box */}
        <div className="bg-[#121212] border border-[#222] rounded-[32px] p-4 shadow-2xl transition-all focus-within:border-[#333]">
          <textarea 
            className="w-full bg-transparent border-none outline-none text-gray-300 placeholder-gray-600 resize-none text-lg px-2 py-1"
            placeholder="Ask EterX to Work"
            rows="1"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
          />
          
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-3">
              <button className="p-2 text-gray-500 hover:text-white hover:bg-[#222] rounded-full transition-all">
                <Plus size={20} />
              </button>
              <button className="p-2 text-gray-500 hover:text-white hover:bg-[#222] rounded-full transition-all">
                <Pin size={20} />
              </button>
              
              {/* Folder Chip */}
              <div className="flex items-center bg-[#1e1e1e] border border-[#333] rounded-full px-3 py-1.5 ml-2 group cursor-pointer hover:border-[#444] transition-all">
                <Folder size={14} className="text-gray-400 mr-2" />
                <span className="text-xs text-gray-300 mr-2">ai-diet-planner</span>
                <X size={12} className="text-gray-500 group-hover:text-white" />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <button className="px-4 py-1.5 bg-[#1e1e1e] border border-[#333] rounded-full text-xs font-medium text-gray-400 hover:text-white hover:bg-[#252525] transition-all">
                Think
              </button>
              <button className="p-2 text-gray-500 hover:text-white hover:bg-[#222] rounded-full transition-all">
                <Mic size={20} />
              </button>
              <button className="p-2 bg-white text-black rounded-full hover:bg-gray-200 transition-all">
                <ArrowUp size={20} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default App;
