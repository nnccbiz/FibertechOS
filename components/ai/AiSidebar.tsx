'use client';

import { useState, useRef, useEffect } from 'react';

interface AiMessage {
  role: 'user' | 'ai';
  text: string;
}

interface AiSidebarProps {
  /** Which page context — limits what Gemma can do */
  context: 'projects' | 'field' | 'import' | 'logistics' | 'inventory';
  /** Current form data — sent to Gemma for context */
  formData?: any;
  /** Called when Gemma extracts data to fill into the form */
  onDataExtracted: (data: any) => void;
}

const CONTEXT_LABELS: Record<string, string> = {
  projects: 'פרויקטים',
  field: 'שירות שדה',
  import: 'ייבוא',
  logistics: 'לוגיסטיקה',
  inventory: 'מלאי',
};

const CONTEXT_HINTS: Record<string, string[]> = {
  projects: [
    'פרויקט ביוב ברמת השרון, מזמין מי שרונים',
    'צינור 700 מ"מ, אורך 1350, קשיחות 10000',
    'קבלן לאוניד שרמן, טלפון 050-4561980',
  ],
  field: [
    'דוח פיקוח שדה לפרויקט X',
    'אירוע חריג — צינור סדוק בתחנה 3',
    'ביצוע מבחן לחץ — תקין',
  ],
  import: [
    'מכולה SUDU8528420 הגיעה לנמל',
    'עדכון סטטוס פרופורמה מ-Amiblu',
    'חלץ נתונים מהפרופורמה המצורפת',
  ],
  logistics: [
    'עדכון מעקב ISKOOR',
    'משלוח 3 מכולות יצא מהנמל',
    'הוסף מכולה חדשה למעקב',
  ],
  inventory: [
    'הוסף 200 מטר צינור DN1200 SN10000',
    'עדכון מלאי אביזרים',
    'הוסף חומרי סיכה ליצרן Amiblu',
  ],
};

export default function AiSidebar({ context, formData, onDataExtracted }: AiSidebarProps) {
  const [messages, setMessages] = useState<AiMessage[]>([
    {
      role: 'ai',
      text: `היי! אני ג׳מה, פה בשביל ${CONTEXT_LABELS[context]}.\nתאר מה לעדכן ואני אמלא את השדות.`,
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<{ name: string; base64: string; mimeType: string; preview?: string }[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
          message: `[הקשר: עמוד ${CONTEXT_LABELS[context]}. מלא רק שדות רלוונטיים ל${CONTEXT_LABELS[context]}.]\n\n${userMsg}`,
          context: formData,
          files: filesToSend?.map((f) => ({ base64: f.base64, mimeType: f.mimeType, name: f.name })),
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: 'ai', text: `שגיאה: ${data.error}` }]);
        return;
      }

      if (data.action === 'query' || data.message) {
        setMessages((prev) => [...prev, { role: 'ai', text: data.message || data.summary }]);
      } else {
        // Extract data and pass to parent form
        const fields = Object.entries(data.data || data)
          .filter(([k, v]) => v !== null && v !== '' && k !== 'action' && k !== 'target_table' && k !== 'target_label' && k !== 'summary' && k !== 'fields_count')
          .map(([k]) => k);

        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            text: `✅ ${data.summary || `מילאתי ${fields.length} שדות`}`,
          },
        ]);

        onDataExtracted(data.data || data);
      }
    } catch {
      setMessages((prev) => [...prev, { role: 'ai', text: 'שגיאה בתקשורת. נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-[320px] bg-white border-r border-[#e2e8f0] flex flex-col h-screen overflow-hidden">
      {/* Header — fixed top */}
      <div className="px-4 py-3 bg-[#fce4ec] flex items-center gap-2 flex-shrink-0">
        <span className="text-lg">✨</span>
        <div>
          <p className="text-sm font-bold text-[#e91e63]">ג׳מה AI</p>
          <p className="text-[10px] text-[#f48fb1]">{CONTEXT_LABELS[context]}</p>
        </div>
      </div>

      {/* Messages — scrollable middle */}
      <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-2.5">
        {messages.map((msg, i) => (
          <div key={i} className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}>
            <div
              className={`max-w-[90%] rounded-xl px-3 py-2 text-xs whitespace-pre-wrap ${
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

        {/* Hints — show only if no user messages yet */}
        {messages.length <= 1 && (
          <div className="pt-2">
            <p className="text-[10px] text-gray-400 mb-1.5">דוגמאות:</p>
            {CONTEXT_HINTS[context]?.map((hint, i) => (
              <button
                key={i}
                onClick={() => { setInput(hint); }}
                className="block w-full text-right text-[11px] text-gray-500 bg-gray-50 rounded-lg px-2.5 py-1.5 mb-1 hover:bg-blue-50 hover:text-[#1a56db] transition-colors"
              >
                {hint}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Uploaded files — fixed bottom area */}
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

      {/* Input — always visible at bottom */}
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
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="תאר מה לעדכן..."
            className="flex-1 border border-[#e2e8f0] rounded-lg px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || (!input.trim() && uploadedFiles.length === 0)}
            className="bg-[#1a56db] text-white px-2.5 py-2 rounded-lg text-xs hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            שלח
          </button>
        </div>
      </div>
    </div>
  );
}
