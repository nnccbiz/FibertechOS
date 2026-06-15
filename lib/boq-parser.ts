// Shared BOQ (Bill of Quantities) Excel parser — runs in BOTH the browser and
// the server. Heavy supplier/pricing spreadsheets (often 100s of KB once they
// embed logos/EMF images) are parsed where the file already lives — the
// browser — so we never ship a ~1MB base64 to the API and never fall back to
// Gemini (which hallucinates from its prompt examples on unreadable input).
//
// XLSX.read with type:'array' accepts a Uint8Array or ArrayBuffer; a Node
// Buffer is a Uint8Array subclass, so the same call works server-side too.
import * as XLSX from 'xlsx';

export type BOQItem = {
  description: string;
  item_code: string | null;
  item_type: string;
  dn: number | null;
  pn: number | null;
  sn: number | null;
  length_m: number | null;
  quantity: number;
  unit_price: number;
  price_per: 'meter' | 'unit';
  currency: string;
  notes: string | null;
};

export type BOQResult = {
  action: 'import';
  target_table: 'supplier_quote';
  quote_info: { supplier_name: string; quote_ref: string | null; currency: string };
  data: BOQItem[];
  summary: string;
};

// Hebrew BOQ column keywords → normalized field names.
// IMPORTANT: order matters — more specific keywords MUST come before generic ones.
export const BOQ_COL_MAP: [string[], string][] = [
  [['קוטר נומינאלי', 'קוטר', 'nominal diameter', 'diameter', 'dn'], 'dn'],
  [['קשיחות', 'stiffness', 'פסקל', 'sn'], 'sn'],
  [['לחץ בדיקה', 'לחץ עבודה', 'לחץ', 'pressure', 'pn'], 'pn'],
  [['אורך יחידה', 'אורך', 'length'], 'length'],
  [['כמות מטרים', 'מספר פריטים', 'כמות', 'qty', 'quantity'], 'quantity'],
  [['תיאור', 'פריט', 'תאור', 'פירוט', 'description', 'item', 'מוצר', 'שם פריט', 'שם המוצר'], 'description'],
  [['סעיף', 'קוד', 'מקט', 'מק"ט', 'code', 'ref', 'item_code'], 'item_code'],
  [['עלות יח', 'עלות ליח', 'עלות/יח', 'unit cost', 'cost/unit', 'עלות יחידה'], 'cost_price'],
  [['מחיר מטר', 'מחיר למטר', 'מחיר ללקוח', 'מחיר יח', 'מחיר יחידה', 'מחיר/יח', 'מחיר ליח', 'unit_price', 'unit price', 'price per'], 'sell_price'],
  [['סה"כ עלות', 'סהכ עלות', 'סה״כ עלות', 'total cost', 'עלות כוללת', 'עלות סה"כ'], 'total_cost'],
  [['סה"כ', 'סהכ', 'סה״כ', 'total', 'סך הכל', 'סך כל'], 'total_sell'],
  [['יחידה', 'יח\'', 'unit', 'units'], 'unit'],
  [['הערות', 'remarks', 'notes', 'הערה'], 'notes'],
];

