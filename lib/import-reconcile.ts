// Reconcile a set of extracted Amiblu/Hobas import documents (one LOT) into a
// single proposed structure: order + items, shipment + containers, packing
// lines (the bridge), invoices and COA — matched by the linking identifiers
// (supplier order no, delivery note no, container no, BL no).

export interface ExtractResult {
  name: string;
  doc_type?: string;
  data?: any;
  error?: string;
}

export interface Proposal {
  order: {
    supplier_order_no: string | null;
    supplier_project_no: string | null;
    project_name: string | null;
    currency: string | null;
    incoterms: string | null;
    payment_terms: string | null;
  };
  items: any[];
  shipment: {
    bl_number: string | null;
    carrier: string | null;
    vessel_name: string | null;
    voyage_no: string | null;
    port_loading: string | null;
    port_discharge: string | null;
    etd: string | null;
    eta: string | null;
  };
  containers: any[];
  packingLines: any[];
  invoices: any[];
  coa: any[];
  docs: { name: string; doc_type: string }[];
  warnings: string[];
}

function firstNonNull(...vals: any[]) {
  for (const v of vals) if (v != null && v !== '') return v;
  return null;
}
function isFreight(desc?: string, material?: string) {
  return /freight|sea\s*freight/i.test(desc || '') || /^6003/.test(material || '');
}
function itemKey(it: any) {
  return (it.material_no || '') + '|' + (it.dn || '') + '|' + (it.description || '').slice(0, 30);
}

