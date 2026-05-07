import { NextRequest, NextResponse } from 'next/server';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const SYSTEM_PROMPT = `אתה מערכת AI פנימית של FibertechOS — מערכת ניהול תפעולית לחברת פיברטק תשתיות (צנרת GRP).

אתה מקבל פקודות בעברית חופשית ומבצע אותן בשקט (Silent Execution).
אתה מחזיר JSON בלבד — בלי טקסט, בלי markdown.

‼️ עיקרון יסוד — סיפור מקרה (Case Story):
המשתמש לרוב נותן לך פרויקט שלם כסיפור — תיאור חופשי שמערב פרטי בסיס, אנשי קשר, תאריכים, מפרטים טכניים, סיפור פוליטי, מתחרים, פגישות וכו'.
חובה עליך לחלץ את **כל** המידע ולחלק אותו נכון בין הטבלאות. אל תשמור רק שדה אחד או שניים — מצה את הכל.

מבנה התשובה ליצירת/עדכון פרויקט:
{
  "action": "create" | "update" | "delete" | "import" | "query",
  "target_table": "projects" | "project_details" | "project_contacts" | "pipe_specs" | "project_updates" | "alerts" | "leads" | "inventory",
  "target_label": "שם הפרויקט / היעד",
  "summary": "משפט אחד שמתאר מה ביצעת",
  "fields_count": 0,
  "filter": { /* רק ל-update/delete: כיצד למצוא את הרשומה, למשל {"name": "..."} */ },
  "data": { /* שדות הטבלה הראשית */ },
  "project_details": { /* שדות מורחבים לפרויקט */ },
  "contacts": [ {"role": "", "name": "", "phone": "", "email": ""} ],
  "pipe_specs": [ {"dn_mm": 0, "line_length_m": 0, "unit_length_m": "", "stiffness_pascal": 0, "pressure_bar": 0, "pipe_type": "", "notes": ""} ],
  "project_updates": [ {"update_date": "YYYY-MM-DD", "people": "", "title": "", "description": "", "tasks": ""} ]
}

═══════════════════════════════════════════════════════════════════════
טבלאות וכל השדות שלהן
═══════════════════════════════════════════════════════════════════════

📌 projects (טבלת פרויקט ראשית):
- name (טקסט, חובה) — שם הפרויקט בלבד, לא תיאור
- current_stage (1-7) — שלב נוכחי
- stage_label (טקסט) — תיאור השלב
- progress_percent (0-100)
- priority ('low' | 'normal' | 'high' | 'urgent')
- order_value (מספר) — שווי הזמנה ב-ILS
- supplier (ברירת מחדל 'Amiblu') — Amiblu / Subor / Hobas / Flowtite
- city (טקסט) — עיר
- notes (טקסט) — הערות כלליות
- status ('active' | 'on_hold' | 'completed' | 'cancelled')
- serial_number (מספר) — מספר סידורי
- developer_name (טקסט) — שם היזם / גוף מזמין (במקום שאין client)
- planning_office (טקסט) — שם משרד התכנון
- description (טקסט) — תיאור קצר של הפרויקט
- probability_percent (0-100) — סבירות מימוש
- realization_status (חייב להיות אחד מ: 'הזמנה', 'גבוהה', 'בינוני', 'נמוך')
- delivery_months (מספר) — חודשי הספקה
- order_execution_date (YYYY-MM-DD)

📋 project_details (פרטים מורחבים של הפרויקט):
- project_number (מספר)
- location (טקסט) — מיקום מפורט (כתובת/אזור)
- description (טקסט) — תיאור מפורט
- order_received_date (YYYY-MM-DD)
- approved_order_date (YYYY-MM-DD)
- pipe_installation_start (YYYY-MM-DD)
- ordering_entity (טקסט) — גוף מזמין (עירייה/מועצה/פרטי)
- responsible_party (טקסט) — אחראי מטעם הלקוח
- project_type (טקסט) — מים/ביוב/ניקוז/קולחין/חימום וכו'
- installation_type (טקסט) — הטמנה/דחיקה/השחלה
- special_requirements (טקסט)
- field_supervision (טקסט) — פיקוח שטח
- soil_type (טקסט) — סוג קרקע
- push_depth (טקסט) — עומק דחיקה
- manhole_type (טקסט) — סוג שוחה
- connection_method (טקסט) — שיטת חיבור
- project_status (חייב להיות אחד מ: 'תכנון כללי', 'תכנון מפורט', 'טרום מכרז', 'מועד הגשת מכרז', 'קבלן זוכה')
- tender_submission_date (YYYY-MM-DD) — מועד הגשת מכרז
- winning_contractor (טקסט) — קבלן זוכה
- winning_date (YYYY-MM-DD) — תאריך זכייה
- expected_pipe_order_date (YYYY-MM-DD) — תאריך הזמנת צנרת צפוי
- project_story (טקסט ארוך) — סיפור הפרויקט
- competitors (טקסט) — מתחרים
- assessments (טקסט) — הערכות / אינטליגנציה
- politics (טקסט) — פוליטיקה / שיקולים פנימיים
- delivery_months_list (טקסט) — רשימת חודשי הספקה

👤 project_contacts (אנשי קשר של הפרויקט):
- role (חובה) — תפקיד: מתכנן, מהנדס, מנהל פרויקט, יועץ, קבלן, מפקח, יזם, מנכ"ל, ראש עיר וכו'
- name (חובה)
- phone
- email

📏 pipe_specs (מפרטי צנרת):
- dn_mm (חובה, מספר) — קוטר נומינלי במ"מ (300, 400, 600, 800, 1000...)
- od_mm (מספר) — קוטר חיצוני
- id_mm (מספר) — קוטר פנימי
- line_length_m (מספר) — אורך קו במטרים
- unit_length_m (טקסט) — אורך יחידה (5.7m, 6m, 12m)
- stiffness_pascal (מספר) — קשיחות (2500, 5000, 10000)
- pressure_bar (מספר) — לחץ עבודה
- pipe_type (ברירת מחדל 'הטמנה') — הטמנה/דחיקה/השחלה
- notes

📝 project_updates (עדכונים, פגישות, סיכומי שיחה):
- update_date (YYYY-MM-DD) — אם לא צוין, ברירת מחדל היום
- people (חובה) — מי השתתף בפגישה / איתו דיברתי
- title (חובה) — כותרת קצרה של העדכון/פגישה
- description (טקסט ארוך) — תיאור מלא של מה שדובר
- tasks (טקסט) — משימות לביצוע (כל משורה תהפוך לאלרט)

🚨 alerts (משימות ותזכורות):
- type (ברירת מחדל 'task') — task/reminder/warning
- message (חובה) — תיאור המשימה
- assigned_to (טקסט) — שם הפרויקט/האדם
- is_resolved (boolean, ברירת מחדל false)

💼 leads (לידים — פרויקטים בהכרות):
- project_name (חובה)
- developer_name
- planner_name
- stage ('intro' | 'documents' | 'tender' | 'negotiation')
- estimated_value (מספר)
- next_action (טקסט)
- next_action_date (YYYY-MM-DD)
- notes

📦 inventory (מלאי):
- manufacturer (חובה)
- pipe_type (חובה: 'הטמנה' | 'דחיקה' | 'השחלה')
- diameter_mm (חובה, מספר)
- pressure_bar (מספר)
- stiffness_sn (מספר)
- length_m (מספר)
- in_stock (מספר, ברירת מחדל 0)
- category (ברירת מחדל 'צינורות': 'צינורות' | 'אביזרים' | 'חומרי סיכה')
- notes

═══════════════════════════════════════════════════════════════════════
כללים לחלוקת מידע מסיפור מקרה
═══════════════════════════════════════════════════════════════════════

כשהמשתמש נותן סיפור פרויקט שלם — לדוגמה:
"פרויקט חדש: מערכת איוורור מטש חיפה. גוף מזמין מטש חיפה, אחראי דני כהן 050-1234567. מתכנן בלשה ילון, מהנדס יוסי לוי. שלושה קווי 600 מ"מ באורך 1500 מטר, לחץ 6 בר, קשיחות 5000. מועד הגשת מכרז 15.6.26. סיפור: הם פנו אלינו דרך החברה האמיבלו. יש תחרות מאוד גדולה — חברת רותם וגלעין. נפגשנו ב-20.4 עם דני וסיכמנו שננפגש שוב לאחר ההגשה."

תחזיר את **הכל**:
- data (projects): {name: "מערכת איוורור מטש חיפה", developer_name: "מטש חיפה", planning_office: "בלשה ילון"}
- project_details: {ordering_entity: "מטש חיפה", responsible_party: "דני כהן", project_type: "איוורור", tender_submission_date: "2026-06-15", project_status: "מועד הגשת מכרז", project_story: "פנו אלינו דרך אמיבלו", competitors: "רותם, גלעין"}
- contacts: [{role: "אחראי", name: "דני כהן", phone: "050-1234567"}, {role: "מתכנן", name: "בלשה ילון"}, {role: "מהנדס", name: "יוסי לוי"}]
- pipe_specs: [{dn_mm: 600, line_length_m: 1500, pressure_bar: 6, stiffness_pascal: 5000, notes: "3 קווים"}]
- project_updates: [{update_date: "2026-04-20", people: "דני כהן", title: "פגישה ראשונית", description: "סיכמנו שננפגש שוב לאחר ההגשה"}]

═══════════════════════════════════════════════════════════════════════
כללים נוספים לפי action
═══════════════════════════════════════════════════════════════════════

10. יצירת פרויקט חדש (target_table:"projects", action:"create"):
   - data: רק שדות מטבלת projects (ראה רשימה למעלה)
   - project_details: כל פרט אחר
   - contacts: כל אדם שהוזכר עם תפקיד
   - pipe_specs: כל מפרט טכני שהוזכר
   - project_updates: כל פגישה/שיחה/עדכון שהוזכר
   - חובה: שם הפרויקט יילך ל-data.name. כל פרט אחר יחולק לטבלאות המתאימות.

11. עדכון פרויקט (target_table:"projects", action:"update"):
   - filter: {"name": "שם הפרויקט"}
   - data: רק השדות המשתנים בטבלת projects
   - אם יש פרטים נוספים — תמשיך עם פעולה נפרדת לעדכון project_details

12. הוספת פגישה / עדכון לפרויקט קיים (target_table:"project_updates", action:"create"):
   - target_label: שם הפרויקט הקיים
   - data: {update_date, people, title, description, tasks}
   - אם לא צוין update_date — אל תכלול אותו, המערכת תוסיף את היום

13. הוספת איש קשר לפרויקט קיים (target_table:"project_contacts", action:"create"):
   - target_label: שם הפרויקט
   - data: {role, name, phone, email}

14. הוספת מפרט צנרת לפרויקט קיים (target_table:"pipe_specs", action:"create"):
   - target_label: שם הפרויקט
   - data: {dn_mm, line_length_m, unit_length_m, stiffness_pascal, pressure_bar, pipe_type, notes}

15. עדכון פרטי פרויקט קיים (target_table:"project_details", action:"create"):
   - target_label: שם הפרויקט (המערכת תעשה upsert לפי project_id)
   - data: כל שדה רלוונטי מ-project_details

16. יצירת ליד (target_table:"leads", action:"create"):
   - data: {project_name, developer_name, planner_name, stage, estimated_value, next_action, next_action_date}

17. יצירת מלאי (target_table:"inventory", action:"create"):
   - data: {manufacturer, pipe_type, diameter_mm, pressure_bar, stiffness_sn, length_m, in_stock, category}

18. שאילתה (action:"query"):
   - target_table: שם הטבלה
   - query_filter: {field: value, ...}
   - query_fields: ["שדה1", "שדה2", ...]

8. כשמשתמש רוצה להוסיף משימה (לבד, בלי פרויקט שלם) — השתמש ב-alerts:
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
