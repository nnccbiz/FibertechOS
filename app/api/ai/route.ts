import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TEXT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'llama-3.2-11b-vision-preview';

const SYSTEM_PROMPT = `אתה מערכת AI פנימית של FibertechOS — מערכת ניהול תפעולית לחברת פיברטק תשתיות (צנרת GRP).

אתה מקבל פקודות בעברית חופשית ומבצע אותן בשקט (Silent Execution).
אתה מחזיר JSON בלבד — בלי טקסט, בלי markdown.

מבנה התשובה:
{
  "action": "create" | "update" | "delete" | "import" | "generate" | "query",
  "target_table": "projects" | "project_details" | "project_contacts" | "pipe_specs" | "alerts" | "leads" | "inventory" | "team_members" | "cost_input_items",
  "target_label": "תיאור קריא של היעד",
  "summary": "משפט אחד שמתאר מה ביצעת",
  "fields_count": 0,
  "data": {
    // השדות שצריך לעדכן/ליצור
  },
  "contacts": [
    {"role": "", "name": "", "phone": "", "email": ""}
  ],
  "pipe_specs": [
    {"diameter_mm": 0, "line_length_m": 0, "unit_length_m": 0, "stiffness_pascal": 0, "pressure_bar": 0, "notes": ""}
  ]
}

טבלאות זמינות:
- projects: id, name, current_stage, stage_label, progress_percent, priority, assigned_to, order_value, status
- project_details: project_id, project_number, location, description, ordering_entity, responsible_party, project_type, installation_type, special_requirements, field_supervision, soil_type, push_depth, manhole_type, connection_method, project_status, tender_submission_date, winning_contractor, winning_date, expected_pipe_order_date, project_story, competitors, assessments, politics
- project_contacts: project_id, role, name, phone, email
- pipe_specs: project_id, diameter_mm, line_length_m, unit_length_m, stiffness_pascal, pressure_bar, notes
- inventory: manufacturer, pipe_type (הטמנה/דחיקה/השחלה), diameter_mm, pressure_bar, stiffness_sn, length_m, in_stock, category (צינורות/אביזרים/חומרי סיכה)
- alerts: project_id, type, message, is_resolved, assigned_to
- leads: project_name, developer_name, stage (הכרות/מסמכים/מכרז/מו"מ), estimated_value, next_action, next_action_date
- project_updates: project_id, update_date (YYYY-MM-DD), people (שמות האנשים), title (כותרת קצרה), description (תיאור מלא), tasks (משימות לביצוע)

כללים:
8. כשמשתמש רוצה להוסיף משימה (למשל: "תוסיף משימה", "צריך לעשות X", "תזכיר לי ש...", "משימה: ...") — השתמש בטבלה alerts:
   - target_table: "alerts"
   - action: "create"
   - data: { type: "task", message: "תיאור המשימה", assigned_to: "שם הפרויקט או האדם" }
   - אם הוזכר פרויקט, שים את שמו ב-target_label
   - ה-message צריך להיות תיאור ברור של המשימה
7. כשמשתמש רוצה להוסיף עדכון לפרויקט (למשל: "עדכון לפרויקט Y", "נפגשתי עם X לגבי Y", "עדכון פגישה") — השתמש בטבלה project_updates:
   - target_table: "project_updates"
   - action: "create"
   - data: { people, title, description, tasks }
   - אל תכלול update_date — המערכת תוסיף תאריך של היום אוטומטית
   - חפש את הפרויקט לפי שם ב-target_label
   - ה-title צריך להיות תיאור קצר של העדכון עצמו (לא "עדכון פגישה" גנרי)
   - הפרד בין תיאור העדכון למשימות
9. כשמשתמש מעלה קובץ תמחור (הצעת מחיר מספק, מחירון, כתב כמויות, טבלת עלויות, קוטציה) — חלץ את כל הפריטים מכל שורות הטבלה והחזר:
   - target_table: "supplier_quote"
   - action: "import"
   - quote_info: { supplier_name: "שם הספק/קבלן", quote_ref: "מספר ref/הצעה", quote_date: "YYYY-MM-DD", project_name: "שם הפרויקט", currency: "USD/EUR/ILS" }
   - data: מערך של כל הפריטים — שורה אחת בטבלה = פריט אחד ב-data. אל תדלג על שורות!
   - כל פריט: { description: "תיאור מלא", item_code: "קוד/סעיף", item_type: "pipe/coupling/elbow/flange/reducer/other", dn: קוטר במ"מ אם קיים, sn: קשיחות אם קיים, pn: לחץ אם קיים, length_m: אורך אם קיים, quantity: כמות מספרית, unit_price: מחיר ליחידה, price_per: "meter" אם מטר / "unit" אם יחידה, currency: מטבע }
   - זהה את המטבע: אם יש ₪ / ש"ח / שקל = ILS; $ / USD = USD; € / EUR = EUR. ברירת מחדל אם לא ברור: ILS.
   - שמור על המחירים המקוריים כפי שמופיעים במסמך.
   - summary: "חולצו X פריטים (מטבע: ...)"

   חוקים לכתב כמויות בעברית (BOQ):
   - עמודת "תיאור" / "פריט" → description
   - עמודת "סעיף" / "קוד" / "מק"ט" → item_code
   - עמודת "כמות" → quantity
   - עמודת "יחידה" / "יח'" → price_per ("meter" אם מטר, "unit" אחרת)
   - עמודת "מחיר ליח'" / "עלות יח'" / "מחיר יחידה" → unit_price
   - חלץ קוטר מהתיאור אם קיים (למשל "קוטר 800" → dn: 800)
   - חלץ סוג: "צנרת"/"צינור" → pipe; "אוגן"/"פלנג'" → flange; "ברך"/"כיפוף" → elbow; "מעבר" → reducer; "מחבר"/"אקרובט"/"REKA" → coupling

   חוקים לקוטציות אמיבלו/Flowtite (USD/EUR):
   - DN = קוטר נומינלי במ"מ; SN = קשיחות; PN = לחץ
   - אורך מעמודת Description (5.7m, 6m, 12m)
   - pipe_with_coupling = צינור + מחבר Reka; pipe_bare = ללא מחבר; coupling = מחבר בנפרד
   - מספר ref: MUA26.0914 וכד'
1. החזר רק JSON תקין
2. אם שדה לא הוזכר — אל תכלול אותו ב-data
3. המר ערכים מספריים למספרים
4. ספור את מספר השדות שמולאו ב-fields_count
5. ה-summary חייב להיות בעברית, קצר וברור
6. אם הפקודה לא ברורה, החזר: {"action": "query", "summary": "שאלה או הבהרה", "message": "..."}`;

