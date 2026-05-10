import { NextRequest, NextResponse } from 'next/server';
import * as XLSX from 'xlsx';

const GROQ_API_KEY = process.env.GROQ_API_KEY;
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const TEXT_MODEL = 'llama-3.3-70b-versatile';
const VISION_MODEL = 'llama-3.2-11b-vision-preview';

// Lean prompt used only for file extraction — avoids hitting Groq TPM limit
const FILE_EXTRACTION_PROMPT = `חלץ נתוני תמחור מהטבלה. החזר JSON בלבד, ללא markdown.

מבנה:
{"action":"import","target_table":"supplier_quote","quote_info":{"supplier_name":"","quote_ref":"","quote_date":"","currency":"ILS"},"data":[{"description":"","item_code":"","dn":0,"quantity":0,"unit_price":0,"price_per":"meter","currency":"ILS"}],"summary":"חולצו X פריטים"}

חוקים:
- כל שורת טבלה = פריט אחד ב-data. אל תדלג על שורות.
- תיאור/פריט → description | סעיף/קוד/מק"ט → item_code | כמות → quantity
- מחיר יח'/עלות יח' → unit_price | יחידה "מטר" → price_per:"meter" אחרת "unit"
- מטבע: ₪/שקל/ש"ח → ILS | $ → USD | € → EUR (ברירת מחדל ILS)
- חלץ קוטר DN מהתיאור אם קיים (קוטר 800 → dn:800)
- supplier_name, quote_ref מהמסמך אם קיים`;

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

// Hebrew BOQ column keywords → normalized field names
const BOQ_COL_MAP: [string[], string][] = [
  [['תיאור', 'פריט', 'תאור', 'פירוט', 'description', 'item', 'מוצר', 'שם פריט', 'שם המוצר'], 'description'],
  [['סעיף', 'קוד', 'מקט', 'מק"ט', 'מק\\\'ט', 'code', 'ref', 'item_code'], 'item_code'],
  [['כמות', 'qty', 'quantity', 'כמ\'', 'כמ'], 'quantity'],
  [['יחידה', 'יח\'', 'יח', 'unit', 'units'], 'unit'],
  [['מחיר יח\'', 'עלות יח\'', 'מחיר יחידה', 'מחיר/יח', 'מחיר ליח', 'מחיר', 'unit_price', 'price', 'עלות'], 'unit_price'],
  [['סה"כ', 'סהכ', 'סה״כ', 'total', 'סך הכל', 'סך כל'], 'total'],
  [['הערות', 'remarks', 'notes', 'הערה'], 'notes'],
];

function detectCol(header: string): string | null {
  const h = header.trim().toLowerCase().replace(/\s+/g, ' ');
  for (const [keywords, field] of BOQ_COL_MAP) {
    if (keywords.some(k => h.includes(k.toLowerCase()))) return field;
  }
  return null;
}

