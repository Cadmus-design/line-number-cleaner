import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Clipboard,
  Check,
  Trash2,
  Settings,
  Code,
  Sparkles,
  History,
  Copy,
  RefreshCw,
  FileCode,
  ChevronRight,
  HelpCircle,
  Scissors,
  ArrowRight,
  Info,
  Upload,
  Download,
  FileJson,
  ArrowRightLeft
} from 'lucide-react';
import { PRESET_EXAMPLES, PRESET_TEXT_EXAMPLES } from './data/examples';
import { cleanCode, purifyText } from './utils/cleaner';
import { CleanPattern, CleanerSettings, TextPurifierSettings, HistoryItem } from './types';

// Default settings
const DEFAULT_SETTINGS: CleanerSettings = {
  pattern: 'Auto',
  customRegex: '^\\s*\\d+[:.)]\\s?',
  trimLines: false,
  removeBlankLines: false,
  autoCopy: true,
  preserveIndent: true,
  stripMarkdown: true,
  stripBullets: false,
  newlineMode: 'enter'
};

const DEFAULT_TEXT_SETTINGS: TextPurifierSettings = {
  removeLeadingSpaces: true,
  removeTrailingSpaces: true,
  collapseNewlines: true,
  removeLineBreakInParagraph: false,
  removeSpacesBetweenChinese: true,
  normalizeSpaces: true,
  stripEmoji: false,
  stripBullets: false,
  autoCopy: true,
  newlineMode: 'enter'
};

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

