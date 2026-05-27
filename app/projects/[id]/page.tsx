'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { MONTH_NAMES } from '@/lib/revenue';
import StatusTracker from '@/components/projects/StatusTracker';
import { DISCLAIMER_TEMPLATES, DISCLAIMER_TYPES } from '@/lib/disclaimers';
import PricingSection from '@/components/projects/PricingSection';
import CustomerForm from '@/components/customers/CustomerForm';
import CompanyAutocomplete from '@/components/projects/CompanyAutocomplete';

function formatDate(d: string | null) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('he-IL');
}

function formatDateInput(d: string | null) {
  if (!d) return '';
  return d.substring(0, 10);
}

function formatCurrency(v: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 0 }).format(v);
}

interface EditableFieldProps {
  label: string;
  value: string;
  editing: boolean;
  type?: 'text' | 'date' | 'number' | 'textarea' | 'select';
  options?: string[];
  onChange: (val: string) => void;
}

function EditableField({ label, value, editing, type = 'text', options, onChange }: EditableFieldProps) {
  const inputClass = 'w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]';

  return (
    <div className="flex items-baseline gap-2 py-1.5 border-b border-gray-50">
      <span className="text-[13px] text-gray-500 w-40 flex-shrink-0">{label}</span>
      {editing ? (
        type === 'textarea' ? (
          <textarea value={value} onChange={(e) => onChange(e.target.value)} className={`${inputClass} min-h-[60px]`} />
        ) : type === 'select' && options ? (
          <select value={value} onChange={(e) => onChange(e.target.value)} className={inputClass}>
            <option value="">—</option>
            {options.map((o) => <option key={o} value={o}>{o}</option>)}
          </select>
        ) : (
          <input type={type} value={value} onChange={(e) => onChange(e.target.value)} className={inputClass} dir={type === 'number' ? 'ltr' : 'rtl'} />
        )
      ) : (
        <span className="text-sm font-medium text-gray-800">{value || '—'}</span>
      )}
    </div>
  );
}

