'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';

interface CommandBarProps {
  onActionComplete?: () => void;
}

interface LogEntry {
  command: string;
  summary: string;
  status: 'processing' | 'applied' | 'failed';
  timestamp: Date;
}

export default function CommandBar({ onActionComplete }: CommandBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsOpen((prev) => !prev);
      }
      if (e.key === 'Escape') {
        setIsOpen(false);
        setFeedback(null);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  // Execute command
  const executeCommand = useCallback(async (command: string, documentText?: string) => {
    if (!command.trim() && !documentText) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: command,
          document_text: documentText,
        }),
      });

      const result = await res.json();

      if (result.error) {
        setFeedback({ text: result.error, type: 'error' });
        return;
      }

      if (result.action === 'query') {
        setFeedback({ text: result.message || result.summary, type: 'info' });
        return;
      }

      // Silent Execution — apply to database
      let targetId: string | null = null;
      let previousValues: any = null;

      if (result.action === 'create' && result.target_table && result.data) {
        const { data: created, error } = await supabase
          .from(result.target_table)
          .insert(result.data)
          .select()
          .single();

        if (error) throw error;
        targetId = created?.id;

        // Handle related data
        if (targetId) {
          if (result.contacts?.length > 0) {
            const rows = result.contacts.filter((c: any) => c.name).map((c: any) => ({ project_id: targetId, ...c }));
            if (rows.length > 0) await supabase.from('project_contacts').insert(rows);
          }
          if (result.pipe_specs?.length > 0) {
            const rows = result.pipe_specs.filter((s: any) => s.diameter_mm > 0).map((s: any) => ({ project_id: targetId, ...s }));
            if (rows.length > 0) await supabase.from('pipe_specs').insert(rows);
          }
        }
      }

      if (result.action === 'update' && result.target_table && result.data) {
        // Get previous values for undo
        if (result.data.id) {
          const { data: prev } = await supabase
            .from(result.target_table)
            .select('*')
            .eq('id', result.data.id)
            .single();
          previousValues = prev;
          targetId = result.data.id;

          const updateData = { ...result.data };
          delete updateData.id;
          const { error } = await supabase
            .from(result.target_table)
            .update(updateData)
            .eq('id', result.data.id);
          if (error) throw error;
        }
      }

      // Log to activity log
      await supabase.from('ai_activity_log').insert({
        command_text: command,
        action_type: result.action,
        target_table: result.target_table || 'unknown',
        target_id: targetId,
        target_label: result.target_label || '',
        changes_applied: result.data || {},
        previous_values: previousValues,
        source_type: documentText ? 'document' : 'command',
        summary: result.summary,
        fields_count: result.fields_count || 0,
        status: 'applied',
      });

      setFeedback({
        text: `✅ ${result.summary}`,
        type: 'success',
      });

      setInput('');
      onActionComplete?.();

      // Auto-close after success
      setTimeout(() => {
        setIsOpen(false);
        setFeedback(null);
      }, 2500);

    } catch (err: any) {
      console.error('Command execution error:', err);
      setFeedback({ text: `שגיאה: ${err.message}`, type: 'error' });
    } finally {
      setLoading(false);
    }
  }, [onActionComplete]);

  // Handle file drop
  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);

    const file = e.dataTransfer.files[0];
    if (!file) return;

    // Read file as text (basic — for PDFs we'd need a parser)
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      executeCommand(
        input || `חלץ נתונים מהמסמך ${file.name} והזן למערכת`,
        text
      );
    };
    reader.readAsText(file);
  }

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100]"
        onClick={() => { setIsOpen(false); setFeedback(null); }}
      />

      {/* Command Bar */}
      <div
        className="fixed top-[20%] left-1/2 -translate-x-1/2 w-[90%] max-w-[640px] z-[101] animate-fade-in-up"
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        <div className={`bg-white rounded-2xl shadow-2xl border-2 transition-colors ${
          dragOver ? 'border-[#1a56db] bg-blue-50' : 'border-[#e2e8f0]'
        }`}>
          {/* Input row */}
          <div className="flex items-center px-4 py-3 gap-3">
            <span className="text-xl">✨</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) executeCommand(input);
              }}
              placeholder='הקלד פקודה... (למשל: "הוסף 200 מטר צינור DN1200 לפרויקט X")'
              className="flex-1 text-sm outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
              dir="rtl"
              disabled={loading}
            />
            {loading ? (
              <div className="flex gap-1 px-2">
                <span className="w-1.5 h-1.5 bg-[#1a56db] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-1.5 h-1.5 bg-[#1a56db] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-1.5 h-1.5 bg-[#1a56db] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            ) : (
              <kbd className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
              </kbd>
            )}
          </div>

          {/* Drag & drop zone hint */}
          {dragOver && (
            <div className="px-4 pb-3">
              <div className="border-2 border-dashed border-[#1a56db] rounded-xl p-6 text-center">
                <p className="text-sm text-[#1a56db] font-medium">📄 שחרר את המסמך כאן</p>
                <p className="text-[10px] text-blue-400 mt-1">PDF, DOCX, Excel — ג׳מה תחלץ את הנתונים</p>
              </div>
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`px-4 pb-3`}>
              <div className={`rounded-xl px-4 py-3 text-xs ${
                feedback.type === 'success' ? 'bg-green-50 text-green-700 border border-green-200' :
                feedback.type === 'error' ? 'bg-red-50 text-red-700 border border-red-200' :
                'bg-blue-50 text-blue-700 border border-blue-200'
              }`}>
                {feedback.text}
              </div>
            </div>
          )}

          {/* Quick actions */}
          {!feedback && !loading && !input && (
            <div className="border-t border-[#e2e8f0] px-4 py-3">
              <p className="text-[10px] text-gray-400 mb-2">פקודות מהירות</p>
              <div className="flex flex-wrap gap-1.5">
                {[
                  'צור פרויקט חדש',
                  'עדכן סטטוס לוגיסטיקה',
                  'הוסף צינורות למלאי',
                  'צור התראה דחופה',
                  'הוסף ליד חדש',
                ].map((cmd) => (
                  <button
                    key={cmd}
                    onClick={() => { setInput(cmd); inputRef.current?.focus(); }}
                    className="text-[11px] bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-gray-300 mt-2 text-center">גרור מסמך לכאן לעיבוד אוטומטי</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