export function detectCol(header: string): string | null {
  const norm = (s: string) => s.trim()
    .replace(/[״"''`]/g, '"')
    .toLowerCase()
    .replace(/\s+/g, ' ');
  const h = norm(header);
  for (const [keywords, field] of BOQ_COL_MAP) {
    if (keywords.some(k => h.includes(norm(k)))) return field;
  }
  return null;
}

export const PRICING_SHEET_PATTERNS = /תמחור|מחירון|pricing|price|עלות|costs?/i;

export function parseExcelBOQ(data: ArrayBuffer | Uint8Array, fileName: string): BOQResult | null {
  const workbook = XLSX.read(data, { type: 'array' });
  const preferredSheets = workbook.SheetNames.filter(n => PRICING_SHEET_PATTERNS.test(n));
  const sheetsToProcess = preferredSheets.length > 0 ? preferredSheets : workbook.SheetNames;

  const allItems: BOQItem[] = [];
  let supplierName = '';
  let quoteRef = '';
  let currency = 'ILS';

  const detectHeader = (row: any[]) => {
    const mapped: Record<number, string> = {};
    let hits = 0;
    for (let j = 0; j < row.length; j++) {
      const field = detectCol(String(row[j] ?? ''));
      if (field) { mapped[j] = field; hits++; }
    }
    return hits >= 2 ? mapped : null;
  };
  const isTotalRow = (row: any[]) => {
    const joined = row.map(String).join(' ');
    return /\b(total|cif|sub-?total|grand)\b|סה"?כ|סה״כ|סך הכל/i.test(joined);
  };

  for (const sheetName of sheetsToProcess) {
    const sheet = workbook.Sheets[sheetName];
    const rawRows: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' });
    if (rawRows.length === 0) continue;

    // Pull supplier/currency hints from the top of the sheet.
    for (let i = 0; i < Math.min(rawRows.length, 8); i++) {
      const rowStr = rawRows[i].map(String).join(' ');
      if (!supplierName && /ספק|חברה|מציע|שם/i.test(rowStr)) {
        const parts = rawRows[i].filter((c: any) => c && String(c).trim());
        if (parts.length) supplierName = String(parts[parts.length - 1]).trim();
      }
      if (!quoteRef && /מספר|ref|הצעה|quote/i.test(rowStr)) {
        const m = rowStr.match(/\d{4,}/);
        if (m) quoteRef = m[0];
      }
      // Only infer a foreign currency when ONE of EUR/USD appears alone. A row
      // with both (e.g. an "אירו - דולר | דולר - ש״ח" exchange-rate reference)
      // is ambiguous — keep the ILS default rather than mis-tagging prices.
      const hasUsd = /\$|usd|דולר/i.test(rowStr);
      const hasEur = /€|eur|אירו/i.test(rowStr);
      if (hasUsd && !hasEur) currency = 'USD';
      else if (hasEur && !hasUsd) currency = 'EUR';
    }

    // Find EVERY header row in the sheet (a BoQ can have multiple sections),
    // then parse the data rows between each header and the next.
    const sections: { headerIdx: number; colMap: Record<number, string> }[] = [];
    for (let i = 0; i < rawRows.length; i++) {
      const map = detectHeader(rawRows[i]);
      if (map) sections.push({ headerIdx: i, colMap: map });
    }
    if (sections.length === 0) continue;

    for (let s = 0; s < sections.length; s++) {
      const { headerIdx, colMap } = sections[s];
      const stopAt = s + 1 < sections.length ? sections[s + 1].headerIdx : rawRows.length;

      // Normalize cost/sell columns the same way as before.
      const hasCostCol = Object.values(colMap).includes('cost_price');
      if (hasCostCol) {
        for (const [k, v] of Object.entries(colMap)) {
          if (v === 'sell_price') delete colMap[Number(k)];
        }
      } else {
        for (const [k, v] of Object.entries(colMap)) {
          if (v === 'sell_price') colMap[Number(k)] = 'cost_price';
        }
      }

      let sectionPricePer: 'meter' | 'unit' = 'unit';
      for (const [ci, f] of Object.entries(colMap)) {
        if (f === 'cost_price' || f === 'sell_price') {
          const hdr = String(rawRows[headerIdx][Number(ci)] ?? '');
          if (/מטר|meter|\bm\b/i.test(hdr)) sectionPricePer = 'meter';
        }
      }

      for (let i = headerIdx + 1; i < stopAt; i++) {
        const row = rawRows[i];
        if (!row.some((c: any) => c !== '' && c !== null && c !== undefined)) continue;
        if (isTotalRow(row)) continue;

        const item: any = {};
        for (const [colIdx, field] of Object.entries(colMap)) {
          let v = row[Number(colIdx)];
          if (typeof v === 'string') v = v.replace(/[₪$€£,]/g, '').trim();
          item[field] = v ?? '';
        }

        const desc = String(item.description || '').trim();
        const qty = parseFloat(String(item.quantity)) || 0;
        const unitPrice = parseFloat(String(item.cost_price)) || 0;
        // Skip section titles / metadata rows (e.g. "אחוז הנחה", "מחברי שוחה"):
        // a real line has at least a quantity or a price.
        if (qty === 0 && unitPrice === 0) continue;
        if (!desc && qty === 0) continue;

        // Pull DN/PN/SN/length from dedicated columns or fall back to description regex.
        const dnExplicit = item.dn ? parseInt(String(item.dn).replace(/[^0-9]/g, '')) : null;
        const dnFromDesc = desc.match(/(?:dn|קוטר|ø)\s*(\d{2,4})/i);
        const dn = dnExplicit || (dnFromDesc ? parseInt(dnFromDesc[1]) : null);

        const pnExplicit = item.pn ? parseInt(String(item.pn).replace(/[^0-9]/g, '')) : null;
        const pnFromDesc = desc.match(/\bpn0*(\d{1,3})\b/i);
        const pn = pnExplicit || (pnFromDesc ? parseInt(pnFromDesc[1]) : null);

        const snExplicit = item.sn ? parseInt(String(item.sn).replace(/[^0-9]/g, '')) : null;
        const snFromDesc = desc.match(/\bsn\s*0*(\d{3,6})\b/i);
        const sn = snExplicit || (snFromDesc ? parseInt(snFromDesc[1]) : null);

        const lenFromCol = item.length ? parseFloat(String(item.length)) : null;
        const lenMatch = desc.match(/L\s*=\s*([0-9]+(?:[.,][0-9]+)?)\s*m/i);
        const lengthM = (lenFromCol && lenFromCol > 0 ? lenFromCol : null) || (lenMatch ? parseFloat(lenMatch[1].replace(',', '.')) : null);

        let itemType = 'other';
        if (/grout\s*nozzle/i.test(desc)) itemType = 'pipe_with_coupling';
        else if (/with.*coupling|with.*pjc/i.test(desc) && /pipe|צינור/i.test(desc)) itemType = 'pipe_with_coupling';
        else if (/צינור|pipe/i.test(desc)) itemType = /coupling/i.test(desc) ? 'pipe_with_coupling' : 'pipe_bare';
        else if (/אוגן|פלנג|flange/i.test(desc)) itemType = 'flange';
        else if (/ברך|כיפוף|elbow/i.test(desc)) itemType = 'elbow';
        else if (/מעבר|reducer/i.test(desc)) itemType = 'reducer';
        else if (/wall\s*coupling/i.test(desc)) itemType = 'wall_coupling';
        else if (/מחבר|coupling|reka|אקרובט/i.test(desc)) itemType = 'coupling';
        else if (/rocker|רוקר/i.test(desc)) itemType = 'roker';

        const unitStr = String(item.unit || '');
        const pricePer: 'meter' | 'unit' = /מטר|meter|\bm\b/i.test(unitStr) ? 'meter' : sectionPricePer;

        allItems.push({
          description: desc || item.item_code || `פריט ${i}`,
          item_code: String(item.item_code || '').trim() || null,
          item_type: itemType,
          dn,
          pn,
          sn,
          length_m: lengthM,
          quantity: qty,
          unit_price: unitPrice,
          price_per: pricePer,
          currency,
          notes: String(item.notes || '').trim() || null,
        });
      }
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
