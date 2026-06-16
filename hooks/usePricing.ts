'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchExchangeRate, type ExchangeRateInfo } from '@/lib/exchange-rate';
import { DISCLAIMER_TEMPLATES } from '@/lib/disclaimers';
import { CONTRACT_SECTIONS } from '@/lib/contract-terms';
import { calcCostPerMeter, calcRokerCostPerMeter, calcSellingPrice } from '@/lib/pricing';
import { parseExcelBOQ } from '@/lib/boq-parser';

// Categorize a quote line by its Hebrew product name for bulk profit operations.
// Short pipes / rokers are grouped with accessories, not full-length pipe runs.
export function itemCategory(productName?: string): 'pipe' | 'accessory' {
  const n = (productName || '').trim();
  if (n.includes('רוקר') || n.includes('קצר')) return 'accessory';
  if (n.includes('צנרת') || n.includes('צינור')) return 'pipe';
  return 'accessory';
}

export interface UsePricingReturn {
  // Data
  costInputs: any[];
  quotes: any[];
  orders: any[];
  quoteItems: Record<string, any[]>;
  costInputItems: Record<string, any[]>;
  attachments: any[];

  // Exchange rate
  exchangeRates: Record<string, ExchangeRateInfo>;
  rateLoading: boolean;
  refreshRate: (currency: string) => Promise<void>;
  refreshCostInputRate: (ciId: string) => Promise<void>;

  // UI state
  pricingTab: 'costs' | 'quotes' | 'orders';
  setPricingTab: (tab: 'costs' | 'quotes' | 'orders') => void;
  showNewCostInput: boolean;
  setShowNewCostInput: (v: boolean) => void;
  showNewQuote: boolean;
  setShowNewQuote: (v: boolean) => void;
  newCostInput: any;
  setNewCostInput: (v: any) => void;
  newQuote: any;
  setNewQuote: (v: any) => void;
  editingQuote: string | null;
  editingItems: any[];
  editingCostInput: string | null;
  editingCostItems: any[];
  expandedQuote: string | null;
  setExpandedQuote: (v: string | null) => void;
  expandedCostInput: string | null;
  setExpandedCostInput: (v: string | null) => void;
  parsingCostFile: boolean;
  saving: boolean;

  // Actions
  createCostInput: () => Promise<void>;
  duplicateCostInput: (ciId: string) => Promise<void>;
  parseCostFile: (fileList: FileList, costInputId: string) => Promise<void>;
  updateCostItem: (idx: number, field: string, val: any) => void;
  saveCostInputItems: (costInputId: string) => Promise<void>;
  startEditCostInput: (ciId: string) => void;
  cancelEditCostInput: () => void;
  setEditingCostItems: React.Dispatch<React.SetStateAction<any[]>>;
  createQuote: () => Promise<void>;
  duplicateQuote: (quoteId: string) => Promise<void>;
  startEditQuote: (quoteId: string) => void;
  updateItem: (idx: number, field: string, val: any) => void;
  bulkSetProfit: (category: 'pipe' | 'accessory' | 'all', profitPct: number) => void;
  saveQuoteItems: (quoteId: string) => Promise<void>;
  setQuoteContact: (quoteId: string, contactId: string) => Promise<void>;
  setQuoteNotes: (quoteId: string, notes: string) => Promise<void>;
  assignQuoteContact: (quoteId: string, value: string) => Promise<void>;
  setQuoteCustomer: (quoteId: string, customerId: string) => Promise<void>;
  setQuoteCostInput: (quoteId: string, costInputId: string) => Promise<void>;
  setQuoteContractTemplate: (quoteId: string, templateId: string) => Promise<void>;
  setQuoteContractOverrides: (quoteId: string, overrides: any) => Promise<void>;
  fetchTemplateContent: (templateId: string) => Promise<any>;
  refreshContractTemplates: () => Promise<void>;
  refreshProjectDrawings: () => Promise<void>;
  refreshCustomers: () => Promise<void>;
  toggleQuoteDrawing: (quoteId: string, attachmentId: string) => Promise<void>;
  contacts: any[];
  customers: any[];
  customerContacts: any[];
  contractTemplates: any[];
  projectDrawings: any[];
  pipeSpecs: any[];
  resolvePnSn: (dnSize: string | null | undefined) => { pn: number | null; sn: number | null };
  quoteDrawings: Record<string, string[]>;
  cancelEditQuote: () => void;
  updateQuoteStatus: (quoteId: string, status: string) => Promise<void>;
  deleteQuote: (quoteId: string) => Promise<void>;
  updateGlobalDiscount: (quoteId: string, pct: number) => Promise<void>;
  refreshDisclaimer: (quoteId: string) => Promise<void>;
  updateDisclaimerText: (quoteId: string, text: string) => Promise<void>;
  updateDeliveryTime: (quoteId: string, text: string) => Promise<void>;
  updatePaymentTerms: (quoteId: string, text: string) => Promise<void>;
  setQuoteField: (quoteId: string, field: string, value: any) => void;
  updateOrderStatus: (orderId: string, status: string) => Promise<void>;
  addEditingItem: (defaults?: any) => void;
  removeEditingItem: (idx: number) => void;
  addCostItem: () => void;
  removeCostItem: (idx: number) => void;
  toggleArchiveCostInput: (ciId: string) => Promise<void>;
  uploadAttachment: (quoteId: string, file: File) => Promise<void>;
  deleteAttachment: (id: string) => Promise<void>;
  uploadCostInputAttachment: (ciId: string, file: File) => Promise<any | null>;
  deleteCostInput: (ciId: string) => Promise<void>;
  uploadingFile: boolean;
}

const DEFAULT_DELIVERY_TIME = '70 ימי עבודה מיום סגירת הזמנה - אישור הצעת מחיר, חתימה על שרטוט לייצור ותשלום מקדמה';