function SectionHeader({ title, icon, editing, onToggle, onSave, saving }: {
  title: string; icon: string; editing: boolean; onToggle: () => void; onSave: () => void; saving: boolean;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <h2 className="text-lg font-bold text-gray-700">{icon} {title}</h2>
      <div className="flex gap-2">
        {editing && (
          <button onClick={onSave} disabled={saving} className="text-[13px] bg-[#1a56db] text-white px-3 py-1.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50">
            {saving ? 'שומר...' : 'שמור'}
          </button>
        )}
        <button onClick={onToggle} className={`text-[13px] px-3 py-1.5 rounded-lg transition-colors ${editing ? 'bg-gray-100 text-gray-600 hover:bg-gray-200' : 'bg-blue-50 text-[#1a56db] hover:bg-blue-100'}`}>
          {editing ? 'ביטול' : 'עריכה'}
        </button>
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const supabase = createClient();
  const params = useParams();
  const router = useRouter();
  const [project, setProject] = useState<any>(null);
  const [details, setDetails] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [pipeSpecs, setPipeSpecs] = useState<any[]>([]);
  const [projectAttachments, setProjectAttachments] = useState<any[]>([]);
  const [projectQuotes, setProjectQuotes] = useState<any[]>([]);
  const [customersList, setCustomersList] = useState<{ id: string; name: string }[]>([]);
  const [showCustomerForm, setShowCustomerForm] = useState(false);
  const [uploadingDrawing, setUploadingDrawing] = useState(false);
  const [updates, setUpdates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedUpdate, setExpandedUpdate] = useState<string | null>(null);
  const [showAddUpdate, setShowAddUpdate] = useState(false);
  const [newUpdate, setNewUpdate] = useState({ update_date: new Date().toISOString().substring(0, 10), people: '', title: '', description: '', tasks: '' });
  const [exportUpdate, setExportUpdate] = useState<any>(null);
  const [exportLang, setExportLang] = useState<'he' | 'en'>('he');
  const [exportRecipient, setExportRecipient] = useState('');
  const [exportEmail, setExportEmail] = useState('');
  const [exportLoading, setExportLoading] = useState(false);
  const [exportCopied, setExportCopied] = useState(false);
  const [showProjectExport, setShowProjectExport] = useState(false);
  const [projectExportLang, setProjectExportLang] = useState<'he' | 'en'>('he');
  const [projectExportText, setProjectExportText] = useState('');
  const [projectExportLoading, setProjectExportLoading] = useState(false);
  const [projectExportCopied, setProjectExportCopied] = useState(false);

  // Edit states per section
  const [editInfo, setEditInfo] = useState(false);
  const [editDates, setEditDates] = useState(false);
  const [editType, setEditType] = useState(false);
  const [editStory, setEditStory] = useState(false);
  const [editContacts, setEditContacts] = useState(false);
  const [editSpecs, setEditSpecs] = useState(false);

  // Quotes & Pricing — moved to PricingSection component + usePricing hook

  // Editable form data
  const [form, setForm] = useState<any>({});
  const [detailForm, setDetailForm] = useState<any>({});
  const [contactsForm, setContactsForm] = useState<any[]>([]);
  const [specsForm, setSpecsForm] = useState<any[]>([]);
  const [contractorsForm, setContractorsForm] = useState<string[]>([]);
  const [contactPickerSupported, setContactPickerSupported] = useState(false);

  useEffect(() => {
    load();
    setContactPickerSupported(
      typeof navigator !== 'undefined' &&
      'contacts' in navigator &&
      // @ts-ignore
      typeof navigator.contacts?.select === 'function'
    );
  }, [params.id]);

  async function pickContactFromPhone() {
    try {
      // @ts-ignore
      const results = await navigator.contacts.select(['name', 'tel', 'email'], { multiple: true });
      if (!results || results.length === 0) return;
      const newContacts = results.map((c: any) => ({
        role: '',
        name: c.name?.[0] || '',
        phone: c.tel?.[0] || '',
        email: c.email?.[0] || '',
      }));
      setContactsForm((prev) => [...prev, ...newContacts]);
    } catch {
      // ביטל בחירה
    }
  }

  async function load() {
    try {
      const id = params.id as string;
      const [projRes, detRes, conRes, specRes, updRes, attRes, qRes, clientsRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', id).single(),
        supabase.from('project_details').select('*').eq('project_id', id).maybeSingle(),
        supabase.from('project_contacts').select('*').eq('project_id', id),
        supabase.from('pipe_specs').select('*').eq('project_id', id),
        supabase.from('project_updates').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('attachments').select('*').eq('project_id', id).order('created_at', { ascending: false }),
        supabase.from('quotes').select('id, quote_number, client_name').eq('project_id', id),
        supabase.from('clients').select('id, name').order('name'),
      ]);
      setCustomersList(clientsRes.data || []);

      const proj = projRes.data;
      const det = detRes.data || {};
      const cons = conRes.data || [];
      const specs = specRes.data || [];

      setProject(proj);
      setDetails(det);
      setContacts(cons);
      setPipeSpecs(specs);
      setUpdates(updRes.data || []);
      setProjectAttachments(attRes.data || []);
      setProjectQuotes(qRes.data || []);

      if (proj) setForm({ ...proj });
      setDetailForm({ ...det });
      setContactsForm(cons.filter((c: any) => c.role !== 'קבלן מבצע').map((c: any) => ({ ...c })));
      setContractorsForm(cons.filter((c: any) => c.role === 'קבלן מבצע').map((c: any) => c.name || ''));
      setSpecsForm(specs.map((s: any) => ({ ...s })));
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  function updateForm(key: string, val: any) {
    setForm((prev: any) => ({ ...prev, [key]: val }));
  }

  async function setProjectCustomer(customerId: string) {
    const value = customerId || null;
    await supabase.from('projects').update({ customer_id: value }).eq('id', params.id as string);
    setProject((prev: any) => ({ ...prev, customer_id: value }));
    setForm((prev: any) => ({ ...prev, customer_id: value }));
  }

  async function refreshCustomers() {
    const { data } = await supabase.from('clients').select('id, name').order('name');
    setCustomersList(data || []);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = reject;
      r.readAsDataURL(file);
    });
  }

  async function uploadProjectDrawing(file: File) {
    setUploadingDrawing(true);
    try {
      const id = params.id as string;
      const ext = file.name.split('.').pop() || 'file';
      const path = `${id}/drawings/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from('project-files').upload(path, file);
      if (upErr) { alert(`שגיאת העלאה: ${upErr.message}`); return; }
      const { data: att, error: insErr } = await supabase.from('attachments').insert({
        entity_type: 'project', entity_id: id, project_id: id,
        file_name: file.name, file_url: path, file_type: 'drawing', file_size_bytes: file.size,
      }).select().single();
      if (insErr) { alert(`שגיאה: ${insErr.message}`); return; }

      // Detect the drawing number: AI from the title block, with a filename fallback.
      try {
        let detected = '';
        const base64 = await fileToBase64(file);
        const res = await fetch('/api/ai', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ mode: 'drawing_meta', files: [{ base64, mimeType: file.type, name: file.name }] }),
        });
        const meta = await res.json();
        detected = meta?.drawing_number || '';
        if (!detected) {
          const m = file.name.replace(/\.[^.]+$/, '').match(/\d{3,5}-\d{1,4}/);
          if (m) detected = m[0];
        }
        if (detected && att) {
          await supabase.from('attachments').update({ drawing_number: detected }).eq('id', att.id);
        }
      } catch {
        const m = file.name.replace(/\.[^.]+$/, '').match(/\d{3,5}-\d{1,4}/);
        if (m && att) await supabase.from('attachments').update({ drawing_number: m[0] }).eq('id', att.id);
      }

      await load();
    } finally {
      setUploadingDrawing(false);
    }
  }

  async function setDrawingNumber(attId: string, drawingNumber: string) {
    await supabase.from('attachments').update({ drawing_number: drawingNumber || null }).eq('id', attId);
    setProjectAttachments((prev) => prev.map((a) => a.id === attId ? { ...a, drawing_number: drawingNumber } : a));
  }

  async function deleteProjectDrawing(attId: string) {
    const att = projectAttachments.find((a) => a.id === attId);
    if (att?.file_url) {
      let storagePath = att.file_url;
      if (storagePath.startsWith('http')) { const m = storagePath.match(/project-files\/(.+)$/); if (m) storagePath = m[1]; }
      await supabase.storage.from('project-files').remove([storagePath]);
    }
    await supabase.from('attachments').delete().eq('id', attId);
    setProjectAttachments((prev) => prev.filter((a) => a.id !== attId));
  }

  async function openDrawing(path: string) {
    if (/^https?:/.test(path)) { window.open(path, '_blank'); return; }
    const { data } = await supabase.storage.from('project-files').createSignedUrl(path, 3600);
    if (data?.signedUrl) window.open(data.signedUrl, '_blank');
  }

  function updateDetailForm(key: string, val: any) {
    setDetailForm((prev: any) => ({ ...prev, [key]: val }));
  }

  async function generateExportEmail(upd: any, lang: 'he' | 'en', recipient: string) {
    setExportLoading(true);
    setExportEmail('');
    try {
      const projectName = project?.name || '';
      const prompt = lang === 'he'
        ? `כתוב מייל עדכון מקצועי בעברית לגבי פרויקט "${projectName}".
הנמען: ${recipient || 'לא צוין'}
תאריך עדכון: ${upd.update_date}
אנשים מעורבים: ${upd.people}
כותרת: ${upd.title}
תיאור: ${upd.description || 'לא צוין'}
משימות: ${upd.tasks || 'לא צוינו'}

כתוב מייל מקצועי ומנומס הכולל נושא (Subject), גוף המייל עם סיכום העדכון והמשימות. החתימה: צוות פיברטק תשתיות.
אל תחזיר JSON — החזר טקסט רגיל בלבד.`
        : `Write a professional project update email in English about project "${projectName}".
Recipient: ${recipient || 'not specified'}
Update date: ${upd.update_date}
People involved: ${upd.people}
Title: ${upd.title}
Description: ${upd.description || 'N/A'}
Tasks: ${upd.tasks || 'N/A'}

Write a professional and polite email including Subject line, body with update summary and action items. Sign off as: Fibertech Infrastructure Team.
Do NOT return JSON — return plain text only.`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      const emailText = data.summary || data.message || (typeof data === 'string' ? data : JSON.stringify(data));
      setExportEmail(emailText);
    } catch {
      setExportEmail(lang === 'he' ? 'שגיאה ביצירת המייל. נסה שוב.' : 'Error generating email. Please try again.');
    } finally {
      setExportLoading(false);
    }
  }

  async function generateProjectExport(lang: 'he' | 'en') {
    setProjectExportLoading(true);
    setProjectExportText('');
    try {
      const d = details || {};
      const projectInfo = `שם: ${project?.name || ''}
יזם: ${project?.developer_name || ''}
משרד תכנון: ${project?.planning_office || ''}
מיקום: ${d.location || ''}
סטטוס: ${d.project_status || ''}
ערך הזמנה: ${project?.order_value || ''}
קבלן זוכה: ${d.winning_contractor || ''}
סוג פרויקט: ${d.project_type || ''}
סוג התקנה: ${d.installation_type || ''}
תיאור: ${d.description || project?.description || ''}
סיפור הפרויקט: ${d.project_story || ''}`;

      const contactsInfo = contacts.length > 0
        ? contacts.map((c: any) => `${c.role}: ${c.name} (${c.phone || ''} ${c.email || ''})`).join('\n')
        : 'אין';

      const specsInfo = pipeSpecs.length > 0
        ? pipeSpecs.map((s: any) => `DN${s.dn_mm || '—'}${s.od_mm ? ` OD${s.od_mm}` : ''}${s.id_mm ? ` ID${s.id_mm}` : ''} - ${s.line_length_m}מ׳ - SN${s.stiffness_pascal} - ${s.pressure_bar}בר`).join('\n')
        : 'אין';

      const updatesInfo = updates.length > 0
        ? updates.slice(0, 5).map((u: any) => `${u.update_date}: ${u.title} (${u.people})`).join('\n')
        : 'אין';

      const prompt = lang === 'he'
        ? `כתוב סיכום מקצועי ומקיף בעברית של הפרויקט הבא. הסיכום צריך לכלול: מידע כללי, אנשי קשר, מפרט צינורות, ועדכונים אחרונים. כתוב בצורה מסודרת ונקיה.

פרטי הפרויקט:
${projectInfo}

אנשי קשר:
${contactsInfo}

מפרט צינורות:
${specsInfo}

עדכונים אחרונים:
${updatesInfo}

אל תחזיר JSON — החזר טקסט רגיל בלבד. כתוב סיכום מקצועי.`
        : `Write a comprehensive professional summary in English of the following project. Include: general info, contacts, pipe specifications, and recent updates. Write in a clean, organized format.

Project details:
${projectInfo}

Contacts:
${contactsInfo}

Pipe specifications:
${specsInfo}

Recent updates:
${updatesInfo}

Do NOT return JSON — return plain text only. Write a professional summary.`;

      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: prompt }),
      });
      const data = await res.json();
      setProjectExportText(data.summary || data.message || (typeof data === 'string' ? data : JSON.stringify(data)));
    } catch {
      setProjectExportText(lang === 'he' ? 'שגיאה ביצירת הסיכום. נסה שוב.' : 'Error generating summary. Please try again.');
    } finally {
      setProjectExportLoading(false);
    }
  }

  async function saveInfo() {
    setSaving(true);
    try {
      const id = params.id as string;
      await supabase.from('projects').update({
        name: form.name,
        order_value: form.order_value ? parseFloat(form.order_value) : null,
        developer_name: form.developer_name,
        planning_office: form.planning_office,
        description: form.description,
        probability_percent: form.probability_percent ? parseInt(form.probability_percent) : 0,
        realization_status: form.realization_status,
        delivery_months: form.delivery_months ? parseInt(form.delivery_months) : null,
        status: form.status,
        last_updated_at: new Date().toISOString(),
      }).eq('id', id);

      // Upsert project_details
      const detailData = {
        project_id: id,
        location: detailForm.location,
        project_number: detailForm.project_number ? parseInt(detailForm.project_number) : null,
        ordering_entity: detailForm.ordering_entity,
        responsible_party: detailForm.responsible_party,
        winning_contractor: detailForm.winning_contractor,
      };

      if (detailForm.id) {
        await supabase.from('project_details').update(detailData).eq('id', detailForm.id);
      } else {
        await supabase.from('project_details').insert(detailData);
      }

      // Save contractors — delete old and insert new
      await supabase.from('project_contacts').delete().eq('project_id', id).eq('role', 'קבלן מבצע');
      const validContractors = contractorsForm.filter((c) => c.trim());
      if (validContractors.length > 0) {
        await supabase.from('project_contacts').insert(
          validContractors.map((name) => ({ project_id: id, role: 'קבלן מבצע', name }))
        );
      }

      setEditInfo(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveDates() {
    setSaving(true);
    try {
      const id = params.id as string;
      const data = {
        project_id: id,
        order_received_date: detailForm.order_received_date || null,
        approved_order_date: detailForm.approved_order_date || null,
        pipe_installation_start: detailForm.pipe_installation_start || null,
        tender_submission_date: detailForm.tender_submission_date || null,
        winning_contractor: detailForm.winning_contractor,
        winning_date: detailForm.winning_date || null,
        expected_pipe_order_date: detailForm.expected_pipe_order_date || null,
        delivery_months_list: detailForm.delivery_months_list || null,
      };

      if (detailForm.id) {
        await supabase.from('project_details').update(data).eq('id', detailForm.id);
      } else {
        await supabase.from('project_details').insert(data);
      }

      setEditDates(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveType() {
    setSaving(true);
    try {
      const id = params.id as string;
      const data = {
        project_id: id,
        description: detailForm.description,
        project_type: detailForm.project_type,
        installation_type: detailForm.installation_type,
        special_requirements: detailForm.special_requirements,
        field_supervision: detailForm.field_supervision,
        soil_type: detailForm.soil_type,
        push_depth: detailForm.push_depth,
        manhole_type: detailForm.manhole_type,
        connection_method: detailForm.connection_method,
      };

      if (detailForm.id) {
        await supabase.from('project_details').update(data).eq('id', detailForm.id);
      } else {
        await supabase.from('project_details').insert(data);
      }

      setEditType(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveStory() {
    setSaving(true);
    try {
      const id = params.id as string;
      const data = {
        project_id: id,
        project_story: detailForm.project_story,
        competitors: detailForm.competitors,
        assessments: detailForm.assessments,
        politics: detailForm.politics,
      };

      if (detailForm.id) {
        await supabase.from('project_details').update(data).eq('id', detailForm.id);
      } else {
        await supabase.from('project_details').insert(data);
      }

      setEditStory(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function saveContacts() {
    setSaving(true);
    try {
      const id = params.id as string;
      // Delete existing and re-insert
      await supabase.from('project_contacts').delete().eq('project_id', id);
      const valid = contactsForm.filter((c) => c.name?.trim());
      if (valid.length > 0) {
        await supabase.from('project_contacts').insert(
          valid.map((c) => ({
            project_id: id,
            role: c.role || '',
            name: c.name,
            company: c.company || '',
            phone: c.phone || '',
            email: c.email || '',
          }))
        );
      }

      // Auto-sync contacts that have a company into the customers list (one-way: project -> customers).
      await syncContactsToCustomers(valid);

      setEditContacts(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  // For each project contact with a company, find-or-create the customer and upsert the contact under it.
  async function syncContactsToCustomers(rows: any[]) {
    const withCompany = rows.filter((c) => c.name?.trim() && c.company?.trim());
    if (withCompany.length === 0) return;

    const companyNames = Array.from(new Set(withCompany.map((c) => c.company.trim())));
    const { data: existing } = await supabase.from('clients').select('id, name').in('name', companyNames);
    const idByName: Record<string, string> = {};
    (existing || []).forEach((c: any) => { idByName[c.name] = c.id; });

    const missing = companyNames.filter((n) => !idByName[n]);
    if (missing.length > 0) {
      const { data: created } = await supabase.from('clients').insert(missing.map((n) => ({ name: n, type: 'לקוח' }))).select('id, name');
      (created || []).forEach((c: any) => { idByName[c.name] = c.id; });
    }

    for (const c of withCompany) {
      const clientId = idByName[c.company.trim()];
      if (!clientId) continue;
      const { data: match } = await supabase.from('client_contacts').select('id').eq('client_id', clientId).eq('name', c.name.trim()).limit(1);
      const payload = { role: c.role || null, phone: c.phone || null, email: c.email || null };
      if (match && match.length > 0) {
        await supabase.from('client_contacts').update(payload).eq('id', match[0].id);
      } else {
        await supabase.from('client_contacts').insert({ client_id: clientId, name: c.name.trim(), ...payload });
      }
    }
  }

  async function saveSpecs() {
    setSaving(true);
    try {
      const id = params.id as string;
      await supabase.from('pipe_specs').delete().eq('project_id', id);
      const valid = specsForm.filter((s) => s.dn_mm || s.od_mm || s.id_mm);
      if (valid.length > 0) {
        await supabase.from('pipe_specs').insert(
          valid.map((s) => ({
            project_id: id,
            dn_mm: s.dn_mm ? parseInt(s.dn_mm) : null,
            od_mm: s.od_mm ? parseInt(s.od_mm) : null,
            id_mm: s.id_mm ? parseInt(s.id_mm) : null,
            pipe_type: s.pipe_type || 'הטמנה',
            line_length_m: s.line_length_m ? parseFloat(s.line_length_m) : null,
            unit_length_m: s.unit_length_m || null,
            stiffness_pascal: s.stiffness_pascal ? parseInt(s.stiffness_pascal) : null,
            pressure_bar: s.pressure_bar ? parseFloat(s.pressure_bar) : null,
            notes: s.notes || '',
          }))
        );
      }
      setEditSpecs(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  // Pricing functions moved to usePricing hook + PricingSection component
  const _pricingMoved = true; // marker

  function cancelEdit(section: string) {
    if (section === 'info') { setForm({ ...project }); setDetailForm({ ...details }); setContractorsForm(contacts.filter((c) => c.role === 'קבלן מבצע').map((c) => c.name || '')); setEditInfo(false); }
    if (section === 'dates') { setDetailForm({ ...details }); setEditDates(false); }
    if (section === 'type') { setDetailForm({ ...details }); setEditType(false); }
    if (section === 'story') { setDetailForm({ ...details }); setEditStory(false); }
    if (section === 'contacts') { setContactsForm(contacts.map((c) => ({ ...c }))); setEditContacts(false); }
    if (section === 'specs') { setSpecsForm(pipeSpecs.map((s) => ({ ...s }))); setEditSpecs(false); }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="skeleton h-8 w-48 mx-auto mb-3" />
          <div className="skeleton h-4 w-32 mx-auto" />
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen bg-[#f0f4f8] flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <p className="text-gray-500">פרויקט לא נמצא</p>
          <button onClick={() => router.push('/projects/list')} className="text-lg text-[#1a56db] hover:underline mt-2">
            חזרה לפרויקטים
          </button>
        </div>
      </div>
    );
  }

  const d = detailForm;
  const inputClass = 'w-full border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]';
  const contactInput = 'border border-[#e2e8f0] rounded-lg px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]';
  const ROLES = ['מזמין', 'מלווה מטעם מזמין', 'קבלן', 'רכש', 'מנהל פרויקט', 'מפקח', 'מתכנן', 'משרד מתכנן'];

  return (
    <div className="min-h-screen bg-[#f0f4f8]" dir="rtl">
      <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">{project.name}</h1>
            <p className="text-[13px] text-gray-400">כרטיס פרויקט #{d.project_number || project.serial_number || '—'}</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => { setShowProjectExport(true); setProjectExportText(''); setProjectExportCopied(false); }}
              className="text-sm bg-blue-50 text-[#1a56db] px-3 py-2 rounded-lg hover:bg-blue-100 transition-colors font-medium"
            >
              📤 ייצוא פרויקט
            </button>
            <button onClick={() => router.push('/projects/list')} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-2">
              ← חזרה לפרויקטים
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {/* Status */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <h2 className="text-lg font-bold text-gray-700 mb-3">📌 סטטוס</h2>
          <StatusTracker
            currentStatus={d.project_status || 'תכנון כללי'}
            onChange={async (status) => {
              const id = params.id as string;
              if (detailForm.id) {
                await supabase.from('project_details').update({ project_status: status }).eq('id', detailForm.id);
              } else {
                await supabase.from('project_details').insert({ project_id: id, project_status: status });
              }
              await load();
            }}
          />
          {d.expected_pipe_order_date && (
            <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
              <span className="text-2xl">📦</span>
              <div>
                <p className="text-sm font-bold text-green-700">צפי מועד להזמנת צנרת</p>
                <p className="text-lg font-bold text-green-800">{formatDate(d.expected_pipe_order_date)}</p>
              </div>
            </div>
          )}
        </section>

        {showCustomerForm && (
          <div className="fixed inset-0 bg-black/40 z-50 flex items-start justify-center overflow-y-auto p-4" onClick={() => setShowCustomerForm(false)}>
            <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl mt-10 p-6" onClick={(e) => e.stopPropagation()}>
              <CustomerForm
                onCancel={() => setShowCustomerForm(false)}
                onSaved={async (id) => { setShowCustomerForm(false); await refreshCustomers(); await setProjectCustomer(id); }}
              />
            </div>
          </div>
        )}

        {/* Basic info */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <SectionHeader title="מידע בסיסי" icon="🏗️" editing={editInfo} onToggle={() => editInfo ? cancelEdit('info') : setEditInfo(true)} onSave={saveInfo} saving={saving} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            <EditableField label="שם הפרויקט" value={form.name || ''} editing={editInfo} onChange={(v) => updateForm('name', v)} />
            <EditableField label="יזם" value={form.developer_name || ''} editing={editInfo} onChange={(v) => updateForm('developer_name', v)} />
            <EditableField label="קבלן זוכה" value={d.winning_contractor || ''} editing={editInfo} onChange={(v) => updateDetailForm('winning_contractor', v)} />
            <EditableField label="משרד תכנון" value={form.planning_office || ''} editing={editInfo} onChange={(v) => updateForm('planning_office', v)} />
            <EditableField label="מיקום" value={d.location || ''} editing={editInfo} onChange={(v) => updateDetailForm('location', v)} />
            <EditableField label="מספר פרויקט" value={String(d.project_number || '')} editing={editInfo} type="number" onChange={(v) => updateDetailForm('project_number', v)} />
            <EditableField label="אחראי פרויקט" value={d.responsible_party || ''} editing={editInfo} onChange={(v) => updateDetailForm('responsible_party', v)} />
            <EditableField label="ערך הזמנה" value={editInfo ? String(form.order_value || '') : (form.order_value ? formatCurrency(form.order_value) : '')} editing={editInfo} type="number" onChange={(v) => updateForm('order_value', v)} />
            <EditableField label="סטטוס פרויקט" value={form.status || ''} editing={editInfo} onChange={(v) => updateForm('status', v)} />
            <EditableField label="סטטוס הסתברות" value={form.realization_status || ''} editing={editInfo} type="select" options={['הזמנה', 'גבוהה', 'בינוני', 'נמוך']} onChange={(v) => updateForm('realization_status', v)} />
            <EditableField label="הסתברות %" value={String(form.probability_percent || '')} editing={editInfo} type="number" onChange={(v) => updateForm('probability_percent', v)} />
            <EditableField label="חודשי אספקה" value={String(form.delivery_months || '')} editing={editInfo} type="number" onChange={(v) => updateForm('delivery_months', v)} />
            <EditableField label="תיאור" value={form.description || ''} editing={editInfo} type="textarea" onChange={(v) => updateForm('description', v)} />
          </div>

          {/* קבלנים מבצעים */}
          <div className="border-t border-[#e2e8f0] mt-4 pt-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-bold text-gray-500">קבלנים מבצעים</h3>
              {editInfo && (
                <button onClick={() => setContractorsForm((prev) => [...prev, ''])} className="text-[13px] text-[#1a56db] hover:underline">+ הוסף קבלן</button>
              )}
            </div>
            {editInfo ? (
              <div className="space-y-2">
                {contractorsForm.map((c, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <input type="text" placeholder="שם קבלן מבצע" value={c} onChange={(e) => { const next = [...contractorsForm]; next[i] = e.target.value; setContractorsForm(next); }} className={`${inputClass} flex-1`} />
                    <button onClick={() => setContractorsForm((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-2xl">✕</button>
                  </div>
                ))}
                {contractorsForm.length === 0 && <p className="text-sm text-gray-400">אין קבלנים. לחץ + להוסיף.</p>}
              </div>
            ) : (
              <div className="space-y-1">
                {contractorsForm.filter((c) => c.trim()).length > 0 ? (
                  contractorsForm.filter((c) => c.trim()).map((c, i) => (
                    <div key={i} className="flex items-center gap-2 py-1.5 border-b border-gray-50">
                      <span className="text-[13px] text-gray-500 w-40 flex-shrink-0">קבלן מבצע {contractorsForm.filter((x) => x.trim()).length > 1 ? i + 1 : ''}</span>
                      <span className="text-sm font-medium text-gray-800">{c}</span>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-gray-400">אין קבלנים מבצעים</p>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Dates */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <SectionHeader title="תאריכים" icon="📅" editing={editDates} onToggle={() => editDates ? cancelEdit('dates') : setEditDates(true)} onSave={saveDates} saving={saving} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            <EditableField label="תאריך קבלת ההזמנה" value={editDates ? formatDateInput(d.order_received_date) : formatDate(d.order_received_date)} editing={editDates} type="date" onChange={(v) => updateDetailForm('order_received_date', v)} />
            <EditableField label="תאריך ההזמנה המאושרת" value={editDates ? formatDateInput(d.approved_order_date) : formatDate(d.approved_order_date)} editing={editDates} type="date" onChange={(v) => updateDetailForm('approved_order_date', v)} />
            <EditableField label="תאריך התחלת הנחת צנרת" value={editDates ? formatDateInput(d.pipe_installation_start) : formatDate(d.pipe_installation_start)} editing={editDates} type="date" onChange={(v) => updateDetailForm('pipe_installation_start', v)} />
            <EditableField label="מועד הגשת המכרז" value={editDates ? formatDateInput(d.tender_submission_date) : formatDate(d.tender_submission_date)} editing={editDates} type="date" onChange={(v) => updateDetailForm('tender_submission_date', v)} />
            <EditableField label="תאריך הכרזה קבלן זוכה" value={editDates ? formatDateInput(d.winning_date) : formatDate(d.winning_date)} editing={editDates} type="date" onChange={(v) => updateDetailForm('winning_date', v)} />
            <EditableField label="צפי מועד להזמנת צנרת" value={editDates ? formatDateInput(d.expected_pipe_order_date) : formatDate(d.expected_pipe_order_date)} editing={editDates} type="date" onChange={(v) => updateDetailForm('expected_pipe_order_date', v)} />
          </div>

          {/* Delivery months picker */}
          <div className="border-t border-[#e2e8f0] mt-4 pt-4">
            <h3 className="text-sm font-bold text-gray-500 mb-3">חודשי אספקה</h3>
            {editDates ? (
              <div className="space-y-4">
                {[new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => (
                  <div key={year}>
                    <p className="text-[13px] font-bold text-gray-400 mb-1.5">{year}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                        const key = `${year}-${m}`;
                        const entries = (detailForm.delivery_months_list || '').split(',').filter(Boolean);
                        const selected = entries.includes(key);
                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              const next = selected ? entries.filter((e: string) => e !== key) : [...entries, key].sort();
                              updateDetailForm('delivery_months_list', next.join(','));
                            }}
                            className={`text-[13px] px-3 py-1.5 rounded-full border transition-colors ${
                              selected
                                ? 'bg-[#1a56db] text-white border-[#1a56db]'
                                : 'bg-white text-gray-600 border-[#e2e8f0] hover:bg-gray-50'
                            }`}
                          >
                            {MONTH_NAMES[m]}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {[new Date().getFullYear(), new Date().getFullYear() + 1].map((year) => {
                  const entries = (d.delivery_months_list || '').split(',').filter(Boolean);
                  const yearMonths = entries.filter((e: string) => e.startsWith(`${year}-`)).map((e: string) => parseInt(e.split('-')[1]));
                  if (yearMonths.length === 0) return null;
                  return (
                    <div key={year}>
                      <p className="text-[12px] text-gray-400 mb-1">{year}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {yearMonths.map((m: number) => (
                          <span key={m} className="text-[13px] bg-blue-50 text-[#1a56db] px-3 py-1 rounded-full font-medium">
                            {MONTH_NAMES[m]}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
                {!(d.delivery_months_list || '').split(',').filter(Boolean).length && (
                  <span className="text-sm text-gray-400">לא נבחרו חודשי אספקה</span>
                )}
              </div>
            )}
          </div>
        </section>

        {/* Contacts */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <SectionHeader title="אנשי קשר" icon="👥" editing={editContacts} onToggle={() => editContacts ? cancelEdit('contacts') : setEditContacts(true)} onSave={saveContacts} saving={saving} />

          {/* Winning customer — known only after the tender is won */}
          <div className="flex items-center gap-2 flex-wrap bg-gray-50 border border-[#e2e8f0] rounded-lg px-3 py-2 mb-3">
            <span className="text-[13px] font-semibold text-gray-600">🏆 לקוח זוכה:</span>
            <select
              value={project.customer_id || ''}
              onChange={(e) => setProjectCustomer(e.target.value)}
              className="border border-[#e2e8f0] rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 bg-white"
            >
              <option value="">— טרם נקבע —</option>
              {customersList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowCustomerForm(true)} className="text-[13px] bg-blue-50 text-[#1a56db] px-3 py-1.5 rounded-lg hover:bg-blue-100">+ לקוח חדש</button>
            {project.customer_id && (
              <a href={`/customers/${project.customer_id}`} className="text-[13px] bg-white border border-gray-200 text-gray-600 px-3 py-1.5 rounded-lg hover:bg-gray-100 no-underline">פתח כרטיס ←</a>
            )}
          </div>

          {editContacts ? (
            <div className="space-y-2">
              {contactsForm.map((c, i) => (
                <div key={i} className="border border-[#e2e8f0] rounded-lg p-3 space-y-2">
                  <div className="flex gap-2 items-center">
                    <select value={c.role || ''} onChange={(e) => { const next = [...contactsForm]; next[i] = { ...next[i], role: e.target.value }; setContactsForm(next); }} className={`${contactInput} w-36 shrink-0 bg-white`}>
                      <option value="">תפקיד</option>
                      {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <input type="text" placeholder="שם איש הקשר" value={c.name || ''} onChange={(e) => { const next = [...contactsForm]; next[i] = { ...next[i], name: e.target.value }; setContactsForm(next); }} className={`${contactInput} flex-1 min-w-0`} />
                    <button onClick={() => setContactsForm((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-2xl shrink-0 leading-none">✕</button>
                  </div>
                  <div className="flex gap-2 items-start">
                    <CompanyAutocomplete
                      value={c.company || ''}
                      onChange={(v) => { const next = [...contactsForm]; next[i] = { ...next[i], company: v }; setContactsForm(next); }}
                      options={customersList.map((cl) => cl.name)}
                      className={`${contactInput} w-full`}
                    />
                    <input type="text" placeholder="טלפון" value={c.phone || ''} onChange={(e) => { const next = [...contactsForm]; next[i] = { ...next[i], phone: e.target.value }; setContactsForm(next); }} className={`${contactInput} w-36 shrink-0`} dir="ltr" />
                    <input type="text" placeholder="מייל" value={c.email || ''} onChange={(e) => { const next = [...contactsForm]; next[i] = { ...next[i], email: e.target.value }; setContactsForm(next); }} className={`${contactInput} flex-1 min-w-0`} dir="ltr" />
                  </div>
                </div>
              ))}
              <div className="flex items-center gap-3">
                <button onClick={() => setContactsForm((prev) => [...prev, { role: '', name: '', company: '', phone: '', email: '' }])} className="text-[13px] text-[#1a56db] hover:underline">+ הוסף איש קשר</button>
                {contactPickerSupported && (
                  <button type="button" onClick={pickContactFromPhone} className="text-[13px] text-[#1a56db] bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors">
                    📱 בחר מאנשי הקשר
                  </button>
                )}
              </div>
            </div>
          ) : contacts.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="text-right text-gray-500 font-medium pb-2 pr-2">תפקיד</th>
                    <th className="text-right text-gray-500 font-medium pb-2">שם</th>
                    <th className="text-right text-gray-500 font-medium pb-2">חברה</th>
                    <th className="text-right text-gray-500 font-medium pb-2">טלפון</th>
                    <th className="text-right text-gray-500 font-medium pb-2">מייל</th>
                  </tr>
                </thead>
                <tbody>
                  {contacts.map((c) => (
                    <tr key={c.id} className="border-b border-gray-50">
                      <td className="py-2 pr-2 text-gray-600">{c.role}</td>
                      <td className="py-2 font-medium text-gray-800">{c.name}</td>
                      <td className="py-2 text-gray-600">{c.company || '—'}</td>
                      <td className="py-2 text-gray-600" dir="ltr">{c.phone || '—'}</td>
                      <td className="py-2 text-gray-600" dir="ltr">{c.email || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">אין אנשי קשר. לחץ עריכה להוסיף.</p>
          )}
        </section>

        {/* Project type & installation */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <SectionHeader title="סוג פרויקט והתקנה" icon="⚙️" editing={editType} onToggle={() => editType ? cancelEdit('type') : setEditType(true)} onSave={saveType} saving={saving} />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
            <EditableField label="תיאור הפרויקט" value={d.description || ''} editing={editType} type="textarea" onChange={(v) => updateDetailForm('description', v)} />
            <EditableField label="סוג פרויקט" value={d.project_type || ''} editing={editType} type="select" options={['ביוב', 'מים', 'תשתית', 'ניקוז', 'קולחין', 'בוצה', 'אחר']} onChange={(v) => updateDetailForm('project_type', v)} />
            <EditableField label="סוג התקנה" value={d.installation_type || ''} editing={editType} type="select" options={['חפירה פתוחה', 'השחלה בשרוול', 'דחיקה']} onChange={(v) => updateDetailForm('installation_type', v)} />
            <EditableField label="דרישות מיוחדות" value={d.special_requirements || ''} editing={editType} type="textarea" onChange={(v) => updateDetailForm('special_requirements', v)} />
            <EditableField label="פיקוח שרות שדה" value={d.field_supervision || ''} editing={editType} type="select" options={['כן', 'לא', 'לא נדרש']} onChange={(v) => updateDetailForm('field_supervision', v)} />
          </div>
          {(editType || d.installation_type === 'דחיקה') && (
            <div className="border-t border-[#e2e8f0] mt-3 pt-3">
              <h3 className="text-sm font-bold text-gray-500 mb-2">פרטי דחיקה</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-2">
                <EditableField label="סוג הקרקע" value={d.soil_type || ''} editing={editType} onChange={(v) => updateDetailForm('soil_type', v)} />
                <EditableField label="עומק הדחיקה" value={d.push_depth || ''} editing={editType} onChange={(v) => updateDetailForm('push_depth', v)} />
                <EditableField label="סוג השוחות" value={d.manhole_type || ''} editing={editType} onChange={(v) => updateDetailForm('manhole_type', v)} />
                <EditableField label="אופן התחברות" value={d.connection_method || ''} editing={editType} onChange={(v) => updateDetailForm('connection_method', v)} />
              </div>
            </div>
          )}
        </section>

        {/* Pipe specs */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <SectionHeader title="מפרטים טכניים ושרטוטים" icon="📐" editing={editSpecs} onToggle={() => editSpecs ? cancelEdit('specs') : setEditSpecs(true)} onSave={saveSpecs} saving={saving} />
          {editSpecs ? (
            <div className="space-y-2">
            <div className="divide-y divide-green-300">
              {specsForm.map((s, i) => (
                <div key={i} className="flex gap-2 items-center flex-wrap py-3 first:pt-0">
                  <div className="flex gap-1 items-center">
                    <input type="number" placeholder="DN" value={s.dn_mm || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], dn_mm: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-20`} title="קוטר נומינלי" />
                    <input type="number" placeholder="OD" value={s.od_mm || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], od_mm: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-20`} title="קוטר חיצוני" />
                    <input type="number" placeholder="ID" value={s.id_mm || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], id_mm: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-20`} title="קוטר פנימי" />
                  </div>
                  <select value={s.pipe_type || 'הטמנה'} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], pipe_type: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-36`}>
                    <option value="הטמנה">הטמנה</option>
                    <option value="דחיקה">דחיקה (Jacking)</option>
                    <option value="השחלה">השחלה (Slip Lining)</option>
                    <option value="עילי">עילי</option>
                    <option value="ביאקסיאלי">ביאקסיאלי</option>
                  </select>
                  <input type="number" placeholder="אורך קו (מ׳)" value={s.line_length_m || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], line_length_m: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-28`} />
                  <div className="flex flex-col gap-1">
                    <span className="text-[10px] text-gray-400">אורך יחידה (מ׳)</span>
                    <div className="flex gap-2 items-center flex-nowrap">
                      <input type="number" step="0.1" placeholder="אחר" value={(() => { const vals = (s.unit_length_m || '').split(',').map(Number).filter(Boolean); const custom = vals.find((v: number) => ![11.7, 5.7, 3.8, 2.8].includes(v)); return custom ?? ''; })()} onChange={(e) => {
                        const vals = (s.unit_length_m || '').split(',').map(Number).filter(Boolean);
                        const predefined = vals.filter((v: number) => [11.7, 5.7, 3.8, 2.8].includes(v));
                        const newVals = e.target.value ? [...predefined, parseFloat(e.target.value)] : predefined;
                        const next = [...specsForm]; next[i] = { ...next[i], unit_length_m: newVals.join(',') }; setSpecsForm(next);
                      }} className={`${inputClass} w-20`} />
                      {[11.7, 5.7, 3.8, 2.8].map((len) => {
                        const selected = (s.unit_length_m || '').split(',').map(Number).filter(Boolean);
                        const isChecked = selected.includes(len);
                        return (
                          <label key={len} className="flex items-center gap-1 text-sm cursor-pointer whitespace-nowrap">
                            <input type="checkbox" checked={isChecked} onChange={() => {
                              const vals = (s.unit_length_m || '').split(',').map(Number).filter(Boolean);
                              const newVals = isChecked ? vals.filter((v: number) => v !== len) : [...vals, len];
                              const next = [...specsForm]; next[i] = { ...next[i], unit_length_m: newVals.join(',') }; setSpecsForm(next);
                            }} className="accent-[#1a56db]" />
                            {len}
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <input type="number" placeholder="קשיחות" value={s.stiffness_pascal || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], stiffness_pascal: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-24`} />
                  <input type="number" placeholder="לחץ (בר)" value={s.pressure_bar || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], pressure_bar: e.target.value }; setSpecsForm(next); }} className={`${inputClass} w-24`} />
                  <input type="text" placeholder="הערות" value={s.notes || ''} onChange={(e) => { const next = [...specsForm]; next[i] = { ...next[i], notes: e.target.value }; setSpecsForm(next); }} className={`${inputClass} flex-1`} />
                  <button onClick={() => setSpecsForm((prev) => prev.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-600 text-2xl">✕</button>
                </div>
              ))}
            </div>
              <button onClick={() => setSpecsForm((prev) => [...prev, { dn_mm: '', od_mm: '', id_mm: '', pipe_type: 'הטמנה', line_length_m: '', unit_length_m: '', stiffness_pascal: '', pressure_bar: '', notes: '' }])} className="text-[13px] text-[#1a56db] hover:underline mt-3 block">+ הוסף מפרט צינור</button>
            </div>
          ) : pipeSpecs.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#e2e8f0]">
                    <th className="text-right text-gray-500 font-medium pb-2 pr-2">DN</th>
                    <th className="text-right text-gray-500 font-medium pb-2">OD</th>
                    <th className="text-right text-gray-500 font-medium pb-2">ID</th>
                    <th className="text-right text-gray-500 font-medium pb-2">סוג צינור</th>
                    <th className="text-right text-gray-500 font-medium pb-2">אורך קו (מ׳)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">אורך יחידה (מ׳)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">קשיחות (פסקל)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">לחץ (בר)</th>
                    <th className="text-right text-gray-500 font-medium pb-2">הערות</th>
                  </tr>
                </thead>
                <tbody>
                  {pipeSpecs.map((spec) => (
                    <tr key={spec.id} className="border-b border-gray-50">
                      <td className="py-2 pr-2 font-semibold text-gray-800">{spec.dn_mm || '—'}</td>
                      <td className="py-2 text-gray-600">{spec.od_mm || '—'}</td>
                      <td className="py-2 text-gray-600">{spec.id_mm || '—'}</td>
                      <td className="py-2 text-gray-600">{spec.pipe_type || 'הטמנה'}</td>
                      <td className="py-2 text-gray-600">{spec.line_length_m ?? '—'}</td>
                      <td className="py-2 text-gray-600" dir="ltr">{spec.unit_length_m ? spec.unit_length_m.split(',').join(', ') : '—'}</td>
                      <td className="py-2 text-gray-600">{spec.stiffness_pascal ?? '—'}</td>
                      <td className="py-2 text-gray-600">{spec.pressure_bar ?? '—'}</td>
                      <td className="py-2 text-gray-600">{spec.notes || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-3">אין מפרט צינורות. לחץ עריכה להוסיף.</p>
          )}

          {/* Attachments */}
          {projectAttachments.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[#e2e8f0]">
              <h3 className="text-sm font-bold text-gray-600 mb-2">📎 שרטוטים ומסמכים ({projectAttachments.length})</h3>
              <div className="space-y-1.5">
                {projectAttachments.map((att: any) => {
                  const linkedQuote = att.entity_type === 'quote' ? projectQuotes.find((q: any) => q.id === att.entity_id) : null;
                  return (
                    <div key={att.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2 text-sm">
                      <span className="text-gray-400 text-xs">{att.file_name.endsWith('.pdf') ? '📄' : att.file_name.match(/\.(png|jpg|jpeg)$/i) ? '🖼️' : '📎'}</span>
                      <a href={att.file_url} target="_blank" rel="noopener noreferrer" className="text-[#1a56db] hover:underline truncate flex-1">{att.file_name}</a>
                      {linkedQuote && (
                        <span className="text-[11px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full whitespace-nowrap">
                          הצעה {linkedQuote.quote_number}
                        </span>
                      )}
                      <span className="text-[10px] text-gray-400">{new Date(att.created_at).toLocaleDateString('he-IL')}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Project drawings */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-lg font-bold text-gray-700">📐 שרטוטי הפרויקט</h2>
            <label className={`text-[13px] px-3 py-1.5 rounded-lg cursor-pointer transition-colors ${uploadingDrawing ? 'bg-gray-100 text-gray-400' : 'bg-blue-50 text-[#1a56db] hover:bg-blue-100'}`}>
              {uploadingDrawing ? '⏳ מעלה ומזהה…' : '+ העלה שרטוט'}
              <input type="file" className="hidden" accept=".pdf,.png,.jpg,.jpeg" disabled={uploadingDrawing}
                onChange={(e) => { if (e.target.files?.[0]) { uploadProjectDrawing(e.target.files[0]); e.target.value = ''; } }} />
            </label>
          </div>
          {(() => {
            const drawings = projectAttachments.filter((a: any) => a.entity_type === 'project');
            if (drawings.length === 0) return <p className="text-sm text-gray-400 text-center py-3">אין שרטוטים. לחץ &quot;+ העלה שרטוט&quot; — מספר השרטוט יזוהה אוטומטית.</p>;
            return (
              <div className="space-y-2">
                {drawings.map((att: any) => (
                  <div key={att.id} className="flex items-center gap-3 bg-gray-50 rounded-lg px-3 py-2 text-sm flex-wrap">
                    <span className="text-[12px] font-bold text-[#003d77] bg-blue-50 px-2 py-1 rounded whitespace-nowrap" dir="ltr">
                      {(details.project_number || '—')}/{att.drawing_number || '?'}
                    </span>
                    <button onClick={() => openDrawing(att.file_url)} className="text-[#1a56db] hover:underline truncate flex-1 text-right min-w-0">
                      {att.file_name.endsWith('.pdf') ? '📄' : '🖼️'} {att.file_name}
                    </button>
                    <label className="text-[11px] text-gray-400 flex items-center gap-1">
                      מס׳ שרטוט:
                      <input type="text" defaultValue={att.drawing_number || ''} onBlur={(e) => { if (e.target.value !== (att.drawing_number || '')) setDrawingNumber(att.id, e.target.value.trim()); }}
                        placeholder="—" className="w-24 border border-[#e2e8f0] rounded px-2 py-1 text-[12px] text-gray-700" dir="ltr" />
                    </label>
                    <button onClick={() => deleteProjectDrawing(att.id)} className="text-red-400 hover:text-red-600 text-lg shrink-0">×</button>
                  </div>
                ))}
              </div>
            );
          })()}
        </section>

        {/* Pricing & Quotes — extracted to PricingSection component */}
        <PricingSection projectId={params.id as string} />
        {/* Updates / Meeting log */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-700">📝 מעקב עדכונים ופגישות</h2>
            <button
              onClick={() => { setShowAddUpdate(!showAddUpdate); setNewUpdate({ update_date: new Date().toISOString().substring(0, 10), people: '', title: '', description: '', tasks: '' }); }}
              className="text-[13px] bg-blue-50 text-[#1a56db] px-3 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
            >
              {showAddUpdate ? 'ביטול' : '+ עדכון חדש'}
            </button>
          </div>

          {/* Add new update form */}
          {showAddUpdate && (
            <div className="bg-blue-50/50 border border-blue-100 rounded-xl p-4 mb-4 space-y-3">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-500 mb-1">תאריך</label>
                  <input type="date" value={newUpdate.update_date} onChange={(e) => setNewUpdate({ ...newUpdate, update_date: e.target.value })} className={inputClass} />
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-gray-500 mb-1">אנשים נוגעים בעניין</label>
                  <input type="text" placeholder="שמות, מופרדים בפסיק" value={newUpdate.people} onChange={(e) => setNewUpdate({ ...newUpdate, people: e.target.value })} className={inputClass} />
                </div>
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-1">כותרת (תיאור קצר)</label>
                <input type="text" placeholder="למשל: פגישה עם מנהל הפרויקט" value={newUpdate.title} onChange={(e) => setNewUpdate({ ...newUpdate, title: e.target.value })} className={inputClass} />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-1">תיאור מלא</label>
                <textarea placeholder="פירוט הפגישה / העדכון..." value={newUpdate.description} onChange={(e) => setNewUpdate({ ...newUpdate, description: e.target.value })} className={`${inputClass} min-h-[80px]`} />
              </div>
              <div>
                <label className="block text-[13px] font-semibold text-gray-500 mb-1">משימות לביצוע</label>
                <textarea placeholder="משימה 1, משימה 2..." value={newUpdate.tasks} onChange={(e) => setNewUpdate({ ...newUpdate, tasks: e.target.value })} className={`${inputClass} min-h-[50px]`} />
              </div>
              <button
                onClick={async () => {
                  if (!newUpdate.title.trim()) return;
                  setSaving(true);
                  await supabase.from('project_updates').insert({
                    project_id: params.id as string,
                    update_date: newUpdate.update_date,
                    people: newUpdate.people,
                    title: newUpdate.title,
                    description: newUpdate.description,
                    tasks: newUpdate.tasks,
                  });
                  setShowAddUpdate(false);
                  setSaving(false);
                  await load();
                }}
                disabled={saving || !newUpdate.title.trim()}
                className="bg-[#1a56db] text-white text-sm font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving ? 'שומר...' : 'שמור עדכון'}
              </button>
            </div>
          )}

          {/* Updates list */}
          {updates.length > 0 ? (
            <div className="space-y-2">
              {updates.map((upd) => (
                <div key={upd.id} className="border border-[#e2e8f0] rounded-lg overflow-hidden">
                  <button
                    onClick={() => setExpandedUpdate(expandedUpdate === upd.id ? null : upd.id)}
                    className="w-full flex items-center gap-3 px-4 py-3 text-right hover:bg-gray-50 transition-colors"
                  >
                    <span className="text-[13px] text-gray-400 flex-shrink-0 w-20">{formatDate(upd.update_date)}</span>
                    <span className="text-[13px] text-[#1a56db] flex-shrink-0 w-32 truncate">{upd.people}</span>
                    <span className="text-sm font-medium text-gray-800 flex-1 truncate">{upd.title}</span>
                    <svg className={`w-4 h-4 text-gray-400 flex-shrink-0 transition-transform ${expandedUpdate === upd.id ? 'rotate-180' : ''}`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="6 9 12 15 18 9" /></svg>
                  </button>
                  {expandedUpdate === upd.id && (
                    <div className="px-4 pb-4 border-t border-[#e2e8f0] bg-gray-50/50">
                      {upd.description && (
                        <div className="mt-3">
                          <p className="text-[12px] font-bold text-gray-400 mb-1">תיאור</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{upd.description}</p>
                        </div>
                      )}
                      {upd.tasks && (
                        <div className="mt-3">
                          <p className="text-[12px] font-bold text-gray-400 mb-1">משימות לביצוע</p>
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{upd.tasks}</p>
                        </div>
                      )}
                      <div className="mt-3 flex gap-2">
                        <button
                          onClick={() => {
                            setExportUpdate(upd);
                            setExportLang('he');
                            setExportRecipient('');
                            setExportEmail('');
                            setExportCopied(false);
                          }}
                          className="text-[12px] text-[#1a56db] hover:text-blue-700 font-medium"
                        >
                          📤 ייצא
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm('למחוק עדכון זה?')) {
                              await supabase.from('project_updates').delete().eq('id', upd.id);
                              await load();
                            }
                          }}
                          className="text-[12px] text-red-400 hover:text-red-600"
                        >
                          מחק עדכון
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">אין עדכונים עדיין. הוסף עדכון ראשון או ספר לרקסי על פגישה.</p>
          )}
        </section>

        {/* Export email modal */}
        {exportUpdate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setExportUpdate(null)}>
            <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[540px] max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
              <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between flex-shrink-0">
                <h3 className="text-lg font-bold text-gray-700">📤 ייצוא עדכון כמייל</h3>
                <button onClick={() => setExportUpdate(null)} className="text-gray-400 hover:text-gray-600">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              </div>
              <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
                <div>
                  <label className="block text-[13px] font-semibold text-gray-500 mb-1">נמען</label>
                  <input
                    type="text"
                    placeholder="שם או מייל הנמען..."
                    value={exportRecipient}
                    onChange={(e) => setExportRecipient(e.target.value)}
                    className="w-full border border-[#e2e8f0] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db]"
                    list="contact-suggestions"
                  />
                  <datalist id="contact-suggestions">
                    {contacts.map((c, i) => (
                      <option key={i} value={`${c.name}${c.email ? ` <${c.email}>` : ''}`} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-[13px] font-semibold text-gray-500 mb-1">שפה</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setExportLang('he')}
                      className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${exportLang === 'he' ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-gray-600 border-[#e2e8f0] hover:bg-gray-50'}`}
                    >
                      עברית
                    </button>
                    <button
                      onClick={() => setExportLang('en')}
                      className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${exportLang === 'en' ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-gray-600 border-[#e2e8f0] hover:bg-gray-50'}`}
                    >
                      English
                    </button>
                  </div>
                </div>
                <button
                  onClick={() => generateExportEmail(exportUpdate, exportLang, exportRecipient)}
                  disabled={exportLoading}
                  className="w-full bg-[#1a56db] text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {exportLoading ? 'רקסי מכינה את המייל...' : '✨ הפק מייל'}
                </button>
                {exportEmail && (
                  <div className="space-y-2">
                    <label className="block text-[13px] font-semibold text-gray-500">תוצאה</label>
                    <div className="bg-gray-50 border border-[#e2e8f0] rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-[250px] overflow-y-auto" dir={exportLang === 'he' ? 'rtl' : 'ltr'}>
                      {exportEmail}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(exportEmail);
                          setExportCopied(true);
                          setTimeout(() => setExportCopied(false), 2000);
                        }}
                        className="flex-1 text-sm py-2 rounded-lg border border-[#e2e8f0] hover:bg-gray-50 transition-colors font-medium text-gray-600"
                      >
                        {exportCopied ? '✅ הועתק!' : '📋 העתק ללוח'}
                      </button>
                      <button
                        onClick={() => {
                          const subject = encodeURIComponent(exportUpdate.title || 'Project Update');
                          const body = encodeURIComponent(exportEmail);
                          window.open(`mailto:?subject=${subject}&body=${body}`);
                        }}
                        className="flex-1 text-sm py-2 rounded-lg bg-[#fce4ec] text-[#1a56db] hover:bg-[#f8bbd0] transition-colors font-medium"
                      >
                        📧 מייל
                      </button>
                      <button
                        onClick={() => {
                          const text = encodeURIComponent(exportEmail);
                          window.open(`https://wa.me/?text=${text}`);
                        }}
                        className="flex-1 text-sm py-2 rounded-lg bg-[#dcf8c6] text-green-700 hover:bg-[#c5f0a4] transition-colors font-medium"
                      >
                        💬 וואטסאפ
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Story & intelligence */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5">
          <SectionHeader title="סיפור הפרויקט ואינטליגנציה" icon="📖" editing={editStory} onToggle={() => editStory ? cancelEdit('story') : setEditStory(true)} onSave={saveStory} saving={saving} />
          <div className="space-y-4">
            <EditableField label="סיפור הפרויקט" value={d.project_story || ''} editing={editStory} type="textarea" onChange={(v) => updateDetailForm('project_story', v)} />
            <EditableField label="מתחרים" value={d.competitors || ''} editing={editStory} type="textarea" onChange={(v) => updateDetailForm('competitors', v)} />
            <EditableField label="הערכות" value={d.assessments || ''} editing={editStory} type="textarea" onChange={(v) => updateDetailForm('assessments', v)} />
            <EditableField label="פוליטיקה" value={d.politics || ''} editing={editStory} type="textarea" onChange={(v) => updateDetailForm('politics', v)} />
          </div>
        </section>
      </div>

      {/* Project export modal */}
      {showProjectExport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowProjectExport(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-[90vw] max-w-[540px] max-h-[85vh] flex flex-col overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="px-5 py-4 border-b border-[#e2e8f0] flex items-center justify-between flex-shrink-0">
              <h3 className="text-lg font-bold text-gray-700">📤 ייצוא כרטיס פרויקט</h3>
              <button onClick={() => setShowProjectExport(false)} className="text-gray-400 hover:text-gray-600">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-4 overflow-y-auto flex-1">
              <div>
                <label className="block text-[12px] font-semibold text-gray-500 mb-1">שפה</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setProjectExportLang('he')}
                    className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${projectExportLang === 'he' ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-gray-600 border-[#e2e8f0] hover:bg-gray-50'}`}
                  >
                    עברית
                  </button>
                  <button
                    onClick={() => setProjectExportLang('en')}
                    className={`flex-1 text-sm py-2 rounded-lg border transition-colors ${projectExportLang === 'en' ? 'bg-[#1a56db] text-white border-[#1a56db]' : 'bg-white text-gray-600 border-[#e2e8f0] hover:bg-gray-50'}`}
                  >
                    English
                  </button>
                </div>
              </div>
              <button
                onClick={() => generateProjectExport(projectExportLang)}
                disabled={projectExportLoading}
                className="w-full bg-[#1a56db] text-white text-sm font-semibold py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {projectExportLoading ? 'רקסי מכין את הסיכום...' : '✨ הפק סיכום פרויקט'}
              </button>
              {projectExportText && (
                <div className="space-y-2">
                  <label className="block text-[12px] font-semibold text-gray-500">תוצאה</label>
                  <div className="bg-gray-50 border border-[#e2e8f0] rounded-lg p-3 text-sm text-gray-700 whitespace-pre-wrap max-h-[250px] overflow-y-auto" dir={projectExportLang === 'he' ? 'rtl' : 'ltr'}>
                    {projectExportText}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(projectExportText);
                        setProjectExportCopied(true);
                        setTimeout(() => setProjectExportCopied(false), 2000);
                      }}
                      className="flex-1 text-sm py-2 rounded-lg border border-[#e2e8f0] hover:bg-gray-50 transition-colors font-medium text-gray-600"
                    >
                      {projectExportCopied ? '✅ הועתק!' : '📋 העתק ללוח'}
                    </button>
                    <button
                      onClick={() => {
                        const subject = encodeURIComponent(`${project?.name || 'Project'} - Summary`);
                        const body = encodeURIComponent(projectExportText);
                        window.open(`mailto:?subject=${subject}&body=${body}`);
                      }}
                      className="flex-1 text-sm py-2 rounded-lg bg-[#fce4ec] text-[#1a56db] hover:bg-[#f8bbd0] transition-colors font-medium"
                    >
                      📧 מייל
                    </button>
                    <button
                      onClick={() => {
                        const text = encodeURIComponent(projectExportText);
                        window.open(`https://wa.me/?text=${text}`);
                      }}
                      className="flex-1 text-sm py-2 rounded-lg bg-[#dcf8c6] text-green-700 hover:bg-[#c5f0a4] transition-colors font-medium"
                    >
                      💬 וואטסאפ
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
