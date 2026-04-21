'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { fetchExchangeRate, type ExchangeRateInfo } from '@/lib/exchange-rate';
import { DISCLAIMER_TEMPLATES } from '@/lib/disclaimers';
import { calcCostPerMeter, calcRokerCostPerMeter, calcSellingPrice } from '@/lib/pricing';

export interface UsePricingReturn {
  // Data
  costInputs: any[];
  quotes: any[];
  orders: any[];
  quoteItems: Record<string, any[]>;
  costInputItems: Record<string, any[]>;

  // Exchange rate
  exchangeRates: Record<string, ExchangeRateInfo>;
  rateLoading: boolean;
  refreshRate: (currency: string) => Promise<void>;

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
  parseCostFile: (fileList: FileList, costInputId: string) => Promise<void>;
  updateCostItem: (idx: number, field: string, val: any) => void;
  saveCostInputItems: (costInputId: string) => Promise<void>;
  startEditCostInput: (ciId: string) => void;
  cancelEditCostInput: () => void;
  setEditingCostItems: React.Dispatch<React.SetStateAction<any[]>>;
  createQuote: () => Promise<void>;
  startEditQuote: (quoteId: string) => void;
  updateItem: (idx: number, field: string, val: any) => void;
  saveQuoteItems: (quoteId: string) => Promise<void>;
  cancelEditQuote: () => void;
  updateQuoteStatus: (quoteId: string, status: string) => Promise<void>;
  deleteQuote: (quoteId: string) => Promise<void>;
  updateOrderStatus: (orderId: string, status: string) => Promise<void>;
  addEditingItem: (defaults?: any) => void;
  removeEditingItem: (idx: number) => void;
  addCostItem: () => void;
  removeCostItem: (idx: number) => void;
}

