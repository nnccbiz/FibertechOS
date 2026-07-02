import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const runtime = 'nodejs';
export const maxDuration = 120;

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_EXTRACTION_MODEL = 'gemini-2.5-pro';

function isTransientGeminiError(e: any): boolean {
  const status = e?.status || e?.response?.status;
  const msg = String(e?.message || '');
  return status === 503 || status === 429 || status === 500 ||
    /\b50[03]\b|overloaded|high demand|service unavailable|try again later/i.test(msg);
}

async function generateWithRetry(model: any, parts: any, maxRetries = 3): Promise<any> {
  let lastErr: any;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await model.generateContent(parts);
    } catch (e: any) {
      lastErr = e;
      if (attempt < maxRetries && isTransientGeminiError(e)) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
        continue;
      }
      throw e;
    }
  }
  throw lastErr;
}

// Extraction prompt — detect the document type and pull the structured fields
// for an Amiblu / Hobas / Flowtite import document set (LOT). Grounded reading
// like the supplier-quote extractor: verbatim, no fabrication.
const IMPORT_EXTRACTION_PROMPT = `אתה מחלץ נתונים ממסמך יבוא של ספק צינורות (Amiblu / Hobas / Flowtite / חברת ספנות).
החזר JSON בלבד, ללא markdown, לפי הסכמה למטה. קרא את המסמך verbatim — אסור להמציא נתונים.

זהה תחילה את סוג המסמך (doc_type), ומלא **רק** את החלקים הרלוונטיים אליו:
- "commercial_invoice" / "proforma_invoice" — Invoice (חשבונית). מלא: doc_number, supplier_name, order, invoice, items.
- "bl" — Bill of Lading / Waybill (שטר מטען, Maersk/MSC וכו'). מלא: shipment, containers.
- "packing_list" — Delivery Note / Packing List (תעודת משלוח של Amiblu). מלא: packing, items.
- "coa" — Inspection / Quality Certificate (תעודת אנליזה). מלא: coa.
- "order_confirmation" — Order Confirmation (OC). מלא: order, items.
- "other" — כל דבר אחר.

⚠️ חוקים קריטיים:
1. מספרים באירופאי: הספק כותב נקודה כאלף ופסיק כעשרוני. "11.888,70" = 11888.70 ; "210,80" = 210.80. החזר תמיד מספר רגיל (נקודה עשרונית, ללא מפרידי אלפים).
2. תאריכים: המר ל-ISO (YYYY-MM-DD). "29.09.2025" → "2025-09-29". אם אין — null.
3. DN/PN/SN — חלץ verbatim מהתיאור. "DN 1100 / OD 1099 PN 06, SN 20.000" → dn:"1100", pn:"06", sn:"20000". אל תמציא.
4. description — השאר את הטקסט המקורי באנגלית מילה-במילה (אל תתרגם).
5. מספרי מסמכים חשובים לקישור — חלץ אותם בדיוק:
   - supplier_order_no = "Ref. order no" / "Sales Order Number" (למשל 1322250535).
   - delivery_note_no = "Delivery Note" (למשל 1822252491).
   - container_number = מספר מכולה (למשל MSKU1238262).
   - bl_number = "B/L No" / "Booking No" (למשל 260373565).
   - invoice_no = מספר החשבונית (למשל 2022253253).
6. אם שדה לא קיים במסמך — החזר null (או מערך ריק). אל תכלול ערכים מומצאים.

סכמת ה-JSON (כלול את כל המפתחות; מלא null/[] במה שלא רלוונטי):
{
  "doc_type": "commercial_invoice|proforma_invoice|bl|packing_list|coa|order_confirmation|other",
  "doc_number": string|null,
  "supplier_name": string|null,
  "order": {
    "supplier_order_no": string|null,
    "supplier_project_no": string|null,
    "project_name": string|null,
    "currency": string|null,
    "incoterms": string|null,
    "payment_terms": string|null
  },
  "invoice": {
    "invoice_no": string|null,
    "invoice_type": "commercial|proforma|advance|null",
    "invoice_date": string|null,
    "net_value": number|null,
    "freight": number|null,
    "down_payment": number|null,
    "final_amount": number|null,
    "delivery_notes": string[]
  },
  "shipment": {
    "bl_number": string|null,
    "carrier": string|null,
    "vessel_name": string|null,
    "voyage_no": string|null,
    "port_loading": string|null,
    "port_discharge": string|null,
    "etd": string|null,
    "eta": string|null
  },
  "containers": [
    { "container_number": string, "seal_number": string|null, "container_type": string|null, "gross_weight": number|null, "pieces": number|null }
  ],
  "items": [
    { "line_no": number|null, "material_no": string|null, "description": string, "dn": string|null, "pn": string|null, "sn": string|null, "qty": number|null, "unit": string|null, "unit_price": number|null, "delivery_note_no": string|null }
  ],
  "packing": {
    "delivery_note_no": string|null,
    "container_number": string|null,
    "loading_date": string|null,
    "discharge_date": string|null,
    "pieces": number|null
  },
  "coa": {
    "coa_no": string|null,
    "coa_date": string|null,
    "dn": string|null,
    "pn": string|null,
    "sn": string|null,
    "delivery_notes": string[],
    "passed": boolean|null
  }
}`;

async function extractOne(model: any, file: { base64: string; mimeType: string; name: string }) {
  const mime = file.mimeType || '';
  const isPdf = mime.includes('pdf') || file.name.toLowerCase().endsWith('.pdf');
  const isImage = mime.startsWith('image/');
  if (!isPdf && !isImage) {
    return { name: file.name, error: 'סוג קובץ לא נתמך לחילוץ (רק PDF/תמונה)' };
  }
  try {
    const result = await generateWithRetry(model, [
      { inlineData: { data: file.base64, mimeType: isPdf ? 'application/pdf' : mime } },
      { text: IMPORT_EXTRACTION_PROMPT },
    ]);
    const text = result.response.text();
    let data: any;
    try {
      data = JSON.parse(text);
    } catch {
      const m = text.match(/\{[\s\S]*\}/);
      if (!m) return { name: file.name, error: 'לא הצלחתי לפענח את תשובת החילוץ' };
      data = JSON.parse(m[0]);
    }
    return { name: file.name, doc_type: data.doc_type || 'other', data };
  } catch (e: any) {
    return { name: file.name, error: e?.message || 'שגיאת חילוץ' };
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!GEMINI_API_KEY) {
      return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }
    const body = await request.json();
    const files: { base64: string; mimeType: string; name: string }[] = body.files || [];
    if (!files.length) {
      return NextResponse.json({ error: 'לא צורפו קבצים' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: GEMINI_EXTRACTION_MODEL,
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0,
        topK: 1,
        topP: 0.1,
        maxOutputTokens: 8192,
        thinkingConfig: { thinkingBudget: 8192, includeThoughts: false },
      } as any,
    });

    // Each file is its own grounded extraction; run them concurrently.
    const results = await Promise.all(files.map((f) => extractOne(model, f)));
    return NextResponse.json({ results });
  } catch (e: any) {
    console.error('[import/extract] error', e);
    return NextResponse.json({ error: e?.message || 'שגיאה' }, { status: 500 });
  }
}
