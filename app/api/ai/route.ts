import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `אתה מערכת AI פנימית של FibertechOS (פיברטק תשתיות — צנרת GRP).
מקבל פקודות בעברית ומחזיר JSON בלבד — ללא טקסט, ללא markdown.

מבנה תשובה:
{
  "action": "create" | "update" | "delete" | "import" | "query",
  "target_table": שם הטבלה,
  "target_label": "שם הפרויקט / היעד",
  "summary": "משפט אחד בעברית",
  "filter": { "name": "..." },
  "data": { /* שדות הטבלה הראשית */ },
  "project_details": { /* פרטים מורחבים */ },
  "contacts": [ { "role","name","phone","email" } ],
  "pipe_specs": [ { "dn_mm","line_length_m","unit_length_m","stiffness_pascal","pressure_bar","pipe_type","notes" } ],
  "project_updates": [ { "update_date","people","title","description","tasks" } ]
}

טבלאות:
- projects: name, current_stage(1-7), priority(low/normal/high/urgent), order_value, status(active/on_hold/completed/cancelled), supplier, city, developer_name, planning_office, probability_percent, realization_status(הזמנה/גבוהה/בינוני/נמוך), delivery_months, order_execution_date
- project_details: location, ordering_entity, responsible_party, project_type, installation_type, tender_submission_date, winning_contractor, project_story, competitors, assessments, politics, project_status(תכנון כללי/תכנון מפורט/טרום מכרז/מועד הגשת מכרז/קבלן זוכה)
- project_contacts: project_id, role, name, phone, email
- pipe_specs: project_id, dn_mm, line_length_m, unit_length_m, stiffness_pascal, pressure_bar, pipe_type(הטמנה/דחיקה/השחלה)
- project_updates: project_id, update_date(YYYY-MM-DD), people, title, description, tasks
- alerts: project_id, type(task/reminder/warning), message, assigned_to, is_resolved
- leads: project_name, developer_name, stage(intro/documents/tender/negotiation), estimated_value, next_action, next_action_date
- inventory: manufacturer, pipe_type, diameter_mm, pressure_bar, stiffness_sn, in_stock, category(צינורות/אביזרים/חומרי סיכה)

כללים:
1. מסיפור פרויקט — חלץ הכל: data, project_details, contacts, pipe_specs, project_updates.
2. create project → data+project_details+contacts+pipe_specs+project_updates בבקשה אחת.
3. update project → filter לפי name + רק השדות שמשתנים. דרוש אישור.
4. delete → דרוש אישור.
5. משימה בודדת → alerts (type:"task").
6. עדכון/פגישה → project_updates (action:"create", target_label: שם הפרויקט).
7. קוטציה מספק → target_table:"supplier_quote", action:"import", quote_info:{supplier_name,quote_ref,quote_date,project_name,currency}, data:[{item_type,dn,sn,pn,length_m,unit_price,price_per,currency,description}].
8. שאילתה → action:"query", query_filter:{...}, query_fields:[...].
9. אם לא ברור → {"action":"query","summary":"שאלה","message":"..."}.
10. החזר JSON תקין בלבד. ערכים ריקים — אל תכלול.`;

export async function POST(request: NextRequest) {
  try {
    if (!GROQ_API_KEY) {
      return NextResponse.json({ error: 'GROQ_API_KEY not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { message, context, document_text, files } = body;

    let userMessage = message || '';
    if (context) {
      userMessage = `נתונים קיימים:\n${JSON.stringify(context)}\n\nפקודה:\n${message}`;
    }
    if (document_text) {
      userMessage = `תוכן מסמך שהועלה:\n${document_text}\n\nפקודה:\n${message || 'חלץ את כל הנתונים מהמסמך והזן למערכת'}`;
    }

    if (files && Array.isArray(files) && files.length > 0 && !message) {
      userMessage = 'חלץ את כל הנתונים מהקבצים המצורפים והזן למערכת.';
    }

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userMessage },
    ];

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        temperature: 0.1,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Groq API error:', err);
      return NextResponse.json({ error: 'שגיאה בתקשורת עם רקסי' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { action: 'query', summary: text, message: text };
    }

    // Post-process supplier quotes — fill missing quote_info from user message & items
    if (parsed.target_table === 'supplier_quote' && parsed.action === 'import' && Array.isArray(parsed.data)) {
      if (!parsed.quote_info) parsed.quote_info = {};
      const qi = parsed.quote_info;
      const items = parsed.data;
      const allDesc = items.map((it: any) => it.description || '').join(' ');
      const userText = userMessage || '';

      if (!qi.project_name) {
        const m = userText.match(/(?:לפרויקט|פרויקט|project)\s+(.+?)(?:\s*[-–—,.\n]|$)/i);
        if (m) qi.project_name = m[1].trim();
      }
      if (!qi.supplier_name) {
        if (/flowtite|amiblu/i.test(allDesc + ' ' + userText)) qi.supplier_name = 'Amiblu';
        else if (/hobas/i.test(allDesc + ' ' + userText)) qi.supplier_name = 'Hobas';
      }
      if (!qi.currency) {
        const fc = items.find((it: any) => it.currency);
        if (fc) qi.currency = fc.currency;
      }
      if (!qi.quote_ref) {
        const rm = allDesc.match(/\b(MUA[\d.]+|Q[\d-]+)/i);
        if (rm) qi.quote_ref = rm[1];
      }
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('AI route error:', error);
    return NextResponse.json({ error: error.message || 'שגיאה פנימית' }, { status: 500 });
  }
}