export default function App() {
  // Application states
  const [activeTab, setActiveTab] = useState<'code' | 'text' | 'tsv'>(() => {
    const saved = localStorage.getItem('codestripper_active_tab');
    return (saved === 'code' || saved === 'text' || saved === 'tsv') ? saved : 'code';
  });
  const [tsvInput, setTsvInput] = useState('');
  const [tsvOutput, setTsvOutput] = useState('');
  const [tsvError, setTsvError] = useState<string | null>(null);
  const tsvFileInputRef = useRef<HTMLInputElement>(null);
  const [inputText, setInputText] = useState('');
  const [settings, setSettings] = useState<CleanerSettings>(() => {
    const saved = localStorage.getItem('code_cleaner_settings');
    if (saved) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });
  const [textSettings, setTextSettings] = useState<TextPurifierSettings>(() => {
    const saved = localStorage.getItem('text_purifier_settings');
    if (saved) {
      try {
        return { ...DEFAULT_TEXT_SETTINGS, ...JSON.parse(saved) };
      } catch (e) {
        return DEFAULT_TEXT_SETTINGS;
      }
    }
    return DEFAULT_TEXT_SETTINGS;
  });
  const [history, setHistory] = useState<HistoryItem[]>(() => {
    const saved = localStorage.getItem('code_cleaner_history_v2');
    return saved ? JSON.parse(saved) : [];
  });
  const [isCopied, setIsCopied] = useState(false);
  const [isPasted, setIsPasted] = useState(false);
  const [showSettingsHelp, setShowSettingsHelp] = useState(false);
  const [regexError, setRegexError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // References
  const outputRef = useRef<HTMLTextAreaElement>(null);
  const copyTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Save active tab
  useEffect(() => {
    localStorage.setItem('codestripper_active_tab', activeTab);
  }, [activeTab]);

  // Save settings on change
  useEffect(() => {
    localStorage.setItem('code_cleaner_settings', JSON.stringify(settings));
  }, [settings]);

  // Save text settings on change
  useEffect(() => {
    localStorage.setItem('text_purifier_settings', JSON.stringify(textSettings));
  }, [textSettings]);

  // Save history on change
  useEffect(() => {
    localStorage.setItem('code_cleaner_history_v2', JSON.stringify(history));
  }, [history]);

  // Clean timeout references
  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
    };
  }, []);

  // Check custom regex validity
  useEffect(() => {
    if (settings.pattern === 'Custom' && settings.customRegex) {
      try {
        new RegExp(settings.customRegex);
        setRegexError(null);
      } catch (e: any) {
        setRegexError(e.message || 'Invalid Regular Expression');
      }
    } else {
      setRegexError(null);
    }
  }, [settings.pattern, settings.customRegex]);

  const convertTsvToJson = () => {
    if (!tsvInput.trim()) { setTsvOutput(''); setTsvError('請輸入 TSV 資料。'); return; }
    try {
      const lines = tsvInput.trim().split('\n');
      const headers = lines[0].split('\t').map(h => h.trim());
      if (headers.length === 0 || (headers.length === 1 && headers[0] === ''))
        throw new Error('找不到欄位標題。');
      const result = [];
      for (let i = 1; i < lines.length; i++) {
        const cols = lines[i].split('\t');
        if (cols.length === 1 && cols[0].trim() === '') continue;
        const obj: Record<string, string> = {};
        headers.forEach((h, j) => { obj[h] = cols[j] !== undefined ? cols[j].trim() : ''; });
        result.push(obj);
      }
      setTsvOutput(JSON.stringify(result, null, 2));
      setTsvError(null);
    } catch (err: any) {
      setTsvError(err.message || '轉換錯誤');
      setTsvOutput('');
    }
  };

  // Real-time Clean Calculation
  const result = useMemo(() => {
    if (activeTab === 'code') {
      return cleanCode(inputText, settings);
    } else if (activeTab === 'text') {
      const cleaned = purifyText(inputText, textSettings);
      return {
        cleanedText: cleaned,
        detectedPattern: 'Text Purify',
        detectionConfidence: undefined
      };
    } else {
      return { cleanedText: '', detectedPattern: '', detectionConfidence: undefined };
    }
  }, [inputText, settings, textSettings, activeTab]);

  const { cleanedText, detectedPattern, detectionConfidence } = result;

  // Clipboard operations
  const handleCopy = async (textToCopy: string = cleanedText) => {
    if (!textToCopy) return;
    try {
      const mode = activeTab === 'code' ? settings.newlineMode : textSettings.newlineMode;
      const selectMode = mode || 'enter';

      if (selectMode === 'shiftEnter') {
        // Standard normal line break mode (soft returns in rich-text / markdown editors)
        await navigator.clipboard.writeText(textToCopy);
      } else {
        // Parse & reconstruct text
        let plainText = textToCopy;
        if (selectMode === 'doubleEnter') {
          // Double-newline mode for Markdown and block note-taking editors like Blinko, Flomo, Obsidian
          const lines = textToCopy.split(/\r?\n/);
          const reconstructedLines: string[] = [];
          for (let i = 0; i < lines.length; i++) {
            if (lines[i].trim() === '') {
              // Avoid compounding empty lines
              if (reconstructedLines.length > 0 && reconstructedLines[reconstructedLines.length - 1] === '') {
                continue;
              }
              reconstructedLines.push('');
            } else {
              reconstructedLines.push(lines[i]);
            }
          }
          plainText = reconstructedLines.join('\r\n\r\n');
        } else {
          // 'enter' mode: Standard CRLF line endings
          plainText = textToCopy.replace(/\r?\n/g, '\r\n');
        }

        // Generate HTML paragraph tags for rich text editors (Word, Excel, Slack, Notion)
        // This ensures they paste as separate blocks
        const htmlLines = (selectMode === 'doubleEnter' ? plainText : textToCopy).split(/\r?\n/);
        const htmlContent = htmlLines.map(line => {
          if (line.trim() === '') {
            return '<p>&nbsp;</p>';
          }
          const leadingMatch = line.match(/^([ \t]+)/);
          const leadingSpaces = leadingMatch ? leadingMatch[1] : '';
          const trailingText = line.substring(leadingSpaces.length);
          const escapedText = escapeHtml(trailingText);
          const padding = '&nbsp;'.repeat(leadingSpaces.length);
          return `<p style="margin: 0 0 8px 0; font-family: monospace; white-space: pre;">${padding}${escapedText}</p>`;
        }).join('');

        if (navigator.clipboard && window.ClipboardItem) {
          try {
            const textBlob = new Blob([plainText], { type: 'text/plain' });
            const htmlBlob = new Blob([htmlContent], { type: 'text/html' });
            const item = new ClipboardItem({
              'text/plain': textBlob,
              'text/html': htmlBlob
            });
            await navigator.clipboard.write([item]);
          } catch (blobErr) {
            // Fallback for sandboxed frames or strict browser permission blocks
            await navigator.clipboard.writeText(plainText);
          }
        } else {
          await navigator.clipboard.writeText(plainText);
        }
      }

      setIsCopied(true);
      if (copyTimeoutRef.current) clearTimeout(copyTimeoutRef.current);
      copyTimeoutRef.current = setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      // Absolute fallback using writeText
      try {
        await navigator.clipboard.writeText(textToCopy);
        setIsCopied(true);
      } catch (fallbackErr) {
        console.error('Absolute fallback copy failed: ', fallbackErr);
      }
    }
  };

  const handlePaste = async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setInputText(text);
        setIsPasted(true);
        setTimeout(() => setIsPasted(false), 1500);

        // Auto copy feature
        const isAutoCopy = activeTab === 'code' ? settings.autoCopy : textSettings.autoCopy;
        if (isAutoCopy) {
          const cleanResultText = activeTab === 'code'
            ? cleanCode(text, settings).cleanedText
            : purifyText(text, textSettings);
          if (cleanResultText) {
            await handleCopy(cleanResultText);
          }
        }
      }
    } catch (err) {
      // Browser permissions fallback - guide user
      alert('請直接按 Ctrl+V (或 Cmd+V) 貼到左邊的文字框中。由於瀏覽器安全限制，我們無法直接讀取您的剪貼簿。');
    }
  };

  // Process and save to history
  const handleSaveToHistory = () => {
    if (!inputText.trim() || !cleanedText.trim()) return;
    
    // Avoid exact duplicate consecutive history
    if (history.length > 0 && history[0].originalText === inputText) {
      return;
    }

    const newItem: HistoryItem = {
      id: Date.now().toString(),
      timestamp: Date.now(),
      originalText: inputText,
      cleanedText: cleanedText,
      detectedPattern: activeTab === 'code'
        ? `${detectedPattern} ${detectionConfidence ? `(${detectionConfidence}%)` : ''}`
        : 'Text Purify',
      mode: activeTab
    };

    setHistory(prev => [newItem, ...prev].slice(0, 50)); // cap at 50 list items
  };

  // Clear inputs
  const handleClear = () => {
    setInputText('');
  };

  // Load Preset
  const handleLoadPreset = (preset: typeof PRESET_EXAMPLES[0]) => {
    setInputText(preset.text);
    const isAutoCopy = activeTab === 'code' ? settings.autoCopy : textSettings.autoCopy;
    if (isAutoCopy) {
      const cleanResultText = activeTab === 'code'
        ? cleanCode(preset.text, settings).cleanedText
        : purifyText(preset.text, textSettings);
      if (cleanResultText) {
        setTimeout(() => handleCopy(cleanResultText), 100);
      }
    }
  };

  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleClearAllHistory = () => {
    setHistory([]);
  };

  return (
    <div className="min-h-screen bg-elegant-dark text-elegant-gray font-sans flex flex-col selection:bg-elegant-cyan selection:text-elegant-dark">
      
      {/* Background Subtle Tech Ambient Gradients */}
      <div className="fixed inset-0 pointer-events-none opacity-[0.02] bg-[radial-gradient(#ffffff_1px,transparent_1px)] [background-size:32px_32px] z-0" />
      <div className="fixed top-0 left-1/3 w-[600px] h-[350px] bg-elegant-cyan/5 rounded-full blur-[140px] pointer-events-none z-0" />
      <div className="fixed bottom-12 right-1/4 w-[500px] h-[300px] bg-elegant-teal/5 rounded-full blur-[120px] pointer-events-none z-0" />

      {/* TOP HEADER BAR (Elegant Dark style) */}
      <header className="border-b border-elegant-border bg-elegant-dark/90 backdrop-blur-md sticky top-0 z-40 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-elegant-cyan to-elegant-teal rounded-lg flex items-center justify-center shadow-lg shadow-elegant-cyan/10">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5.5 w-5.5 text-elegant-dark" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M14.121 14.121L19 19m-7-7l7-7m-7 7l-2.879 2.879M12 12L9.121 9.121m0 5.758L5 19m0-14l4.121 4.121" />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight text-white font-display">
                  CODESTRIPPER <span className="text-elegant-cyan">v1.4</span>
                </span>
                <span className="text-[10px] tracking-wider uppercase font-mono bg-elegant-teal/10 text-elegant-teal border border-elegant-teal/30 px-2 py-0.5 rounded">
                  Gemini Tool Suite
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                快速在本地端清除 AI CLI 代碼行號與文章的雜亂空白、空行與不自然段落
              </p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-sm text-[#45A29E]">
            {inputText && (
              <div className="hidden lg:flex items-center gap-2 px-3 py-1 bg-elegant-teal/5 border border-elegant-teal/25 rounded-md text-xs text-elegant-teal">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                {activeTab === 'code' ? (
                  <span>動態格式: <strong className="text-white">{detectedPattern}</strong></span>
                ) : (
                  <span>文本淨化已套用</span>
                )}
              </div>
            )}

            <button
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className={`flex items-center gap-2 px-4 py-2 rounded border border-elegant-border text-xs font-semibold tracking-wide transition-colors ${
                sidebarOpen 
                  ? 'bg-elegant-border text-white border-elegant-teal/40' 
                  : 'bg-transparent text-slate-400 hover:text-white hover:bg-[#1a212a]'
              }`}
            >
              <History className="w-4 h-4 text-elegant-teal" />
              <span>紀錄 ({history.length})</span>
            </button>
          </div>

        </div>
      </header>

      {/* WORKSPACE AREA */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 flex flex-col lg:flex-row gap-6 relative z-10 overflow-hidden">
        
        {/* Main interactive workflow */}
        <div className="flex-1 flex flex-col gap-6">

          {/* Segmented Tab Control */}
          <div className="flex bg-[#0b1016] p-1 rounded-lg border border-elegant-border max-w-2xl mx-auto w-full shadow-lg">
            <button
              onClick={() => { setActiveTab('code'); setInputText(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-xs font-bold tracking-wide transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'bg-gradient-to-r from-elegant-cyan to-elegant-teal text-elegant-dark shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileCode className="w-4 h-4" />
              <span>CLI 程式行號清除</span>
            </button>
            <button
              onClick={() => { setActiveTab('text'); setInputText(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-xs font-bold tracking-wide transition-all cursor-pointer ${
                activeTab === 'text'
                  ? 'bg-gradient-to-r from-elegant-cyan to-elegant-teal text-elegant-dark shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sparkles className="w-4 h-4" />
              <span>AI 文本空白淨化</span>
            </button>
            <button
              onClick={() => { setActiveTab('tsv'); setInputText(''); }}
              className={`flex-1 flex items-center justify-center gap-2 py-2 px-4 rounded-md text-xs font-bold tracking-wide transition-all cursor-pointer ${
                activeTab === 'tsv'
                  ? 'bg-gradient-to-r from-elegant-cyan to-elegant-teal text-elegant-dark shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <FileJson className="w-4 h-4" />
              <span>TSV → JSON</span>
            </button>
          </div>
          
          {/* TSV → JSON Panel */}
          {activeTab === 'tsv' && (
            <div className="flex flex-col gap-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
                {/* TSV Input */}
                <div className="flex flex-col bg-elegant-card border border-elegant-border rounded-xl overflow-hidden shadow-2xl">
                  <div className="px-5 py-3.5 bg-elegant-border/30 border-b border-elegant-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-elegant-teal" />
                      <span className="text-xs font-bold uppercase tracking-widest font-display text-elegant-teal">TSV 輸入</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input type="file" accept=".tsv,.txt,.csv" className="hidden" ref={tsvFileInputRef}
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) => { setTsvInput(ev.target?.result as string); setTsvError(null); };
                          reader.readAsText(file);
                          if (tsvFileInputRef.current) tsvFileInputRef.current.value = '';
                        }}
                      />
                      <button onClick={() => tsvFileInputRef.current?.click()}
                        className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-elegant-cyan bg-elegant-cyan/5 border border-elegant-cyan/30 rounded hover:bg-elegant-cyan hover:text-elegant-dark transition-all cursor-pointer">
                        <Upload className="w-3 h-3" />
                        <span>上傳檔案</span>
                      </button>
                      {tsvInput && (
                        <button onClick={() => { setTsvInput(''); setTsvOutput(''); setTsvError(null); }}
                          className="p-1 text-slate-500 hover:text-rose-400 transition-colors cursor-pointer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={tsvInput}
                    onChange={(e) => { setTsvInput(e.target.value); setTsvError(null); }}
                    placeholder={"貼上 TSV 資料...\nid\tname\tage\n1\tAlice\t28\n2\tBob\t34"}
                    className="w-full flex-1 p-5 bg-transparent outline-none font-mono text-sm leading-relaxed text-slate-300 resize-none min-h-[350px]"
                  />
                  <div className="px-5 py-2.5 bg-elegant-dark/85 border-t border-elegant-border flex justify-between items-center text-[10px] font-mono text-slate-400 select-none">
                    <span>行數: <strong className="text-white">{tsvInput.split('\n').filter(Boolean).length}</strong></span>
                    <span>大小: <strong className="text-white">{tsvInput.length}</strong> 字元</span>
                  </div>
                </div>

                {/* JSON Output */}
                <div className="flex flex-col bg-elegant-dark border border-elegant-border rounded-xl overflow-hidden shadow-2xl">
                  <div className="px-5 py-3.5 bg-[#1F2833]/50 border-b border-elegant-border flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full bg-elegant-cyan" />
                      <span className="text-xs font-bold uppercase tracking-widest font-display text-elegant-cyan">JSON 輸出</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {tsvOutput && (
                        <>
                          <button onClick={() => navigator.clipboard.writeText(tsvOutput)}
                            className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-slate-400 bg-elegant-dark border border-elegant-border rounded hover:bg-elegant-border transition-all cursor-pointer">
                            <Copy className="w-3 h-3" />複製
                          </button>
                          <button onClick={() => {
                            const blob = new Blob([tsvOutput], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = 'converted.json';
                            document.body.appendChild(a); a.click();
                            document.body.removeChild(a); URL.revokeObjectURL(url);
                          }} className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-white bg-elegant-teal rounded hover:bg-elegant-cyan hover:text-elegant-dark transition-all cursor-pointer">
                            <Download className="w-3 h-3" />下載
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                  <textarea
                    value={tsvOutput}
                    readOnly
                    placeholder="// 轉換後的 JSON 會顯示在此..."
                    className="w-full flex-1 p-5 bg-transparent outline-none font-mono text-sm leading-relaxed text-elegant-cyan resize-none select-all cursor-text min-h-[350px]"
                  />
                  <div className="px-5 py-2.5 bg-elegant-card border-t border-elegant-border flex justify-between items-center text-[10px] font-mono text-slate-400 select-none">
                    <span>筆數: <strong className="text-white">{tsvOutput ? JSON.parse(tsvOutput || '[]').length : 0}</strong></span>
                  </div>
                </div>
              </div>

              {tsvError && (
                <div className="p-3 bg-rose-950/40 border border-rose-500/30 text-rose-400 rounded-lg text-sm text-center">{tsvError}</div>
              )}

              <div className="flex justify-center">
                <button onClick={convertTsvToJson}
                  className="flex items-center gap-2 px-8 py-3 text-base font-bold text-elegant-dark bg-gradient-to-r from-elegant-cyan to-elegant-teal rounded-full shadow-lg shadow-elegant-cyan/20 hover:shadow-elegant-cyan/40 transition-all cursor-pointer">
                  <ArrowRightLeft className="w-5 h-5" />
                  轉換為 JSON
                </button>
              </div>
            </div>
          )}

          {/* Preset Buttons Panel (Cyan and Teal details) */}
          <section className={`bg-elegant-card border border-elegant-border rounded-xl p-4.5 shadow-xl shadow-black/40 ${activeTab === 'tsv' ? 'hidden' : ''}`}>
            <span className="text-xs font-mono font-bold text-elegant-teal block mb-3 flex items-center gap-1.5 uppercase tracking-wide">
              <Sparkles className="w-3.5 h-3.5 text-elegant-cyan" />
              {activeTab === 'code' ? '快速載入典型 CLI 格式範例：' : '快速載入典型 AI 亂空白文本範例：'}
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
              {(activeTab === 'code' ? PRESET_EXAMPLES : PRESET_TEXT_EXAMPLES).map((preset, index) => (
                <button
                  key={index}
                  onClick={() => handleLoadPreset(preset)}
                  className="group text-left p-3 rounded-lg bg-elegant-dark/60 hover:bg-[#13171e] border border-elegant-border/70 hover:border-elegant-cyan/40 transition-all text-xs cursor-pointer"
                >
                  <p className="font-semibold text-white group-hover:text-elegant-cyan transition-colors truncate">
                    {preset.title}
                  </p>
                  <span className="text-[10px] text-slate-400 font-mono block mt-1 truncate">
                    {preset.description}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {/* TWO TEXTAREAS WITH WORKSPACE */}
          {activeTab !== 'tsv' && <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
            
            {/* Input card */}
            <div className="flex flex-col bg-elegant-card border border-elegant-border rounded-xl overflow-hidden focus-within:border-elegant-teal/60 transition-colors shadow-2xl">
              <div className="px-5 py-3.5 bg-elegant-border/30 border-b border-elegant-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-elegant-teal" />
                  <span className="text-xs font-bold uppercase tracking-widest font-display text-elegant-teal">
                    {activeTab === 'code' ? '原始帶行號代碼 (CLI Input)' : '原始帶多餘空白文本 (Raw Text)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handlePaste}
                    className="flex items-center gap-1 px-3 py-1 text-xs font-bold text-elegant-cyan bg-elegant-cyan/5 border border-elegant-cyan/30 rounded hover:bg-elegant-cyan hover:text-elegant-dark transition-all cursor-pointer"
                  >
                    <Clipboard className="w-3 h-3" />
                    <span>貼上剪貼簿</span>
                  </button>
                  {inputText && (
                    <button
                      onClick={handleClear}
                      className="p-1 text-slate-500 hover:text-rose-450 transition-colors cursor-pointer"
                      title="清除輸入"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>

              <div className="relative flex-1 min-h-[350px] flex flex-col">
                <textarea
                  id="input-editor"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder={
                    activeTab === 'code'
                      ? "在此貼上您的程式碼片段。範例格式：\n 1: import express from 'express';\n 2: const app = express();\n\n或是點上方「載入 CLI 格式範例」了解詳情！"
                      : "在此貼上帶有多餘空格、空行或不自然排版換行的中文或對話文本。\n\n例如：\n  目前的計畫是：\n   1. 正式上線月份之前：我們進行清理...\n   2. 正式上線月份之後：維持對帳流程...\n\n可點上方「快速載入典型 AI 亂空白文本範例」快速試用！"
                  }
                  className="w-full flex-1 p-5 bg-transparent outline-none font-mono text-sm leading-relaxed text-slate-300 resize-none min-h-[350px]"
                />
                
                {isPasted && (
                  <motion.div 
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="absolute bg-elegant-teal text-elegant-dark text-xs font-bold px-3 py-1.5 rounded shadow-lg bottom-3 left-3 flex items-center gap-1.5 pointer-events-none"
                  >
                    <Check className="w-3.5 h-3.5 stroke-[2.5]" />
                    <span>內容已自動貼上！</span>
                  </motion.div>
                )}

                <div className="px-5 py-2.5 bg-elegant-dark/85 border-t border-elegant-border flex justify-between items-center text-[10px] font-mono text-slate-400 select-none">
                  <span>
                    輸入行數: <strong className="text-white">{inputText.split('\n').filter(Boolean).length}</strong> 行
                  </span>
                  <span>
                    大小: <strong className="text-white">{inputText.length}</strong> 字元
                  </span>
                </div>
              </div>
            </div>

            {/* Output card (Clean Elegant Dark) */}
            <div className="flex flex-col bg-elegant-dark border border-elegant-border rounded-xl overflow-hidden focus-within:border-elegant-cyan/60 transition-colors shadow-2xl">
              <div className="px-5 py-3.5 bg-[#1F2833]/50 border-b border-elegant-border flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-elegant-cyan" />
                  <span className="text-xs font-bold uppercase tracking-widest font-display text-elegant-cyan">
                    {activeTab === 'code' ? '乾淨無行號結果 (Sanitized)' : '清洗與美化後結果 (Purified)'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] px-2 py-0.5 rounded bg-elegant-teal/20 text-elegant-cyan font-semibold hidden sm:inline select-none">
                    Ready to Paste
                  </span>
                </div>
              </div>

              <div className="relative flex-1 min-h-[350px] flex flex-col bg-elegant-darker/50">
                <textarea
                  id="output-editor"
                  ref={outputRef}
                  value={cleanedText}
                  readOnly
                  placeholder={
                    activeTab === 'code' 
                      ? "// 清洗出的乾淨代碼將顯示在此..." 
                      : "// 淨化後的潔淨電子郵件、文本將顯示在此..."
                  }
                  className="w-full flex-1 p-5 bg-transparent outline-none font-mono text-sm leading-relaxed text-elegant-cyan resize-none select-all cursor-text min-h-[350px]"
                />

                {/* Detected logic badge Overlay */}
                {inputText && (
                  <div className="absolute top-4 right-4 flex flex-col items-end gap-2">
                    <span className="px-3 py-1.5 bg-elegant-card border border-elegant-border text-[10px] font-mono rounded shadow-lg text-white flex items-center gap-1.5">
                      <Sparkles className="w-3 h-3 text-elegant-cyan" />
                      {activeTab === 'code' ? (
                        <>偵測為 <strong>{detectedPattern}</strong></>
                      ) : (
                        <>文本格式已自動淨化</>
                      )}
                    </span>
                    {activeTab === 'code' && detectionConfidence !== undefined && settings.pattern === 'Auto' && (
                      <span className="px-2 py-0.5 bg-elegant-card text-[9px] text-slate-400 font-mono rounded border border-elegant-border/80 shadow">
                        信心度: <strong className={detectionConfidence > 70 ? 'text-elegant-cyan' : 'text-amber-500'}>{detectionConfidence}%</strong>
                      </span>
                    )}
                  </div>
                )}

                <div className="px-5 py-2.5 bg-elegant-card border-t border-elegant-border flex justify-between items-center text-[10px] font-mono text-slate-400 select-none">
                  <span>
                    輸出行數: <strong className="text-white">{cleanedText.split('\n').filter(Boolean).length}</strong> 行
                  </span>
                  <div className="flex items-center gap-2">
                    {(activeTab === 'code' ? settings.autoCopy : textSettings.autoCopy) && (
                      <span className="bg-elegant-cyan/15 text-elegant-cyan border border-elegant-cyan/20 px-2 py-0.5 rounded text-[8px] tracking-wider uppercase font-bold">
                        ⚡ 貼上自動複製
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>

          </div>}

          {/* DOCK OPTIONS PANEL (Styled in Dark Elegant) */}
          {activeTab !== 'tsv' && <section className="bg-elegant-card border border-elegant-border rounded-xl p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-elegant-border pb-4 mb-6 select-none">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-elegant-cyan" />
                <h3 className="text-base font-bold font-display text-white tracking-wide">
                  {activeTab === 'code' ? '過濾規則與正則設定 (Settings)' : '文本空白與空行規則 (Settings)'}
                </h3>
              </div>
              <button
                onClick={() => setShowSettingsHelp(!showSettingsHelp)}
                className="text-xs text-slate-400 hover:text-elegant-cyan flex items-center gap-1 transition-colors cursor-pointer"
              >
                <HelpCircle className="w-4 h-4" />
                <span>怎麼使用？</span>
              </button>
            </div>

            <AnimatePresence>
              {showSettingsHelp && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="overflow-hidden mb-6"
                >
                  <div className="bg-[#121c24] border border-elegant-teal/30 p-4 rounded-lg text-xs leading-relaxed text-slate-300 shadow-inner">
                    <p className="font-bold text-white mb-1.5 flex items-center gap-1">
                      <Info className="w-3.5 h-3.5 text-elegant-cyan" />
                      {activeTab === 'code' ? '行號清除器說明' : '文本空白淨化器說明'}
                    </p>
                    {activeTab === 'code' ? (
                      <>
                        <p className="mb-2">
                          當 AI CLI 產出程式片段時（或從特定 IDE 複製代碼時），程式前會代行號如 <code className="text-elegant-cyan font-mono">1: const a = 1</code>。本程式會在點擊<strong>「貼上剪貼簿」</strong>之後，自動為您精準清除首碼。
                        </p>
                        <p>
                          如果開啟了「貼上時自動清洗+自動複製」，貼入原始片段後會直接清好代碼並寫回您的系統剪貼簿。
                        </p>
                      </>
                    ) : (
                      <>
                        <p className="mb-2">
                          專為處理 AI 寫作、翻譯、或郵件輸出時產生的雜亂多重空白、不自然空格而設計。
                        </p>
                        <ul className="list-disc list-inside space-y-1 text-slate-400">
                          <li><strong>去除半形空格：</strong> 自動剔除中文和中文、中文和中文標點間因格式轉換莫名夾雜的空格。</li>
                          <li><strong>段落合併折行：</strong> 清除句中的不正常折行，但保留雙換行的段落架構，完美左對齊。</li>
                          <li><strong>收緊連續空行：</strong> 壓縮過多的換行，只保留清爽的單一空行，並依需求清除表情符號。</li>
                          <li><strong>剝除清單與序列：</strong> 一鍵剝除行首清單符號（如 <code className="text-elegant-cyan font-mono">-</code>、<code className="text-elegant-cyan font-mono">*</code>）、數字排版序列（如 <code className="text-elegant-cyan font-mono">1.</code>、<code className="text-elegant-cyan font-mono">(1)</code>）及單獨干擾數字，方便直貼 Slack、Teams 發言。</li>
                        </ul>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {activeTab === 'code' ? (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Patterns selection */}
                <div className="lg:col-span-12 xl:col-span-7 flex flex-col gap-4">
                  <span className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
                    1. 選擇或指定匹配格式 Pattern
                  </span>
                  
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    
                    {/* AUTO */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Auto' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Auto'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg shadow-elegant-cyan/5'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">✨ 自動偵測</span>
                      <span className="text-[9px] font-mono opacity-80">常規最佳選擇</span>
                    </button>

                    {/* COLON */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Colon' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Colon'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">1: 冒號 style</span>
                      <span className="text-[10px] font-mono text-slate-400 truncate w-full">1: main()...</span>
                    </button>

                    {/* DOT */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Dot' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Dot'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">1. 點點 style</span>
                      <span className="text-[10px] font-mono text-slate-400 truncate w-full">1. func()...</span>
                    </button>

                    {/* PIPE */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Pipe' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Pipe'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">01 | 直線 style</span>
                      <span className="text-[10px] font-mono text-slate-400 truncate w-full">01 | import...</span>
                    </button>

                    {/* BRACKET */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Bracket' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Bracket'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">[1] 中括號 style</span>
                      <span className="text-[10px] font-mono text-slate-400 truncate w-full">[1] class...</span>
                    </button>

                    {/* PARENTHESIS */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Parenthesis' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Parenthesis'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">(1) 括號 style</span>
                      <span className="text-[10px] font-mono text-slate-400 truncate w-full">(1) echo...</span>
                    </button>

                    {/* RAWNUMBER */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'RawNumber' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'RawNumber'
                          ? 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">1 純數字 style</span>
                      <span className="text-[10px] font-mono text-slate-400 truncate w-full">1 print...</span>
                    </button>

                    {/* CUSTOM */}
                    <button
                      onClick={() => setSettings(prev => ({ ...prev, pattern: 'Custom' }))}
                      className={`px-3.5 py-4 rounded-lg border text-left transition-all flex flex-col justify-between h-[85px] cursor-pointer ${
                        settings.pattern === 'Custom'
                          ? 'bg-gradient-to-tr from-[#66FCF1]/10 to-[#45A29E]/10 border-elegant-cyan text-white shadow-lg'
                          : 'bg-elegant-darker/60 border-elegant-border hover:border-slate-700 text-slate-450 hover:text-white'
                      }`}
                    >
                      <span className="text-xs font-bold font-display">⚙️ 自訂 Regular</span>
                      <span className="text-[9px] font-mono text-elegant-cyan">客製 regex 規則</span>
                    </button>

                  </div>

                  {settings.pattern === 'Custom' && (
                    <motion.div
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="mt-1"
                    >
                      <label className="text-[10px] font-mono text-slate-400 block mb-1.5">
                        自訂行首正則表達式 Regular Expression (會對每行首字元匹配並刪除)：
                      </label>
                      <input
                        type="text"
                        value={settings.customRegex}
                        onChange={(e) => setSettings(prev => ({ ...prev, customRegex: e.target.value }))}
                        className={`w-full p-2.5 bg-elegant-dark border rounded font-mono text-xs text-white focus:outline-none focus:border-elegant-cyan ${
                          regexError ? 'border-rose-500/50 focus:border-rose-500' : 'border-elegant-border'
                        }`}
                        placeholder="例如: ^\\s*\\d+[:.)]\\s?"
                      />
                      {regexError ? (
                        <p className="text-[10px] text-rose-450 mt-1">{regexError}</p>
                      ) : (
                        <p className="text-[10px] text-slate-500 mt-1">
                          提示: 請帶入轉義後的反斜線，例如 <code className="text-slate-450 font-mono">^\s*\d+\|?\s?</code> 代表行首的空白與管線。
                        </p>
                      )}
                    </motion.div>
                  )}
                </div>

                {/* Advanced settings toggles */}
                <div className="lg:col-span-12 xl:col-span-5 flex flex-col gap-4">
                  <span className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
                    2. 過濾喜好設定 Settings
                  </span>

                  <div className="flex flex-col gap-3">
                    
                    {/* NEWLINE MODE FOR CODE */}
                    <div className="flex flex-col p-3 bg-[#131922] border border-elegant-border rounded-lg hover:border-slate-700 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex flex-col pr-3">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            換行複製格式 (Newline Copy Format)
                            <span className="bg-elegant-cyan/25 text-elegant-cyan border border-elegant-cyan/35 px-1.5 py-0.2 rounded text-[8px] font-bold">OPTIMAL</span>
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            選擇在目標編輯器或記事軟體貼上時，行與行之間的換行處理類型
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, newlineMode: 'enter' }))}
                          className={`px-2 py-2 text-[9px] font-bold rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center text-center leading-tight ${
                            (settings.newlineMode ?? 'enter') === 'enter'
                              ? 'bg-elegant-cyan/15 text-elegant-cyan border-elegant-cyan/50 shadow-[0_0_10px_rgba(20,250,210,0.1)]'
                              : 'bg-[#0b0f14] text-slate-450 border-elegant-border hover:border-slate-750'
                          }`}
                        >
                          <span className="font-bold">獨立段落 (Enter)</span>
                          <span className="text-[7.5px] opacity-75 font-normal mt-0.5">適合 Slack / Notion 訊息</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, newlineMode: 'doubleEnter' }))}
                          className={`px-2 py-2 text-[9px] font-bold rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center text-center leading-tight ${
                            settings.newlineMode === 'doubleEnter'
                              ? 'bg-elegant-cyan/15 text-elegant-cyan border-elegant-cyan/50 shadow-[0_0_10px_rgba(20,250,210,0.1)]'
                              : 'bg-[#0b0f14] text-slate-450 border-elegant-border hover:border-slate-750'
                          }`}
                        >
                          <span className="font-bold">強制雙換行 (Enter×2)</span>
                          <span className="text-[7.5px] opacity-75 font-normal mt-0.5">專為 Blinko / Markdown</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setSettings(prev => ({ ...prev, newlineMode: 'shiftEnter' }))}
                          className={`px-2 py-2 text-[9px] font-bold rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center text-center leading-tight ${
                            settings.newlineMode === 'shiftEnter'
                              ? 'bg-elegant-cyan/15 text-elegant-cyan border-elegant-cyan/50 shadow-[0_0_10px_rgba(20,250,210,0.1)]'
                              : 'bg-[#0b0f14] text-slate-450 border-elegant-border hover:border-slate-750'
                          }`}
                        >
                          <span className="font-bold">同塊折行 (S+Enter)</span>
                          <span className="text-[7.5px] opacity-75 font-normal mt-0.5">傳統連續文字單塊</span>
                        </button>
                      </div>
                    </div>
                    
                    {/* AUTO COPY */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          貼上時自動清洗與複製 (Auto-Copy)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          點擊貼上時，一秒完成清洗，並自動將乾淨成品寫入剪貼簿
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.autoCopy}
                        onChange={(e) => setSettings(prev => ({ ...prev, autoCopy: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* REMOVE MARKDOWN SHIELD */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          剝除 Markdown 程式碼框 (Strip Markdown)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          如果貼上的文字前後包含 ``` 區塊語法，會自動為您剝除
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.stripMarkdown}
                        onChange={(e) => setSettings(prev => ({ ...prev, stripMarkdown: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* SQUEEZE BLANK LINES */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          去除無內文空行 (Remove Empty Lines)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          直接過濾並拿掉代碼之中完全為空的片段，使代碼緊湊
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.removeBlankLines}
                        onChange={(e) => setSettings(prev => ({ ...prev, removeBlankLines: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* FORCE TRIM */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          強制去除每行首尾空格 (Trim Line Whitespace)
                        </span>
                        <span className="text-[10px] text-amber-500 font-semibold mt-0.5">
                          ⚠️ 這會將程式的進排/縮排清空 (不適用於 Python)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.trimLines}
                        onChange={(e) => setSettings(prev => ({ ...prev, trimLines: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* STRIP BULLETS AND SEQUENCES */}
                    <label className="flex items-center justify-between p-3 bg-[#131922] border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          一併進階剝除清單項目符號、引言塊 & 序列 (Strip Bullets)
                          <span className="bg-elegant-teal/30 text-elegant-teal border border-elegant-teal/40 px-1.5 py-0.2 rounded text-[8px] font-bold">NEW</span>
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          在移除代碼行號時，也過濾行首項目符號 (如 *、-、•) 或引言塊 & 側邊線 (如 ▎、&gt;、|)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={settings.stripBullets ?? false}
                        onChange={(e) => setSettings(prev => ({ ...prev, stripBullets: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                  </div>
                </div>

              </div>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                
                {/* Text Purifier Column 1 */}
                <div className="lg:col-span-12 xl:col-span-6 flex flex-col gap-4">
                  <span className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
                    1. 核心空格與縮排排版 Primary Space Cleans
                  </span>

                  <div className="flex flex-col gap-3">
                    
                    {/* LEADING SPACES */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          去除行首縮排/空字元 (Remove Leading Spaces)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          消除 AI 產生的各行段首不對稱縮排 & 空格
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.removeLeadingSpaces}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, removeLeadingSpaces: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* TRAILING SPACES */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          去除行末多餘空格 (Remove Trailing Spaces)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          自動拔除各行結尾不小心懸空的空字元
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.removeTrailingSpaces}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, removeTrailingSpaces: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* CHINESE SPACES CLEANER */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          清除中文旁的「半形空格」 (Clean Chinese Spacing)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          自動移去中文和中文、中文和標點符號間多餘的空格 (例如：『我 正在 進行』合併為『我正在進行』)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.removeSpacesBetweenChinese}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, removeSpacesBetweenChinese: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* NORMALIZE CONSECUTIVE SPACES */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          壓縮連續空格為單一空格 (Reduce Multiple Spaces)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          將正文中不小心打出的雙重或三重空格過濾，保留常規單空格
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.normalizeSpaces}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, normalizeSpaces: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                  </div>
                </div>

                {/* Text Purifier Column 2 */}
                <div className="lg:col-span-12 xl:col-span-6 flex flex-col gap-4">
                  <span className="text-xs font-bold text-slate-400 font-mono tracking-wider uppercase flex items-center gap-1">
                    2. 段落折行與過濾 Advanced Paragraph Layouts
                  </span>

                  <div className="flex flex-col gap-3">
                    
                    {/* NEWLINE MODE FOR TEXT */}
                    <div className="flex flex-col p-3 bg-[#131922] border border-elegant-border rounded-lg hover:border-slate-700 transition-colors">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex flex-col pr-3">
                          <span className="text-xs font-bold text-white flex items-center gap-1.5">
                            換行複製格式 (Newline Copy Format)
                            <span className="bg-elegant-cyan/25 text-elegant-cyan border border-elegant-cyan/35 px-1.5 py-0.2 rounded text-[8px] font-bold">OPTIMAL</span>
                          </span>
                          <span className="text-[10px] text-slate-400 mt-0.5">
                            選擇在目標編輯器或記事軟體貼上時，行與行之間的換行處理類型
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-3 gap-1.5 mt-1">
                        <button
                          type="button"
                          onClick={() => setTextSettings(prev => ({ ...prev, newlineMode: 'enter' }))}
                          className={`px-2 py-2 text-[9px] font-bold rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center text-center leading-tight ${
                            (textSettings.newlineMode ?? 'enter') === 'enter'
                              ? 'bg-elegant-cyan/15 text-elegant-cyan border-elegant-cyan/50 shadow-[0_0_10px_rgba(20,250,210,0.1)]'
                              : 'bg-[#0b0f14] text-slate-450 border-elegant-border hover:border-slate-750'
                          }`}
                        >
                          <span className="font-bold">獨立段落 (Enter)</span>
                          <span className="text-[7.5px] opacity-75 font-normal mt-0.5">適合 Slack / Notion 訊息</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTextSettings(prev => ({ ...prev, newlineMode: 'doubleEnter' }))}
                          className={`px-2 py-2 text-[9px] font-bold rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center text-center leading-tight ${
                            textSettings.newlineMode === 'doubleEnter'
                              ? 'bg-elegant-cyan/15 text-elegant-cyan border-elegant-cyan/50 shadow-[0_0_10px_rgba(20,250,210,0.1)]'
                              : 'bg-[#0b0f14] text-slate-450 border-elegant-border hover:border-slate-750'
                          }`}
                        >
                          <span className="font-bold">強制雙換行 (Enter×2)</span>
                          <span className="text-[7.5px] opacity-75 font-normal mt-0.5">專為 Blinko / Markdown</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setTextSettings(prev => ({ ...prev, newlineMode: 'shiftEnter' }))}
                          className={`px-2 py-2 text-[9px] font-bold rounded-md border transition-all cursor-pointer flex flex-col items-center justify-center text-center leading-tight ${
                            textSettings.newlineMode === 'shiftEnter'
                              ? 'bg-elegant-cyan/15 text-elegant-cyan border-elegant-cyan/50 shadow-[0_0_10px_rgba(20,250,210,0.1)]'
                              : 'bg-[#0b0f14] text-slate-450 border-elegant-border hover:border-slate-750'
                          }`}
                        >
                          <span className="font-bold">同塊折行 (S+Enter)</span>
                          <span className="text-[7.5px] opacity-75 font-normal mt-0.5">傳統連續文字單塊</span>
                        </button>
                      </div>
                    </div>
                    
                    {/* MERGE PARAGRAPH BREAK LINE WRIPS */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          合併段落內不自然折行 (Merge Line Breaks in Paragraph)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          接續段落內無意義的單行斷句。中文直接合併、英文加空中介，遇雙空行則判定為大段分界不合句
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.removeLineBreakInParagraph}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, removeLineBreakInParagraph: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* COLLAPSE NEWLINES */}
                    <label className="flex items-center justify-between p-3 bg-[#131922] border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          收縮連續空行至多剩一行 (Collapse Extra Newlines)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          多個空白行直接收縮為一個清爽的空行
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.collapseNewlines}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, collapseNewlines: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* STRIP BULLETS */}
                    <label className="flex items-center justify-between p-3 bg-[#131922] border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white flex items-center gap-1.5">
                          剝除清單符號、引言塊與數字序列 (Strip Bullets, Quotes & Sequences)
                          <span className="bg-elegant-teal/30 text-elegant-teal border border-elegant-teal/40 px-1.5 py-0.2 rounded text-[8px] font-bold">SLACK OPTIMIZED</span>
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          自動剔除行首項目符號（-、*、•、●）、引言引導線原件（▎、&gt;、|）及時序序列（如 1.、a)），貼上 Slack/Blinko 乾淨無阻！
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.stripBullets ?? false}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, stripBullets: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* STRIP EMOJIS */}
                    <label className="flex items-center justify-between p-3 bg-elegant-darker/50 border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          去除文章中所有 Emoji 表情 (Strip Emojis)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          拿掉正文中的小紅箭、打勾、火箭等符號 (適合正式公文、嚴肅報告)
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.stripEmoji}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, stripEmoji: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                    {/* AUTO COPY */}
                    <label className="flex items-center justify-between p-3 bg-[#131922] border border-elegant-border rounded-lg hover:border-slate-700 cursor-pointer transition-colors">
                      <div className="flex flex-col pr-3">
                        <span className="text-xs font-bold text-white">
                          貼上時自動美化與複製 (Auto-Copy Results)
                        </span>
                        <span className="text-[10px] text-slate-400 mt-0.5">
                          貼上未經格式化的內文時直接在背景複製乾淨成果
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={textSettings.autoCopy}
                        onChange={(e) => setTextSettings(prev => ({ ...prev, autoCopy: e.target.checked }))}
                        className="w-4 h-4 rounded text-elegant-cyan bg-[#050608] border-elegant-border accent-elegant-cyan"
                      />
                    </label>

                  </div>
                </div>

              </div>
            )}
          </section>}

          {/* Sticky Elegant Action Trigger Block */}
          {activeTab !== 'tsv' && inputText && (
            <div className="bg-[#121820] border-t-4 border-elegant-cyan p-6 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4 shadow-xl select-none">
              <div className="flex flex-col text-left">
                <span className="text-[10px] text-elegant-teal uppercase font-bold tracking-wider">
                  {activeTab === 'code' ? 'Code Clipped Successfully' : 'Text Purified Successfully'}
                </span>
                <span className="text-sm font-semibold text-white">
                  {activeTab === 'code' 
                    ? '程式片段格式優化完成，行號前綴字元已精準移除。' 
                    : '多餘空白與段落不自然空行已徹底美化。底層對齊左側。'}
                </span>
              </div>
              <div className="flex gap-3 w-full sm:w-auto shrink-0">
                <button
                  onClick={() => {
                    handleCopy();
                    handleSaveToHistory();
                  }}
                  className="px-8 py-3 w-full sm:w-auto bg-elegant-teal text-white font-bold rounded shadow-lg shadow-elegant-teal/20 hover:bg-elegant-cyan hover:text-elegant-dark transition-all duration-200 uppercase tracking-wide flex items-center justify-center gap-2 cursor-pointer outline-none"
                >
                  <Copy className="w-4 h-4" />
                  {isCopied ? '已複製潔好成品' : '複製潔好成品'}
                </button>
                <button
                  onClick={handleClear}
                  className="px-6 py-3 w-full sm:w-auto bg-transparent border border-elegant-border text-slate-300 font-semibold rounded hover:bg-elegant-border hover:text-white transition-all duration-200 cursor-pointer"
                >
                  重置內容
                </button>
              </div>
            </div>
          )}

        </div>

        {/* SIDEBAR DETAILED HISTORY */}
        <AnimatePresence>
          {sidebarOpen && (
            <motion.aside
              initial={{ opacity: 0, width: 0 }}
              animate={{ opacity: 1, width: 340 }}
              exit={{ opacity: 0, width: 0 }}
              className="w-full lg:w-[340px] flex flex-col bg-elegant-card border border-elegant-border rounded-xl overflow-hidden shrink-0 shadow-2xl"
            >
              <div className="p-4 bg-[#12171E] border-b border-elegant-border flex items-center justify-between select-none">
                <div className="flex items-center gap-2">
                  <History className="w-4 h-4 text-elegant-cyan" />
                  <span className="text-sm font-bold font-display text-white tracking-wide">
                    本地歷史清洗紀錄
                  </span>
                </div>
                {history.length > 0 && (
                  <button
                    onClick={handleClearAllHistory}
                    className="text-[10px] text-slate-500 hover:text-rose-450 transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>清除</span>
                  </button>
                )}
              </div>

              <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 max-h-[500px] lg:max-h-[640px]">
                {history.length === 0 ? (
                  <div className="h-full flex flex-col items-center justify-center text-center py-16 px-4">
                    <div className="w-12 h-12 rounded-full border border-elegant-border flex items-center justify-center bg-elegant-dark text-slate-600 mb-3">
                      <Code className="w-5 h-5 text-elegant-teal" />
                    </div>
                    <p className="text-xs font-bold text-slate-400">尚無快照紀錄</p>
                    <p className="text-[10px] text-slate-500 mt-1 max-w-[200px] leading-relaxed">
                      清洗並點選「複製潔好成品」時，系統會為您將舊檔自動備份於此。
                    </p>
                  </div>
                ) : (
                  history.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        setInputText(item.originalText);
                        if (item.mode) {
                          setActiveTab(item.mode);
                        }
                        handleCopy(item.cleanedText);
                      }}
                      className="group p-3 bg-elegant-dark hover:bg-[#12161D] border border-elegant-border hover:border-elegant-cyan/30 rounded-lg cursor-pointer transition-all text-left relative overflow-hidden"
                    >
                      {/* Badge format type */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <div className="flex items-center gap-1.5">
                          <span className={`px-1.5 py-0.5 border rounded text-[8px] font-mono font-bold ${
                            item.mode === 'text'
                              ? 'bg-elegant-teal/10 border-elegant-teal text-elegant-teal'
                              : 'bg-elegant-cyan/10 border-elegant-cyan text-elegant-cyan'
                          }`}>
                            {item.mode === 'text' ? '文本淨化 (TEXT)' : '代碼行號 (CODE)'}
                          </span>
                          {item.mode !== 'text' && (
                            <span className="text-[8px] font-mono text-slate-500 truncate max-w-[90px]">
                              {item.detectedPattern}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-slate-500">
                            {new Date(item.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <button
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            className="p-1 text-slate-600 group-hover:text-rose-450 rounded hover:bg-[#1F2833]/40 transition-all z-10 cursor-pointer"
                            title="刪除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Code preview snippet */}
                      <p className="text-[10px] leading-relaxed font-mono text-slate-400 truncate max-w-full block bg-[#050608]/50 p-2 rounded border border-elegant-border">
                        {item.cleanedText.split('\n')[0] || '// 程式/文本空行'}
                        {item.cleanedText.split('\n').length > 1 && '\n...'}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between">
                        <span className="text-[9px] text-slate-500 flex items-center gap-0.5">
                          行數: <strong className="text-slate-400">{item.cleanedText.split('\n').filter(Boolean).length}</strong>
                        </span>
                        <span className="text-[9px] text-elegant-teal group-hover:text-elegant-cyan font-bold flex items-center gap-0.5 transition-colors">
                          <span>還原並複製</span>
                          <ArrowRight className="w-2.5 h-2.5" />
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
              
              <div className="p-3.5 bg-[#12171E] border-t border-elegant-border text-[10px] text-slate-500 text-center font-mono select-none">
                儲存於本地瀏覽器 LocalStorage
              </div>
            </motion.aside>
          )}
        </AnimatePresence>

      </main>

      {/* FOOTER */}
      <footer className="mt-auto border-t border-elegant-border bg-elegant-darker py-6 px-6 text-center text-xs text-slate-500 relative z-10 select-none">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="flex items-center gap-1.5 justify-center">
            <span>Powering real-time CLI sanitizers & text format clean engines.</span>
          </p>
          <div className="flex gap-4">
            <span className="text-[10px] font-mono text-slate-500">
              UTC: {new Date().toISOString().substring(11, 19)}
            </span>
            <span className="text-[10px] font-mono text-slate-500">
              安全沙盒、本地計算、防洩密驗證
            </span>
          </div>
        </div>
      </footer>

    </div>
  );
}