export function usePricing(projectId: string): UsePricingReturn {
  const supabase = createClient();
  // Data
  const [costInputs, setCostInputs] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<Record<string, any[]>>({});
  const [costInputItems, setCostInputItems] = useState<Record<string, any[]>>({});
  const [attachments, setAttachments] = useState<any[]>([]);
  const [contacts, setContacts] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [customerContacts, setCustomerContacts] = useState<any[]>([]);
  const [contractTemplates, setContractTemplates] = useState<any[]>([]);
  const [projectDrawings, setProjectDrawings] = useState<any[]>([]);
  const [pipeSpecs, setPipeSpecs] = useState<any[]>([]);
  const [quoteDrawings, setQuoteDrawings] = useState<Record<string, string[]>>({});
  const [uploadingFile, setUploadingFile] = useState(false);
  const [projectNumber, setProjectNumber] = useState<number | null>(null);

  // Exchange rates — keyed by currency code
  const [exchangeRates, setExchangeRates] = useState<Record<string, ExchangeRateInfo>>({});
  const [rateLoading, setRateLoading] = useState(false);

  // UI state
  const [pricingTab, setPricingTab] = useState<'costs' | 'quotes' | 'orders'>('quotes');
  const [showNewCostInput, setShowNewCostInput] = useState(false);
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [newCostInput, setNewCostInput] = useState({ source_type: 'supplier', source_name: '', notes: '', currency: 'USD', payment_terms: '' });
  const [newQuote, setNewQuote] = useState({
    client_name: '', customer_id: '', contact_id: '', cost_input_id: '', cost_source: 'supplier', supplier_name: '',
    default_overheads_pct: 17, default_profit_pct: 25,
    disclaimer_type: 'grp_pipe', payment_terms: '40% מקדמה, יתרה שוטף +30', notes: '',
    tier: 'contractor_pre_tender',
  });
  const [editingQuote, setEditingQuote] = useState<string | null>(null);
  const [editingItems, setEditingItems] = useState<any[]>([]);
  const [editingCostInput, setEditingCostInput] = useState<string | null>(null);
  const [editingCostItems, setEditingCostItems] = useState<any[]>([]);
  const [expandedQuote, setExpandedQuote] = useState<string | null>(null);
  const [expandedCostInput, setExpandedCostInput] = useState<string | null>(null);
  const [parsingCostFile, setParsingCostFile] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load data
  useEffect(() => {
    loadPricingData();
    loadExchangeRates();
  }, [projectId]);

  async function loadPricingData() {
    const [quotesRes, costRes, ordersRes, projRes, contactsRes, customersRes, drawingsRes, custContactsRes, tplRes, specsRes] = await Promise.all([
      supabase.from('quotes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('cost_inputs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('project_details').select('project_number').eq('project_id', projectId).maybeSingle(),
      supabase.from('project_contacts').select('id, role, name, phone, email').eq('project_id', projectId).order('created_at'),
      supabase.from('clients').select('id, name').order('name'),
      supabase.from('attachments').select('id, file_name, file_url, drawing_number, file_type').eq('project_id', projectId).eq('entity_type', 'project').order('created_at'),
      supabase.from('client_contacts').select('id, client_id, name, role, phone, email').order('created_at'),
      supabase.from('contract_term_templates').select('id, name, description, is_default').order('is_default', { ascending: false }).order('name'),
      supabase.from('pipe_specs').select('dn_mm, pressure_bar, stiffness_pascal').eq('project_id', projectId).order('dn_mm'),
    ]);
    if (projRes.data?.project_number) setProjectNumber(projRes.data.project_number);
    setContractTemplates(tplRes.data || []);
    setContacts(contactsRes.data || []);
    setCustomers(customersRes.data || []);
    setCustomerContacts(custContactsRes.data || []);
    setProjectDrawings(drawingsRes.data || []);
    setPipeSpecs(specsRes.data || []);

    const qts = quotesRes.data || [];
    const costs = costRes.data || [];
    const ords = ordersRes.data || [];
    setQuotes(qts);
    setCostInputs(costs);
    setOrders(ords);

    if (qts.length > 0) {
      const qdRes = await supabase.from('quote_drawings').select('quote_id, attachment_id').in('quote_id', qts.map((q: any) => q.id));
      const qdMap: Record<string, string[]> = {};
      (qdRes.data || []).forEach((r: any) => { (qdMap[r.quote_id] ||= []).push(r.attachment_id); });
      setQuoteDrawings(qdMap);
    }

    if (qts.length > 0) {
      const itemsRes = await supabase.from('quote_items').select('*').in('quote_id', qts.map((q: any) => q.id)).order('sort_order');
      const items = itemsRes.data || [];
      const grouped: Record<string, any[]> = {};
      items.forEach((item: any) => {
        if (!grouped[item.quote_id]) grouped[item.quote_id] = [];
        grouped[item.quote_id].push(item);
      });
      setQuoteItems(grouped);
    }

    if (costs.length > 0) {
      const ciRes = await supabase.from('cost_input_items').select('*').in('cost_input_id', costs.map((c: any) => c.id)).order('sort_order');
      const ciItems = ciRes.data || [];
      const ciGrouped: Record<string, any[]> = {};
      ciItems.forEach((item: any) => {
        if (!ciGrouped[item.cost_input_id]) ciGrouped[item.cost_input_id] = [];
        ciGrouped[item.cost_input_id].push(item);
      });
      setCostInputItems(ciGrouped);
    }

    const { data: atts } = await supabase.from('attachments').select('*').eq('project_id', projectId).order('created_at', { ascending: false });
    setAttachments(atts || []);
  }

  async function uploadAttachment(quoteId: string, file: File) {
    setUploadingFile(true);
    try {
      const ext = file.name.split('.').pop() || 'file';
      const path = `${projectId}/${quoteId}/${Date.now()}.${ext}`;
      const { error: uploadErr } = await supabase.storage.from('project-files').upload(path, file);
      if (uploadErr) { alert(`שגיאת העלאה: ${uploadErr.message}`); return; }
      const { data: att, error: insertErr } = await supabase.from('attachments').insert({
        entity_type: 'quote', entity_id: quoteId, project_id: projectId,
        file_name: file.name, file_url: path,
        file_type: 'drawing', file_size_bytes: file.size,
      }).select().single();
      if (insertErr) { alert(`שגיאה: ${insertErr.message}`); return; }
      if (att) setAttachments((prev) => [att, ...prev]);
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setUploadingFile(false);
    }
  }

  // Remove a storage object only when no remaining attachment row references it.
  // duplicateCostInput mirrors attachment rows onto the copy while sharing the
  // same file_url (no duplicated bytes), so a blind storage.remove() on either
  // side would destroy the blob the sibling still points at. Call this AFTER the
  // attachment rows have been deleted, so they don't count as live references.
  async function removeStorageIfOrphan(fileUrl?: string | null) {
    if (!fileUrl) return;
    const { data: refs } = await supabase.from('attachments').select('id').eq('file_url', fileUrl).limit(1);
    if (refs && refs.length > 0) return; // still referenced elsewhere — keep the blob
    const path = fileUrl.startsWith('http') ? (fileUrl.match(/project-files\/(.+)$/)?.[1] || fileUrl) : fileUrl;
    await supabase.storage.from('project-files').remove([path]);
  }

  async function deleteAttachment(id: string) {
    const att = attachments.find((a) => a.id === id);
    await supabase.from('attachments').delete().eq('id', id);
    await removeStorageIfOrphan(att?.file_url);
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }

  // Save an uploaded file as an attachment linked to a cost input — so the
  // original supplier quote (PDF/image/Excel) stays traceable from the price.
  async function uploadCostInputAttachment(ciId: string, file: File): Promise<any | null> {
    const ext = file.name.split('.').pop() || 'file';
    const path = `${projectId}/cost_inputs/${ciId}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
    const { error: uploadErr } = await supabase.storage.from('project-files').upload(path, file);
    if (uploadErr) { console.error('upload cost_input attachment failed', uploadErr); return null; }
    const { data: att, error: insertErr } = await supabase.from('attachments').insert({
      entity_type: 'cost_input', entity_id: ciId, project_id: projectId,
      file_name: file.name, file_url: path,
      file_type: 'supplier_quote', file_size_bytes: file.size,
    }).select().single();
    if (insertErr || !att) { console.error('insert cost_input attachment failed', insertErr); return null; }
    setAttachments((prev) => [att, ...prev]);
    return att;
  }

  // Delete a cost input (its items cascade via FK; attachments are removed
  // explicitly — both the rows and the underlying storage objects).
  async function deleteCostInput(ciId: string) {
    try {
      const ciAtts = attachments.filter((a) => a.entity_type === 'cost_input' && a.entity_id === ciId);
      if (ciAtts.length) {
        // Delete the rows first, then remove each unique blob only if no other
        // attachment (e.g. a duplicated cost input) still references it.
        await supabase.from('attachments').delete().eq('entity_type', 'cost_input').eq('entity_id', ciId);
        const urls = Array.from(new Set(ciAtts.map((a) => a.file_url).filter(Boolean)));
        for (const url of urls) await removeStorageIfOrphan(url);
      }
      const { error } = await supabase.from('cost_inputs').delete().eq('id', ciId);
      if (error) { alert(`שגיאה במחיקה: ${error.message}`); return; }
      setCostInputs((prev) => prev.filter((c) => c.id !== ciId));
      setCostInputItems((prev) => { const next = { ...prev }; delete next[ciId]; return next; });
      setAttachments((prev) => prev.filter((a) => !(a.entity_type === 'cost_input' && a.entity_id === ciId)));
      if (expandedCostInput === ciId) setExpandedCostInput(null);
      if (editingCostInput === ciId) setEditingCostInput(null);
    } catch (e: any) {
      alert(`שגיאה במחיקה: ${e?.message || e}`);
    }
  }

  async function loadExchangeRates() {
    setRateLoading(true);
    try {
      const [usd, eur] = await Promise.all([
        fetchExchangeRate('USD').catch(() => null),
        fetchExchangeRate('EUR').catch(() => null),
      ]);
      const rates: Record<string, ExchangeRateInfo> = {};
      if (usd) rates.USD = usd;
      if (eur) rates.EUR = eur;
      setExchangeRates(rates);
    } finally {
      setRateLoading(false);
    }
  }

  const refreshRate = useCallback(async (currency: string) => {
    setRateLoading(true);
    try {
      const info = await fetchExchangeRate(currency as 'USD' | 'EUR');
      setExchangeRates((prev) => ({ ...prev, [currency]: info }));
    } finally {
      setRateLoading(false);
    }
  }, []);

  // Pull today's rate for a cost input's currency and re-price all its items
  // by original_price * newRate. Handy after duplicating a cost input — the
  // duplicate inherits the source's rate, but the new "today" rate is what
  // should drive the prices.
  async function refreshCostInputRate(ciId: string) {
    const ci = costInputs.find((c) => c.id === ciId);
    if (!ci) return;
    // Prefer the cost input's stored currency, but fall back to items' original_currency
    // (covers the case where a duplicate was saved with currency=ILS by mistake).
    const items = costInputItems[ciId] || [];
    const itemForex = items.find((i: any) => i.original_currency && i.original_currency !== 'ILS' && parseFloat(i.original_price) > 0);
    const currency = (ci.currency && ci.currency !== 'ILS') ? ci.currency : (itemForex?.original_currency || ci.currency);
    if (!currency || currency === 'ILS') { alert('שער מטבע זמין רק לתמחור במטבע זר (USD / EUR / GBP).'); return; }

    setRateLoading(true);
    try {
      const info = await fetchExchangeRate(currency as 'USD' | 'EUR');
      if (!info?.rate) { alert('שגיאה במשיכת שער המטבע.'); return; }
      const newRate = info.rate;
      const newDate = info.date || new Date().toISOString().split('T')[0];

      // Update the cost input — also normalize currency if it was wrongly tagged.
      await supabase.from('cost_inputs').update({
        currency,
        exchange_rate: newRate,
        exchange_rate_date: newDate,
      }).eq('id', ciId);

      // Re-price every item from its original_price × new rate. Items without a
      // foreign original_price are left as-is (their cost_price was set manually).
      const oldRate = parseFloat(ci.exchange_rate) || 0;
      let skipped = 0;
      const updated = items.map((i: any) => {
        const orig = parseFloat(i.original_price);
        if (!orig || !i.original_currency || i.original_currency === 'ILS') return i;
        // Preserve a manual ILS override: if the current cost_price doesn't match
        // original_price × the old stored rate, the user typed a custom price
        // (negotiated/fixed) — don't clobber it with the auto re-price.
        if (oldRate > 0) {
          const expectedOld = Math.round(orig * oldRate * 100) / 100;
          if (Math.abs((parseFloat(i.cost_price) || 0) - expectedOld) > 0.01) { skipped++; return i; }
        }
        const qty = parseFloat(i.quantity) || 0;
        const newCost = Math.round(orig * newRate * 100) / 100;
        const newTotal = Math.round(newCost * qty * 100) / 100;
        return { ...i, cost_price: newCost, total_cost: newTotal };
      });

      const rowsToWrite = updated
        .filter((i: any, idx: number) => i !== items[idx])
        .map((i: any) => ({ id: i.id, cost_price: i.cost_price, total_cost: i.total_cost }));
      for (const row of rowsToWrite) {
        await supabase.from('cost_input_items').update({ cost_price: row.cost_price, total_cost: row.total_cost }).eq('id', row.id);
      }

      setCostInputs((prev) => prev.map((c) => c.id === ciId ? { ...c, currency, exchange_rate: newRate, exchange_rate_date: newDate } : c));
      setCostInputItems((prev) => ({ ...prev, [ciId]: updated }));
      setExchangeRates((prev) => ({ ...prev, [currency]: info }));
      if (skipped > 0) alert(`עודכנו המחירים לפי השער החדש. ${skipped} פריטים עם מחיר ידני נשמרו כפי שהם.`);
    } finally {
      setRateLoading(false);
    }
  }

  // === Cost Input functions ===
  async function createCostInput() {
    if (!newCostInput.source_name.trim()) return;
    const rate = exchangeRates[newCostInput.currency]?.rate || undefined;
    const rateDate = exchangeRates[newCostInput.currency]?.date || undefined;

    const { data: ci, error } = await supabase.from('cost_inputs').insert({
      project_id: projectId,
      source_type: newCostInput.source_type,
      source_name: newCostInput.source_name,
      notes: newCostInput.notes,
      currency: newCostInput.currency || 'ILS',
      exchange_rate: rate,
      exchange_rate_date: rateDate,
      payment_terms: newCostInput.payment_terms,
    }).select().single();
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    setShowNewCostInput(false);
    setNewCostInput({ source_type: 'supplier', source_name: '', notes: '', currency: 'USD', payment_terms: '' });
    setCostInputs((prev) => [ci, ...prev]);
    setExpandedCostInput(ci.id);
    setEditingCostInput(ci.id);
    setEditingCostItems([{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, total_cost: 0, original_price: 0, original_currency: newCostInput.currency || 'USD', item_type: '' }]);
  }

  // Clone a cost input (all items, currency, terms) — handy when a new supplier
  // quote arrives and most fields are the same as a previous one.
  async function duplicateCostInput(ciId: string) {
    try {
      // Atomic server-side copy (row + all items in one transaction).
      const { data: newId, error: rpcErr } = await supabase.rpc('duplicate_cost_input', { p_ci_id: ciId });
      if (rpcErr || !newId) { alert(`שגיאה בשכפול: ${rpcErr?.message || 'לא הוחזר מזהה'}`); return; }

      const [{ data: nci, error: ciErr }, { data: items }] = await Promise.all([
        supabase.from('cost_inputs').select('*').eq('id', newId).single(),
        supabase.from('cost_input_items').select('*').eq('cost_input_id', newId),
      ]);
      if (ciErr || !nci) { alert(`התמחור שוכפל אך טעינתו נכשלה: ${ciErr?.message || ''}`); return; }

      // Mirror the source's attachment rows onto the new cost input (reusing
      // the same storage objects — no duplicated bytes).
      const srcAtts = attachments.filter((a) => a.entity_type === 'cost_input' && a.entity_id === ciId);
      let newAtts: any[] = [];
      if (srcAtts.length) {
        const rows = srcAtts.map((a) => ({
          entity_type: 'cost_input', entity_id: newId, project_id: projectId,
          file_name: a.file_name, file_url: a.file_url, file_type: a.file_type, file_size_bytes: a.file_size_bytes,
        }));
        const { data: inserted } = await supabase.from('attachments').insert(rows).select();
        newAtts = inserted || [];
      }

      setCostInputs((prev) => [nci, ...prev]);
      setCostInputItems((prev) => ({ ...prev, [nci.id]: items || [] }));
      if (newAtts.length) setAttachments((prev) => [...newAtts, ...prev]);
      setExpandedCostInput(nci.id);
      alert(`✅ התמחור שוכפל (${nci.source_name}) — ${items?.length || 0} פריטים${srcAtts.length ? `, ${srcAtts.length} קבצים` : ''}.`);
    } catch (e: any) {
      alert(`שגיאה בשכפול: ${e?.message || e}`);
    }
  }

  function startEditCostInput(ciId: string) {
    const ci = costInputs.find((c) => c.id === ciId);
    const citems = costInputItems[ciId] || [];
    setEditingCostInput(ciId);
    setEditingCostItems(citems.length > 0
      ? citems.map((i: any) => ({ ...i }))
      : [{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, total_cost: 0, original_price: 0, original_currency: ci?.currency || 'USD', item_type: '' }]
    );
  }

  function cancelEditCostInput() {
    setEditingCostInput(null);
  }

  function updateCostItem(idx: number, field: string, val: any) {
    setEditingCostItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      const ci = costInputs.find((c) => c.id === editingCostInput);
      // Effective currency: the cost input's currency if foreign, else any
      // foreign currency already present on items (handles ci.currency=ILS
      // mistagged after a duplicate where items are actually EUR/USD).
      const headerForeign = ci?.currency && ci.currency !== 'ILS';
      const itemForeign = next.find((i: any) => i.original_currency && i.original_currency !== 'ILS' && parseFloat(i.original_price) > 0);
      const currency = headerForeign ? ci!.currency : (itemForeign?.original_currency || ci?.currency || 'ILS');
      const rate = ci?.exchange_rate || exchangeRates[currency]?.rate || 1;
      const isILS = currency === 'ILS';
      // Sync this row's stamp so saved items reflect the effective currency.
      if (!isILS && next[idx].original_currency !== currency) next[idx].original_currency = currency;

      if (field === 'original_price' || field === 'quantity' || field === 'cost_price') {
        if (field === 'original_price' && !isILS) {
          const orig = parseFloat(val) || 0;
          next[idx].cost_price = Math.round(orig * rate * 100) / 100;
        }
        const qty = parseFloat(next[idx].quantity) || 0;
        const price = parseFloat(next[idx].cost_price) || 0;
        next[idx].total_cost = Math.round(qty * price * 100) / 100;
      }
      if (field === 'cost_price' && !isILS) {
        const costILS = parseFloat(val) || 0;
        if (rate > 0) next[idx].original_price = Math.round((costILS / rate) * 100) / 100;
        const qty = parseFloat(next[idx].quantity) || 0;
        next[idx].total_cost = Math.round(qty * costILS * 100) / 100;
      }
      return next;
    });
  }

  async function saveCostInputItems(costInputId: string) {
    setSaving(true);
    try {
      const { error: delErr } = await supabase.from('cost_input_items').delete().eq('cost_input_id', costInputId);
      if (delErr) throw delErr;
      const valid = editingCostItems.filter((i) => i.product_name?.trim());
      if (valid.length > 0) {
        const { error: insErr } = await supabase.from('cost_input_items').insert(valid.map((i, idx) => ({
          cost_input_id: costInputId,
          product_name: i.product_name,
          dn_size: i.dn_size || null,
          quantity: parseFloat(i.quantity) || 0,
          unit: i.unit || 'מטר',
          cost_price: parseFloat(i.cost_price) || 0,
          total_cost: parseFloat(i.total_cost) || 0,
          original_price: parseFloat(i.original_price) || null,
          original_currency: i.original_currency || null,
          item_type: i.item_type || null,
          sn: i.sn ? parseInt(i.sn) : null,
          pn: i.pn ? parseInt(i.pn) : null,
          length_m: i.length_m ? parseFloat(i.length_m) : null,
          sort_order: idx,
        })));
        if (insErr) throw insErr;
      }
      // Re-fetch with the real DB ids (and sort order) so per-row updates and the
      // 🔄 refresh-rate button — which target .eq('id', ...) — actually hit rows.
      const { data: reloaded } = await supabase.from('cost_input_items')
        .select('*').eq('cost_input_id', costInputId).order('sort_order');
      setCostInputItems((prev) => ({ ...prev, [costInputId]: reloaded || [] }));
      setEditingCostInput(null);
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function parseCostFile(fileList: FileList, costInputId: string) {
    setParsingCostFile(true);
    // Snapshot the FileList into a stable array IMMEDIATELY (before any await).
    // The <input onChange> clears the input with `e.target.value = ''` right
    // after calling us, which empties the live FileList we were handed — so by
    // the time our async loops run, fileList.length is 0 and nothing extracts.
    // Array.from here captures the File objects while they're still present.
    const srcFiles = Array.from(fileList);
    try {
      // Save the source files as attachments on the cost input so the
      // original supplier quotes stay traceable from the parsed price. Track
      // failures (e.g. RLS denial for a marketing-only user) so we can warn —
      // otherwise the user sees "items extracted" while the source file is lost.
      let uploadFailures = 0;
      for (const f of srcFiles) {
        try {
          const saved = await uploadCostInputAttachment(costInputId, f);
          if (!saved) uploadFailures++;
        } catch { uploadFailures++; }
      }

      // Collect extracted rows from all files into one list. Excel is parsed
      // HERE in the browser (where the file already is) — heavy spreadsheets
      // that embed logos/EMF images can be ~1MB once base64-encoded, and
      // shipping that to the API was unreliable (the file arrived empty and
      // fell through to Gemini, which then hallucinated from its prompt
      // examples). PDFs/images still go to Gemini via /api/ai.
      const rawItems: any[] = [];
      const quoteInfo: any = {};
      let extractedBy = '';
      const geminiFiles: File[] = [];
      const excelErrors: string[] = [];

      for (const file of srcFiles) {
        // Detect Excel by EXTENSION/MIME, but don't trust them blindly — Safari
        // and some pickers report empty/garbled type and occasionally a name
        // without the extension. So: anything that isn't clearly a PDF/image is
        // *attempted* as a spreadsheet by reading its bytes (XLSX sniffs the
        // ZIP/OLE magic). Only genuine PDFs/images skip straight to Gemini.
        const isPdfOrImage = file.type.startsWith('image/')
          || file.type === 'application/pdf'
          || /\.(pdf|png|jpe?g|gif|webp|heic|bmp|tiff?)$/i.test(file.name);
        const looksExcel = /\.(xlsx|xlsm|xls)$/i.test(file.name)
          || file.type.includes('spreadsheet') || file.type.includes('ms-excel')
          || file.type.includes('officedocument');
        if (isPdfOrImage) { geminiFiles.push(file); continue; }
        try {
          const ab = await file.arrayBuffer();
          const result = parseExcelBOQ(new Uint8Array(ab), file.name);
          if (result && Array.isArray(result.data) && result.data.length) {
            rawItems.push(...result.data);
            if (!quoteInfo.supplier_name) Object.assign(quoteInfo, result.quote_info, quoteInfo);
            extractedBy = extractedBy ? 'mixed' : 'local_excel';
          } else if (looksExcel) {
            excelErrors.push(`לא זוהתה טבלת תמחור ב-"${file.name}" (צריך שורת כותרת עם קוטר/כמות/מחיר).`);
          } else {
            geminiFiles.push(file); // not a spreadsheet we could read → let Gemini try
          }
        } catch (e: any) {
          // Bytes aren't a spreadsheet (or it's corrupt). If it looked like
          // Excel, report; otherwise hand the original file to Gemini.
          if (looksExcel) excelErrors.push(`שגיאה בקריאת "${file.name}" (${file.type || 'ללא סוג'}): ${e?.message || 'קובץ פגום'}`);
          else geminiFiles.push(file);
        }
      }

      // Non-Excel files (PDF/image/CSV) → Gemini extraction on the server.
      if (geminiFiles.length > 0) {
        const filesArr: { base64: string; mimeType: string; name: string }[] = [];
        for (const file of geminiFiles) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(((reader.result as string) || '').split(',')[1] || '');
            reader.onerror = () => reject(new Error('קריאת הקובץ נכשלה'));
            reader.readAsDataURL(file);
          });
          filesArr.push({ base64, mimeType: file.type, name: file.name });
        }
        const res = await fetch('/api/ai', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: `חלץ את כל פריטי התמחור מ-${filesArr.length > 1 ? `${filesArr.length} הקבצים המצורפים (מכולם!)` : 'הקובץ המצורף'}. אלו קבצי תמחור/הצעת מחיר מספק צנרת GRP. חלץ: שם מוצר, קוטר DN, כמות, יחידה, מחיר ליחידה, סה"כ.`,
            files: filesArr,
          }),
        });
        const data = await res.json();
        if (Array.isArray(data?.data) && data.data.length) {
          rawItems.push(...data.data);
          if (!quoteInfo.supplier_name) Object.assign(quoteInfo, data.quote_info || {}, quoteInfo);
          extractedBy = extractedBy ? 'mixed' : (data.extracted_by || 'gemini');
        } else if (data?.error || data?.message) {
          excelErrors.push(data.error || data.message);
        }
      }

      if (rawItems.length === 0) {
        const dbg = srcFiles.map((f) => `"${f.name}" (${f.type || 'ללא סוג'}, ${Math.round(f.size / 1024)}KB)`).join(' ; ') || 'אין קבצים';
        alert((excelErrors.length ? excelErrors.join('\n') : 'לא הצלחתי לחלץ פריטים מהקובץ') + `\n\n[אבחון] ${dbg}`);
        return;
      }

      const qi = quoteInfo;
      const currency = qi.currency || rawItems.find((i) => i.currency)?.currency || 'ILS';
      const ci = costInputs.find((c) => c.id === costInputId);
      const rate = ci?.exchange_rate || exchangeRates[currency]?.rate || 1;
      const isILS = currency === 'ILS';

      const items = rawItems.map((item: any) => {
        const origPrice = parseFloat(item.unit_price || item.cost_price) || 0;
        const costPrice = isILS ? origPrice : Math.round(origPrice * rate * 100) / 100;
        // Round away floating-point noise from Excel formula cells
        // (e.g. 51.300000000000004 → 51.3) so quantities display cleanly.
        const qty = Math.round((parseFloat(item.quantity) || 1) * 1000) / 1000;
        return {
          product_name: item.description || item.product_name || item.item_code || `${item.item_type || ''} DN${item.dn || ''}`.trim() || 'פריט',
          dn_size: item.dn ? `DN${item.dn}` : (item.dn_size || ''),
          quantity: qty,
          unit: item.price_per === 'unit' ? 'יח\'' : 'מטר',
          original_price: origPrice,
          original_currency: currency,
          cost_price: costPrice,
          total_cost: Math.round(qty * costPrice * 100) / 100,
          item_type: item.item_type || '',
          sn: item.sn || null,
          pn: item.pn || null,
          length_m: item.length_m || null,
        };
      });

      if (ci && ci.currency !== currency) {
        await supabase.from('cost_inputs').update({
          currency,
          exchange_rate: rate,
          exchange_rate_date: exchangeRates[currency]?.date || new Date().toISOString().split('T')[0],
        }).eq('id', costInputId);
        setCostInputs((prev) => prev.map((c) => c.id === costInputId ? { ...c, currency, exchange_rate: rate } : c));
      }

      // Append when adding more files to the same cost input; otherwise start fresh.
      setEditingCostItems((prev) => (editingCostInput === costInputId && prev.length > 0 ? [...prev, ...items] : items));
      setEditingCostInput(costInputId);
      const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪';
      const partialNote = excelErrors.length ? `\n\n⚠️ ${excelErrors.join('\n')}` : '';
      const uploadNote = uploadFailures > 0
        ? `\n\n⚠️ ${uploadFailures} קבצי מקור לא נשמרו כצרופה (כנראה אין לך הרשאת עריכה לפרויקטים) — הפריטים חולצו אך הקובץ המקורי לא נשמר.`
        : '';
      // Show which engine read the file: local Excel parser (reliable) vs
      // Gemini (used for PDF/images; can hallucinate on unreadable input).
      const sourceNote = extractedBy === 'local_excel'
        ? '\n\n📗 חולץ מקומית מהאקסל (קריאה מדויקת).'
        : extractedBy === 'gemini'
        ? '\n\n🤖 חולץ ע"י Gemini (PDF/תמונה) — מומלץ לוודא את הפריטים.'
        : extractedBy === 'mixed'
        ? '\n\n📗🤖 חולץ מאקסל + Gemini.'
        : '';
      alert(`Roxy חילצה ${items.length} פריטים${qi.supplier_name ? ` מ-${qi.supplier_name}` : ''}${qi.quote_ref ? ` (Ref: ${qi.quote_ref})` : ''} — מטבע: ${sym}${!isILS ? ` (שער: ${rate})` : ''}.\nאפשר להעלות עוד קובץ (יתווסף), ואז לבדוק וללחוץ שמור.${sourceNote}${partialNote}${uploadNote}`);
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setParsingCostFile(false);
    }
  }

  // === Quote functions ===

  // Pull working pressure (PN, bar) + stiffness (SN, Pascal) from the project's
  // pipe_specs for a given DN. Matches the numeric part of dn_size (e.g. "DN700"
  // or "700") to pipe_specs.dn_mm. Returns nulls when there's no matching spec.
  function resolvePnSn(dnSize: string | null | undefined): { pn: number | null; sn: number | null } {
    if (dnSize == null) return { pn: null, sn: null };
    const m = String(dnSize).match(/\d+/);
    if (!m) return { pn: null, sn: null };
    const dn = parseInt(m[0], 10);
    const spec = pipeSpecs.find((s) => Number(s.dn_mm) === dn);
    if (!spec) return { pn: null, sn: null };
    return {
      pn: spec.pressure_bar != null ? Number(spec.pressure_bar) : null,
      sn: spec.stiffness_pascal != null ? Number(spec.stiffness_pascal) : null,
    };
  }

  function buildDocNumber(prefix: string, version?: number) {
    const now = new Date();
    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const yy = String(now.getFullYear()).slice(-2);
    const pNum = String(projectNumber || 0).padStart(3, '0');
    const base = `${prefix}-${dd}${mm}${yy}-P${pNum}`;
    return version != null ? `${base}-V${String(version).padStart(2, '0')}` : base;
  }

  async function createQuote() {
    if (!newQuote.client_name.trim()) return;
    const existingCount = quotes.filter((q) => q.status !== 'cancelled').length;
    const num = buildDocNumber('HM', existingCount + 1);
    const disclaimer = DISCLAIMER_TEMPLATES[newQuote.disclaimer_type]?.text || '';
    const oh = newQuote.cost_source === 'internal' ? 0 : (newQuote.default_overheads_pct || 17);
    const pr = newQuote.default_profit_pct || 25;

    // Resolve the contact picker value into a real project_contacts id.
    // "cc:<id>" → materialize that customer contact into this project (reuse by
    // name when possible). "pc:<id>" → use directly. Empty → null.
    let resolvedContactId: string | null = null;
    if (newQuote.contact_id) {
      const [kind, id] = newQuote.contact_id.split(':');
      if (kind === 'pc' && id) {
        resolvedContactId = id;
      } else if (kind === 'cc' && id) {
        const cc = customerContacts.find((c) => c.id === id);
        if (cc) {
          const existing = contacts.find((c) => (c.name || '').trim() === (cc.name || '').trim() && (c.name || '').trim() !== '');
          if (existing) {
            resolvedContactId = existing.id;
          } else {
            const { data: inserted } = await supabase
              .from('project_contacts')
              .insert({ project_id: projectId, name: cc.name || '', role: cc.role || null, phone: cc.phone || null, email: cc.email || null, client_contact_id: cc.id })
              .select('id, role, name, phone, email')
              .single();
            if (inserted) {
              setContacts((prev) => [...prev, inserted]);
              resolvedContactId = inserted.id;
            }
          }
        }
      } else if (!kind.includes(':') && newQuote.contact_id.length > 8) {
        // Legacy plain uuid (no prefix) — treat as project_contact id.
        resolvedContactId = newQuote.contact_id;
      }
    }

    const { data: q, error } = await supabase.from('quotes').insert({
      project_id: projectId, quote_number: num, client_name: newQuote.client_name,
      customer_id: newQuote.customer_id || null,
      contact_id: resolvedContactId,
      status: 'draft', tier: newQuote.tier, cost_source: newQuote.cost_source, supplier_name: newQuote.supplier_name,
      cost_input_id: newQuote.cost_input_id || null,
      default_overheads_pct: oh,
      default_profit_pct: pr,
      payment_terms: newQuote.payment_terms, disclaimer_type: newQuote.disclaimer_type,
      disclaimer_text: disclaimer, global_discount_pct: 0, total_amount: 0, total_cost: 0, notes: newQuote.notes,
      delivery_time: DEFAULT_DELIVERY_TIME,
    }).select().single();
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    setShowNewQuote(false);

    const ciItems = newQuote.cost_input_id ? (costInputItems[newQuote.cost_input_id] || []) : [];
    const preItems = ciItems.length > 0
      ? ciItems.map((ci: any) => {
          const unitPrice = calcSellingPrice(parseFloat(ci.cost_price) || 0, oh, pr);
          const spec = resolvePnSn(ci.dn_size);
          return {
            product_name: ci.product_name, dn_size: ci.dn_size, quantity: ci.quantity, unit: ci.unit,
            cost_price: ci.cost_price, overheads_pct: oh, profit_pct: pr, discount_pct: 0,
            unit_price: unitPrice, total_price: (ci.quantity || 0) * unitPrice, notes: '',
            pn: ci.pn ?? spec.pn, sn: ci.sn ?? spec.sn, length_m: ci.length_m ?? null,
          };
        })
      : [{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, overheads_pct: oh, profit_pct: pr, discount_pct: 0, unit_price: 0, total_price: 0, notes: '', pn: null, sn: null, length_m: null }];

    setNewQuote({
      client_name: '', customer_id: '', contact_id: '', cost_input_id: '', cost_source: 'supplier', supplier_name: '',
      default_overheads_pct: 17, default_profit_pct: 25,
      disclaimer_type: 'grp_pipe', payment_terms: '40% מקדמה, יתרה שוטף +30', notes: '',
      tier: 'contractor_pre_tender',
    });
    setQuotes((prev) => [q, ...prev]);
    setEditingQuote(q.id);
    setEditingItems(preItems);
    setExpandedQuote(q.id);
  }

  // Clone a quote (all items + terms) into a fresh draft — e.g. to send the same
  // offer to another customer. The recipient (customer/contact) and the frozen
  // snapshot are reset so the copy can be re-addressed.
  async function duplicateQuote(quoteId: string) {
    const src = quotes.find((x) => x.id === quoteId);
    if (!src) return;
    const existingCount = quotes.filter((x) => x.status !== 'cancelled').length;
    const num = buildDocNumber('HM', existingCount + 1);

    const { data: nq, error } = await supabase.from('quotes').insert({
      project_id: projectId, quote_number: num, client_name: '',
      customer_id: null, contact_id: null, contact_snapshot: null,
      status: 'draft', tier: src.tier, cost_source: src.cost_source, supplier_name: src.supplier_name,
      cost_input_id: src.cost_input_id || null,
      default_overheads_pct: src.default_overheads_pct, default_profit_pct: src.default_profit_pct,
      payment_terms: src.payment_terms, disclaimer_type: src.disclaimer_type, disclaimer_text: src.disclaimer_text,
      global_discount_pct: src.global_discount_pct || 0, total_amount: src.total_amount || 0, total_cost: src.total_cost || 0,
      notes: src.notes, delivery_time: src.delivery_time,
      // Carry the contract terms over so the duplicate starts identical.
      contract_template_id: src.contract_template_id || null,
      contract_overrides: src.contract_overrides || null,
    }).select().single();
    if (error || !nq) { alert(`שגיאה בשכפול: ${error?.message || ''}`); return; }

    const { data: srcItems } = await supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order');
    if (srcItems && srcItems.length) {
      const rows = srcItems.map(({ id, quote_id, created_at, ...rest }: any) => ({ ...rest, quote_id: nq.id }));
      await supabase.from('quote_items').insert(rows);
    }
    const { data: newItems } = await supabase.from('quote_items').select('*').eq('quote_id', nq.id).order('sort_order');

    const links = quoteDrawings[quoteId] || [];
    if (links.length) {
      await supabase.from('quote_drawings').insert(links.map((aid) => ({ quote_id: nq.id, attachment_id: aid })));
      setQuoteDrawings((prev) => ({ ...prev, [nq.id]: [...links] }));
    }

    setQuotes((prev) => [nq, ...prev]);
    setQuoteItems((prev) => ({ ...prev, [nq.id]: newItems || [] }));
    setExpandedQuote(nq.id);
    alert(`✅ ההצעה שוכפלה כטיוטה חדשה (${num}).\nבחר לקוח/איש קשר חדש ושלח.`);
  }

  function startEditQuote(quoteId: string) {
    const q = quotes.find((x) => x.id === quoteId);
    const items = quoteItems[quoteId] || [];
    const oh = q?.default_overheads_pct ?? 17;
    const pr = q?.default_profit_pct ?? 25;
    setEditingQuote(quoteId);
    setEditingItems(items.length > 0
      ? items.map((i) => ({ ...i }))
      : [{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, overheads_pct: oh, profit_pct: pr, discount_pct: 0, unit_price: 0, total_price: 0, notes: '' }]
    );
  }

  function cancelEditQuote() {
    setEditingQuote(null);
  }

  function updateItem(idx: number, field: string, val: any) {
    setEditingItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (['quantity', 'cost_price', 'overheads_pct', 'profit_pct', 'unit_price', 'discount_pct'].includes(field)) {
        const cost = parseFloat(next[idx].cost_price) || 0;
        const oh = parseFloat(next[idx].overheads_pct) || 0;
        const qty = parseFloat(next[idx].quantity) || 0;
        const disc = parseFloat(next[idx].discount_pct) || 0;
        if (field === 'unit_price') {
          const up = parseFloat(val) || 0;
          const costWithOH = cost * (1 + oh / 100);
          if (costWithOH > 0) {
            next[idx].profit_pct = Math.round(((up / costWithOH) - 1) * 10000) / 100;
          }
        } else {
          const pr = parseFloat(next[idx].profit_pct) || 0;
          next[idx].unit_price = calcSellingPrice(cost, oh, pr);
        }
        const lineTotal = qty * (parseFloat(next[idx].unit_price) || 0);
        next[idx].total_price = disc > 0 ? Math.round(lineTotal * (1 - disc / 100) * 100) / 100 : lineTotal;
      }
      return next;
    });
  }

  // Apply one profit % across a category of items at once.
  // 'pipe' = full-length pipe runs only; 'accessory' = fittings + short pipes (rokers).
  function bulkSetProfit(category: 'pipe' | 'accessory' | 'all', profitPct: number) {
    setEditingItems((prev) => prev.map((item) => {
      if (category !== 'all' && itemCategory(item.product_name) !== category) return item;
      const cost = parseFloat(item.cost_price) || 0;
      const oh = parseFloat(item.overheads_pct) || 0;
      const qty = parseFloat(item.quantity) || 0;
      const disc = parseFloat(item.discount_pct) || 0;
      const unitPrice = calcSellingPrice(cost, oh, profitPct);
      const lineTotal = qty * unitPrice;
      return {
        ...item,
        profit_pct: profitPct,
        unit_price: unitPrice,
        total_price: disc > 0 ? Math.round(lineTotal * (1 - disc / 100) * 100) / 100 : lineTotal,
      };
    }));
  }

  async function setQuoteContact(quoteId: string, contactId: string) {
    const value = contactId || null;
    await supabase.from('quotes').update({ contact_id: value, updated_at: new Date().toISOString() }).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, contact_id: value } : q));
  }

  async function setQuoteNotes(quoteId: string, notes: string) {
    const value = notes.trim() ? notes.trim() : null;
    await supabase.from('quotes').update({ notes: value, updated_at: new Date().toISOString() }).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, notes: value } : q));
  }

  // Dropdown values are prefixed: "pc:<id>" = project contact, "cc:<id>" = customer
  // contact. A quote's contact_id must reference project_contacts (the preview reads
  // from there), so a chosen customer contact is first materialized into this project.
  async function assignQuoteContact(quoteId: string, value: string) {
    if (!value) { await setQuoteContact(quoteId, ''); return; }
    const [kind, id] = value.split(':');
    if (kind === 'pc') { await setQuoteContact(quoteId, id); return; }
    if (kind !== 'cc') return;

    const cc = customerContacts.find((c) => c.id === id);
    if (!cc) return;

    // Reuse a project contact with the same name if one already exists.
    const existing = contacts.find((c) => (c.name || '').trim() === (cc.name || '').trim() && (c.name || '').trim() !== '');
    if (existing) { await setQuoteContact(quoteId, existing.id); return; }

    const { data: inserted, error } = await supabase
      .from('project_contacts')
      .insert({ project_id: projectId, name: cc.name || '', role: cc.role || 'איש קשר', phone: cc.phone || null, email: cc.email || null, client_contact_id: cc.id })
      .select('id, role, name, phone, email')
      .single();
    if (error || !inserted) { alert(`שגיאה בהוספת איש הקשר: ${error?.message || ''}`); return; }
    setContacts((prev) => [...prev, inserted]);
    await setQuoteContact(quoteId, inserted.id);
  }

  async function setQuoteCustomer(quoteId: string, customerId: string) {
    const value = customerId || null;
    // When a customer is chosen, reflect its name as the quote's recipient name.
    const name = value ? (customers.find((c) => c.id === value)?.name || null) : null;
    const patch: any = { customer_id: value, updated_at: new Date().toISOString() };
    if (name) patch.client_name = name;
    await supabase.from('quotes').update(patch).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, customer_id: value, ...(name ? { client_name: name } : {}) } : q));
  }

  // Re-link a quote to a different cost input (used on a duplicated draft
  // when the user wants to base it on another supplier quote). If the link
  // changes to a real cost input, the quote's items are replaced (after
  // confirmation) with rows derived from that cost input — using the quote's
  // own overheads/profit defaults to compute selling prices.
  async function setQuoteCostInput(quoteId: string, costInputId: string) {
    const value = costInputId || null;
    const quote = quotes.find((q) => q.id === quoteId);

    // Just clearing the link — keep the items, only update the field.
    if (!value) {
      await supabase.from('quotes').update({ cost_input_id: null, updated_at: new Date().toISOString() }).eq('id', quoteId);
      setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, cost_input_id: null } : q));
      return;
    }

    const currentItems = quoteItems[quoteId] || [];
    if (currentItems.length > 0 && !confirm('שינוי הקישור לתמחור יחליף את הפריטים בהצעה (תיאורים, כמויות ועלויות) על-פי התמחור החדש. להמשיך?')) return;

    // Pull the new cost input's items (prefer local cache, fall back to DB).
    let srcItems = costInputItems[value];
    if (!srcItems) {
      const { data } = await supabase.from('cost_input_items').select('*').eq('cost_input_id', value).order('sort_order');
      srcItems = data || [];
    }

    const oh = parseFloat(quote?.default_overheads_pct ?? '17') || 0;
    const pr = parseFloat(quote?.default_profit_pct ?? '25') || 0;
    const newItems = srcItems.map((ci: any, idx: number) => {
      const cost = parseFloat(ci.cost_price) || 0;
      const qty = parseFloat(ci.quantity) || 0;
      const unitPrice = calcSellingPrice(cost, oh, pr);
      const spec = resolvePnSn(ci.dn_size);
      return {
        quote_id: quoteId,
        product_name: ci.product_name || '',
        dn_size: ci.dn_size || null,
        quantity: qty,
        unit: ci.unit || 'מטר',
        cost_price: cost,
        overheads_pct: oh,
        profit_pct: pr,
        discount_pct: 0,
        unit_price: unitPrice,
        total_price: Math.round(qty * unitPrice * 100) / 100,
        notes: '',
        pn: ci.pn ?? spec.pn,
        sn: ci.sn ?? spec.sn,
        length_m: ci.length_m ?? null,
        sort_order: idx,
      };
    });

    const totalCost = newItems.reduce((s, i) => s + (i.cost_price * i.quantity), 0);
    const totalAmount = newItems.reduce((s, i) => s + i.total_price, 0);

    // Atomic replace: the RPC does DELETE+INSERT in one transaction, so a failed
    // insert rolls the delete back and the quote keeps its old items (instead of
    // ending up empty in the DB while the cache still shows the old rows).
    const { error: rpcErr } = await supabase.rpc('replace_quote_items', {
      p_quote_id: quoteId, p_items: newItems,
    });
    if (rpcErr) { alert(`שגיאה בהחלפת הפריטים: ${rpcErr.message}`); return; }

    await supabase.from('quotes').update({
      cost_input_id: value, total_cost: totalCost, total_amount: totalAmount, updated_at: new Date().toISOString(),
    }).eq('id', quoteId);

    const { data: reloaded } = await supabase.from('quote_items').select('*').eq('quote_id', quoteId).order('sort_order');
    setQuoteItems((prev) => ({ ...prev, [quoteId]: reloaded || [] }));
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, cost_input_id: value, total_cost: totalCost, total_amount: totalAmount } : q));
    if (editingQuote === quoteId) setEditingQuote(null); // exit any in-progress edit so the new items show
  }

  // Pick a contract-terms template for a quote. Clears any quote-specific
  // overrides so the new template's content is rendered cleanly.
  async function setQuoteContractTemplate(quoteId: string, templateId: string) {
    const value = templateId || null;
    await supabase.from('quotes').update({
      contract_template_id: value, contract_overrides: null, updated_at: new Date().toISOString(),
    }).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, contract_template_id: value, contract_overrides: null } : q));
  }

  // Save quote-specific overrides of the contract terms (per-quote customization,
  // doesn't touch the template). Pass null to clear.
  async function setQuoteContractOverrides(quoteId: string, overrides: any) {
    await supabase.from('quotes').update({
      contract_overrides: overrides, updated_at: new Date().toISOString(),
    }).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, contract_overrides: overrides } : q));
  }

  // Fetch a template's full content (the list cache only holds id/name).
  async function fetchTemplateContent(templateId: string) {
    const { data, error } = await supabase.from('contract_term_templates').select('*').eq('id', templateId).single();
    if (error) { console.error('[contract template] fetch error', error); return null; }
    return data;
  }

  async function refreshContractTemplates() {
    const { data } = await supabase.from('contract_term_templates').select('id, name, description, is_default').order('is_default', { ascending: false }).order('name');
    setContractTemplates(data || []);
  }

  // Pulls fresh project-level attachments (drawings + specs) so newly uploaded
  // files show up in the quote-card linking checkboxes without a full reload.
  async function refreshProjectDrawings() {
    const { data } = await supabase
      .from('attachments')
      .select('id, file_name, file_url, drawing_number, file_type')
      .eq('project_id', projectId)
      .eq('entity_type', 'project')
      .order('created_at');
    setProjectDrawings(data || []);
  }

  async function refreshCustomers() {
    const { data } = await supabase.from('clients').select('id, name').order('name');
    setCustomers(data || []);
  }

  async function toggleQuoteDrawing(quoteId: string, attachmentId: string) {
    const current = quoteDrawings[quoteId] || [];
    const isOn = current.includes(attachmentId);
    if (isOn) {
      await supabase.from('quote_drawings').delete().eq('quote_id', quoteId).eq('attachment_id', attachmentId);
      setQuoteDrawings((prev) => ({ ...prev, [quoteId]: (prev[quoteId] || []).filter((x) => x !== attachmentId) }));
    } else {
      await supabase.from('quote_drawings').insert({ quote_id: quoteId, attachment_id: attachmentId });
      setQuoteDrawings((prev) => ({ ...prev, [quoteId]: [...(prev[quoteId] || []), attachmentId] }));
    }
  }

  async function saveQuoteItems(quoteId: string) {
    setSaving(true);
    try {
      await supabase.from('quote_items').delete().eq('quote_id', quoteId);
      const valid = editingItems.filter((i) => i.product_name?.trim());
      if (valid.length > 0) {
        await supabase.from('quote_items').insert(valid.map((i, idx) => {
          const spec = resolvePnSn(i.dn_size);
          const hasPn = i.pn != null && i.pn !== '';
          const hasSn = i.sn != null && i.sn !== '';
          return {
            quote_id: quoteId, product_name: i.product_name, dn_size: i.dn_size || null,
            quantity: parseFloat(i.quantity) || 0, unit: i.unit || 'מטר',
            cost_price: parseFloat(i.cost_price) || 0, overheads_pct: parseFloat(i.overheads_pct) || 0,
            profit_pct: parseFloat(i.profit_pct) || 0, discount_pct: parseFloat(i.discount_pct) || 0,
            unit_price: parseFloat(i.unit_price) || 0, total_price: parseFloat(i.total_price) || 0,
            notes: i.notes || '',
            pn: hasPn ? parseFloat(i.pn) : spec.pn,
            sn: hasSn ? parseInt(i.sn) : spec.sn,
            length_m: i.length_m != null && i.length_m !== '' ? parseFloat(i.length_m) : null,
            sort_order: idx,
          };
        }));
      }
      const totalSell = valid.reduce((s, i) => s + (parseFloat(i.total_price) || 0), 0);
      const totalCost = valid.reduce((s, i) => s + ((parseFloat(i.cost_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
      await supabase.from('quotes').update({ total_amount: totalSell, total_cost: totalCost, updated_at: new Date().toISOString() }).eq('id', quoteId);
      setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, total_amount: totalSell, total_cost: totalCost } : q));
      setQuoteItems((prev) => ({ ...prev, [quoteId]: valid }));
      setEditingQuote(null);
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function updateQuoteStatus(quoteId: string, status: string) {
    const q = quotes.find((x) => x.id === quoteId);
    const now = new Date().toISOString();
    const patch: any = { status, updated_at: now };
    // Freeze the printed quote date the first time it's issued — updated_at keeps
    // moving on later back-office edits, sent_at must not.
    if ((status === 'sent' || status === 'signed') && q && !q.sent_at) patch.sent_at = now;
    await supabase.from('quotes').update(patch).eq('id', quoteId);
    setQuotes((prev) => prev.map((x) => x.id === quoteId ? { ...x, ...patch } : x));

    // Freeze the contact on the quote the first time it goes out, so later edits
    // to the contact (sync in either direction) don't change an issued quote.
    if (status === 'sent' || status === 'signed') {
      if (q && !q.contact_snapshot) {
        // Snapshot ONLY the explicitly linked addressee. Falling back to
        // contacts[0] would silently freeze the wrong person (often the planner)
        // when the linked contact was deleted between draft and send.
        const c = q.contact_id ? contacts.find((x) => x.id === q.contact_id) : null;
        if (c) {
          const snap = {
            name: c.name || '', role: c.role || '', phone: c.phone || '', email: c.email || '',
            company: q.customer_id ? (customers.find((cu) => cu.id === q.customer_id)?.name || null) : null,
          };
          await supabase.from('quotes').update({ contact_snapshot: snap }).eq('id', quoteId);
          setQuotes((prev) => prev.map((x) => x.id === quoteId ? { ...x, contact_snapshot: snap } : x));
        }
      }
      // Freeze the contract terms. Resolve the same way the preview does
      // (template content, else the hard-coded fallback sections) and snapshot
      // it — even without a template — so editing lib/contract-terms.ts can't
      // retroactively change an already-issued quote.
      if (q && !q.contract_overrides) {
        let content: any = null;
        if (q.contract_template_id) {
          const tpl = await fetchTemplateContent(q.contract_template_id);
          content = tpl?.content || null;
        }
        if (!content) content = CONTRACT_SECTIONS;
        if (content) {
          await supabase.from('quotes').update({ contract_overrides: content }).eq('id', quoteId);
          setQuotes((prev) => prev.map((x) => x.id === quoteId ? { ...x, contract_overrides: content } : x));
        }
      }
    }

    if (status === 'signed') {
      const orderNum = q?.quote_number ? q.quote_number.replace(/^HM/, 'HZ') : `HZ-${Date.now().toString(36).toUpperCase()}`;
      const { data: ord } = await supabase.from('orders').insert({
        project_id: projectId, quote_id: quoteId, order_number: orderNum,
        status: 'pending', total_amount: q?.total_amount || 0, advance_percent: 40,
      }).select().single();
      if (ord) setOrders((prev) => [ord, ...prev]);
      const signedQuotes = quotes.map((x) => x.id === quoteId ? { ...x, status: 'signed' } : x).filter((x) => x.status === 'signed');
      const totalValue = signedQuotes.reduce((s, x) => s + (x.total_amount || 0), 0);
      await supabase.from('projects').update({ order_value: totalValue, last_updated_at: new Date().toISOString() }).eq('id', projectId);
    }
  }

  async function deleteQuote(quoteId: string) {
    await supabase.from('quotes').delete().eq('id', quoteId);
    setQuotes((prev) => prev.filter((q) => q.id !== quoteId));
    if (editingQuote === quoteId) setEditingQuote(null);
  }

  async function updateGlobalDiscount(quoteId: string, pct: number) {
    await supabase.from('quotes').update({ global_discount_pct: pct, updated_at: new Date().toISOString() }).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, global_discount_pct: pct } : q));
  }

  async function refreshDisclaimer(quoteId: string) {
    const q = quotes.find((x) => x.id === quoteId);
    if (!q) return;
    const newText = DISCLAIMER_TEMPLATES[q.disclaimer_type]?.text || '';
    await supabase.from('quotes').update({ disclaimer_text: newText, updated_at: new Date().toISOString() }).eq('id', quoteId);
    setQuotes((prev) => prev.map((x) => x.id === quoteId ? { ...x, disclaimer_text: newText } : x));
  }

  function setQuoteField(quoteId: string, field: string, value: any) {
    setQuotes((prev) => prev.map((x) => x.id === quoteId ? { ...x, [field]: value } : x));
  }

  async function updateDisclaimerText(quoteId: string, text: string) {
    setQuoteField(quoteId, 'disclaimer_text', text);
    await supabase.from('quotes').update({ disclaimer_text: text, updated_at: new Date().toISOString() }).eq('id', quoteId);
  }

  async function updateDeliveryTime(quoteId: string, text: string) {
    setQuoteField(quoteId, 'delivery_time', text);
    await supabase.from('quotes').update({ delivery_time: text, updated_at: new Date().toISOString() }).eq('id', quoteId);
  }

  async function updatePaymentTerms(quoteId: string, text: string) {
    setQuoteField(quoteId, 'payment_terms', text);
    await supabase.from('quotes').update({ payment_terms: text, updated_at: new Date().toISOString() }).eq('id', quoteId);
  }

  async function updateOrderStatus(orderId: string, status: string) {
    await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', orderId);
    setOrders((prev) => prev.map((o) => o.id === orderId ? { ...o, status } : o));
  }

  function addEditingItem(defaults?: any) {
    const q = editingQuote ? quotes.find((x) => x.id === editingQuote) : null;
    setEditingItems((prev) => [...prev, {
      product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0,
      overheads_pct: defaults?.overheads_pct ?? q?.default_overheads_pct ?? 17,
      profit_pct: defaults?.profit_pct ?? q?.default_profit_pct ?? 25,
      discount_pct: 0, unit_price: 0, total_price: 0, notes: '', ...defaults,
    }]);
  }

  function removeEditingItem(idx: number) {
    setEditingItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCostItem() {
    const ci = editingCostInput ? costInputs.find((c) => c.id === editingCostInput) : null;
    setEditingCostItems((prev) => {
      // Pick up the effective currency from existing rows if the header is
      // mistagged as ILS — same logic the editor uses to decide isForex.
      const headerForeign = ci?.currency && ci.currency !== 'ILS';
      const itemForeign = prev.find((i: any) => i.original_currency && i.original_currency !== 'ILS' && parseFloat(i.original_price) > 0);
      const currency = headerForeign ? ci!.currency : (itemForeign?.original_currency || ci?.currency || 'ILS');
      return [...prev, {
        product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, total_cost: 0,
        original_price: 0, original_currency: currency, item_type: '',
      }];
    });
  }

  function removeCostItem(idx: number) {
    setEditingCostItems((prev) => prev.filter((_, i) => i !== idx));
  }

  async function toggleArchiveCostInput(ciId: string) {
    const ci = costInputs.find((c) => c.id === ciId);
    if (!ci) return;
    const newVal = !ci.is_archived;
    await supabase.from('cost_inputs').update({ is_archived: newVal }).eq('id', ciId);
    setCostInputs((prev) => prev.map((c) => c.id === ciId ? { ...c, is_archived: newVal } : c));
  }

  return {
    costInputs, quotes, orders, quoteItems, costInputItems, attachments,
    exchangeRates, rateLoading, refreshRate, refreshCostInputRate,
    pricingTab, setPricingTab,
    showNewCostInput, setShowNewCostInput,
    showNewQuote, setShowNewQuote,
    newCostInput, setNewCostInput,
    newQuote, setNewQuote,
    editingQuote, editingItems,
    editingCostInput, editingCostItems,
    expandedQuote, setExpandedQuote,
    expandedCostInput, setExpandedCostInput,
    parsingCostFile, saving, uploadingFile,
    createCostInput, duplicateCostInput, parseCostFile, updateCostItem, saveCostInputItems,
    startEditCostInput, cancelEditCostInput, setEditingCostItems,
    contacts, customers, customerContacts, refreshCustomers, assignQuoteContact,
    contractTemplates, setQuoteContractTemplate, setQuoteContractOverrides, fetchTemplateContent, refreshContractTemplates, refreshProjectDrawings,
    projectDrawings, pipeSpecs, resolvePnSn, quoteDrawings, toggleQuoteDrawing,
    createQuote, duplicateQuote, startEditQuote, updateItem, bulkSetProfit, saveQuoteItems, setQuoteContact, setQuoteNotes, setQuoteCustomer, setQuoteCostInput,
    cancelEditQuote, updateQuoteStatus, deleteQuote, updateGlobalDiscount, refreshDisclaimer, updateDisclaimerText, updateDeliveryTime, updatePaymentTerms, setQuoteField, updateOrderStatus,
    addEditingItem, removeEditingItem, addCostItem, removeCostItem,
    toggleArchiveCostInput, uploadAttachment, deleteAttachment, uploadCostInputAttachment, deleteCostInput,
  };
}
