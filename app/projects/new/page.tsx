'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import StatusTracker from '@/components/projects/StatusTracker';
import ContactsInput, { ProjectContact } from '@/components/projects/ContactsInput';
import PipeSpecsInput, { PipeSpec } from '@/components/projects/PipeSpecsInput';

const INSTALLATION_TYPES = ['חפירה פתוחה', 'השחלה בשרוול', 'דחיקה'];
const PROJECT_TYPES = ['ביוב', 'מים', 'ניקוז', 'השקיה', 'תשתית', 'אחר'];

export default function NewProjectPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Basic project info
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [projectNumber, setProjectNumber] = useState('');
  const [orderValue, setOrderValue] = useState('');
  const [priority, setPriority] = useState('medium');

  // Details
  const [description, setDescription] = useState('');
  const [projectType, setProjectType] = useState('');
  const [installationType, setInstallationType] = useState('');
  const [specialRequirements, setSpecialRequirements] = useState('');
  const [fieldSupervision, setFieldSupervision] = useState('');

  // Ordering
  const [orderingEntity, setOrderingEntity] = useState('');
  const [responsibleParty, setResponsibleParty] = useState('');
  const [orderReceivedDate, setOrderReceivedDate] = useState('');
  const [approvedOrderDate, setApprovedOrderDate] = useState('');
  const [pipeInstallStart, setPipeInstallStart] = useState('');

  // Push-specific
  const [soilType, setSoilType] = useState('');
  const [pushDepth, setPushDepth] = useState('');
  const [manholeType, setManholeType] = useState('');
  const [connectionMethod, setConnectionMethod] = useState('');

  // Status
  const [projectStatus, setProjectStatus] = useState('תכנון כללי');
  const [tenderDate, setTenderDate] = useState('');
  const [winningContractor, setWinningContractor] = useState('');
  const [winningDate, setWinningDate] = useState('');
  const [expectedPipeOrder, setExpectedPipeOrder] = useState('');

  // Intelligence
  const [projectStory, setProjectStory] = useState('');
  const [competitors, setCompetitors] = useState('');
  const [assessments, setAssessments] = useState('');
  const [politics, setPolitics] = useState('');

  // Related data
  const [contacts, setContacts] = useState<ProjectContact[]>([]);
  const [pipeSpecs, setPipeSpecs] = useState<PipeSpec[]>([]);

  // Handle AI-extracted data
  function handleAiData(data: any) {
    if (data.name) setName(data.name);
    if (data.location) setLocation(data.location);
    if (data.project_number) setProjectNumber(String(data.project_number));
    if (data.order_value) setOrderValue(String(data.order_value));
    if (data.ordering_entity) setOrderingEntity(data.ordering_entity);
    if (data.responsible_party) setResponsibleParty(data.responsible_party);
    if (data.description) setDescription(data.description);
    if (data.project_type) setProjectType(data.project_type);
    if (data.installation_type) setInstallationType(data.installation_type);
    if (data.special_requirements) setSpecialRequirements(data.special_requirements);
    if (data.field_supervision) setFieldSupervision(data.field_supervision);
    if (data.soil_type) setSoilType(data.soil_type);
    if (data.push_depth) setPushDepth(data.push_depth);
    if (data.manhole_type) setManholeType(data.manhole_type);
    if (data.connection_method) setConnectionMethod(data.connection_method);
    if (data.project_status) setProjectStatus(data.project_status);
    if (data.winning_contractor) setWinningContractor(data.winning_contractor);
    if (data.project_story) setProjectStory(data.project_story);
    if (data.competitors) setCompetitors(data.competitors);
    if (data.assessments) setAssessments(data.assessments);
    if (data.politics) setPolitics(data.politics);
    if (data.contacts?.length > 0) {
      const validContacts = data.contacts.filter((c: any) => c.name);
      if (validContacts.length > 0) setContacts(validContacts);
    }
    if (data.pipe_specs?.length > 0) {
      const validSpecs = data.pipe_specs.filter((s: any) => s.diameter_mm > 0);
      if (validSpecs.length > 0) setPipeSpecs(validSpecs);
    }
  }

  // Auto-calculate expected pipe order (2 months after winning date)
  function handleWinningDateChange(date: string) {
    setWinningDate(date);
    if (date) {
      const d = new Date(date);
      d.setMonth(d.getMonth() + 2);
      setExpectedPipeOrder(d.toISOString().split('T')[0]);
    }
  }

  async function handleSave() {
    if (!name.trim()) {
      setError('שם פרויקט הוא שדה חובה');
      return;
    }

    try {
      setSaving(true);
      setError(null);

      // 1. Create project
      const { data: project, error: projErr } = await supabase
        .from('projects')
        .insert({
          name,
          current_stage: 1,
          stage_label: projectStatus,
          progress_percent: 0,
          priority,
          order_value: parseFloat(orderValue) || 0,
          status: 'active',
        })
        .select()
        .single();

      if (projErr) throw projErr;

      // 2. Create project details
      const { error: detErr } = await supabase.from('project_details').insert({
        project_id: project.id,
        project_number: projectNumber ? parseInt(projectNumber) : null,
        location,
        description,
        order_received_date: orderReceivedDate || null,
        approved_order_date: approvedOrderDate || null,
        pipe_installation_start: pipeInstallStart || null,
        ordering_entity: orderingEntity,
        responsible_party: responsibleParty,
        project_type: projectType,
        installation_type: installationType,
        special_requirements: specialRequirements,
        field_supervision: fieldSupervision,
        soil_type: soilType,
        push_depth: pushDepth,
        manhole_type: manholeType,
        connection_method: connectionMethod,
        project_status: projectStatus,
        tender_submission_date: tenderDate || null,
        winning_contractor: winningContractor,
        winning_date: winningDate || null,
        expected_pipe_order_date: expectedPipeOrder || null,
        project_story: projectStory,
        competitors,
        assessments,
        politics,
      });

      if (detErr) throw detErr;

      // 3. Create contacts
      if (contacts.length > 0) {
        const contactRows = contacts
          .filter((c) => c.name.trim())
          .map((c) => ({ project_id: project.id, ...c }));
        if (contactRows.length > 0) {
          const { error: conErr } = await supabase.from('project_contacts').insert(contactRows);
          if (conErr) throw conErr;
        }
      }

      // 4. Create pipe specs
      if (pipeSpecs.length > 0) {
        const specRows = pipeSpecs.map((s) => ({
          project_id: project.id,
          diameter_mm: s.diameter_mm,
          line_length_m: s.line_length_m,
          unit_length_m: s.unit_length_m,
          stiffness_pascal: s.stiffness_pascal,
          pressure_bar: s.pressure_bar,
          notes: s.notes || null,
        }));
        const { error: specErr } = await supabase.from('pipe_specs').insert(specRows);
        if (specErr) throw specErr;
      }

      router.push('/');
    } catch (err: any) {
      console.error('Error saving project:', err);
      setError(err.message || 'שגיאה בשמירת הפרויקט');
    } finally {
      setSaving(false);
    }
  }

  const inputClass =
    'w-full border border-[#e2e8f0] rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#1a56db]/20 focus:border-[#1a56db] transition-colors';
  const labelClass = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <div className="min-h-screen bg-[#f0f4f8]" dir="rtl">
      <div className="flex-1 min-h-screen">
      {/* Header */}
      <header className="bg-white border-b border-[#e2e8f0] px-5 py-4 sticky top-0 z-30">
        <div className="max-w-4xl mx-auto flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-gray-800">פרויקט חדש</h1>
            <p className="text-[11px] text-gray-400">כרטיס פרויקט — B-80</p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => router.push('/')}
              className="text-xs text-gray-500 hover:text-gray-700 px-3 py-2"
            >
              ביטול
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-xs bg-[#1a56db] text-white px-5 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
            >
              {saving ? 'שומר...' : 'שמור פרויקט'}
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 md:px-6 py-6 space-y-5">
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
            {error}
          </div>
        )}

        {/* === סטטוס פרויקט === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up">
          <h2 className="text-sm font-bold text-gray-700 mb-3">📌 סטטוס פרויקט</h2>
          <StatusTracker currentStatus={projectStatus} onChange={setProjectStatus} />
        </section>

        {/* === מידע בסיסי === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up-delay-1">
          <h2 className="text-sm font-bold text-gray-700 mb-4">🏗️ מידע בסיסי</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>שם הפרויקט *</label>
              <input type="text" value={name} onChange={(e) => setName(e.target.value)} className={inputClass} placeholder="מאסף לאורך כביש 5" />
            </div>
            <div>
              <label className={labelClass}>מיקום הפרויקט</label>
              <input type="text" value={location} onChange={(e) => setLocation(e.target.value)} className={inputClass} placeholder="רמת השרון" />
            </div>
            <div>
              <label className={labelClass}>מספר פרויקט פיברטק</label>
              <input type="number" value={projectNumber} onChange={(e) => setProjectNumber(e.target.value)} className={inputClass} placeholder="1714" dir="ltr" />
            </div>
            <div>
              <label className={labelClass}>ערך הזמנה (₪)</label>
              <input type="number" value={orderValue} onChange={(e) => setOrderValue(e.target.value)} className={inputClass} placeholder="500000" dir="ltr" />
            </div>
            <div>
              <label className={labelClass}>מזמין הפרויקט</label>
              <input type="text" value={orderingEntity} onChange={(e) => setOrderingEntity(e.target.value)} className={inputClass} placeholder="מי שרונים" />
            </div>
            <div>
              <label className={labelClass}>הגורם שהפרויקט באחריותו</label>
              <input type="text" value={responsibleParty} onChange={(e) => setResponsibleParty(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>עדיפות</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)} className={inputClass}>
                <option value="low">נמוכה</option>
                <option value="medium">בינונית</option>
                <option value="high">גבוהה</option>
                <option value="critical">קריטית</option>
              </select>
            </div>
          </div>
        </section>

        {/* === תאריכים === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up-delay-2">
          <h2 className="text-sm font-bold text-gray-700 mb-4">📅 תאריכים</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className={labelClass}>תאריך קבלת ההזמנה</label>
              <input type="date" value={orderReceivedDate} onChange={(e) => setOrderReceivedDate(e.target.value)} className={inputClass} dir="ltr" />
            </div>
            <div>
              <label className={labelClass}>תאריך ההזמנה המאושרת</label>
              <input type="date" value={approvedOrderDate} onChange={(e) => setApprovedOrderDate(e.target.value)} className={inputClass} dir="ltr" />
            </div>
            <div>
              <label className={labelClass}>תאריך התחלת הנחת צנרת</label>
              <input type="date" value={pipeInstallStart} onChange={(e) => setPipeInstallStart(e.target.value)} className={inputClass} dir="ltr" />
            </div>
          </div>

          {/* Tender & winning contractor */}
          <div className="border-t border-[#e2e8f0] mt-4 pt-4">
            <h3 className="text-xs font-bold text-gray-500 mb-3">מכרז וצפי הזמנה</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className={labelClass}>מועד הגשת המכרז</label>
                <input type="date" value={tenderDate} onChange={(e) => setTenderDate(e.target.value)} className={inputClass} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>קבלן זוכה</label>
                <input type="text" value={winningContractor} onChange={(e) => setWinningContractor(e.target.value)} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>תאריך הכרזה על קבלן זוכה</label>
                <input type="date" value={winningDate} onChange={(e) => handleWinningDateChange(e.target.value)} className={inputClass} dir="ltr" />
              </div>
              <div>
                <label className={labelClass}>
                  צפי מועד להזמנת צנרת
                  <span className="text-[10px] text-gray-400 font-normal mr-1">(~חודשיים מהכרזה)</span>
                </label>
                <input type="date" value={expectedPipeOrder} onChange={(e) => setExpectedPipeOrder(e.target.value)} className={`${inputClass} bg-green-50 border-green-200 font-semibold`} dir="ltr" />
              </div>
            </div>
          </div>
        </section>

        {/* === אנשי קשר === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up-delay-3">
          <h2 className="text-sm font-bold text-gray-700 mb-4">👥 אנשי קשר</h2>
          <ContactsInput contacts={contacts} onChange={setContacts} />
        </section>

        {/* === סוג פרויקט והתקנה === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up-delay-3">
          <h2 className="text-sm font-bold text-gray-700 mb-4">⚙️ סוג פרויקט והתקנה</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>תיאור הפרויקט</label>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="הסטת קו מאסף ביוב ראשי..." />
            </div>
            <div>
              <label className={labelClass}>סוג פרויקט</label>
              <select value={projectType} onChange={(e) => setProjectType(e.target.value)} className={inputClass}>
                <option value="">בחר סוג</option>
                {PROJECT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>סוג התקנה</label>
              <select value={installationType} onChange={(e) => setInstallationType(e.target.value)} className={inputClass}>
                <option value="">בחר סוג</option>
                {INSTALLATION_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={labelClass}>דרישות מיוחדות לצנרת</label>
              <input type="text" value={specialRequirements} onChange={(e) => setSpecialRequirements(e.target.value)} className={inputClass} placeholder="עמידות קורוזיביות/כימית/שחיקה..." />
            </div>
            <div>
              <label className={labelClass}>האם נדרש פיקוח שרות שדה</label>
              <input type="text" value={fieldSupervision} onChange={(e) => setFieldSupervision(e.target.value)} className={inputClass} placeholder="פיקוח צמוד" />
            </div>
          </div>

          {/* Push-specific fields */}
          {installationType === 'דחיקה' && (
            <div className="border-t border-[#e2e8f0] mt-4 pt-4">
              <h3 className="text-xs font-bold text-gray-500 mb-3">פרטי דחיקה</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className={labelClass}>סוג הקרקע באתר הדחיקה</label>
                  <input type="text" value={soilType} onChange={(e) => setSoilType(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>עומק הדחיקה</label>
                  <input type="text" value={pushDepth} onChange={(e) => setPushDepth(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>סוג השוחות</label>
                  <input type="text" value={manholeType} onChange={(e) => setManholeType(e.target.value)} className={inputClass} />
                </div>
                <div>
                  <label className={labelClass}>אופן התחברות לשוחות</label>
                  <input type="text" value={connectionMethod} onChange={(e) => setConnectionMethod(e.target.value)} className={inputClass} />
                </div>
              </div>
            </div>
          )}
        </section>

        {/* === מפרט צינורות === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up-delay-4">
          <h2 className="text-sm font-bold text-gray-700 mb-4">🔧 מאפייני הצינור והשוחות</h2>
          <PipeSpecsInput specs={pipeSpecs} onChange={setPipeSpecs} />
        </section>

        {/* === סיפור ואינטליגנציה === */}
        <section className="bg-white rounded-xl border border-[#e2e8f0] p-5 animate-fade-in-up-delay-5">
          <h2 className="text-sm font-bold text-gray-700 mb-4">📖 סיפור הפרויקט ואינטליגנציה</h2>
          <div className="space-y-4">
            <div>
              <label className={labelClass}>סיפור הפרויקט</label>
              <textarea value={projectStory} onChange={(e) => setProjectStory(e.target.value)} className={`${inputClass} min-h-[80px]`} placeholder="רקע, היסטוריה, קשרים מרכזיים..." />
            </div>
            <div>
              <label className={labelClass}>מתחרים</label>
              <textarea value={competitors} onChange={(e) => setCompetitors(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="מי המתחרים, מה הם מציעים..." />
            </div>
            <div>
              <label className={labelClass}>הערכות</label>
              <textarea value={assessments} onChange={(e) => setAssessments(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="סיכויים, ניתוח שוק..." />
            </div>
            <div>
              <label className={labelClass}>פוליטיקה</label>
              <textarea value={politics} onChange={(e) => setPolitics(e.target.value)} className={`${inputClass} min-h-[60px]`} placeholder="שחקנים מרכזיים, קשרים, דינמיקות..." />
            </div>
          </div>
        </section>

        {/* Bottom save button */}
        <div className="flex justify-end gap-3 pb-10">
          <button
            onClick={() => router.push('/')}
            className="text-sm text-gray-500 hover:text-gray-700 px-5 py-2.5"
          >
            ביטול
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="text-sm bg-[#1a56db] text-white px-8 py-2.5 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 font-medium"
          >
            {saving ? 'שומר...' : 'שמור פרויקט'}
          </button>
        </div>
      </div>
      </div>
    </div>
  );
}
