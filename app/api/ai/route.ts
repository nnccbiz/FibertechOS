import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${GEMINI_API_KEY}`;

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
9. כשמשתמש מעלה קובץ תמחור (הצעת מחיר מספק, מחירון, טבלת עלויות, קוטציה) — חלץ את כל הפריטים והחזר:
   - target_table: "supplier_quote"
   - action: "import"
   - quote_info: { supplier_name: "שם הספק", quote_ref: "מספר ref", quote_date: "YYYY-MM-DD", project_name: "שם הפרויקט", currency: "USD/EUR/ILS" }
   - חובה למלא quote_info.project_name — אם לא מופיע במסמך, קח מהודעת המשתמש (למשל "קוטציה לפרויקט מטש שמשון" → project_name: "מטש שמשון")
   - חובה למלא quote_info.quote_ref — חפש מספר ref/quote/reference/הצעה במסמך
   - חובה למלא quote_info.supplier_name — חפש שם ספק/חברה במסמך (Amiblu, Flowtite וכו')
   - data: מערך של פריטים, כל פריט: { item_type: "pipe_with_coupling/pipe_bare/coupling/elbow/flange/reducer/other", dn: מספר, sn: מספר, pn: מספר, length_m: אורך במטרים, unit_price: מחיר ליחידה, price_per: "meter"/"unit", currency: "USD/EUR", description: "תיאור מלא מהמסמך" }
   - זהה את המטבע מהמסמך (USD, EUR, ILS, GBP וכו'). אל תניח שזה שקלים — בדוק סימנים ($, €, ₪, £), כיתוב (דולר, יורו, שקל) או כל רמז אחר.
   - שמור על המחירים המקוריים כפי שמופיעים במסמך.
   - summary: "חולצו X פריטים מקוטציה [ref] של [ספק] (מטבע: USD/EUR/ILS)"

   כללי חילוץ לקוטציות אמיבלו/Flowtite:
   - DN = קוטר נומינלי במ"מ (300, 400, 500, 600, 800, 1000, 1200, 1400, 1600...)
   - SN = קשיחות (2500, 5000, 10000)
   - PN = לחץ עבודה בבר
   - אורך הצינור בא מעמודת Description (5.7m, 6m, 12m)
   - pipe_with_coupling = צינור כולל מחבר Reka (מחיר למטר)
   - pipe_bare = צינור בלי מחבר (מחיר למטר)
   - coupling = מחבר Reka בנפרד (מחיר ליחידה)
   - elbow = ברך/כיפוף
   - flange = אוגן/פלנג׳
   - reducer = מעבר קטרים
   - זהה את מספר ה-ref (למשל: MUA26.0914)
   - זהה תאריך הקוטציה
1. החזר רק JSON תקין
2. אם שדה לא הוזכר — אל תכלול אותו ב-data
3. המר ערכים מספריים למספרים
4. ספור את מספר השדות שמולאו ב-fields_count
5. ה-summary חייב להיות בעברית, קצר וברור
6. אם הפקודה לא ברורה, החזר: {"action": "query", "summary": "שאלה או הבהרה", "message": "..."}`;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
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

    // Build parts array — text + optional files/images
    const parts: any[] = [{ text: SYSTEM_PROMPT + '\n\n' + userMessage }];

    // Add uploaded files (images, PDFs as base64)
    if (files && Array.isArray(files)) {
      for (const file of files) {
        if (file.base64 && file.mimeType) {
          parts.push({
            inline_data: {
              mime_type: file.mimeType,
              data: file.base64,
            },
          });
        }
      }
      if (!message) {
        parts[0] = { text: SYSTEM_PROMPT + '\n\nחלץ את כל הנתונים מהקבצים המצורפים והזן למערכת.' };
      }
    }

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts,
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4096,
        },
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Gemma API error:', err);
      return NextResponse.json({ error: 'שגיאה בתקשורת עם Gemma' }, { status: 500 });
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      parsed = { action: 'query', summary: text, message: text };
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('AI route error:', error);
    return NextResponse.json({ error: error.message || 'שגיאה פנימית' }, { status: 500 });
  }
}