export function reconcileDocuments(results: ExtractResult[]): Proposal {
  const ok = results.filter((r) => r.data && !r.error);
  const warnings: string[] = [];
  results.filter((r) => r.error).forEach((r) => warnings.push(`${r.name}: ${r.error}`));

  const proposal: Proposal = {
    order: { supplier_order_no: null, supplier_project_no: null, project_name: null, currency: null, incoterms: null, payment_terms: null },
    items: [], shipment: { bl_number: null, carrier: null, vessel_name: null, voyage_no: null, port_loading: null, port_discharge: null, etd: null, eta: null },
    containers: [], packingLines: [], invoices: [], coa: [], docs: [], warnings,
  };

  // ----- order header (from invoice / OC / packing) -----
  for (const r of ok) {
    const o = r.data.order || {};
    proposal.order.supplier_order_no = firstNonNull(proposal.order.supplier_order_no, o.supplier_order_no);
    proposal.order.supplier_project_no = firstNonNull(proposal.order.supplier_project_no, o.supplier_project_no);
    proposal.order.project_name = firstNonNull(proposal.order.project_name, o.project_name);
    proposal.order.currency = firstNonNull(proposal.order.currency, o.currency);
    proposal.order.incoterms = firstNonNull(proposal.order.incoterms, o.incoterms);
    proposal.order.payment_terms = firstNonNull(proposal.order.payment_terms, o.payment_terms);
  }

  // ----- order items (from invoice / OC) — dedup, drop freight lines -----
  const itemMap = new Map<string, any>();
  for (const r of ok) {
    if (r.doc_type !== 'commercial_invoice' && r.doc_type !== 'proforma_invoice' && r.doc_type !== 'order_confirmation') continue;
    for (const it of r.data.items || []) {
      if (isFreight(it.description, it.material_no)) continue;
      const k = itemKey(it);
      if (!itemMap.has(k)) {
        itemMap.set(k, {
          line_no: it.line_no ?? null, material_no: it.material_no ?? null, description: it.description || '',
          dn: it.dn ?? null, pn: it.pn ?? null, sn: it.sn ?? null,
          ordered_qty: it.qty ?? 0, unit: it.unit || 'M', unit_price: it.unit_price ?? null,
        });
      } else if (it.unit_price != null) {
        const cur = itemMap.get(k);
        if (cur.unit_price == null) cur.unit_price = it.unit_price;
      }
    }
  }
  proposal.items = [...itemMap.values()];

  // ----- shipment (from BL) -----
  for (const r of ok) {
    if (r.doc_type !== 'bl') continue;
    const s = r.data.shipment || {};
    proposal.shipment = {
      bl_number: firstNonNull(proposal.shipment.bl_number, s.bl_number),
      carrier: firstNonNull(proposal.shipment.carrier, s.carrier),
      vessel_name: firstNonNull(proposal.shipment.vessel_name, s.vessel_name),
      voyage_no: firstNonNull(proposal.shipment.voyage_no, s.voyage_no),
      port_loading: firstNonNull(proposal.shipment.port_loading, s.port_loading),
      port_discharge: firstNonNull(proposal.shipment.port_discharge, s.port_discharge),
      etd: firstNonNull(proposal.shipment.etd, s.etd),
      eta: firstNonNull(proposal.shipment.eta, s.eta),
    };
  }

  // ----- containers (BL authoritative; merged by number) -----
  const contMap = new Map<string, any>();
  function upsertContainer(c: any) {
    const num = (c.container_number || '').replace(/\s+/g, '').toUpperCase();
    if (!num) return;
    const cur = contMap.get(num) || { container_number: c.container_number, seal_number: null, container_type: null, gross_weight: null, pieces: null };
    cur.seal_number = firstNonNull(cur.seal_number, c.seal_number);
    cur.container_type = firstNonNull(cur.container_type, c.container_type);
    cur.gross_weight = firstNonNull(cur.gross_weight, c.gross_weight);
    cur.pieces = firstNonNull(cur.pieces, c.pieces);
    contMap.set(num, cur);
  }
  for (const r of ok) for (const c of r.data.containers || []) upsertContainer(c);

  // ----- packing lines (from packing lists) — the bridge -----
  for (const r of ok) {
    if (r.doc_type !== 'packing_list') continue;
    const pk = r.data.packing || {};
    const contNum = pk.container_number || null;
    if (contNum) upsertContainer({ container_number: contNum, pieces: pk.pieces });
    for (const it of r.data.items || []) {
      if (isFreight(it.description, it.material_no)) continue;
      proposal.packingLines.push({
        delivery_note_no: pk.delivery_note_no || it.delivery_note_no || null,
        container_number: contNum,
        material_no: it.material_no ?? null, description: it.description || '', dn: it.dn ?? null,
        shipped_qty: it.qty ?? 0, unit: it.unit || 'M', pieces: it.pieces ?? null,
        loading_date: pk.loading_date || null, discharge_date: pk.discharge_date || null,
      });
    }
  }
  proposal.containers = [...contMap.values()];

  // warn on packing lines whose container isn't in the BL set
  const blNums = new Set([...contMap.keys()]);
  for (const pl of proposal.packingLines) {
    const n = (pl.container_number || '').replace(/\s+/g, '').toUpperCase();
    if (n && !blNums.has(n)) warnings.push(`מכולה ${pl.container_number} מופיעה בתעודת משלוח אך לא ב-BL`);
  }

  // ----- invoices -----
  for (const r of ok) {
    if (r.doc_type !== 'commercial_invoice' && r.doc_type !== 'proforma_invoice') continue;
    const iv = r.data.invoice || {};
    if (!iv.invoice_no) continue;
    proposal.invoices.push({
      invoice_no: iv.invoice_no, invoice_type: iv.invoice_type || (r.doc_type === 'proforma_invoice' ? 'proforma' : 'commercial'),
      invoice_date: iv.invoice_date || null, currency: proposal.order.currency || 'USD',
      net_value: iv.net_value ?? null, freight: iv.freight ?? null, down_payment: iv.down_payment ?? null,
      final_amount: iv.final_amount ?? null, delivery_notes: (iv.delivery_notes || []).join(', ') || null,
    });
  }

  // ----- COA -----
  for (const r of ok) {
    if (r.doc_type !== 'coa') continue;
    const c = r.data.coa || {};
    if (!c.coa_no) continue;
    proposal.coa.push({
      coa_no: c.coa_no, coa_date: c.coa_date || null, dn: c.dn ?? null, pn: c.pn ?? null, sn: c.sn ?? null,
      delivery_notes: (c.delivery_notes || []).join(', ') || null, passed: c.passed ?? null,
    });
  }

  // ----- docs -----
  proposal.docs = ok.map((r) => ({ name: r.name, doc_type: r.doc_type || 'other' }));

  if (!proposal.order.supplier_order_no) warnings.push('לא זוהה מספר הזמנת ספק (Sales Order) — יש לשייך ידנית.');
  return proposal;
}
