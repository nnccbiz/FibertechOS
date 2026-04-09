'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';

interface AiMessage {
  role: 'user' | 'ai';
  text: string;
}

const CONTEXT_MAP: Record<string, string> = {
  '/': 'לוח בקרה',
  '/projects': 'פרויקטים',
  '/marketing': 'שיווק',
  '/import': 'ייבוא',
  '/field': 'שירות שדה',
  '/inventory': 'מלאי',
  '/reports': 'דוחות',
  '/settings': 'הגדרות',
};

function getContext(pathname: string): string {
  if (pathname === '/') return 'לוח בקרה';
  const match = Object.entries(CONTEXT_MAP).find(([key]) => key !== '/' && pathname.startsWith(key));
  return match?.[1] || 'כללי';
}

export default function FloatingChat() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; base64: string; mimeType: string; preview?: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const context = getContext(pathname);

  // Initialize welcome message
  useEffect(() => {
    setMessages([{ role: 'ai', text: `היי! אני ג׳מה. איך אפשר לעזור?` }]);
  }, []);

  // Ctrl+K / Cmd+K to toggle
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen((prev) => {
          const next = !prev;
          if (next) {
            setTimeout(() => inputRef.current?.focus(), 100);
          }
          return next;
        });
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  function processFiles(fileList: FileList) {
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        const base64 = dataUrl.split(',')[1];
        setUploadedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64,
            preview: file.type.startsWith('image/') ? dataUrl : undefined,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  async function handleSend() {
    if ((!input.trim() && uploadedFiles.length === 0) || loading) return;

    const userMsg = input.trim() || `חלץ נתונים מ-${uploadedFiles.map((f) => f.name).join(', ')}`;
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    const filesToSend = uploadedFiles.length > 0 ? uploadedFiles : undefined;
    setUploadedFiles([]);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[הקשר: ${context}]\n\n${userMsg}`,
          files: filesToSend?.map((f) => ({ base64: f.base64, mimeType: f.mimeType, name: f.name })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: 'ai', text: `שגיאה: ${data.error}` }]);
      } else {
        setMessages((prev) => [...prev, { role: 'ai', text: data.summary || data.message || JSON.stringify(data) }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'שגיאה בתקשורת. נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  }

  const isMac = typeof navigator !== 'undefined' && navigator.platform?.includes('Mac');
  const shortcutLabel = isMac ? '⌘K' : 'Ctrl+K';

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setOpen(!open)}
        className={`fixed bottom-6 left-6 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300 hover:scale-110 ${
          open ? 'bg-gray-700 text-white rotate-45' : 'bg-[#1a56db] text-white'
        }`}
        title={`ג׳מה AI (${shortcutLabel})`}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : (
          <span className="text-2xl">✨</span>
        )}
      </button>

      {/* Shortcut hint — only when closed */}
      {!open && (
        <div className="fixed bottom-[88px] left-6 z-50 bg-gray-800 text-white text-[10px] px-2 py-1 rounded-full opacity-60">
          {shortcutLabel}
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 left-6 z-50 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-4 py-3 bg-[#fce4ec] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-lg">✨</span>
              <div>
                <p className="text-sm font-bold text-[#1a56db]">ג׳מה AI</p>
                <p className="text-[10px] text-[#1a56db]/60">{context}</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-[#1a56db]/40 hover:text-[#1a56db] transition-colors"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Messages */}
          <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
                <div
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-[#1a56db] text-white rounded-tr-none'
                      : 'bg-gray-100 text-gray-700 rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-end">
                <div className="bg-gray-100 rounded-xl px-4 py-2 rounded-tl-none">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="px-3 py-2 border-t border-[#e2e8f0] flex flex-wrap gap-1.5 flex-shrink-0">
              {uploadedFiles.map((file, i) => (
                <div key={i} className="relative group">
                  {file.preview ? (
                    <img src={file.preview} alt={file.name} className="w-10 h-10 object-cover rounded border border-[#e2e8f0]" />
                  ) : (
                    <div className="w-10 h-10 bg-gray-50 rounded border border-[#e2e8f0] flex items-center justify-center text-sm">📄</div>
                  )}
                  <button
                    onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1 -left-1 w-3.5 h-3.5 bg-red-500 text-white rounded-full text-[8px] flex items-center justify-center opacity-0 group-hover:opacity-100"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-[#e2e8f0] px-3 py-2 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={(e) => { if (e.target.files) processFiles(e.target.files); e.target.value = ''; }}
              className="hidden"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-gray-400 hover:text-[#1a56db] p-1.5 rounded-lg hover:bg-blue-50 transition-colors disabled:opacity-50"
                title="העלה קובץ"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="שאל את ג׳מה..."
                className="flex-1 border border-[#e2e8f0] rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && uploadedFiles.length === 0)}
                className="bg-[#fce4ec] text-[#1a56db] font-semibold px-2.5 py-2 rounded-lg text-xs hover:bg-[#f8bbd0] transition-colors disabled:opacity-50"
              >
                שלח
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