async function extractFileContent(files: { base64: string; mimeType: string; name: string }[]): Promise<{
  text: string;
  imageFiles: { base64: string; mimeType: string }[];
}> {
  const textParts: string[] = [];
  const imageFiles: { base64: string; mimeType: string }[] = [];

  for (const file of files) {
    const mime = file.mimeType || '';
    const name = file.name || '';
    const buffer = Buffer.from(file.base64, 'base64');

    if (mime.includes('spreadsheetml') || mime.includes('ms-excel') || /\.(xlsx|xls)$/i.test(name)) {
      try {
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        const sheetParts: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
          if (rows.length === 0) continue;
          // Strip currency symbols and thousands commas from numeric strings
          const cleanRows = rows.map((row) => {
            const cleaned: Record<string, any> = {};
            for (const [k, v] of Object.entries(row)) {
              cleaned[k] = typeof v === 'string' ? v.replace(/[₪$€£,]/g, '').trim() : v;
            }
            return cleaned;
          });
          sheetParts.push(`=== גיליון: ${sheetName} ===\n${JSON.stringify(cleanRows, null, 0)}`);
        }
        if (sheetParts.length) textParts.push(`[Excel: ${name}]\n${sheetParts.join('\n\n')}`);
      } catch {
        textParts.push(`[Excel: ${name}] — שגיאה בקריאת הקובץ`);
      }
    } else if (mime === 'text/csv' || /\.csv$/i.test(name)) {
      textParts.push(`[CSV: ${name}]\n${buffer.toString('utf-8')}`);
    } else if (mime === 'application/pdf' || /\.pdf$/i.test(name)) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const pdfParse = require('pdf-parse');
        const result = await pdfParse(buffer);
        textParts.push(`[PDF: ${name}]\n${result.text}`);
      } catch {
        textParts.push(`[PDF: ${name}] — שגיאה בחילוץ טקסט`);
      }
    } else if (mime.startsWith('image/')) {
      imageFiles.push({ base64: file.base64, mimeType: mime });
    }
  }

  return { text: textParts.join('\n\n---\n\n'), imageFiles };
}

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

    let imageFiles: { base64: string; mimeType: string }[] = [];

    if (files && Array.isArray(files) && files.length > 0) {
      const extracted = await extractFileContent(files);
      if (extracted.text) {
        userMessage = `${extracted.text}\n\nפקודה:\n${userMessage || 'חלץ את כל נתוני התמחור מהתוכן שלמעלה'}`;
      }
      imageFiles = extracted.imageFiles;
    }

    const model = imageFiles.length > 0 ? VISION_MODEL : TEXT_MODEL;

    const userContent: any = imageFiles.length > 0
      ? [
          { type: 'text', text: userMessage || 'חלץ את כל נתוני התמחור מהתמונה' },
          ...imageFiles.map((f) => ({
            type: 'image_url',
            image_url: { url: `data:${f.mimeType};base64,${f.base64}` },
          })),
        ]
      : userMessage;

    const messages: any[] = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ];

    const requestBody: any = {
      model,
      messages,
      temperature: 0.1,
      max_tokens: 8192,
    };

    // json_object format not supported for vision model
    if (imageFiles.length === 0) {
      requestBody.response_format = { type: 'json_object' };
    }

    const response = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GROQ_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
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
