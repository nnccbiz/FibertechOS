// Field-works section for quote contract terms ("עבודות שטח באתר הלקוח").
// This UNIFIES the old standard section "צוות עבודות חוץ בשטח הפרויקט מטעמנו"
// with the B149 field-works clauses into ONE section that always exists and
// starts at clause 50 (in the standard template):
//   - checkbox OFF (default): opens with "הצעה זו אינה כוללת ביצוע עבודות
//     חבישה..." + the standard field-crew clauses.
//   - checkbox ON: opens with "הצעה זו כוללת ביצוע עבודות חבישה..." + the full
//     B149 execution clauses + the standard field-crew clauses.
// Toggling replaces the section inside the quote's resolved terms and renumbers
// every following clause/section title, then stores contract_overrides — so the
// preview, public page, PDF and issue-time snapshot all see the same thing.

export const FIELD_WORKS_TITLE = 'עבודות שטח באתר הלקוח';

export const FIELD_WORKS_INCLUDED_CLAUSE =
  'הצעה זו כוללת ביצוע עבודות חבישה, חיתוכים להתאמה ותיקון GRP על ידי צוות שטח מטעם פיברטק.';
export const FIELD_WORKS_NOT_INCLUDED_CLAUSE =
  'הצעה זו אינה כוללת ביצוע עבודות חבישה, חיתוכים להתאמה ותיקון GRP על ידי צוות עבודת שטח מטעם פיברטק. ככל שיידרשו עבודות כאמור, תימסר עבורן הצעת מחיר נפרדת.';

// B149 execution clauses — appear only when the addon is ON.
const EXECUTION_CLAUSES: string[] = [
  'כל עבודות ההכנה לביצוע התיקון, כגון: חפירה, שבירת שוחת הבטון, התאמת האביזרים לחבישה וכדומה — יבוצעו על ידי המזמין ועל חשבונו.',
  'על המזמין לבצע את כל ההכנות בהתאם לנדרש, לדרישות שירות שדה פיברטק ולדרישות הבטיחות, לפני הגעת צוות העבודה.',
  'הלקוח יוודא כי אזור העבודה יבש — לא ניתן לבצע עבודות GRP בסביבה רטובה.',
  'המחיר כולל חומרי גלם GRP בלבד, בהתאם לנדרש.',
  "המחיר אינו כולל שום חלק שאינו GRP — לרבות הקשיחים (ברגים, אטמים, שייבות וכו') — שעל הקבלן להזמין טרם ביצוע כל עבודה.",
  'על המזמין לספק כלי הרמה וכלי צמ"ה שונים בשטח העבודה בזמן התיקון.',
  'עבודות בתוך חלל מוקף יבוצעו על ידי צוות עבודה מיומן מטעם חברת פיברטק, בליווי מנהל עבודה מורשה לעבודות אלו ובנוכחות ממונה בטיחות מורשה של המזמין.',
  'העבודה תתבצע בתיאום מראש עם המזמין או מי מטעמו ובאחריות המזמין, וזאת רק לאחר קבלת אישור ממנהל האתר / ממונה בטיחות מורשה לביצוע העבודה בתוך החלל המוקף.',
  'המזמין ידאג לדרכי גישה — כניסה ויציאה לאתר ולחלל העבודה.',
  'באחריות המזמין אוורור חלל העבודה באמצעות מפוח ומאוורר, הכול בכפוף לנהלי הבטיחות הממלכתיים הנאכפים על ידי גורמים מוסמכים בעלי רישיונות תקפים — ובאישורם בלבד.',
  'עבודות בגובה יבוצעו בליווי מנהל עבודה מורשה לעבודות אלו וממונה בטיחות מטעם המזמין ובאחריותו, ורק לאחר קבלת אישור ממנהל האתר וממונה הבטיחות מטעמו לעבודה בגובה. לצוות פיברטק אישור לעבודה בגובה.',
  'הלקוח ידאג לאמצעי עלייה וירידה על פי נהלי הבטיחות — מדרגות / סולם / מנוף סל.',
  'פיברטק שומרת לעצמה את הזכות לחלוק על גורמים שונים אם נושאי האיכות והבטיחות לא יבוצעו כנדרש, בכפוף להוראות ונהלי פיברטק.',
  'הגעת צוות שטח של פיברטק תיעשה בכפוף להוראות משרד הביטחון / המנהל האזרחי. במידה ויוכרז סגר בשטחי יהודה ושומרון, צוות העובדים לא יוכל להגיע.',
  'זמן אספקה — בתיאום עם המזמין ובהתאם לזמינות צוות השטח.',
  'המחירים המצוינים הינם לשנה הקלנדרית הנוכחית. בכל שנה קלנדרית חדשה (מרגע אישור הצעת המחיר) יתווספו למחיר 3.5%.',
  'עבודות לילה ועבודות בימים שאינם ימי חול יטופלו מצדנו במשנה זהירות מהיבטי הבטיחות, וילוו בדרישת תשלום נפרדת.',
];

