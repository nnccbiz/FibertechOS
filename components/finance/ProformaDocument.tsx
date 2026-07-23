'use client';

/**
 * Proforma invoice (חשבון עסקה) — branded A4 render + PDF export in the same
 * visual language as the quote/PO documents. Hebrew RTL, single page.
 * NOT a tax invoice — the SAP tax invoice replaces it; this document is the
 * billing request sent to the customer.
 */
import React, { forwardRef, useImperativeHandle } from 'react';

export interface ProformaLine {
  description?: string;
  qty?: number | string;
  unit?: string;
  unit_price?: number | string;
}

export interface ProformaDocumentHandle {
  downloadPdf: (fileName?: string) => Promise<void>;
}

const A4_W = 794;

function ils(n: number) {
  return new Intl.NumberFormat('he-IL', { style: 'currency', currency: 'ILS', maximumFractionDigits: 2 }).format(n || 0);
}

const ProformaDocument = forwardRef<ProformaDocumentHandle, {
  invoice: any;
  customerName?: string | null;
  projectName?: string | null;
}>(function ProformaDocument({ invoice, customerName, projectName }, ref) {
  const lines: ProformaLine[] = Array.isArray(invoice?.lines) ? invoice.lines : [];
  const linesTotal = lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_price) || 0), 0);
  const amount = Number(invoice?.amount) || linesTotal;
  const vat = Number(invoice?.vat_amount) || 0;

  async function handleDownloadPdf(fileName?: string) {
    const html2canvas = (await import('html2canvas')).default;
    const { jsPDF } = await import('jspdf');
    const el = document.getElementById('proforma-page');
    if (!el) return;
    const canvas = await html2canvas(el, { scale: 1.5, useCORS: true, backgroundColor: '#ffffff' });
    const imgData = canvas.toDataURL('image/jpeg', 0.85);
    const pdf = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4', compress: true });
    pdf.addImage(imgData, 'JPEG', 0, 0, pdf.internal.pageSize.getWidth(), pdf.internal.pageSize.getHeight(), undefined, 'FAST');
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const dateStr = new Date().toLocaleDateString('he-IL');
    const defaultName = ['חשבונית פרופורמה', customerName || '', dateStr].filter(Boolean).join(' ');
    a.download = `${(fileName || defaultName).replace(/[\\/:*?"<>|]/g, '')}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
  useImperativeHandle(ref, () => ({ downloadPdf: handleDownloadPdf }), [invoice, customerName, projectName]);

  const cell: React.CSSProperties = { border: '1px solid #d3dce6', padding: '6px 10px', fontSize: 12 };
  const th: React.CSSProperties = { ...cell, background: '#15427E', color: '#fff', fontWeight: 700, fontSize: 11 };

  return (
    <div className="overflow-auto">
      <div id="proforma-page" dir="rtl" style={{ width: A4_W, minHeight: 1123, margin: '0 auto', background: '#fff', padding: '48px 56px', display: 'flex', flexDirection: 'column', fontFamily: 'Assistant, sans-serif', color: '#1a2733' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '3px solid #15427E', paddingBottom: 16 }}>
          <div>
            <img src="/logo.png" alt="Fibertech" style={{ height: 52, objectFit: 'contain' }} />
            <p style={{ margin: '6px 0 0', fontSize: 11, color: '#5b6b7b' }}>פיברטק תשתיות בע״מ · ח.פ. 510931389</p>
          </div>
          <div style={{ textAlign: 'left' }}>
            <h1 style={{ margin: 0, fontSize: 22, color: '#15427E', fontWeight: 800 }}>חשבונית פרופורמה</h1>
            <p style={{ margin: '4px 0 0', fontSize: 13, fontFamily: 'Roboto Mono, monospace' }} dir="ltr">{invoice?.invoice_number || ''}</p>
            <p style={{ margin: '2px 0 0', fontSize: 11, color: '#5b6b7b' }}>תאריך: {invoice?.issued_at ? new Date(invoice.issued_at).toLocaleDateString('he-IL') : new Date().toLocaleDateString('he-IL')}</p>
          </div>
        </div>

        {/* Addressee */}
        <div style={{ display: 'flex', gap: 24, marginTop: 18 }}>
          <div style={{ flex: 1, background: '#f4f7fa', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontSize: 10, color: '#5b6b7b', fontWeight: 700 }}>לכבוד</p>
            <p style={{ margin: '2px 0 0', fontSize: 14, fontWeight: 700 }}>{customerName || '—'}</p>
            {projectName && <p style={{ margin: '2px 0 0', fontSize: 12, color: '#33475b' }}>פרויקט: {projectName}</p>}
          </div>
          <div style={{ flex: 1, background: '#f4f7fa', borderRadius: 8, padding: '10px 14px' }}>
            <p style={{ margin: 0, fontSize: 10, color: '#5b6b7b', fontWeight: 700 }}>תנאי תשלום</p>
            <p style={{ margin: '2px 0 0', fontSize: 12 }}>{invoice?.payment_terms || '—'}</p>
            {invoice?.payment_due_date && <p style={{ margin: '2px 0 0', fontSize: 12 }}>לתשלום עד: <b>{new Date(invoice.payment_due_date).toLocaleDateString('he-IL')}</b></p>}
          </div>
        </div>

        {/* Lines */}
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 18 }}>
          <thead>
            <tr>
              <th style={{ ...th, width: 28 }}>#</th>
              <th style={th}>תיאור</th>
              <th style={{ ...th, width: 70 }}>כמות</th>
              <th style={{ ...th, width: 60 }}>יח׳</th>
              <th style={{ ...th, width: 90 }}>מחיר יח׳</th>
              <th style={{ ...th, width: 100 }}>סה״כ</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td style={cell}>1</td>
                <td style={cell}>{invoice?.notes || 'ראה פירוט בהסכם / בתעודות המשלוח'}</td>
                <td style={cell}></td>
                <td style={cell}></td>
                <td style={cell}></td>
                <td style={{ ...cell, fontWeight: 700 }} dir="ltr">{ils(amount)}</td>
              </tr>
            ) : lines.map((l, i) => (
              <tr key={i}>
                <td style={cell}>{i + 1}</td>
                <td style={cell}><span dir="ltr" style={{ unicodeBidi: 'plaintext' }}>{l.description || ''}</span></td>
                <td style={cell} dir="ltr">{Number(l.qty) ? Number(l.qty).toLocaleString() : ''}</td>
                <td style={cell}>{l.unit || ''}</td>
                <td style={cell} dir="ltr">{Number(l.unit_price) ? ils(Number(l.unit_price)) : ''}</td>
                <td style={{ ...cell, fontWeight: 600 }} dir="ltr">{ils((Number(l.qty) || 0) * (Number(l.unit_price) || 0))}</td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Totals */}
        <div style={{ display: 'flex', justifyContent: 'flex-start', marginTop: 14 }}>
          <table style={{ borderCollapse: 'collapse', minWidth: 260 }}>
            <tbody>
              <tr>
                <td style={{ ...cell, fontWeight: 600 }}>סה״כ לפני מע״מ</td>
                <td style={{ ...cell, textAlign: 'left' }} dir="ltr">{ils(amount)}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 600 }}>מע״מ</td>
                <td style={{ ...cell, textAlign: 'left' }} dir="ltr">{ils(vat)}</td>
              </tr>
              <tr>
                <td style={{ ...cell, fontWeight: 800, background: '#f4f7fa' }}>סה״כ לתשלום</td>
                <td style={{ ...cell, fontWeight: 800, background: '#f4f7fa', textAlign: 'left' }} dir="ltr">{ils(amount + vat)}</td>
              </tr>
            </tbody>
          </table>
        </div>

        {invoice?.notes && lines.length > 0 && (
          <p style={{ marginTop: 14, fontSize: 11, color: '#33475b', whiteSpace: 'pre-line' }}>{invoice.notes}</p>
        )}

        <div style={{ marginTop: 'auto', paddingTop: 24 }}>
          <p style={{ fontSize: 11, color: '#8296aa', borderTop: '1px solid #d3dce6', paddingTop: 10, margin: 0 }}>
            מסמך זה אינו חשבונית מס. חשבונית מס תופק עם קבלת התשלום / בהתאם לתנאי ההסכם.
          </p>
          <p style={{ fontSize: 10, color: '#8296aa', margin: '6px 0 0' }}>
            פיברטק תשתיות בע״מ · קבוצת מאיה אופקים · www.fibertech.co.il
          </p>
        </div>
      </div>
    </div>
  );
});

export default ProformaDocument;
