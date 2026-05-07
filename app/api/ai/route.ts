import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `אתה מערכת AI פנימית של FibertechOS — מערכת ניהול תפעולית לחברת פיברטק תשתיות (צנרת GRP).

אתה מקבל פקודות בעברית חופשית ומבצע אותן בשקט (Silent Execution).
אתה מחזיר JSON בלבד — בלי טקסט, בלי markdown.

מבנה התשובה:
{
  "action": "create" | "update" | "delete" | "import" | "query",
  "target_table": "projects" | "project_details" | "project_contacts" | "pipe_specs" | "alerts" | "leads" | "inventory" | "team_members" | "cost_input_items" | "project_updates",
  "target_label": "תיאור קריא של היעד (שם הפרויקט/ליד/פריט)",
  "summary": "משפט אחד שמתאר מה ביצעת",
  "fields_count": 0,
  "filter": {
    // לפעולות update ו-delete בלבד: כיצד למצוא את הרשומה
    // דוגמה: {"name": "מטש שמשון"} או {"id": "uuid"}
  },
  "data": {
    // השדות שצריך לעדכן/ליצור (לפרויקט: רק name, current_stage, priority, status, order_value, progress_percent, stage_label)
  },
  "project_details": {
    // לפרויקט חדש או עדכון פרויקט: שדות ל-project_details
    // location, description, ordering_entity, responsible_party, project_type, installation_type, special_requirements, field_supervision, soil_type, push_depth, manhole_type, connection_method, tender_submission_date, winning_contractor, expected_pipe_order_date, project_story, competitors
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

כללים כלליים לפי action:
- create: כלול רק את "data" עם השדות החדשים. אל תכלול "filter".
- update: חובה לכלול "filter" עם שם הרשומה לחיפוש (למשל {"name": "שם הפרויקט"}). כלול ב-"data" רק את השדות שמשתנים.
- delete: חובה לכלול "filter". אל תכלול "data".
- query: כלול "query_filter" עם קריטריונים לסינון, ו-"query_fields" עם רשימת שדות להחזיר.
- import: לייבוא קבצים/קוטציות.

10. יצירת פרויקט חדש (create projects):
   - target_table: "projects", action: "create"
   - data: רק שדות מטבלת projects: name (חובה), current_stage, priority, status, order_value, progress_percent, stage_label
   - project_details: כל פרט אחר על הפרויקט — מיקום, תיאור, גוף מזמין/יזם (ordering_entity), אחראי (responsible_party), סוג פרויקט, סוג התקנה, סוג קרקע וכו'
   - contacts: אם המשתמש הזכיר אנשים עם תפקיד (מתכנן, מנהל פרויקט, יועץ, מהנדס, קבלן, מפקח) — תכניס לכאן עם role + name
   - pipe_specs: אם הוזכרו מפרטי צנרת (קוטר, אורך, לחץ, קשיחות) — תכניס לכאן
   - חובה לפצל: שם פרויקט בלבד הולך ל-data.name. כל פרט אחר הולך לאחד השדות האחרים.
   - דוגמה: "פרויקט חדש איוורור מטש חיפה, יזם מטש חיפה, מתכנן בלשה ילון" → data: {name: "איוורור מטש חיפה"}, project_details: {ordering_entity: "מטש חיפה"}, contacts: [{role: "מתכנן", name: "בלשה ילון"}]
11. עדכון פרויקט (update projects): filter לפי {"name": "שם"}, data עם השדות לשינוי
12. יצירת ליד (create leads): שדות: project_name (חובה), developer_name, stage, estimated_value, next_action, next_action_date
13. עדכון ליד (update leads): filter לפי {"project_name": "שם"}, data עם השדות לשינוי
14. יצירת מלאי (create inventory): שדות: manufacturer, pipe_type, diameter_mm, pressure_bar, stiffness_sn, length_m, in_stock, category
15. עדכון מלאי (update inventory): filter לפי {"manufacturer": "שם", "diameter_mm": מספר}, data עם השדות לשינוי
16. הוספת איש קשר לפרויקט (create project_contacts): target_label = שם הפרויקט, data: {role, name, phone, email}
17. עדכון פרטי פרויקט (update project_details): target_label = שם הפרויקט, data עם השדות לשינוי (מתוך: location, description, ordering_entity, responsible_party, project_type, installation_type, special_requirements, field_supervision, soil_type, push_depth, manhole_type, connection_method, project_status, tender_submission_date, winning_contractor, winning_date, expected_pipe_order_date, project_story, competitors)
18. הוספת מפרט צנרת (create pipe_specs): target_label = שם הפרויקט, data: {diameter_mm, line_length_m, unit_length_m, stiffness_pascal, pressure_bar, notes}
19. שאילתה/שאלה על נתונים (query): החזר action:"query", target_table עם שם הטבלה הרלוונטי, query_filter (אובייקט עם קריטריוני סינון), query_fields (מערך של שמות שדות להחזיר)

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
