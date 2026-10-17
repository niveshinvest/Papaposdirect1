import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Gift, Loader2, Package2, Percent, Plus, Save, Settings2, Trash2 } from 'lucide-react';
import type { MenuItem, Outlet } from '../types';
import type { ComboGroup, ComboRule, DiscountRule, OfferRule, PromotionConfig, PromotionWindow } from '../types/promotions';
import { menuService } from '../services/supabaseService';
import { promotionService } from '../services/promotionService';

const DEFAULT_CONFIG: PromotionConfig = {
  max_manual_discount_percent: 20,
  allowed_manual_discount_types: ['FLAT', 'PERCENTAGE'],
  allow_cashier_manual_discount: false,
};

const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const DAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
] as const;

const toInputDate = (value: Date) => {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const defaultWindow = (): PromotionWindow => ({
  start_date: toInputDate(new Date()),
  end_date: toInputDate(new Date(new Date().setMonth(new Date().getMonth() + 1))),
  start_time: '00:00',
  end_time: '23:59',
  days_of_week: [...ALL_DAYS],
});

const hasValidWindow = (window?: PromotionWindow | null) => Boolean(
  window?.start_date &&
  window?.end_date &&
  window?.start_time &&
  window?.end_time &&
  window?.days_of_week?.length
);

const emptyDiscount = (): Partial<DiscountRule> => ({
  ...defaultWindow(),
  name: '',
  scope: 'ORDER',
  value_type: 'PERCENTAGE',
  value: 10,
  auto_apply: true,
  is_active: true,
  priority: 200,
  category_filters: [],
  item_filters: [],
});

const emptyOffer = (): Partial<OfferRule> => ({
  ...defaultWindow(),
  name: '',
  type: 'BOGO',
  auto_apply: true,
  is_active: true,
  priority: 300,
  conditions: { buy_quantity: 1, reward_quantity: 1, category_filters: [], item_filters: [] },
  rewards: { discount_type: 'FREE', discount_value: 100, category_filters: [], item_filters: [] },
});

const emptyComboGroup = (): ComboGroup => ({
  id: crypto.randomUUID(),
  label: '',
  mode: 'CHOICE',
  required_quantity: 1,
  category_filters: [],
  item_filters: [],
  fixed_items: [],
});

const emptyCombo = (): Partial<ComboRule> => ({
  ...defaultWindow(),
  name: '',
  type: 'FIXED',
  price: 0,
  auto_apply: false,
  is_active: true,
  priority: 400,
  groups: [emptyComboGroup()],
});

const toggleArrayValue = (values: string[] | null | undefined, nextValue: string) => {
  const current = values || [];
  return current.includes(nextValue)
    ? current.filter(value => value !== nextValue)
    : [...current, nextValue];
};

const ScheduleFields: React.FC<{
  value: PromotionWindow;
  onChange: (next: PromotionWindow) => void;
}> = ({ value, onChange }) => (
  <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Schedule</p>
      <p className="text-xs text-slate-500">Every promotion needs date and time criteria.</p>
    </div>
    <div className="grid grid-cols-2 gap-3">
      <input
        type="date"
        value={value.start_date || ''}
        onChange={e => onChange({ ...value, start_date: e.target.value })}
        className="px-4 py-3 rounded-2xl bg-white border border-slate-200 font-bold outline-none"
      />
      <input
        type="date"
        value={value.end_date || ''}
        onChange={e => onChange({ ...value, end_date: e.target.value })}
        className="px-4 py-3 rounded-2xl bg-white border border-slate-200 font-bold outline-none"
      />
    </div>
    <div className="grid grid-cols-2 gap-3">
      <input
        type="time"
        value={value.start_time || ''}
        onChange={e => onChange({ ...value, start_time: e.target.value })}
        className="px-4 py-3 rounded-2xl bg-white border border-slate-200 font-bold outline-none"
      />
      <input
        type="time"
        value={value.end_time || ''}
        onChange={e => onChange({ ...value, end_time: e.target.value })}
        className="px-4 py-3 rounded-2xl bg-white border border-slate-200 font-bold outline-none"
      />
    </div>
    <div className="flex flex-wrap gap-2">
      {DAY_OPTIONS.map(day => {
        const selected = value.days_of_week?.includes(day.value) ?? false;
        return (
          <button
            key={day.value}
            type="button"
            onClick={() => onChange({
              ...value,
              days_of_week: selected
                ? (value.days_of_week || []).filter(entry => entry !== day.value)
                : [...(value.days_of_week || []), day.value].sort(),
            })}
            className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-white text-slate-500'}`}
          >
            {day.label}
          </button>
        );
      })}
    </div>
  </div>
);

const TargetPicker: React.FC<{
  title: string;
  itemFilters?: string[] | null;
  categoryFilters?: string[] | null;
  menuItems: MenuItem[];
  categories: Array<{ id: string; name: string }>;
  onChange: (next: { item_filters: string[]; category_filters: string[] }) => void;
}> = ({ title, itemFilters, categoryFilters, menuItems, categories, onChange }) => (
  <div className="space-y-3 rounded-3xl border border-slate-200 bg-slate-50 p-4">
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{title}</p>
      <p className="text-xs text-slate-500">Choose categories and items this promotion should apply to.</p>
    </div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Categories</p>
      <div className="flex flex-wrap gap-2">
        {categories.map(category => {
          const selected = categoryFilters?.includes(category.name) ?? false;
          return (
            <button
              key={category.id}
              type="button"
              onClick={() => onChange({
                item_filters: itemFilters || [],
                category_filters: toggleArrayValue(categoryFilters, category.name),
              })}
              className={`px-3 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${selected ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 bg-white text-slate-500'}`}
            >
              {category.name}
            </button>
          );
        })}
      </div>
    </div>
    <div>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Items</p>
      <div className="max-h-36 overflow-y-auto rounded-2xl border border-slate-200 bg-white p-2">
        <div className="flex flex-wrap gap-2">
          {menuItems.map(item => {
            const selected = itemFilters?.includes(item.id) ?? false;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => onChange({
                  item_filters: toggleArrayValue(itemFilters, item.id),
                  category_filters: categoryFilters || [],
                })}
                className={`px-3 py-2 rounded-2xl text-[10px] font-black border ${selected ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}
              >
                {item.name}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  </div>
);

const PromotionStudio: React.FC<{ activeOutlet?: Outlet | null }> = ({ activeOutlet }) => {
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [discounts, setDiscounts] = useState<DiscountRule[]>([]);
  const [offers, setOffers] = useState<OfferRule[]>([]);
  const [combos, setCombos] = useState<ComboRule[]>([]);
  const [config, setConfig] = useState<PromotionConfig>(DEFAULT_CONFIG);
  const [discountDraft, setDiscountDraft] = useState<Partial<DiscountRule>>(emptyDiscount());
  const [offerDraft, setOfferDraft] = useState<Partial<OfferRule>>(emptyOffer());
  const [comboDraft, setComboDraft] = useState<Partial<ComboRule>>(emptyCombo());
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);

  const loadAll = async () => {
    if (!activeOutlet?.id) return;
    setLoading(true);
    try {
      const [payload, categoryData, itemData] = await Promise.all([
        promotionService.loadActivePromotions(activeOutlet.id),
        menuService.fetchCategories(activeOutlet.id),
        menuService.fetchItems(activeOutlet.id),
      ]);
      setDiscounts(payload.discounts);
      setOffers(payload.offers);
      setCombos(payload.combos);
      setConfig(payload.config);
      setCategories((categoryData || []).map((category: any) => ({ id: category.id, name: category.name })));
      setMenuItems((itemData || []).map((item: any) => ({
        ...item,
        category: item.menu_categories?.name || item.category,
      })));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, [activeOutlet?.id]);

  const outletGuard = useMemo(() => Boolean(activeOutlet?.id), [activeOutlet?.id]);

  const hasBuyTarget =
  (offerDraft.conditions?.item_filters?.length || 0) > 0 ||
  (offerDraft.conditions?.category_filters?.length || 0) > 0;

const hasRewardTarget =
  (offerDraft.rewards?.item_filters?.length || 0) > 0 ||
  (offerDraft.rewards?.category_filters?.length || 0) > 0;


  const saveDiscount = async () => {
    if (!activeOutlet?.id || !discountDraft.name || !hasValidWindow(discountDraft)) return;
    setSaving(true);
    try {
      await promotionService.saveDiscount({ ...discountDraft, outlet_id: activeOutlet.id } as any);
      setDiscountDraft(emptyDiscount());
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const saveOffer = async () => {
    if (
  (!offerDraft.rewards?.item_filters?.length &&
   !offerDraft.rewards?.category_filters?.length)
) {
  alert("Select at least one reward item/category");
  return;
}
    if (!activeOutlet?.id || !offerDraft.name || !offerDraft.type || !hasValidWindow(offerDraft)) return;
    setSaving(true);
    try {
      await promotionService.saveOffer({ ...offerDraft, outlet_id: activeOutlet.id } as any);
      setOfferDraft(emptyOffer());
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const saveCombo = async () => {
    if (!activeOutlet?.id || !comboDraft.name || !hasValidWindow(comboDraft)) return;
    setSaving(true);
    try {
      await promotionService.saveCombo({ ...comboDraft, outlet_id: activeOutlet.id } as any);
      setComboDraft(emptyCombo());
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const deleteRule = async (table: 'discounts' | 'offers' | 'combos', id: string) => {
    if (!confirm('Remove this promotion rule?')) return;
    setSaving(true);
    try {
      await promotionService.deleteRule(table, id);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  const saveConfig = async () => {
    if (!activeOutlet?.id) return;
    setSaving(true);
    try {
      await promotionService.saveConfig(activeOutlet.id, config);
      await loadAll();
    } finally {
      setSaving(false);
    }
  };

  if (!outletGuard) {
    return (
      <div className="bg-white p-16 rounded-[40px] border border-slate-100 text-center text-slate-500 font-bold">
        Select an outlet to manage outlet-wise discounts, offers, and combos.
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div className="grid lg:grid-cols-[1.2fr_1fr] gap-6">
        <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-3 rounded-2xl bg-orange-100 text-orange-600"><Settings2 size={18} /></div>
            <div>
              <h3 className="text-xl font-black text-slate-900">Promotion Policy</h3>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Manager guardrails</p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-5">
            <div>
              <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Max Manual Discount %</label>
              <input
                type="number"
                value={config.max_manual_discount_percent}
                onChange={e => setConfig(prev => ({ ...prev, max_manual_discount_percent: Number(e.target.value) || 0 }))}
                className="mt-2 w-full px-5 py-4 rounded-2xl bg-slate-50 font-bold outline-none border border-slate-200"
              />
            </div>
            <div className="flex items-center justify-between rounded-3xl border border-slate-200 bg-slate-50 px-5 py-4 mt-5 md:mt-0">
              <div>
                <p className="font-black text-slate-900">Cashier Manual Discount</p>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Allow 1-click override</p>
              </div>
              <button
                type="button"
                onClick={() => setConfig(prev => ({ ...prev, allow_cashier_manual_discount: !prev.allow_cashier_manual_discount }))}
                className={`w-14 h-7 rounded-full relative transition-all ${config.allow_cashier_manual_discount ? 'bg-emerald-600' : 'bg-slate-300'}`}
              >
                <span className={`absolute top-1 h-5 w-5 rounded-full bg-white transition-all ${config.allow_cashier_manual_discount ? 'right-1' : 'left-1'}`} />
              </button>
            </div>
          </div>

          <div className="mt-5 flex gap-3">
            {(['FLAT', 'PERCENTAGE'] as const).map(type => (
              <button
                key={type}
                type="button"
                onClick={() => setConfig(prev => ({
                  ...prev,
                  allowed_manual_discount_types: prev.allowed_manual_discount_types.includes(type)
                    ? prev.allowed_manual_discount_types.filter(item => item !== type)
                    : [...prev.allowed_manual_discount_types, type],
                }))}
                className={`px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest border ${config.allowed_manual_discount_types.includes(type) ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-500'}`}
              >
                {type}
              </button>
            ))}
          </div>

          <button onClick={saveConfig} disabled={saving} className="mt-6 px-6 py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs flex items-center gap-2">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Save size={16} />}
            Save Policy
          </button>
        </div>

        <div className="bg-slate-900 p-8 rounded-[40px] text-white shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-[0.3em] text-slate-500">Live Setup</p>
          <div className="grid grid-cols-3 gap-4 mt-6">
            <div><p className="text-3xl font-black">{discounts.length}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Discounts</p></div>
            <div><p className="text-3xl font-black">{offers.length}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Offers</p></div>
            <div><p className="text-3xl font-black">{combos.length}</p><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Combos</p></div>
          </div>
          <div className="mt-8 space-y-3 text-sm text-slate-300">
            <p>Manual discount wins first, then combo, then BOGO, then auto discounts.</p>
            <p>Billing uses outlet-local cache so staff still get offers in offline mode.</p>
            <p>Every promotion is stored back into invoice snapshots for future reporting.</p>
          </div>
        </div>
      </div>

      <div className="grid xl:grid-cols-3 gap-6">
        <section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-600"><Percent size={18} /></div>
            <div><h4 className="font-black text-slate-900">Discounts</h4><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Order, item, category</p></div>
          </div>
          <input value={discountDraft.name || ''} onChange={e => setDiscountDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="10% Off Entire Order" className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={discountDraft.scope} onChange={e => setDiscountDraft(prev => ({ ...prev, scope: e.target.value as any }))} className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none">
              <option value="ORDER">Order</option>
              <option value="ITEM">Item</option>
              <option value="CATEGORY">Category</option>
            </select>
            <select value={discountDraft.value_type} onChange={e => setDiscountDraft(prev => ({ ...prev, value_type: e.target.value as any }))} className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none">
              <option value="PERCENTAGE">Percentage</option>
              <option value="FLAT">Flat</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <input type="number" value={discountDraft.value || 0} onChange={e => setDiscountDraft(prev => ({ ...prev, value: Number(e.target.value) || 0 }))} placeholder="Value" className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none" />
            <input type="number" value={discountDraft.min_order_amount || 0} onChange={e => setDiscountDraft(prev => ({ ...prev, min_order_amount: Number(e.target.value) || 0 }))} placeholder="Min bill" className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none" />
          </div>
          {discountDraft.scope !== 'ORDER' && (
            <TargetPicker
              title="Discount Targets"
              itemFilters={discountDraft.item_filters}
              categoryFilters={discountDraft.category_filters}
              menuItems={menuItems}
              categories={categories}
              onChange={next => setDiscountDraft(prev => ({ ...prev, item_filters: next.item_filters, category_filters: next.category_filters }))}
            />
          )}
          <ScheduleFields value={discountDraft} onChange={next => setDiscountDraft(prev => ({ ...prev, ...next }))} />
          <button onClick={saveDiscount} disabled={saving || loading || !hasValidWindow(discountDraft)} className="w-full py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
            Save Discount
          </button>
          <div className="space-y-3">
            {discounts.map(rule => (
              <div key={rule.id} className="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
                <div><p className="font-black text-slate-900">{rule.name}</p><p className="text-xs text-slate-500">{rule.scope} • {rule.value_type} • {rule.value}</p></div>
                <button onClick={() => deleteRule('discounts', rule.id)} className="text-rose-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>

        {/* ======================= OFFERS PRO ======================= */}
<section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-5">

  <div className="flex items-center gap-3">
    <div className="p-3 rounded-2xl bg-indigo-100 text-indigo-600">
      <Gift size={18} />
    </div>
    <div>
      <h4 className="font-black text-slate-900">Offers Pro</h4>
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
        Buy X Get Y • Smart Upsell Engine
      </p>
    </div>
  </div>

  {/* NAME */}
  <input
    value={offerDraft.name || ''}
    onChange={e => setOfferDraft(prev => ({ ...prev, name: e.target.value }))}
    placeholder="Buy Burger → Cooler ₹6 OFF"
    className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none"
  />

  {/* TYPE + BUY QTY */}
  <div className="grid grid-cols-2 gap-3">
    <select
      value={offerDraft.type}
      onChange={e => setOfferDraft(prev => ({ ...prev, type: e.target.value as any }))}
      className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold"
    >
      <option value="BUY_X_GET_Y">Buy X Get Y</option>
      <option value="BOGO">BOGO</option>
      <option value="FREE_ADDON">Free Add-on</option>
      <option value="PERCENTAGE">Percentage</option>
      <option value="FLAT">Flat</option>
    </select>

    <input
      type="number"
      value={offerDraft.conditions?.buy_quantity || 1}
      onChange={e =>
        setOfferDraft(prev => ({
          ...prev,
          conditions: {
            ...prev.conditions,
            buy_quantity: Number(e.target.value) || 1,
          },
        }))
      }
      className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold"
      placeholder="Buy Qty"
    />
  </div>

  {/* REWARD QTY */}
  {(offerDraft.type === 'BUY_X_GET_Y' || offerDraft.type === 'BOGO') && (
    <input
      type="number"
      value={offerDraft.conditions?.reward_quantity || 1}
      onChange={e =>
        setOfferDraft(prev => ({
          ...prev,
          conditions: {
            ...prev.conditions,
            reward_quantity: Number(e.target.value) || 1,
          },
        }))
      }
      className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold"
      placeholder="Reward Qty"
    />
  )}

  {/* TRIGGER */}
  <TargetPicker
    title="Trigger (BUY)"
    itemFilters={offerDraft.conditions?.item_filters}
    categoryFilters={offerDraft.conditions?.category_filters}
    menuItems={menuItems}
    categories={categories}
    onChange={next =>
      setOfferDraft(prev => ({
        ...prev,
        conditions: {
          ...prev.conditions,
          item_filters: next.item_filters,
          category_filters: next.category_filters,
        },
      }))
    }
  />

  {/* REWARD */}
  <TargetPicker
    title="Reward (GET)"
    itemFilters={offerDraft.rewards?.item_filters}
    categoryFilters={offerDraft.rewards?.category_filters}
    menuItems={menuItems}
    categories={categories}
    onChange={next =>
      setOfferDraft(prev => ({
        ...prev,
        rewards: {
          ...prev.rewards,
          item_filters: next.item_filters,
          category_filters: next.category_filters,
        },
      }))
    }
  />

  {/* 🔥 REWARD PRICING (CORE FIX) */}
  <div className="grid grid-cols-2 gap-3">
    <select
      value={offerDraft.rewards?.discount_type || 'FREE'}
      onChange={e =>
        setOfferDraft(prev => ({
          ...prev,
          rewards: {
            ...prev.rewards,
            discount_type: e.target.value as any,
          },
        }))
      }
      className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold"
    >
      <option value="FREE">Free</option>
      <option value="FLAT">₹ Off</option>
      <option value="PERCENTAGE">% Off</option>
    </select>

    <input
      type="number"
      value={offerDraft.rewards?.discount_value || 0}
      onChange={e =>
        setOfferDraft(prev => ({
          ...prev,
          rewards: {
            ...prev.rewards,
            discount_value: Number(e.target.value) || 0,
          },
        }))
      }
      disabled={offerDraft.rewards?.discount_type === 'FREE'}
      placeholder="Value"
      className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold disabled:opacity-40"
    />
  </div>

  {/* 🧠 LIVE PREVIEW (ENTERPRISE UX) */}
  <div className="p-4 rounded-2xl bg-slate-900 text-white text-sm font-bold">
    {offerDraft.name || 'Offer Preview'}
    <div className="text-xs text-slate-400 mt-1">
      Buy {offerDraft.conditions?.buy_quantity || 1} → Get {offerDraft.conditions?.reward_quantity || 1}{' '}
      {offerDraft.rewards?.discount_type === 'FREE'
        ? 'FREE'
        : offerDraft.rewards?.discount_type === 'FLAT'
        ? `₹${offerDraft.rewards?.discount_value || 0} OFF`
        : `${offerDraft.rewards?.discount_value || 0}% OFF`}
    </div>
  </div>

  <ScheduleFields
    value={offerDraft}
    onChange={next => setOfferDraft(prev => ({ ...prev, ...next }))}
  />

  {/* 🚫 VALIDATION */}
    <button
  onClick={saveOffer}
  disabled={
    saving ||
    loading ||
    !hasValidWindow(offerDraft) ||
    !hasBuyTarget ||
    !hasRewardTarget
  }
    className="w-full py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-40"
  >
    {saving ? <Loader2 className="animate-spin" size={16} /> : <Plus size={16} />}
    Save Offer
  </button>

</section>

        <section className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-sm space-y-5">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-2xl bg-orange-100 text-orange-600"><Package2 size={18} /></div>
            <div><h4 className="font-black text-slate-900">Combos</h4><p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fixed and build-your-own</p></div>
          </div>
          <input value={comboDraft.name || ''} onChange={e => setComboDraft(prev => ({ ...prev, name: e.target.value }))} placeholder="Burger + Fries + Coke" className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none" />
          <div className="grid grid-cols-2 gap-3">
            <select value={comboDraft.type} onChange={e => setComboDraft(prev => ({ ...prev, type: e.target.value as any }))} className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none">
              <option value="FIXED">Fixed</option>
              <option value="BUILD_YOUR_OWN">Build Your Own</option>
            </select>
            <input type="number" value={comboDraft.price || 0} onChange={e => setComboDraft(prev => ({ ...prev, price: Number(e.target.value) || 0 }))} placeholder="Combo price" className="px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 font-bold outline-none" />
          </div>
          <div className="space-y-3">
            {(comboDraft.groups || []).map((group, index) => (
              <div key={group.id} className="rounded-2xl border border-slate-200 p-3 space-y-2">
                <input value={group.label} onChange={e => setComboDraft(prev => ({ ...prev, groups: (prev.groups || []).map((entry, entryIndex) => entryIndex === index ? { ...entry, label: e.target.value } : entry) }))} placeholder="Choose Drink" className="w-full px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold outline-none" />
                <div className="grid grid-cols-2 gap-2">
                  <select value={group.mode} onChange={e => setComboDraft(prev => ({ ...prev, groups: (prev.groups || []).map((entry, entryIndex) => entryIndex === index ? { ...entry, mode: e.target.value as any } : entry) }))} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold outline-none">
                    <option value="CHOICE">Choice</option>
                    <option value="FIXED">Fixed</option>
                  </select>
                  <input type="number" value={group.required_quantity} onChange={e => setComboDraft(prev => ({ ...prev, groups: (prev.groups || []).map((entry, entryIndex) => entryIndex === index ? { ...entry, required_quantity: Number(e.target.value) || 1 } : entry) }))} className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 font-bold outline-none" />
                </div>
                <TargetPicker
                  title={group.mode === 'FIXED' ? 'Fixed Combo Items' : 'Allowed Choice Items'}
                  itemFilters={group.mode === 'FIXED' ? group.fixed_items : group.item_filters}
                  categoryFilters={group.category_filters}
                  menuItems={menuItems}
                  categories={categories}
                  onChange={next => setComboDraft(prev => ({
                    ...prev,
                    groups: (prev.groups || []).map((entry, entryIndex) => entryIndex === index ? {
                      ...entry,
                      item_filters: group.mode === 'FIXED' ? [] : next.item_filters,
                      fixed_items: group.mode === 'FIXED' ? next.item_filters : (entry.fixed_items || []),
                      category_filters: next.category_filters,
                    } : entry),
                  }))}
                />
              </div>
            ))}
          </div>
          <ScheduleFields value={comboDraft} onChange={next => setComboDraft(prev => ({ ...prev, ...next }))} />
          <button onClick={() => setComboDraft(prev => ({ ...prev, groups: [...(prev.groups || []), emptyComboGroup()] }))} className="w-full py-3 rounded-2xl border border-dashed border-slate-300 text-slate-600 font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2">
            <Plus size={16} />
            Add Combo Group
          </button>
          <button onClick={saveCombo} disabled={saving || loading || !hasValidWindow(comboDraft)} className="w-full py-3 rounded-2xl bg-slate-900 text-white font-black uppercase tracking-widest text-xs flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed">
            {saving ? <Loader2 className="animate-spin" size={16} /> : <CheckCircle2 size={16} />}
            Save Combo
          </button>
          <div className="space-y-3">
            {combos.map(rule => (
              <div key={rule.id} className="rounded-2xl border border-slate-200 p-4 flex items-start justify-between gap-3">
                <div><p className="font-black text-slate-900">{rule.name}</p><p className="text-xs text-slate-500">₹{rule.price} • {rule.groups?.length || 0} groups</p></div>
                <button onClick={() => deleteRule('combos', rule.id)} className="text-rose-500"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default PromotionStudio;