function parseExcelBOQ(buffer: Buffer, fileName: string): object | null {
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const allItems: any[] = [];
  let supplierName = '';
  let quoteRef = '';
  let currency = 'ILS';

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawRows.length === 0) continue;

    // Scan first rows for supplier name / quote ref
    for (let i = 0; i < Math.min(rawRows.length, 8); i++) {
      const rowStr = rawRows[i].map(String).join(' ');
      if (!supplierName && /ספק|חברה|מציע|שם/i.test(rowStr)) {
        const parts = rawRows[i].filter((c: any) => c && String(c).trim());
        if (parts.length) supplierName = String(parts[parts.length - 1]).trim();
      }
      if (!quoteRef && /מספר|ref|הצעה|quote/i.test(rowStr)) {
        const m = rowStr.match(/[\d]{4,}/);
        if (m) quoteRef = m[0];
      }
      if (/\$|usd|דולר/i.test(rowStr)) currency = 'USD';
      else if (/€|eur|אירו/i.test(rowStr)) currency = 'EUR';
    }

    // Find header row
    let headerIdx = -1;
    let colMap: Record<number, string> = {};
    for (let i = 0; i < Math.min(rawRows.length, 15); i++) {
      const row = rawRows[i];
      const mapped: Record<number, string> = {};
      let hits = 0;
      for (let j = 0; j < row.length; j++) {
        const field = detectCol(String(row[j] ?? ''));
        if (field) { mapped[j] = field; hits++; }
      }
      if (hits >= 2) { headerIdx = i; colMap = mapped; break; }
    }
    if (headerIdx === -1) continue;

    // Parse data rows
    for (let i = headerIdx + 1; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row.some((c: any) => c !== '' && c !== null && c !== undefined)) continue;

      const item: any = {};
      for (const [colIdx, field] of Object.entries(colMap)) {
        let v = row[Number(colIdx)];
        if (typeof v === 'string') v = v.replace(/[₪$€£,]/g, '').trim();
        item[field] = v ?? '';
      }

      const desc = String(item.description || '').trim();
      const qty = parseFloat(String(item.quantity)) || 0;
      const unitPrice = parseFloat(String(item.unit_price)) || 0;
      if (!desc && qty === 0 && unitPrice === 0) continue; // skip empty rows

      // Extract DN from description
      const dnMatch = desc.match(/(?:dn|קוטר|ø)\s*(\d{2,4})/i);
      const dn = dnMatch ? parseInt(dnMatch[1]) : null;

      // Detect item type from description
      let itemType = 'other';
      if (/צינור|pipe/i.test(desc)) itemType = 'pipe';
      else if (/אוגן|פלנג|flange/i.test(desc)) itemType = 'flange';
      else if (/ברך|כיפוף|elbow/i.test(desc)) itemType = 'elbow';
      else if (/מעבר|reducer/i.test(desc)) itemType = 'reducer';
      else if (/מחבר|coupling|reka|אקרובט/i.test(desc)) itemType = 'coupling';

      const unitStr = String(item.unit || '');
      const pricePer = /מטר|meter|m\b/i.test(unitStr) ? 'meter' : 'unit';

      allItems.push({
        description: desc || item.item_code || `פריט ${i}`,
        item_code: String(item.item_code || '').trim() || null,
        item_type: itemType,
        dn: dn,
        quantity: qty,
        unit_price: unitPrice,
        price_per: pricePer,
        currency,
        notes: String(item.notes || '').trim() || null,
      });
    }
  }

  if (allItems.length === 0) return null;

  return {
    action: 'import',
    target_table: 'supplier_quote',
    quote_info: {
      supplier_name: supplierName || fileName.replace(/\.[^.]+$/, ''),
      quote_ref: quoteRef || null,
      currency,
    },
    data: allItems,
    summary: `חולצו ${allItems.length} פריטים (מטבע: ${currency})`,
  };
}

