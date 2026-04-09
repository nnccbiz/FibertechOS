'use client';

import { useState, useRef, useEffect } from 'react';

interface AiChatMessage {
  role: 'user' | 'ai';
  text: string;
  data?: any;
}

interface AiChatProps {
  onDataExtracted: (data: any) => void;
  currentData?: any;
}

export default function AiChat({ onDataExtracted, currentData }: AiChatProps) {
  const [messages, setMessages] = useState<AiChatMessage[]>([
    {
      role: 'ai',
      text: 'היי! אני רקסי, העוזרת של FibertechOS.\nתאר לי את הפרויקט בכמה משפטים ואני אמלא את כל השדות בטופס.',
    },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function handleSend() {
    if (!input.trim() || loading) return;

    const userMsg = input.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMsg, context: currentData }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: 'ai', text: `שגיאה: ${data.error}` }]);
        return;
      }

      if (data.message) {
        // AI responded with a message, not structured data
        setMessages((prev) => [...prev, { role: 'ai', text: data.message }]);
      } else {
        // AI extracted structured data
        const filledFields = Object.entries(data)
          .filter(([_, v]) => v !== null && v !== '' && !(Array.isArray(v) && v.length === 0))
          .map(([k]) => k);

        setMessages((prev) => [
          ...prev,
          {
            role: 'ai',
            text: `מילאתי ${filledFields.length} שדות בטופס:\n${filledFields.join(', ')}\n\nתוכל להמשיך לתאר פרטים נוספים ואני אעדכן.`,
            data,
          },
        ]);

        onDataExtracted(data);
      }
    } catch (err) {
      setMessages((prev) => [...prev, { role: 'ai', text: 'שגיאה בתקשורת. נסה שוב.' }]);
    } finally {
      setLoading(false);
    }
  }

  if (!isOpen) {
    return (
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-24 md:bottom-6 left-6 w-14 h-14 bg-[#1a56db] text-white rounded-full shadow-lg flex items-center justify-center text-2xl hover:bg-blue-700 transition-all hover:scale-105 z-50"
        title="שיחה עם רקסי AI"
      >
        ✨
      </button>
    );
  }

  return (
    <div className="fixed bottom-24 md:bottom-6 left-6 w-[360px] max-h-[500px] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] flex flex-col z-50 animate-fade-in-up">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#e2e8f0] bg-[#1a56db] rounded-t-2xl">
        <div className="flex items-center gap-2">
          <span className="text-lg">✨</span>
          <div>
            <p className="text-sm font-bold text-white">רקסי AI</p>
            <p className="text-[10px] text-blue-200">עוזרת FibertechOS</p>
          </div>
        </div>
        <button
          onClick={() => setIsOpen(false)}
          className="text-white/70 hover:text-white text-lg"
        >
          ✕
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 max-h-[340px]">
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-start' : 'justify-end'}`}
          >
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

      {/* Input */}
      <div className="border-t border-[#e2e8f0] px-3 py-2">
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
            placeholder="תאר את הפרויקט..."
            className="flex-1 border border-[#e2e8f0] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
            disabled={loading}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="bg-[#1a56db] text-white px-3 py-2 rounded-lg text-xs hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            שלח
          </button>
        </div>
      </div>
    </div>
  );
}
