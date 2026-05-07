'use client';

import { useState, useRef, useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
  const [pendingConfirm, setPendingConfirm] = useState<any>(null);
  const recognitionRef = useRef<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const pathname = usePathname();
  const context = getContext(pathname);

  // Initialize welcome message
  useEffect(() => {
    setMessages([{ role: 'ai', text: `היי! אני רקסי. איך אפשר לעזור?` }]);
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

  // Strip empty strings, null, undefined — Supabase rejects "" for UUID/numeric fields
  function cleanFields(obj: any) {
    if (!obj || typeof obj !== 'object') return obj;
    const out: any = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v === null || v === undefined) continue;
      if (typeof v === 'string' && v.trim() === '') continue;
      out[k] = v;
    }
    return out;
  }

  async function handleAiAction(data: any, supabase: any, userMsg: string) {
    const { action, target_table, target_label, data: fields, filter } = data;

    // ── project_updates create ──────────────────────────────────────────────
    if (target_table === 'project_updates' && action === 'create' && fields) {
      const projectName = target_label || fields.project_name;
      if (!projectName) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא צוין שם פרויקט.` }]); return; }
      const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
      if (!proj) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט בשם "${projectName}".` }]); return; }
      await supabase.from('project_updates').insert({
        project_id: proj.id,
        update_date: new Date().toISOString().substring(0, 10),
        people: fields.people || '',
        title: fields.title || '',
        description: fields.description || '',
        tasks: fields.tasks || '',
      });
      const tasksText = fields.tasks || '';
      if (tasksText.trim()) {
        const taskLines = tasksText.split(/[,\n]/).map((t: string) => t.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
        for (const task of taskLines) {
          await supabase.from('alerts').insert({ project_id: proj.id, type: 'task', message: task, is_resolved: false, assigned_to: projectName });
        }
      }
      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}\n\nהעדכון נוסף לכרטיס הפרויקט.${tasksText.trim() ? '\n📌 המשימות נוספו ללוח הבקרה.' : ''}` }]);
      return;
    }

    // ── alerts create ───────────────────────────────────────────────────────
    if (target_table === 'alerts' && action === 'create' && fields) {
      let projectId = null;
      const projectName = target_label || fields.project_name;
      if (projectName) {
        const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
        if (proj) projectId = proj.id;
      }
      await supabase.from('alerts').insert({ project_id: projectId, type: fields.type || 'task', message: fields.message || data.summary, is_resolved: false, assigned_to: fields.assigned_to || projectName || null });
      setMessages((prev) => [...prev, { role: 'ai', text: `📌 ${data.summary}\n\nהמשימה נוספה ללוח הבקרה.` }]);
      return;
    }

    // ── supplier_quote import ───────────────────────────────────────────────
    if (target_table === 'supplier_quote' && action === 'import' && Array.isArray(data.data)) {
      const qi = data.quote_info || {};
      const items = data.data;
      if (!qi.project_name) { const m = userMsg.match(/(?:לפרויקט|פרויקט|project)\s+(.+?)(?:\s*[-–—,.]|$)/i); if (m) qi.project_name = m[1].trim(); }
      if (!qi.supplier_name) { const allDesc = items.map((it: any) => it.description || '').join(' '); if (/flowtite|amiblu/i.test(allDesc)) qi.supplier_name = 'Amiblu'; else if (/hobas/i.test(allDesc)) qi.supplier_name = 'Hobas'; else { const sm = userMsg.match(/(?:מ-|של|from)\s*([A-Za-zא-ת]+)/i); if (sm) qi.supplier_name = sm[1].trim(); } }
      if (!qi.currency) { const fc = items.find((it: any) => it.currency)?.currency; if (fc) qi.currency = fc; }
      if (!qi.quote_ref) { const allDesc = items.map((it: any) => it.description || '').join(' '); const rm = allDesc.match(/\b(MUA[\d.]+|Q[\d-]+|REF[\s:-]*([\w.-]+))/i); if (rm) qi.quote_ref = rm[1]; }
      const itemLines = items.map((it: any, i: number) =>
        `${i + 1}. ${it.item_type} | DN${it.dn || '?'} SN${it.sn || '?'} | ${it.length_m ? it.length_m + 'm' : ''} | ${it.unit_price} ${it.currency || qi.currency || '?'}/${it.price_per || 'meter'}${it.description ? ' — ' + it.description : ''}`
      ).join('\n');
      const preview = `📋 קוטציה מ-${qi.supplier_name || 'ספק'}\nRef: ${qi.quote_ref || '—'}\nתאריך: ${qi.quote_date || '—'}\nפרויקט: ${qi.project_name || '—'}\nמטבע: ${qi.currency || '—'}\n\n${itemLines}\n\nסה"כ ${items.length} פריטים.\n\n💾 לשמור? (כן / לא)`;
      setPendingQuote({ quote_info: qi, items });
      setMessages((prev) => [...prev, { role: 'ai', text: preview }]);
      return;
    }

    // ── update / delete — require confirmation ──────────────────────────────
    if (action === 'update' || action === 'delete') {
      const filterDesc = filter ? Object.entries(filter).map(([k, v]) => `${k}: ${v}`).join(', ') : target_label || '—';
      let confirmText: string;
      if (action === 'delete') {
        confirmText = `🗑️ מחיקה מטבלה "${target_table}"\nחיפוש לפי: ${filterDesc}\n\nלאשר מחיקה? (כן / לא)`;
      } else {
        // Update — show all parts that will change/be added
        const parts: string[] = [`✏️ עדכון בטבלה "${target_table}"`, `חיפוש לפי: ${filterDesc}`];
        if (fields && Object.keys(cleanFields(fields)).length > 0) {
          parts.push('\nשדות לעדכון:');
          for (const [k, v] of Object.entries(cleanFields(fields))) parts.push(`  • ${k}: ${v}`);
        }
        if (target_table === 'projects' && data.project_details && Object.keys(cleanFields(data.project_details)).length > 0) {
          parts.push('\nפרטי פרויקט (עדכון/הוספה):');
          for (const [k, v] of Object.entries(cleanFields(data.project_details))) parts.push(`  • ${k}: ${v}`);
        }
        if (target_table === 'projects' && Array.isArray(data.contacts) && data.contacts.length > 0) {
          parts.push(`\nאנשי קשר חדשים (${data.contacts.length}):`);
          for (const c of data.contacts) parts.push(`  • ${c.role || ''}: ${c.name || ''}${c.phone ? ' — ' + c.phone : ''}`);
        }
        if (target_table === 'projects' && Array.isArray(data.pipe_specs) && data.pipe_specs.length > 0) {
          parts.push(`\nמפרטי צנרת חדשים (${data.pipe_specs.length}):`);
          for (const s of data.pipe_specs) parts.push(`  • DN${s.dn_mm || s.diameter_mm || '?'} | ${s.line_length_m || '?'}m | ${s.pressure_bar || '?'} bar`);
        }
        if (target_table === 'projects' && Array.isArray(data.project_updates) && data.project_updates.length > 0) {
          parts.push(`\nעדכונים/פגישות חדשים (${data.project_updates.length}):`);
          for (const u of data.project_updates) parts.push(`  • ${u.update_date || 'היום'} — ${u.title || ''}`);
        }
        parts.push('\nלאשר? (כן / לא)');
        confirmText = parts.join('\n');
      }
      setPendingConfirm({ action, target_table, filter, fields, target_label, summary: data.summary, project_details: data.project_details, contacts: data.contacts, pipe_specs: data.pipe_specs, project_updates: data.project_updates });
      setMessages((prev) => [...prev, { role: 'ai', text: confirmText }]);
      return;
    }

    // ── projects create (with details, contacts, pipe_specs, updates) ─────
    if (target_table === 'projects' && action === 'create' && fields) {
      const { data: newProj, error } = await supabase.from('projects').insert(cleanFields(fields)).select('id').single();
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${error.message}` }]); return; }
      const projId = newProj?.id;
      const extras: string[] = [];

      if (projId && data.project_details && Object.keys(cleanFields(data.project_details)).length > 0) {
        const { error: e2 } = await supabase.from('project_details').insert({ ...cleanFields(data.project_details), project_id: projId });
        if (e2) extras.push(`⚠️ פרטי פרויקט: ${e2.message}`); else extras.push(`📋 נשמרו פרטי פרויקט`);
      }

      if (projId && Array.isArray(data.contacts) && data.contacts.length > 0) {
        const cleanContacts = data.contacts.map((c: any) => ({ ...cleanFields(c), project_id: projId })).filter((c: any) => c.name || c.role);
        if (cleanContacts.length > 0) {
          const { error: e3 } = await supabase.from('project_contacts').insert(cleanContacts);
          if (e3) extras.push(`⚠️ אנשי קשר: ${e3.message}`); else extras.push(`👥 נוספו ${cleanContacts.length} אנשי קשר`);
        }
      }

      if (projId && Array.isArray(data.pipe_specs) && data.pipe_specs.length > 0) {
        // Map diameter_mm → dn_mm for backward compatibility
        const cleanSpecs = data.pipe_specs.map((s: any) => {
          const obj: any = { ...s };
          if (obj.diameter_mm && !obj.dn_mm) { obj.dn_mm = obj.diameter_mm; delete obj.diameter_mm; }
          return { ...cleanFields(obj), project_id: projId };
        }).filter((s: any) => s.dn_mm);
        if (cleanSpecs.length > 0) {
          const { error: e4 } = await supabase.from('pipe_specs').insert(cleanSpecs);
          if (e4) extras.push(`⚠️ מפרטי צנרת: ${e4.message}`); else extras.push(`📏 נוספו ${cleanSpecs.length} מפרטי צנרת`);
        }
      }

      if (projId && Array.isArray(data.project_updates) && data.project_updates.length > 0) {
        const cleanUpdates = data.project_updates.map((u: any) => ({
          project_id: projId,
          update_date: u.update_date || new Date().toISOString().substring(0, 10),
          people: u.people || '',
          title: u.title || '',
          description: u.description || '',
          tasks: u.tasks || '',
        })).filter((u: any) => u.title || u.description || u.people);
        if (cleanUpdates.length > 0) {
          const { error: e5 } = await supabase.from('project_updates').insert(cleanUpdates);
          if (e5) extras.push(`⚠️ עדכונים: ${e5.message}`); else extras.push(`📝 נוספו ${cleanUpdates.length} עדכונים/פגישות`);
          // Also create alerts from any tasks mentioned in the updates
          for (const u of cleanUpdates) {
            const tasksText = u.tasks || '';
            if (tasksText.trim()) {
              const taskLines = tasksText.split(/[,\n]/).map((t: string) => t.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
              for (const task of taskLines) {
                await supabase.from('alerts').insert({ project_id: projId, type: 'task', message: task, is_resolved: false, assigned_to: fields.name });
              }
            }
          }
        }
      }

      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}${extras.length > 0 ? '\n' + extras.join('\n') : ''}` }]);
      return;
    }

    // ── leads create ────────────────────────────────────────────────────────
    if (target_table === 'leads' && action === 'create' && fields) {
      const { error } = await supabase.from('leads').insert(cleanFields(fields));
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${error.message}` }]); return; }
      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}` }]);
      return;
    }

    // ── inventory create ────────────────────────────────────────────────────
    if (target_table === 'inventory' && action === 'create' && fields) {
      const { error } = await supabase.from('inventory').insert(cleanFields(fields));
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${error.message}` }]); return; }
      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}` }]);
      return;
    }

    // ── project_contacts create ─────────────────────────────────────────────
    if (target_table === 'project_contacts' && action === 'create' && fields) {
      const projectName = target_label;
      if (!projectName) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא צוין שם פרויקט.` }]); return; }
      const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
      if (!proj) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט בשם "${projectName}".` }]); return; }
      const { error } = await supabase.from('project_contacts').insert({ ...cleanFields(fields), project_id: proj.id });
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${error.message}` }]); return; }
      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}` }]);
      return;
    }

    // ── pipe_specs create ───────────────────────────────────────────────────
    if (target_table === 'pipe_specs' && action === 'create' && fields) {
      const projectName = target_label;
      if (!projectName) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא צוין שם פרויקט.` }]); return; }
      const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
      if (!proj) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט בשם "${projectName}".` }]); return; }
      const obj: any = { ...fields };
      if (obj.diameter_mm && !obj.dn_mm) { obj.dn_mm = obj.diameter_mm; delete obj.diameter_mm; }
      const { error } = await supabase.from('pipe_specs').insert({ ...cleanFields(obj), project_id: proj.id });
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${error.message}` }]); return; }
      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}` }]);
      return;
    }

    // ── project_details update (via project name) ──────────────────────────
    if (target_table === 'project_details' && action === 'create' && fields) {
      const projectName = target_label;
      if (!projectName) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא צוין שם פרויקט.` }]); return; }
      const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${projectName}%`).limit(1).single();
      if (!proj) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט בשם "${projectName}".` }]); return; }
      const { error } = await supabase.from('project_details').upsert({ ...cleanFields(fields), project_id: proj.id }, { onConflict: 'project_id' });
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${error.message}` }]); return; }
      setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${data.summary}` }]);
      return;
    }

    // ── query ───────────────────────────────────────────────────────────────
    if (action === 'query') {
      const table = target_table;
      if (!table) { setMessages((prev) => [...prev, { role: 'ai', text: data.summary || data.message || '?' }]); return; }
      const qf = data.query_filter || {};
      const qfields = Array.isArray(data.query_fields) && data.query_fields.length > 0 ? data.query_fields.join(', ') : '*';
      let query = supabase.from(table).select(qfields).limit(20);
      for (const [k, v] of Object.entries(qf)) {
        if (typeof v === 'string') query = query.ilike(k, `%${v}%`);
        else query = query.eq(k, v);
      }
      const { data: rows, error } = await query;
      if (error) { setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאת שאילתה: ${error.message}` }]); return; }
      if (!rows || rows.length === 0) { setMessages((prev) => [...prev, { role: 'ai', text: `🔍 לא נמצאו תוצאות.` }]); return; }
      const lines = rows.map((r: any, i: number) => {
        const vals = Object.entries(r).filter(([, v]) => v !== null && v !== '').map(([k, v]) => `${k}: ${v}`).join(' | ');
        return `${i + 1}. ${vals}`;
      }).join('\n');
      setMessages((prev) => [...prev, { role: 'ai', text: `🔍 ${data.summary || `תוצאות מ-${table}`} (${rows.length}):\n\n${lines}` }]);
      return;
    }

    // fallback
    setMessages((prev) => [...prev, { role: 'ai', text: data.summary || data.message || JSON.stringify(data) }]);
  }

  async function handleSend() {
    if ((!input.trim() && uploadedFiles.length === 0) || loading) return;
    const supabase = createClient();

    const userMsg = input.trim() || `חלץ נתונים מ-${uploadedFiles.map((f) => f.name).join(', ')}`;
    setInput('');
    if (inputRef.current) { inputRef.current.style.height = 'auto'; }
    setMessages((prev) => [...prev, { role: 'user', text: userMsg }]);
    setLoading(true);

    // Handle pending quote confirmation
    if (pendingQuote) {
      const isYes = /^(כן|yes|אישור|שמור|ok|אוקיי|בטח)$/i.test(userMsg.trim());
      const isNo = /^(לא|no|ביטול|cancel)$/i.test(userMsg.trim());
      if (isYes) {
        try {
          const qi = pendingQuote.quote_info;
          const items = pendingQuote.items;
          // Find or create supplier
          let supplierId: string | null = null;
          if (qi.supplier_name) {
            const { data: existing } = await supabase.from('suppliers').select('id').ilike('name', `%${qi.supplier_name}%`).limit(1).single();
            if (existing) {
              supplierId = existing.id;
            } else {
              const { data: newSup } = await supabase.from('suppliers').insert({ name: qi.supplier_name, currency: qi.currency || 'USD' }).select('id').single();
              if (newSup) supplierId = newSup.id;
            }
          }
          // Create supplier_quote
          const { data: sq, error: sqErr } = await supabase.from('supplier_quotes').insert({
            supplier_id: supplierId,
            quote_ref: qi.quote_ref || null,
            quote_date: qi.quote_date || null,
            project_name: qi.project_name || null,
            currency: qi.currency || 'USD',
          }).select('id').single();
          if (sqErr) throw sqErr;
          // Create items
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
      // If neither yes nor no, clear pending and continue as normal message
      setPendingQuote(null);
    }

    // Handle pending update/delete confirmation
    if (pendingConfirm) {
      const isYes = /^(כן|yes|אישור|שמור|ok|אוקיי|בטח)$/i.test(userMsg.trim());
      const isNo = /^(לא|no|ביטול|cancel)$/i.test(userMsg.trim());
      if (isYes) {
        const { action, target_table, filter, fields, target_label, summary } = pendingConfirm;
        try {
          if (action === 'delete') {
            const nameKey = filter ? Object.keys(filter)[0] : 'name';
            const nameVal = filter ? Object.values(filter)[0] : target_label;
            const { data: found } = await supabase.from(target_table).select('id').ilike(nameKey, `%${nameVal}%`).limit(1).single();
            if (!found) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי רשומה ל-${nameVal}.` }]); setPendingConfirm(null); setLoading(false); return; }
            const { error } = await supabase.from(target_table).delete().eq('id', found.id);
            if (error) throw error;
            setMessages((prev) => [...prev, { role: 'ai', text: `🗑️ נמחק בהצלחה.` }]);
          } else if (action === 'update') {
            const nameKey = filter ? Object.keys(filter)[0] : 'name';
            const nameVal = filter ? Object.values(filter)[0] : target_label;
            const cleanedFields: any = {};
            if (fields) {
              for (const [k, v] of Object.entries(fields)) {
                if (v === null || v === undefined) continue;
                if (typeof v === 'string' && v.trim() === '') continue;
                cleanedFields[k] = v;
              }
            }
            const extras: string[] = [];

            if (target_table === 'project_details') {
              const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${nameVal}%`).limit(1).single();
              if (!proj) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט "${nameVal}".` }]); setPendingConfirm(null); setLoading(false); return; }
              const { error } = await supabase.from('project_details').upsert({ ...cleanedFields, project_id: proj.id }, { onConflict: 'project_id' });
              if (error) throw error;
            } else if (target_table === 'projects') {
              const { data: proj } = await supabase.from('projects').select('id').ilike('name', `%${nameVal}%`).limit(1).single();
              if (!proj) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי פרויקט "${nameVal}".` }]); setPendingConfirm(null); setLoading(false); return; }
              const projId = proj.id;

              // 1. Update main projects table
              if (Object.keys(cleanedFields).length > 0) {
                const { error: e1 } = await supabase.from('projects').update(cleanedFields).eq('id', projId);
                if (e1) throw e1;
              }

              // 2. Upsert project_details
              const pd = pendingConfirm.project_details;
              if (pd && Object.keys(cleanFields(pd)).length > 0) {
                const { error: e2 } = await supabase.from('project_details').upsert({ ...cleanFields(pd), project_id: projId }, { onConflict: 'project_id' });
                if (e2) extras.push(`⚠️ פרטי פרויקט: ${e2.message}`); else extras.push(`📋 עודכנו פרטי פרויקט`);
              }

              // 3. Insert new contacts
              const newContacts = pendingConfirm.contacts;
              if (Array.isArray(newContacts) && newContacts.length > 0) {
                const rows = newContacts.map((c: any) => ({ ...cleanFields(c), project_id: projId })).filter((c: any) => c.name || c.role);
                if (rows.length > 0) {
                  const { error: e3 } = await supabase.from('project_contacts').insert(rows);
                  if (e3) extras.push(`⚠️ אנשי קשר: ${e3.message}`); else extras.push(`👥 נוספו ${rows.length} אנשי קשר`);
                }
              }

              // 4. Insert new pipe_specs
              const newSpecs = pendingConfirm.pipe_specs;
              if (Array.isArray(newSpecs) && newSpecs.length > 0) {
                const rows = newSpecs.map((s: any) => {
                  const obj: any = { ...s };
                  if (obj.diameter_mm && !obj.dn_mm) { obj.dn_mm = obj.diameter_mm; delete obj.diameter_mm; }
                  return { ...cleanFields(obj), project_id: projId };
                }).filter((s: any) => s.dn_mm);
                if (rows.length > 0) {
                  const { error: e4 } = await supabase.from('pipe_specs').insert(rows);
                  if (e4) extras.push(`⚠️ מפרטי צנרת: ${e4.message}`); else extras.push(`📏 נוספו ${rows.length} מפרטי צנרת`);
                }
              }

              // 5. Insert new project_updates + derive alerts
              const newUpdates = pendingConfirm.project_updates;
              if (Array.isArray(newUpdates) && newUpdates.length > 0) {
                const rows = newUpdates.map((u: any) => ({
                  project_id: projId,
                  update_date: u.update_date || new Date().toISOString().substring(0, 10),
                  people: u.people || '',
                  title: u.title || '',
                  description: u.description || '',
                  tasks: u.tasks || '',
                })).filter((u: any) => u.title || u.description || u.people);
                if (rows.length > 0) {
                  const { error: e5 } = await supabase.from('project_updates').insert(rows);
                  if (e5) extras.push(`⚠️ עדכונים: ${e5.message}`); else extras.push(`📝 נוספו ${rows.length} עדכונים/פגישות`);
                  for (const u of rows) {
                    const tasksText = u.tasks || '';
                    if (tasksText.trim()) {
                      const taskLines = tasksText.split(/[,\n]/).map((t: string) => t.replace(/^\d+[\.\)]\s*/, '').trim()).filter(Boolean);
                      for (const task of taskLines) {
                        await supabase.from('alerts').insert({ project_id: projId, type: 'task', message: task, is_resolved: false, assigned_to: nameVal });
                      }
                    }
                  }
                }
              }
            } else {
              const { data: found } = await supabase.from(target_table).select('id').ilike(nameKey as string, `%${nameVal}%`).limit(1).single();
              if (!found) { setMessages((prev) => [...prev, { role: 'ai', text: `⚠️ לא מצאתי רשומה ל-${nameVal}.` }]); setPendingConfirm(null); setLoading(false); return; }
              const { error } = await supabase.from(target_table).update(cleanedFields).eq('id', found.id);
              if (error) throw error;
            }
            setMessages((prev) => [...prev, { role: 'ai', text: `✅ ${summary || 'עודכן בהצלחה.'}${extras.length > 0 ? '\n' + extras.join('\n') : ''}` }]);
          }
        } catch (err: any) {
          setMessages((prev) => [...prev, { role: 'ai', text: `❌ שגיאה: ${err.message}` }]);
        }
        setPendingConfirm(null);
        setLoading(false);
        return;
      } else if (isNo) {
        setPendingConfirm(null);
        setMessages((prev) => [...prev, { role: 'ai', text: '🚫 בוטל — לא בוצע שינוי.' }]);
        setLoading(false);
        return;
      }
      setPendingConfirm(null);
    }

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
        await handleAiAction(data, supabase, userMsg);
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
        title={`רקסי AI (${shortcutLabel})`}
      >
        {open ? (
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
        ) : (
          <span className="text-3xl">✨</span>
        )}
      </button>

      {/* Shortcut hint — only when closed */}
      {!open && (
        <div className="fixed bottom-[88px] left-6 z-50 bg-gray-800 text-white text-[12px] px-2 py-1 rounded-full opacity-60">
          {shortcutLabel}
        </div>
      )}

      {/* Chat panel */}
      {open && (
        <div className="fixed bottom-24 left-6 z-50 w-[380px] h-[520px] bg-white rounded-2xl shadow-2xl border border-[#e2e8f0] flex flex-col overflow-hidden animate-fade-in-up">
          {/* Header */}
          <div className="px-4 py-3 bg-[#fce4ec] flex items-center justify-between flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="text-2xl">✨</span>
              <div>
                <p className="text-lg font-bold text-[#1a56db]">רקסי AI</p>
                <p className="text-[12px] text-[#1a56db]/60">{context}</p>
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
                  className={`max-w-[85%] rounded-xl px-3 py-2 text-sm whitespace-pre-wrap ${
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
            <div className="px-3 py-2 border-t border-[#e2e8f0] space-y-1.5 flex-shrink-0 max-h-[120px] overflow-y-auto">
              {uploadedFiles.map((file, i) => {
                const ext = file.name.split('.').pop()?.toLowerCase() || '';
                const icon = file.mimeType.startsWith('image/') ? '🖼️'
                  : ext === 'pdf' ? '📕'
                  : ['xls', 'xlsx', 'csv'].includes(ext) ? '📊'
                  : ['doc', 'docx'].includes(ext) ? '📝'
                  : '📄';
                return (
                  <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-2.5 py-1.5 group">
                    <span className="text-lg flex-shrink-0">{icon}</span>
                    <span className="text-[12px] text-gray-700 truncate flex-1" dir="ltr">{file.name}</span>
                    <button
                      onClick={() => setUploadedFiles((prev) => prev.filter((_, j) => j !== i))}
                      className="text-gray-300 hover:text-red-500 text-sm flex-shrink-0 transition-colors"
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
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
              <button
                onClick={toggleRecording}
                disabled={loading}
                className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                  isRecording
                    ? 'text-red-500 bg-red-50 animate-pulse'
                    : 'text-gray-400 hover:text-[#1a56db] hover:bg-blue-50'
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
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 160) + 'px';
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const shift = e.shiftKey || e.nativeEvent.shiftKey;
                    if (shift) {
                      e.preventDefault();
                      const el = e.currentTarget;
                      const start = el.selectionStart ?? el.value.length;
                      const end = el.selectionEnd ?? el.value.length;
                      const newVal = el.value.substring(0, start) + '\n' + el.value.substring(end);
                      setInput(newVal);
                      requestAnimationFrame(() => {
                        if (inputRef.current) {
                          inputRef.current.selectionStart = start + 1;
                          inputRef.current.selectionEnd = start + 1;
                          inputRef.current.style.height = 'auto';
                          inputRef.current.style.height = Math.min(inputRef.current.scrollHeight, 160) + 'px';
                        }
                      });
                    } else {
                      e.preventDefault();
                      handleSend();
                    }
                  }
                }}
                placeholder="שאל את רקסי... (Shift+Enter לשורה חדשה)"
                rows={1}
                className="flex-1 border border-[#e2e8f0] rounded-lg px-2.5 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db] resize-none overflow-hidden leading-5"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={loading || (!input.trim() && uploadedFiles.length === 0)}
                className="bg-[#fce4ec] text-[#1a56db] font-semibold px-2.5 py-2 rounded-lg text-sm hover:bg-[#f8bbd0] transition-colors disabled:opacity-50"
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