async function extractFileContent(files: { base64: string; mimeType: string; name: string }[]): Promise<{
  text: string;
  imageFiles: { base64: string; mimeType: string }[];
}> {
  const textParts: string[] = [];
  const imageFiles: { base64: string; mimeType: string }[] = [];

  console.log(`[AI route] extractFileContent: ${files.length} file(s)`);
  for (const file of files) {
    const mime = file.mimeType || '';
    const name = file.name || '';
    const b64len = file.base64?.length || 0;
    console.log(`[AI route] file: name="${name}" mime="${mime}" base64len=${b64len}`);
    if (!file.base64 || b64len === 0) { textParts.push(`[${name || 'קובץ'}] — base64 ריק`); continue; }
    const buffer = Buffer.from(file.base64, 'base64');

    if (mime.includes('spreadsheetml') || mime.includes('ms-excel') || /\.(xlsx|xls)$/i.test(name)) {
      try {
        console.log(`[AI route] Excel file: name=${name} mime=${mime} buflen=${buffer.length}`);
        const workbook = XLSX.read(buffer, { type: 'buffer' });
        console.log(`[AI route] Excel sheets: ${workbook.SheetNames.join(', ')}`);
        const sheetParts: string[] = [];
        for (const sheetName of workbook.SheetNames) {
          const sheet = workbook.Sheets[sheetName];
          // Use raw arrays (header:1) to handle files with title rows before the actual header
          const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
          console.log(`[AI route] Sheet "${sheetName}": ${rawRows.length} raw rows`);
          if (rawRows.length === 0) continue;

          // Find the header row: first row with at least 3 non-empty cells
          let headerIdx = 0;
          for (let i = 0; i < Math.min(rawRows.length, 10); i++) {
            const nonEmpty = rawRows[i].filter((c: any) => c !== '' && c !== null && c !== undefined).length;
            if (nonEmpty >= 3) { headerIdx = i; break; }
          }
          const headers = rawRows[headerIdx].map((h: any) => String(h).trim());
          const dataRows = rawRows.slice(headerIdx + 1).filter((r: any[]) =>
            r.some((c: any) => c !== '' && c !== null && c !== undefined)
          );
          console.log(`[AI route] headerIdx=${headerIdx} headers=[${headers.join('|')}] dataRows=${dataRows.length}`);
          if (dataRows.length === 0) continue;

          // Convert to objects using the found headers
          const objRows = dataRows.map((row: any[]) => {
            const obj: Record<string, any> = {};
            headers.forEach((h, i) => {
              if (!h) return;
              const v = row[i];
              obj[h] = typeof v === 'string' ? v.replace(/[₪$€£,]/g, '').trim() : v;
            });
            return obj;
          });
          sheetParts.push(`=== גיליון: ${sheetName} ===\n${JSON.stringify(objRows, null, 0)}`);
        }
        if (sheetParts.length) textParts.push(`[Excel: ${name}]\n${sheetParts.join('\n\n')}`);
        else textParts.push(`[Excel: ${name}] — לא נמצאו שורות נתונים`);
      } catch (e: any) {
        console.error(`[AI route] Excel parse error:`, e?.message);
        textParts.push(`[Excel: ${name}] — שגיאה בקריאת הקובץ: ${e?.message}`);
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
      // Try direct Excel BOQ parsing first — no AI needed for structured spreadsheets
      for (const file of files) {
        const mime = file.mimeType || '';
        const name = file.name || '';
        if (mime.includes('spreadsheetml') || mime.includes('ms-excel') || /\.(xlsx|xls)$/i.test(name)) {
          if (file.base64) {
            const buffer = Buffer.from(file.base64, 'base64');
            const boqResult = parseExcelBOQ(buffer, name);
            if (boqResult) {
              console.log(`[AI route] direct BOQ parse success: ${(boqResult as any).data?.length} items`);
              return NextResponse.json(boqResult);
            }
            console.log(`[AI route] direct BOQ parse failed (no recognized columns), falling back to Groq`);
          }
        }
      }

      // For non-Excel files (PDF, image) or unrecognized Excel, use Groq
      const extracted = await extractFileContent(files);
      const textLen = extracted.text.length;
      console.log(`[AI route] extracted: len=${textLen} imgs=${extracted.imageFiles.length}`);
      if (extracted.text) {
        userMessage = `${extracted.text}\n\nפקודה:\n${userMessage || 'חלץ את כל נתוני התמחור מהתוכן שלמעלה'}`;
      }
      if (userMessage.length > 8000) {
        userMessage = userMessage.slice(0, 8000) + '\n...(truncated)';
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

    // Use lean extraction prompt when processing files to stay within Groq TPM limit
    const hasExtractedText = files && Array.isArray(files) && files.length > 0 && imageFiles.length === 0;
    const systemPrompt = hasExtractedText ? FILE_EXTRACTION_PROMPT : SYSTEM_PROMPT;

    const messages: any[] = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userContent },
    ];

    const requestBody: any = {
      model,
      messages,
      temperature: 0.1,
      max_tokens: hasExtractedText ? 4096 : 8192,
    };

    // json_object format: use for normal chat only.
    // For file extraction we skip it — the lean prompt already says "JSON only"
    // and some Groq model versions reject json_object with large extracted content.
    if (imageFiles.length === 0 && !hasExtractedText) {
      requestBody.response_format = { type: 'json_object' };
    }

    console.log(`[AI route] sending to Groq: model=${model} hasExtractedText=${hasExtractedText} msgLen=${JSON.stringify(messages).length}`);

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
      console.error(`[AI route] Groq error ${response.status}: ${err.slice(0, 500)}`);
      let errMsg = 'שגיאה בתקשורת עם רקסי';
      try { const parsed = JSON.parse(err); errMsg = parsed?.error?.message || errMsg; } catch {}
      return NextResponse.json({ error: errMsg, groq_status: response.status, summary: `שגיאה ${response.status}: ${errMsg}`, message: errMsg }, { status: 500 });
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content || '';
    console.log('[AI route] raw AI response (first 500):', text.slice(0, 500));

    let parsed;
    try {
      const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      parsed = JSON.parse(cleaned);
      console.log('[AI route] parsed action:', parsed.action, 'target_table:', parsed.target_table, 'data length:', Array.isArray(parsed.data) ? parsed.data.length : typeof parsed.data);
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