// The standard field-crew clauses (formerly "צוות עבודות חוץ בשטח הפרויקט
// מטעמנו" 50–60) — always present. The old clause 56 ("המחיר אינו כולל עבודות
// התאמה או חבישה") is intentionally absent: its content lives in the OFF
// opening clause, and it contradicts the ON state.
const CREW_CLAUSES: string[] = [
  'צוות עבודות החוץ של פיברטק מבצע עבודות שונות בתחום ה-GRP, לרבות בדיקות אטימות, בכפוף למערך האיכות והבטיחות של פיברטק ובהתאם לתקנים הנדרשים. מובהר כי בדיקות אלה נדרשות להתבצע על ידי המזמין בשלב הפיילוט ובשלב סיום הפרויקט, כתנאי לקבלת תעודת אחריות.',
  'בעת הגעת צוות שירות פיברטק לאתר נדרשת נוכחות ממונה בטיחות מורשה מטעם המזמין.',
  'עבודת צוות מערך שירות השדה של פיברטק בחצר הלקוח תבוצע רק לאחר קבלת אישור ממונה הבטיחות מטעם המזמין, אשר ידאג לביצוע סקר סיכונים לכל עבודה נדרשת.',
  'עבודות צוות שירות החוץ יבוצעו בשעות העבודה הרגילות בלבד, ולא יבוצעו בשעות ערב, לילה, חג או שבת, אלא אם סוכם אחרת בכתב.',
  'נוכחות צוות השטח באתר המזמין תוגבל לעד 8 שעות, כולל זמן הגעה לאתר וחזרה ממנו.',
  'עבודות צוות החוץ באתר הלקוח יתואמו מראש. אם המזמין לא יעמוד בתיאום שנקבע מראש, יחויב המזמין בעלות יום עבודה מלא בסך 10,000 ש"ח.',
  'המחיר אינו כולל בדיקות אטימות מחברים בשלב הרכבת הצנרת ותמיכתה בגובה של עד 30 ס"מ באמצעות חומר עוטף ומהודק למניעת תזוזת הצינור, ואינו כולל בדיקות אטימות קו. ככל שהמזמין יבקש שפיברטק יבצע בדיקות אלה, תימסר הצעת מחיר נפרדת.',
  'המחיר אינו כולל ליווי של מערך שירות השדה, ככל שהוא נדרש לפי מערך האיכות של פיברטק, לצורך הבטחת ביצוע מתאים של הטמנת הצנרת והאביזרים בהתאם לנהלים ולהוראות הכתובים במערך האיכות של פיברטק.',
  'תפקיד מערך שירות השדה במסגרת הפרויקט הוא לוודא שהפרויקט מבוצע באופן רציף ובהתאם למערך האיכות של פיברטק, החל משלב ההתנעה ואילך, לרבות הדרכה, פיילוט ובקרה אקראית, ככל שיידרשו.',
  'כל סטייה מהתכנון שאושר מראש ביחס לצנרת, לאביזרים או לשוחות של פיברטק, בכל פרויקט, תחייב את הקבלן לקבל מראש את הסכמת פיברטק. יישום שינוי כאמור יכלול את כל שלבי מערך האיכות הנדרשים, לרבות התנעה, הדרכה, פיילוט, פיקוח אקראי וביצוע מבחני אטימות לפי טפסי האטימות של פיברטק, המהווים חלק בלתי נפרד ממערך האיכות.',
];

export function fieldWorksClauseTexts(on: boolean): string[] {
  return on
    ? [FIELD_WORKS_INCLUDED_CLAUSE, ...EXECUTION_CLAUSES, ...CREW_CLAUSES]
    : [FIELD_WORKS_NOT_INCLUDED_CLAUSE, ...CREW_CLAUSES];
}

function isFieldWorksSectionTitle(title: string): boolean {
  return title.startsWith(FIELD_WORKS_TITLE) || title.includes('צוות עבודות חוץ');
}

/** Renumber every clause sequentially across sections and refresh the
 *  "| סעיפים X עד Y" suffix on each section title. */
export function renumberSections(sections: any[]): any[] {
  let n = 1;
  return sections.map((s: any) => {
    const clauses = (s?.clauses || []).map((c: any) => ({ ...c, num: n++ }));
    const base = String(s?.title || '').replace(/\s*\|\s*סעיף.*$/, '').trim();
    const first = clauses[0]?.num;
    const last = clauses.length ? clauses[clauses.length - 1].num : 0;
    const suffix = !clauses.length ? '' : first === last ? ` | סעיף ${first}` : ` | סעיפים ${first} עד ${last}`;
    return { ...s, title: base + suffix, clauses };
  });
}

/** Replace (or insert) the unified field-works section in the given state and
 *  renumber the whole document. */
export function applyFieldWorks(sections: any[], on: boolean): any[] {
  const built = { title: FIELD_WORKS_TITLE, clauses: fieldWorksClauseTexts(on).map((text) => ({ num: 0, text })) };
  const idx = sections.findIndex((s: any) => isFieldWorksSectionTitle(String(s?.title || '')));
  const rest = sections.filter((s: any) => !isFieldWorksSectionTitle(String(s?.title || '')));
  const insertAt = idx >= 0 ? Math.min(idx, rest.length) : rest.length;
  rest.splice(insertAt, 0, built);
  return renumberSections(rest);
}

/** Is the addon ON in these sections? (default OFF when no overrides exist) */
export function isFieldWorksOn(sections: any): boolean {
  if (!Array.isArray(sections)) return false;
  const s = sections.find((x: any) => isFieldWorksSectionTitle(String(x?.title || '')));
  return !!(s?.clauses?.[0]?.text || '').startsWith('הצעה זו כוללת');
}
