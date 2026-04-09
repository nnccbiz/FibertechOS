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

interface UploadedFile {
  name: string;
  mimeType: string;
  base64: string;
  preview?: string; // data URL for image preview
}

export default function CommandBar({ onActionComplete }: CommandBarProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [feedback, setFeedback] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    } else {
      setUploadedFiles([]);
    }
  }, [isOpen]);

  // Process selected/dropped files
  function processFiles(fileList: FileList) {
    Array.from(fileList).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target?.result as string;
        // Extract base64 data after the comma
        const base64 = dataUrl.split(',')[1];
        const isImage = file.type.startsWith('image/');

        setUploadedFiles((prev) => [
          ...prev,
          {
            name: file.name,
            mimeType: file.type || 'application/octet-stream',
            base64,
            preview: isImage ? dataUrl : undefined,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
  }

  function removeFile(index: number) {
    setUploadedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  // Execute command
  const executeCommand = useCallback(async (command: string, documentText?: string, filesToSend?: UploadedFile[]) => {
    if (!command.trim() && !documentText && (!filesToSend || filesToSend.length === 0)) return;

    setLoading(true);
    setFeedback(null);

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: command,
          document_text: documentText,
          files: filesToSend?.map((f) => ({ base64: f.base64, mimeType: f.mimeType, name: f.name })),
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
      setUploadedFiles([]);
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
    if (e.dataTransfer.files.length > 0) {
      processFiles(e.dataTransfer.files);
    }
  }

  // Handle file input change
  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
      e.target.value = '';
    }
  }

  // Send command with attached files
  function handleSubmit() {
    if (loading) return;
    executeCommand(input, undefined, uploadedFiles.length > 0 ? uploadedFiles : undefined);
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
          {/* Hidden file input */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
            onChange={handleFileSelect}
            className="hidden"
          />

          {/* Input row */}
          <div className="flex items-center px-4 py-3 gap-3">
            <span className="text-2xl">✨</span>
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !loading) handleSubmit();
              }}
              placeholder='הקלד פקודה... (למשל: "הוסף 200 מטר צינור DN1200 לפרויקט X")'
              className="flex-1 text-lg outline-none bg-transparent text-gray-800 placeholder:text-gray-400"
              dir="rtl"
              disabled={loading}
            />
            <div className="flex items-center gap-1.5">
              {/* Upload button */}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-gray-400 hover:text-[#1a56db] transition-colors p-1 rounded-lg hover:bg-blue-50 disabled:opacity-50"
                title="העלה קובץ או תמונה"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              {loading ? (
                <div className="flex gap-1 px-2">
                  <span className="w-1.5 h-1.5 bg-[#1a56db] rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#1a56db] rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-[#1a56db] rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <kbd className="text-[12px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded border border-gray-200">
                  {typeof navigator !== 'undefined' && /Mac/.test(navigator.userAgent) ? '⌘K' : 'Ctrl+K'}
                </kbd>
              )}
            </div>
          </div>

          {/* Uploaded files preview */}
          {uploadedFiles.length > 0 && (
            <div className="px-4 pb-3">
              <div className="flex flex-wrap gap-2">
                {uploadedFiles.map((file, i) => (
                  <div key={i} className="relative group">
                    {file.preview ? (
                      <img
                        src={file.preview}
                        alt={file.name}
                        className="w-16 h-16 object-cover rounded-lg border border-[#e2e8f0]"
                      />
                    ) : (
                      <div className="w-16 h-16 bg-gray-50 rounded-lg border border-[#e2e8f0] flex flex-col items-center justify-center">
                        <span className="text-2xl">📄</span>
                        <span className="text-[8px] text-gray-400 truncate max-w-[56px] px-1">{file.name.split('.').pop()?.toUpperCase()}</span>
                      </div>
                    )}
                    <button
                      onClick={() => removeFile(i)}
                      className="absolute -top-1.5 -left-1.5 w-4 h-4 bg-red-500 text-white rounded-full text-[11px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      ✕
                    </button>
                    <p className="text-[8px] text-gray-400 text-center mt-0.5 truncate max-w-[64px]">{file.name}</p>
                  </div>
                ))}
              </div>
              {!input.trim() && (
                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="mt-2 text-sm bg-[#1a56db] text-white px-4 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  חלץ נתונים מהקבצים
                </button>
              )}
            </div>
          )}

          {/* Drag & drop zone hint */}
          {dragOver && (
            <div className="px-4 pb-3">
              <div className="border-2 border-dashed border-[#1a56db] rounded-xl p-6 text-center">
                <p className="text-lg text-[#1a56db] font-medium">📄 שחרר קבצים כאן</p>
                <p className="text-[12px] text-blue-400 mt-1">תמונות, PDF, Excel, Word — רקסי תחלץ את הנתונים</p>
              </div>
            </div>
          )}

          {/* Feedback */}
          {feedback && (
            <div className={`px-4 pb-3`}>
              <div className={`rounded-xl px-4 py-3 text-sm ${
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
              <p className="text-[12px] text-gray-400 mb-2">פקודות מהירות</p>
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
                    className="text-[13px] bg-gray-50 text-gray-600 px-2.5 py-1.5 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    {cmd}
                  </button>
                ))}
              </div>
              <p className="text-[12px] text-gray-300 mt-2 text-center">גרור מסמך לכאן לעיבוד אוטומטי</p>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
