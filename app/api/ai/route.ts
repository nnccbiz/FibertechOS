import { NextRequest, NextResponse } from 'next/server';

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemma-3-27b-it:generateContent?key=${GEMINI_API_KEY}`;

const SYSTEM_PROMPT = `אתה עוזר AI של מערכת FibertechOS — מערכת ניהול תפעולית לחברת פיברטק תשתיות (צנרת GRP).

המשימה שלך: לקבל טקסט חופשי בעברית מהמשתמש ולחלץ ממנו נתוני פרויקט מובנים.

עליך להחזיר JSON בלבד (בלי טקסט נוסף) במבנה הבא:
{
  "name": "שם הפרויקט",
  "location": "מיקום",
  "project_number": null,
  "order_value": null,
  "ordering_entity": "מזמין",
  "responsible_party": "גורם אחראי",
  "description": "תיאור",
  "project_type": "ביוב/מים/ניקוז/השקיה/תשתית/אחר",
  "installation_type": "חפירה פתוחה/השחלה בשרוול/דחיקה",
  "special_requirements": "",
  "field_supervision": "",
  "soil_type": "",
  "push_depth": "",
  "manhole_type": "",
  "connection_method": "",
  "project_status": "תכנון כללי/תכנון מפורט/טרום מכרז/מועד הגשת מכרז/קבלן זוכה",
  "winning_contractor": "",
  "project_story": "",
  "competitors": "",
  "assessments": "",
  "politics": "",
  "contacts": [
    {"role": "מזמין הפרויקט/מלווה מטעם המזמין/קבלן/נציג/מנהל הפרויקט/מפקח/מתכנן/משרד מתכנן", "name": "", "phone": "", "email": ""}
  ],
  "pipe_specs": [
    {"diameter_mm": 0, "line_length_m": 0, "unit_length_m": 0, "stiffness_pascal": 0, "pressure_bar": 0, "notes": ""}
  ]
}

כללים:
- החזר רק JSON תקין, בלי markdown, בלי הסברים
- אם שדה לא הוזכר, השאר null או מחרוזת ריקה
- אם הוזכרו מספר צינורות, הוסף מספר אובייקטים ל-pipe_specs
- אם הוזכרו אנשי קשר, מלא את contacts
- המר ערכים מספריים למספרים (לא מחרוזות)
- אם המשתמש שואל שאלה במקום לתת נתונים, החזר: {"message": "תשובתך כאן"} `;

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    const { message, context } = await request.json();

    const userMessage = context
      ? `הנתונים הקיימים בפרויקט:\n${JSON.stringify(context, null, 2)}\n\nהודעת המשתמש:\n${message}`
      : message;

    const response = await fetch(GEMINI_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            role: 'user',
            parts: [{ text: SYSTEM_PROMPT + '\n\n' + userMessage }],
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

    // Try to parse JSON from response
    let parsed;
    try {
      // Remove markdown code blocks if present
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
    } catch {
      // If not valid JSON, return as message
      parsed = { message: text };
    }

    return NextResponse.json(parsed);
  } catch (error: any) {
    console.error('AI route error:', error);
    return NextResponse.json({ error: error.message || 'שגיאה פנימית' }, { status: 500 });
  }
}
