// Cross-app drag-and-drop on iPad/Safari (e.g. dragging an attachment from
// Mail into the browser) is fragile in two distinct ways:
//   1. The dropped file may arrive via dataTransfer.items while
//      dataTransfer.files stays empty.
//   2. The File's backing blob is a short-lived provider reference — reading
//      it moments after the drop event yields 0 bytes ("No content provided"
//      from Supabase storage). Mail also hands a 0-byte placeholder when the
//      attachment was never downloaded to the device.
// So: collect from both channels synchronously, then read every file's bytes
// IMMEDIATELY and rebuild stable in-memory Files before any upload starts.

export function filesFromDrop(dt: DataTransfer | null): File[] {
  if (!dt) return [];
  let files = Array.from(dt.files || []);
  if (!files.length && dt.items) {
    files = Array.from(dt.items)
      .filter((it) => it.kind === 'file')
      .map((it) => it.getAsFile())
      .filter(Boolean) as File[];
  }
  return files;
}

export async function materializeFiles(files: File[]): Promise<{ stable: File[]; empty: string[] }> {
  const stable: File[] = [];
  const empty: string[] = [];
  for (const f of files) {
    try {
      const buf = await f.arrayBuffer();
      if (!buf.byteLength) { empty.push(f.name || 'קובץ ללא שם'); continue; }
      stable.push(new File([buf], f.name || 'file', { type: f.type }));
    } catch {
      empty.push(f.name || 'קובץ ללא שם');
    }
  }
  return { stable, empty };
}

export const EMPTY_DROP_HINT = 'באייפד: פתח קודם את הקובץ במייל (כדי שיירד למכשיר) ונסה שוב, או שמור אותו ב"קבצים" והעלה משם.';