export function usePricing(projectId: string): UsePricingReturn {
  const supabase = createClient();
  // Data
  const [costInputs, setCostInputs] = useState<any[]>([]);
  const [quotes, setQuotes] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [quoteItems, setQuoteItems] = useState<Record<string, any[]>>({});
  const [costInputItems, setCostInputItems] = useState<Record<string, any[]>>({});

  // Exchange rates — keyed by currency code
  const [exchangeRates, setExchangeRates] = useState<Record<string, ExchangeRateInfo>>({});
  const [rateLoading, setRateLoading] = useState(false);

  // UI state
  const [pricingTab, setPricingTab] = useState<'costs' | 'quotes' | 'orders'>('quotes');
  const [showNewCostInput, setShowNewCostInput] = useState(false);
  const [showNewQuote, setShowNewQuote] = useState(false);
  const [newCostInput, setNewCostInput] = useState({ source_type: 'supplier', source_name: '', notes: '', currency: 'USD' });
  const [newQuote, setNewQuote] = useState({
    client_name: '', cost_input_id: '', cost_source: 'supplier', supplier_name: '',
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
    const [quotesRes, costRes, ordersRes] = await Promise.all([
      supabase.from('quotes').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('cost_inputs').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
      supabase.from('orders').select('*').eq('project_id', projectId).order('created_at', { ascending: false }),
    ]);

    const qts = quotesRes.data || [];
    const costs = costRes.data || [];
    const ords = ordersRes.data || [];
    setQuotes(qts);
    setCostInputs(costs);
    setOrders(ords);

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
    }).select().single();
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    setShowNewCostInput(false);
    setNewCostInput({ source_type: 'supplier', source_name: '', notes: '', currency: 'USD' });
    setCostInputs((prev) => [ci, ...prev]);
    setExpandedCostInput(ci.id);
    setEditingCostInput(ci.id);
    setEditingCostItems([{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, total_cost: 0, original_price: 0, original_currency: newCostInput.currency || 'USD', item_type: '' }]);
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
      const currency = ci?.currency || next[idx].original_currency || 'USD';
      const rate = ci?.exchange_rate || exchangeRates[currency]?.rate || 1;
      const isILS = currency === 'ILS';

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
        // Back-calculate original price when cost_price is edited directly
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
      await supabase.from('cost_input_items').delete().eq('cost_input_id', costInputId);
      const valid = editingCostItems.filter((i) => i.product_name?.trim());
      if (valid.length > 0) {
        await supabase.from('cost_input_items').insert(valid.map((i, idx) => ({
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
      }
      setCostInputItems((prev) => ({ ...prev, [costInputId]: valid }));
      setEditingCostInput(null);
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setSaving(false);
    }
  }

  async function parseCostFile(fileList: FileList, costInputId: string) {
    setParsingCostFile(true);
    try {
      const filesArr: { base64: string; mimeType: string; name: string }[] = [];
      for (let i = 0; i < fileList.length; i++) {
        const file = fileList[i];
        const base64 = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result.split(',')[1]);
          };
          reader.readAsDataURL(file);
        });
        filesArr.push({ base64, mimeType: file.type, name: file.name });
      }
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: 'חלץ את כל פריטי התמחור מהקובץ המצורף. זהו קובץ תמחור/הצעת מחיר מספק צנרת GRP. חלץ: שם מוצר, קוטר DN, כמות, יחידה, מחיר ליחידה, סה"כ.',
          files: filesArr,
        }),
      });
      const data = await res.json();
      if ((data.target_table === 'supplier_quote' || data.target_table === 'cost_input_items') && Array.isArray(data.data)) {
        const qi = data.quote_info || {};
        const currency = qi.currency || data.currency || 'USD';
        const ci = costInputs.find((c) => c.id === costInputId);
        const rate = ci?.exchange_rate || exchangeRates[currency]?.rate || 1;
        const isILS = currency === 'ILS';

        const items = data.data.map((item: any) => {
          const origPrice = parseFloat(item.unit_price || item.cost_price) || 0;
          const costPrice = isILS ? origPrice : Math.round(origPrice * rate * 100) / 100;
          const qty = parseFloat(item.quantity) || 1;
          return {
            product_name: item.description || item.product_name || `${item.item_type || ''} DN${item.dn || ''}`.trim(),
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

        // Update cost input currency if different
        if (ci && ci.currency !== currency) {
          await supabase.from('cost_inputs').update({
            currency,
            exchange_rate: rate,
            exchange_rate_date: exchangeRates[currency]?.date || new Date().toISOString().split('T')[0],
          }).eq('id', costInputId);
          setCostInputs((prev) => prev.map((c) => c.id === costInputId ? { ...c, currency, exchange_rate: rate } : c));
        }

        setEditingCostItems(items);
        setEditingCostInput(costInputId);
        const sym = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : '₪';
        alert(`Roxy חילצה ${items.length} פריטים${qi.supplier_name ? ` מ-${qi.supplier_name}` : ''}${qi.quote_ref ? ` (Ref: ${qi.quote_ref})` : ''} — מטבע: ${sym}${!isILS ? ` (שער: ${rate})` : ''}.\nבדוק ולחץ שמור.`);
      } else {
        alert(data.summary || data.message || 'לא הצלחתי לחלץ פריטים מהקובץ');
      }
    } catch (err: any) {
      alert(`שגיאה: ${err.message}`);
    } finally {
      setParsingCostFile(false);
    }
  }

  // === Quote functions ===
  async function createQuote() {
    if (!newQuote.client_name.trim()) return;
    const num = `Q-${Date.now().toString(36).toUpperCase()}`;
    const disclaimer = DISCLAIMER_TEMPLATES[newQuote.disclaimer_type]?.text || '';
    const oh = newQuote.cost_source === 'internal' ? 0 : (newQuote.default_overheads_pct || 17);
    const pr = newQuote.default_profit_pct || 25;

    const { data: q, error } = await supabase.from('quotes').insert({
      project_id: projectId, quote_number: num, client_name: newQuote.client_name,
      status: 'draft', tier: newQuote.tier, cost_source: newQuote.cost_source, supplier_name: newQuote.supplier_name,
      cost_input_id: newQuote.cost_input_id || null,
      default_overheads_pct: oh,
      default_profit_pct: pr,
      payment_terms: newQuote.payment_terms, disclaimer_type: newQuote.disclaimer_type,
      disclaimer_text: disclaimer, total_amount: 0, total_cost: 0, notes: newQuote.notes,
    }).select().single();
    if (error) { alert(`שגיאה: ${error.message}`); return; }
    setShowNewQuote(false);

    // Pre-populate items from linked cost input
    const ciItems = newQuote.cost_input_id ? (costInputItems[newQuote.cost_input_id] || []) : [];
    const preItems = ciItems.length > 0
      ? ciItems.map((ci: any) => {
          const unitPrice = calcSellingPrice(parseFloat(ci.cost_price) || 0, oh, pr);
          return {
            product_name: ci.product_name, dn_size: ci.dn_size, quantity: ci.quantity, unit: ci.unit,
            cost_price: ci.cost_price, overheads_pct: oh, profit_pct: pr,
            unit_price: unitPrice, total_price: (ci.quantity || 0) * unitPrice, notes: '',
          };
        })
      : [{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, overheads_pct: oh, profit_pct: pr, unit_price: 0, total_price: 0, notes: '' }];

    setNewQuote({
      client_name: '', cost_input_id: '', cost_source: 'supplier', supplier_name: '',
      default_overheads_pct: 17, default_profit_pct: 25,
      disclaimer_type: 'grp_pipe', payment_terms: '40% מקדמה, יתרה שוטף +30', notes: '',
      tier: 'contractor_pre_tender',
    });
    setQuotes((prev) => [q, ...prev]);
    setEditingQuote(q.id);
    setEditingItems(preItems);
    setExpandedQuote(q.id);
  }

  function startEditQuote(quoteId: string) {
    const q = quotes.find((x) => x.id === quoteId);
    const items = quoteItems[quoteId] || [];
    const oh = q?.default_overheads_pct ?? 17;
    const pr = q?.default_profit_pct ?? 25;
    setEditingQuote(quoteId);
    setEditingItems(items.length > 0
      ? items.map((i) => ({ ...i }))
      : [{ product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, overheads_pct: oh, profit_pct: pr, unit_price: 0, total_price: 0, notes: '' }]
    );
  }

  function cancelEditQuote() {
    setEditingQuote(null);
  }

  function updateItem(idx: number, field: string, val: any) {
    setEditingItems((prev) => {
      const next = [...prev];
      next[idx] = { ...next[idx], [field]: val };
      if (['quantity', 'cost_price', 'overheads_pct', 'profit_pct', 'unit_price'].includes(field)) {
        const cost = parseFloat(next[idx].cost_price) || 0;
        const oh = parseFloat(next[idx].overheads_pct) || 0;
        const pr = parseFloat(next[idx].profit_pct) || 0;
        const qty = parseFloat(next[idx].quantity) || 0;
        if (field !== 'unit_price') {
          next[idx].unit_price = calcSellingPrice(cost, oh, pr);
        }
        next[idx].total_price = qty * (parseFloat(next[idx].unit_price) || 0);
      }
      return next;
    });
  }

  async function saveQuoteItems(quoteId: string) {
    setSaving(true);
    try {
      await supabase.from('quote_items').delete().eq('quote_id', quoteId);
      const valid = editingItems.filter((i) => i.product_name?.trim());
      if (valid.length > 0) {
        await supabase.from('quote_items').insert(valid.map((i, idx) => ({
          quote_id: quoteId, product_name: i.product_name, dn_size: i.dn_size || null,
          quantity: parseFloat(i.quantity) || 0, unit: i.unit || 'מטר',
          cost_price: parseFloat(i.cost_price) || 0, overheads_pct: parseFloat(i.overheads_pct) || 0,
          profit_pct: parseFloat(i.profit_pct) || 0,
          unit_price: parseFloat(i.unit_price) || 0, total_price: parseFloat(i.total_price) || 0,
          notes: i.notes || '', sort_order: idx,
        })));
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
    await supabase.from('quotes').update({ status, updated_at: new Date().toISOString() }).eq('id', quoteId);
    setQuotes((prev) => prev.map((q) => q.id === quoteId ? { ...q, status } : q));
    if (status === 'signed') {
      const q = quotes.find((x) => x.id === quoteId);
      const orderNum = `ORD-${Date.now().toString(36).toUpperCase()}`;
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
      unit_price: 0, total_price: 0, notes: '', ...defaults,
    }]);
  }

  function removeEditingItem(idx: number) {
    setEditingItems((prev) => prev.filter((_, i) => i !== idx));
  }

  function addCostItem() {
    const ci = editingCostInput ? costInputs.find((c) => c.id === editingCostInput) : null;
    setEditingCostItems((prev) => [...prev, {
      product_name: '', dn_size: '', quantity: 0, unit: 'מטר', cost_price: 0, total_cost: 0,
      original_price: 0, original_currency: ci?.currency || 'USD', item_type: '',
    }]);
  }

  function removeCostItem(idx: number) {
    setEditingCostItems((prev) => prev.filter((_, i) => i !== idx));
  }

  return {
    costInputs, quotes, orders, quoteItems, costInputItems,
    exchangeRates, rateLoading, refreshRate,
    pricingTab, setPricingTab,
    showNewCostInput, setShowNewCostInput,
    showNewQuote, setShowNewQuote,
    newCostInput, setNewCostInput,
    newQuote, setNewQuote,
    editingQuote, editingItems,
    editingCostInput, editingCostItems,
    expandedQuote, setExpandedQuote,
    expandedCostInput, setExpandedCostInput,
    parsingCostFile, saving,
    createCostInput, parseCostFile, updateCostItem, saveCostInputItems,
    startEditCostInput, cancelEditCostInput, setEditingCostItems,
    createQuote, startEditQuote, updateItem, saveQuoteItems,
    cancelEditQuote, updateQuoteStatus, deleteQuote, updateOrderStatus,
    addEditingItem, removeEditingItem, addCostItem, removeCostItem,
  };
}
