'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { validateWrite, rejectionMessage, logRejection } from '@/lib/ai/write-allowlist';
import Icon, { type IconName } from '@/components/ui/Icon';

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
  const [isRecording, setIsRecording] = useState(false);
  const [pendingQuote, setPendingQuote] = useState<any>(null);
  const [pendingImport, setPendingImport] = useState<{ step: 'ask_project' | 'confirm'; quote_info: any; items: any[]; projectName?: string } | null>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const router = useRouter();
  const context = getContext(pathname);

  useEffect(() => {
    setMessages([{ role: 'ai', text: `היי! אני רקסי. איך אפשר לעזור?` }]);
  }, []);

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

  function toggleRecording() {
    if (isRecording) {
      recognitionRef.current?.stop();
      setIsRecording(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setMessages((prev) => [...prev, { role: 'ai', text: 'הדפדפן לא תומך בהקלטה קולית. נסה Chrome או Safari.' }]);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'he-IL';
    recognition.interimResults = true;
    recognition.continuous = false;

    recognition.onstart = () => setIsRecording(true);

    recognition.onresult = (event: any) => {
      const transcript = Array.from(event.results)
        .map((result: any) => result[0].transcript)
        .join('');
      setInput(transcript);
    };

    recognition.onend = () => {
      setIsRecording(false);
    };

    recognition.onerror = () => {
      setIsRecording(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function loadFiles(fileList: FileList): Promise<{ name: string; mimeType: string; base64: string; preview?: string }[]> {
    return Promise.all(
      Array.from(fileList).map(
        (file) =>
          new Promise<{ name: string; mimeType: string; base64: string; preview?: string }>((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
              const dataUrl = e.target?.result as string;
              resolve({
                name: file.name,
                mimeType: file.type || 'application/octet-stream',
                base64: dataUrl.split(',')[1],
                preview: file.type.startsWith('image/') ? dataUrl : undefined,
              });
            };
            reader.readAsDataURL(file);
          })
      )
    );
  }

  async function handleSend(explicitFiles?: { name: string; mimeType: string; base64: string; preview?: string }[]) {
    const filesToUse = explicitFiles ?? uploadedFiles;
    if ((!input.trim() && filesToUse.length === 0) || loading) return;
    const supabase = createClient();

    const userMsg = input.trim() || `חלץ נתונים מ-${filesToUse.map((f) => f.name).join(', ')}`;
    setInput('');
    setUploadedFiles([]);
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    // Roxy output is untrusted — every AI-driven write is validated against the
    // allowlist before reaching Supabase. Returns false (and notifies + logs) on reject.
    const passesAllowlist = async (table: string, payload: any, label?: string): Promise<boolean> => {
      const v = validateWrite(table, payload);
      if (!v.ok) {
        await logRejection(supabase, {
          command: userMsg, action: 'create', validation: v,
          targetLabel: label, data: payload, sourceType: 'chat',
        });
        setMessages((prev) => [...prev, { role: 'ai', text: rejectionMessage(v) }]);
        return false;
      }
      return true;
    };

    // Handle pending quote confirmation
    if (pendingQuote) {
      const isYes = /^(כן|yes|אישור|שמור|ok|אוקיי|בטח)$/i.test(userMsg.trim());
      const isNo = /^(לא|no|ביטול|cancel)$/i.test(userMsg.trim());
      if (isYes) {
        try {
          const qi = pendingQuote.quote_info;
          const items = pendingQuote.items;
          let supplierId: string | null = null;
          if (qi.supplier_name) {
            const { data: existing } = await supabase.from('suppliers').select('id').ilike('name', `%${qi.supplier_name}%`).limit(1).single();
            if (existing) {
              supplierId = existing.id;
            } else {
              const supplierPayload = { name: qi.supplier_name, currency: qi.currency || 'USD' };
              if (!(await passesAllowlist('suppliers', supplierPayload, qi.supplier_name))) {
                setPendingQuote(null); setLoading(false); return;
              }
              const { data: newSup } = await supabase.from('suppliers').insert(supplierPayload).select('id').single();
              if (newSup) supplierId = newSup.id;
            }
          }
          // Create supplier_quote
          const quotePayload = {
            supplier_id: supplierId,
            quote_ref: qi.quote_ref || null,
            quote_date: qi.quote_date || null,
            project_name: qi.project_name || null,
            currency: qi.currency || 'USD',
          };
          if (!(await passesAllowlist('supplier_quotes', quotePayload, qi.quote_ref))) {
            setPendingQuote(null); setLoading(false); return;
          }
          const { data: sq, error: sqErr } = await supabase.from('supplier_quotes').insert(quotePayload).select('id').single();
          if (sqErr) throw sqErr;
          if (sq && items.length > 0) {
            const rows = items.map((it: any) => ({
              quote_id: sq.id,
              item_type: it.item_type || 'other',
              dn: it.dn ? parseInt(it.dn) : null,
              sn: it.sn ? parseInt(it.sn) : null,
              pn: it.pn ? parseInt(it.pn) : null,
              length_m: it.length_m ? parseFloat(it.length_m) : null,
              unit_price: parseFloat(it.unit_price) || 0,
              price_per: it.price_per || 'meter',
              currency: it.currency || qi.currency || 'USD',
              description: it.description || null,
            }));
            const badRow = rows.find((r: any) => !validateWrite('supplier_quote_items', r).ok);
            if (badRow) {
              await passesAllowlist('supplier_quote_items', badRow, qi.quote_ref);
              setPendingQuote(null); setLoading(false); return;
            }
            await supabase.from('supplier_quote_items').insert(rows);
          }
          setMessages((prev) => [...prev, { role: 'ai', text: `✅ נשמר בהצלחה — ${items.length} פריטים מ-${qi.supplier_name || 'ספק'} (Ref: ${qi.quote_ref || '—'})` }]);
        } catch (err: any) {
          setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה בשמירה: ${err.message}` }]);
        }
        setPendingQuote(null);
        setLoading(false);
        return;
      } else if (isNo) {
        setPendingQuote(null);
        setMessages((prev) => [...prev, { role: 'ai', text: '🚫 בוטל — הנתונים לא נשמרו.' }]);
        setLoading(false);
        return;
      }
      setPendingQuote(null);
    }

    // Handle pending cost input import to a specific project
    if (pendingImport) {
      const trimmed = userMsg.trim();
      const isCancel = /^(לא|ביטול|cancel|no)$/i.test(trimmed);

      if (isCancel) {
        setPendingImport(null);
        setMessages((prev) => [...prev, { role: 'ai', text: '🚫 בוטל.' }]);
        setLoading(false);
        return;
      }

      if (/^ספק$/i.test(trimmed)) {
        const qi = pendingImport.quote_info;
        const items = pendingImport.items;
        setPendingImport(null);
        setPendingQuote({ quote_info: qi, items });
        setMessages((prev) => [...prev, { role: 'ai', text: `💾 לשמור כקוטציית ספק כללית מ-${qi.supplier_name || 'ספק'}? (כן/לא)` }]);
        setLoading(false);
        return;
      }

      if (pendingImport.step === 'ask_project') {
        const { data: proj } = await supabase.from('projects').select('id, name').ilike('name', `%${trimmed}%`).limit(1).single();
        if (!proj) {
          setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט בשם "${trimmed}".\nנסה שם אחר, "ספק" לשמור כקוטציה, או "לא" לביטול:` }]);
          setLoading(false);
          return;
        }
        setPendingImport({ ...pendingImport, step: 'confirm', projectName: proj.name });
        setMessages((prev) => [...prev, { role: 'ai', text: `נמצא פרויקט: "${proj.name}" ✅\nלשמור ${pendingImport.items.length} פריטים כתמחור לפרויקט זה? (כן/לא)` }]);
        setLoading(false);
        return;
      }

      if (pendingImport.step === 'confirm') {
        const isYes = /^(כן|yes|אישור|שמור|ok|אוקיי|בטח)$/i.test(trimmed);
        if (isYes && pendingImport.projectName) {
          try {
            const qi = pendingImport.quote_info;
            const currency = qi.currency || 'USD';
            const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${pendingImport.projectName}%`).limit(1).single();
            if (!proj) throw new Error(`פרויקט "${pendingImport.projectName}" לא נמצא`);

            const { data: ci, error: ciErr } = await supabase.from('cost_inputs').insert({
              project_id: proj.id,
              source_type: 'supplier',
              source_name: qi.supplier_name || 'ספק',
              notes: qi.quote_ref ? `Ref: ${qi.quote_ref}` : '',
              currency,
              exchange_rate: null,
              exchange_rate_date: null,
              payment_terms: '',
            }).select('id').single();
            if (ciErr) throw ciErr;

            const rows = pendingImport.items.map((item: any, idx: number) => ({
              cost_input_id: ci.id,
              product_name: item.description || item.product_name || `${item.item_type || ''} DN${item.dn || ''}`.trim(),
              dn_size: item.dn ? `DN${item.dn}` : (item.dn_size || null),
              quantity: parseFloat(item.quantity) || 1,
              unit: item.price_per === 'unit' ? "יח'" : 'מטר',
              original_price: parseFloat(item.unit_price || item.cost_price) || 0,
              original_currency: currency,
              cost_price: parseFloat(item.unit_price || item.cost_price) || 0,
              total_cost: (parseFloat(item.quantity) || 1) * (parseFloat(item.unit_price || item.cost_price) || 0),
              item_type: item.item_type || null,
              sn: item.sn ? parseInt(item.sn) : null,
              pn: item.pn ? parseInt(item.pn) : null,
              length_m: item.length_m ? parseFloat(item.length_m) : null,
              sort_order: idx,
            }));
            await supabase.from('cost_input_items').insert(rows);

            setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${rows.length} פריטים מ-${qi.supplier_name || 'ספק'}${qi.quote_ref ? ` (Ref: ${qi.quote_ref})` : ''} נשמרו לתמחור של פרויקט "${pendingImport.projectName}".\n⚠️ עדכן את שער החליפין בלשונית תמחור בדף הפרויקט.` }]);
          } catch (err: any) {
            setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${err.message}` }]);
          }
          setPendingImport(null);
          setLoading(false);
          return;
        } else {
          const { data: proj } = await supabase.from('projects').select('id, name').ilike('name', `%${trimmed}%`).limit(1).single();
          if (proj) {
            setPendingImport({ ...pendingImport, projectName: proj.name });
            setMessages((prev) => [...prev, { role: 'ai', text: `לשמור ${pendingImport.items.length} פריטים לפרויקט "${proj.name}"? (כן/לא)` }]);
          } else {
            setPendingImport(null);
            setMessages((prev) => [...prev, { role: 'ai', text: '🚫 בוטל.' }]);
          }
          setLoading(false);
          return;
        }
      }
    }

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `[הקשר: ${context}]\n\n${userMsg}`,
          files: filesToUse.length > 0 ? filesToUse.map((f) => ({ base64: f.base64, mimeType: f.mimeType, name: f.name })) : undefined,
        }),
      });

      const data = await res.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: 'ai', text: `שגיאה: ${data.error}` }]);
      } else {
        if (data.target_table === 'project_updates' && data.action === 'create' && data.data) {
          const projectName = data.target_label || data.data.project_name;
          if (projectName) {
            const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
            if (proj) {
              const updatePayload = {
                project_id: proj.id,
                update_date: new Date().toISOString().substring(0, 10),
                people: data.data.people || '',
                title: data.data.title || '',
                description: data.data.description || '',
                tasks: data.data.tasks || '',
              };
              if (!(await passesAllowlist('project_updates', updatePayload, projectName))) {
                setLoading(false); return;
              }
              await supabase.from('project_updates').insert(updatePayload);
              // Auto-create tasks as alerts
              const tasksText = data.data.tasks || '';
              if (tasksText.trim()) {
                const taskLines = tasksText.split(/[,\n]/).map((t: string) => t.replace(/^\d+[.):\s]+/, '').trim()).filter(Boolean);
                for (const task of taskLines) {
                  // Real alerts schema: severity/title/message/category/is_read (no type/is_resolved/assigned_to).
                  const alertPayload = {
                    project_id: proj.id,
                    severity: 'info',
                    category: 'task',
                    title: task,
                    message: task,
                    is_read: false,
                  };
                  if (!(await passesAllowlist('alerts', alertPayload, projectName))) {
                    setLoading(false); return;
                  }
                  await supabase.from('alerts').insert(alertPayload);
                }
              }
              setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}\n\nהעדכון נוסף לכרטיס הפרויקט.${tasksText.trim() ? '\n📌 המשימות נוספו ללוח הבקרה.' : ''}` }]);
            } else {
              setMessages((prev) => [...prev, { role: 'ai', text: `${data.summary}\n\n⚠️ לא מצאתי פרויקט בשם "${projectName}". העדכון לא נשמר.` }]);
            }
          } else {
            setMessages((prev) => [...prev, { role: 'ai', text: data.summary || data.message || JSON.stringify(data) }]);
          }
        } else if (data.target_table === 'alerts' && data.action === 'create' && data.data) {
          let projectId = null;
          const projectName = data.target_label || data.data.project_name;
          if (projectName) {
            const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
            if (proj) projectId = proj.id;
          }
          // Real alerts schema: severity/title/message/category/is_read (no type/is_resolved/assigned_to).
          const alertText = data.data.message || data.summary;
          const alertPayload = {
            project_id: projectId,
            severity: 'info',
            category: 'task',
            title: alertText,
            message: alertText,
            is_read: false,
          };
          if (!(await passesAllowlist('alerts', alertPayload, projectName))) {
            setLoading(false); return;
          }
          await supabase.from('alerts').insert(alertPayload);
          setMessages((prev) => [...prev, { role: 'ai', text: `📌 ${data.summary}\n\nהמשימה נוספה ללוח הבקרה.` }]);
        } else if (data.target_table === 'supplier_quote' && data.action === 'import' && Array.isArray(data.data)) {
          const qi = data.quote_info || {};
          const items = data.data;

          if (!qi.project_name) {
            const projMatch = userMsg.match(/(?:לפרויקט|פרויקט|project)\s+(.+?)(?:\s*[-–—,.]|$)/i);
            if (projMatch) qi.project_name = projMatch[1].trim();
          }
          if (!qi.supplier_name) {
            const allDesc = items.map((it: any) => it.description || '').join(' ');
            if (/flowtite|amiblu/i.test(allDesc)) qi.supplier_name = 'Amiblu';
            else if (/hobas/i.test(allDesc)) qi.supplier_name = 'Hobas';
            else {
              const supMatch = userMsg.match(/(?:מ-|של|from)\s*([A-Za-zא-ת]+)/i);
              if (supMatch) qi.supplier_name = supMatch[1].trim();
            }
          }
          if (!qi.currency) {
            const firstCur = items.find((it: any) => it.currency)?.currency;
            if (firstCur) qi.currency = firstCur;
          }
          if (!qi.quote_ref) {
            const allDesc = items.map((it: any) => it.description || '').join(' ');
            const refMatch = allDesc.match(/\b(MUA[\d.]+|Q[\d-]+|REF[\s:-]*([\w.-]+))/i);
            if (refMatch) qi.quote_ref = refMatch[1];
          }

          const itemLines = items.map((it: any, i: number) =>
            `${i + 1}. ${it.item_type} | DN${it.dn || '?'} SN${it.sn || '?'} | ${it.length_m ? it.length_m + 'm' : ''} | ${it.unit_price} ${it.currency || qi.currency || '?'}/${it.price_per || 'meter'}${it.description ? ' — ' + it.description : ''}`
          ).join('\n');
          const projectLine = qi.project_name ? `פרויקט: ${qi.project_name}\n` : '';
          const askLine = qi.project_name
            ? `💾 לשמור כתמחור לפרויקט "${qi.project_name}"? (כן / שם פרויקט אחר / "ספק" לקוטציה כללית / לא)`
            : `💾 לאיזה פרויקט לשמור?\nציין שם פרויקט, "ספק" לשמירה כקוטציית ספק, או "לא" לביטול`;
          const preview = `📋 קוטציה מ-${qi.supplier_name || 'ספק'}\nRef: ${qi.quote_ref || '—'}\nתאריך: ${qi.quote_date || '—'}\n${projectLine}מטבע: ${qi.currency || '—'}\n\n${itemLines}\n\nסה"כ ${items.length} פריטים.\n\n${askLine}`;
          if (qi.project_name) {
            setPendingImport({ step: 'confirm', quote_info: qi, items, projectName: qi.project_name });
          } else {
            setPendingImport({ step: 'ask_project', quote_info: qi, items });
          }
          setPendingQuote(null);
          setMessages((prev) => [...prev, { role: 'ai', text: preview }]);
        } else if (data.target_table === 'drawings' && data.action === 'query') {
          const term = (data.search || '').trim();
          const supabase = createClient();
          const [{ data: atts }, { data: projs }, { data: dets }] = await Promise.all([
            supabase.from('attachments').select('id, project_id, file_name, drawing_number').eq('entity_type', 'project'),
            supabase.from('projects').select('id, name'),
            supabase.from('project_details').select('project_id, project_number'),
          ]);
          const nameById: Record<string, string> = {};
          (projs || []).forEach((p: any) => { nameById[p.id] = p.name; });
          const numById: Record<string, number> = {};
          (dets || []).forEach((d: any) => { if (d.project_number != null) numById[d.project_id] = d.project_number; });
          const t = term.toLowerCase();
          const matches = (atts || []).filter((a: any) => {
            const ref = `${numById[a.project_id] ?? ''}/${a.drawing_number ?? ''}`;
            return !t || [a.drawing_number, nameById[a.project_id], String(numById[a.project_id] ?? ''), ref, a.file_name]
              .some((f: any) => (f || '').toLowerCase().includes(t));
          });
          if (matches.length === 0) {
            setMessages((prev) => [...prev, { role: 'ai', text: `לא מצאתי שרטוטים תואמים ל"${term}".` }]);
          } else {
            const lines = matches.slice(0, 8).map((a: any) => `• ${numById[a.project_id] ?? '—'}/${a.drawing_number || '?'} — ${nameById[a.project_id] || ''} (${a.file_name})`).join('\n');
            setMessages((prev) => [...prev, { role: 'ai', text: `📐 מצאתי ${matches.length} שרטוטים:\n${lines}\n\nפותח את מסך השרטוטים לצפייה…` }]);
            router.push(`/drawings?q=${encodeURIComponent(term)}`);
          }
        } else {
          const debugInfo = `action: ${data.action}, table: ${data.target_table}, data_type: ${Array.isArray(data.data) ? `array[${data.data?.length}]` : typeof data.data}`;
          setMessages((prev) => [...prev, { role: 'ai', text: `${data.summary || data.message || 'תגובה לא מזוהה'}\n\n[debug: ${debugInfo}]` }]);
        }
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
          open ? 'bg-neutral-700 text-white rotate-45' : 'bg-primary text-white'
        }`}
        title={`רקסי AI (${shortcutLabel})`}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : (
          <Icon name="ai" size={28} />
        )}
      </button>

      {/* Shortcut hint — only when closed */}
      {!open && (
        <div className="fixed bottom-[88px] left-6 z-50 bg-neutral-900 text-white text-[12px] px-2 py-1 rounded-full opacity-60">
          {shortcutLabel}
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 left-6 z-50 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-line-subtle flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-4 py-3 bg-azure-100 flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <Icon name="ai" size={24} className="text-azure-600" />
              <div>
                <p className="text-lg font-bold text-azure-600">רקסי AI</p>
                <p className="text-[12px] text-navy-500">{context}</p>
              </div>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-navy-300 hover:text-azure-600 transition-colors"
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
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
                    msg.role === 'user'
                      ? 'bg-primary text-white rounded-tr-none'
                      : 'bg-neutral-100 text-content-body rounded-tl-none'
                  }`}
                >
                  {msg.text}
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex justify-end">
                <div className="bg-neutral-100 rounded-xl px-4 py-2 rounded-tl-none">
                  <div className="flex gap-1">
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                    <span className="w-1.5 h-1.5 bg-neutral-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {/* Uploaded files */}
          {uploadedFiles.length > 0 && (
            <div className="px-3 py-2 border-t border-line-subtle space-y-1.5 flex-shrink-0 max-h-[120px] overflow-y-auto">
              {uploadedFiles.map((file, i) => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const icon: IconName = file.mimeType.startsWith('image/') ? 'image'
                  : ext === 'pdf' ? 'pdf'
                  : ['xls', 'xlsx', 'csv'].includes(ext) ? 'excel'
                  : ['doc', 'docx'].includes(ext) ? 'doc'
                  : 'file';
                return (
                  <div key={i} className="flex items-center gap-2 bg-neutral-50 rounded-lg px-2.5 py-1.5 group">
                    <span className="flex-shrink-0 text-primary"><Icon name={icon} size={18} /></span>
                    <span className="text-[12px] text-content-body truncate flex-1" dir="ltr">{file.name}</span>
                    <button
                      onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-neutral-300 hover:text-danger text-sm flex-shrink-0 transition-colors"
                    >
                      <Icon name="close" size={16} />
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Input */}
          <div className="border-t border-line-subtle px-3 py-2 flex-shrink-0">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.csv,.txt"
              onChange={async (e) => {
                if (!e.target.files || e.target.files.length === 0) return;
                const fl = e.target.files;
                e.target.value = '';
                const files = await loadFiles(fl);
                // Accumulate (don't auto-send) so several files — added together or one
                // after another — can be sent and merged into one extraction.
                setUploadedFiles((prev) => [...prev, ...files]);
              }}
              className="hidden"
            />
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="text-neutral-400 hover:text-primary p-1.5 rounded-lg hover:bg-primary-50 transition-colors disabled:opacity-50"
                title="העלה קובץ"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
                </svg>
              </button>
              <button
                onClick={toggleRecording}
                disabled={loading}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                  isRecording
                    ? 'text-danger bg-danger-soft animate-pulse'
                    : 'text-neutral-400 hover:text-primary hover:bg-primary-50'
                }`}
                title={isRecording ? 'עצור הקלטה' : 'הקלט קולי'}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              </button>
              <input
                ref={inputRef}
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                placeholder="שאל את רקסי..."
                className="flex-1 border border-line-subtle rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary-100 focus:border-primary"
                disabled={loading}
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || (!input.trim() && uploadedFiles.length === 0)}
                className="bg-primary text-white font-semibold px-2.5 py-2 rounded-lg text-sm hover:bg-primary-700 transition-colors disabled:opacity-50"
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
