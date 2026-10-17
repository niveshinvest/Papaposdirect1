import React, { useMemo, useState } from 'react';
import { Gift, Percent, Package2, Sparkles, X, Check } from 'lucide-react';
import type { ComboRule, DiscountRule, ManualDiscountDraft, OfferRule, PromotionConfig } from '../types/promotions';

type ModalType = 'combos' | 'offers' | 'discount' | null;

export const PosPromotions: React.FC<{
  isOpen: boolean;
  mode: ModalType;
  onClose: () => void;
  combos: ComboRule[];
  offers: OfferRule[];
  discounts: DiscountRule[];
  menuItems: any[];
  cartItems: Array<{ line_id: string; name: string; category?: string; quantity: number }>;
  config: PromotionConfig;
  selectedOfferIds: string[];
  manualDiscount: ManualDiscountDraft | null;
  autoAppliedPromotionIds: string[];
  onSelectOffer: (offerId: string) => void;
  onApplyManualDiscount: (draft: ManualDiscountDraft) => void;
  onClearManualDiscount: () => void;
  onAddCombo: (combo: ComboRule, selectedItems: Record<string, string[]>) => void;
}> = ({
  isOpen,
  mode,
  onClose,
  combos,
  offers,
  discounts,
  menuItems,
  cartItems,
  config,
  selectedOfferIds,
  manualDiscount,
  autoAppliedPromotionIds,
  onSelectOffer,
  onApplyManualDiscount,
  onClearManualDiscount,
  onAddCombo,
}) => {
  const [discountScope, setDiscountScope] = useState<'ORDER' | 'ITEM'>('ORDER');
  const [discountType, setDiscountType] = useState<'FLAT' | 'PERCENTAGE'>('PERCENTAGE');
  const [discountValue, setDiscountValue] = useState('');
  const [discountReason, setDiscountReason] = useState('');
  const [selectedLineIds, setSelectedLineIds] = useState<string[]>([]);
  const [comboSelections, setComboSelections] = useState<Record<string, Record<string, string[]>>>({});

  const groupedMenu = useMemo(() => {
    return menuItems.reduce<Record<string, any[]>>((acc, item) => {
      const key = String(item.category || 'Uncategorised');
      acc[key] = [...(acc[key] || []), item];
      return acc;
    }, {});
  }, [menuItems]);

  if (!isOpen || !mode) return null;

  return (
    <div className="fixed inset-0 z-[1200] bg-slate-950/60 backdrop-blur-sm p-4 sm:p-6 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-4xl bg-white rounded-[28px] shadow-2xl border border-slate-200 overflow-hidden max-h-[92vh] flex flex-col">
        <div className="px-6 py-5 border-b border-slate-200 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.35em] text-slate-400">Promotion Center</p>
            <h3 className="text-2xl font-black text-slate-900 mt-1">
              {mode === 'combos' ? 'Combos' : mode === 'offers' ? 'Offers' : 'Apply Discount'}
            </h3>
          </div>
          <button onClick={onClose} className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          {mode === 'combos' && (
            <div className="grid md:grid-cols-2 gap-4">
              {combos.length === 0 && (
                <div className="md:col-span-2 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 font-bold">
                  No combos configured for this outlet yet.
                </div>
              )}
              {combos.map(combo => (
                <div key={combo.id} className="bg-white rounded-3xl border border-slate-200 p-5 space-y-4 shadow-sm">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-orange-500">{combo.type === 'BUILD_YOUR_OWN' ? 'Build Your Own' : 'Fixed Combo'}</p>
                      <h4 className="text-xl font-black text-slate-900 mt-1">{combo.name}</h4>
                      {combo.description && <p className="text-sm text-slate-500 mt-2">{combo.description}</p>}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Combo Price</p>
                      <p className="text-2xl font-black text-emerald-600">₹{combo.price}</p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    {combo.groups.map(group => {
                      const selection = comboSelections[combo.id]?.[group.id] || [];
                      const options = group.mode === 'FIXED'
                        ? menuItems.filter(item => group.fixed_items?.includes(item.id))
                        : menuItems.filter(item =>
                            (!group.item_filters?.length || group.item_filters.includes(item.id)) &&
                            (!group.category_filters?.length || group.category_filters.includes(String(item.category || '')))
                          );

                      return (
                        <div key={group.id} className="rounded-2xl border border-slate-200 p-4">
                          <div className="flex items-center justify-between gap-3 mb-3">
                            <div>
                              <p className="font-black text-slate-900">{group.label}</p>
                              <p className="text-xs text-slate-500">
                                {group.mode === 'FIXED' ? 'Included in combo' : `Choose ${group.required_quantity}`}
                              </p>
                            </div>
                            {selection.length > 0 && (
                              <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600">
                                {selection.length} selected
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {options.map(option => {
                              const chosen = selection.includes(option.id);
                              const disabled = group.mode === 'CHOICE' && !chosen && selection.length >= group.required_quantity;
                              return (
                                <button
                                  key={option.id}
                                  type="button"
                                  disabled={group.mode === 'FIXED' || disabled}
                                  onClick={() => {
                                    if (group.mode === 'FIXED') return;
                                    setComboSelections(prev => {
                                      const groupSelections = prev[combo.id]?.[group.id] || [];
                                      const nextGroupSelections = groupSelections.includes(option.id)
                                        ? groupSelections.filter(id => id !== option.id)
                                        : [...groupSelections, option.id];
                                      return {
                                        ...prev,
                                        [combo.id]: {
                                          ...(prev[combo.id] || {}),
                                          [group.id]: nextGroupSelections,
                                        },
                                      };
                                    });
                                  }}
                                  className={`px-3 py-2 rounded-xl border text-sm font-bold transition-colors ${
                                    chosen || group.mode === 'FIXED'
                                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                      : 'border-slate-200 bg-white text-slate-600 hover:border-orange-400'
                                  } ${disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                                >
                                  {option.name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={() => onAddCombo(combo, comboSelections[combo.id] || {})}
                    className="w-full rounded-2xl bg-slate-900 text-white py-3 font-black uppercase tracking-widest text-sm hover:bg-orange-500 transition-colors"
                  >
                    Add Combo
                  </button>
                </div>
              ))}
            </div>
          )}

          {mode === 'offers' && (
            <div className="grid md:grid-cols-2 gap-4">
              {offers.length === 0 && (
                <div className="md:col-span-2 rounded-3xl border border-dashed border-slate-300 bg-white p-8 text-center text-slate-500 font-bold">
                  No active offers right now.
                </div>
              )}
              {offers.map(offer => {
                const autoApplied = autoAppliedPromotionIds.includes(offer.id);
                const selected = selectedOfferIds.includes(offer.id);
                return (
                  <div key={offer.id} className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-indigo-500">{offer.type.replaceAll('_', ' ')}</p>
                        <h4 className="text-xl font-black text-slate-900 mt-1">{offer.name}</h4>
                        {offer.description && <p className="text-sm text-slate-500 mt-2">{offer.description}</p>}
                      </div>
                      {autoApplied ? (
                        <span className="px-3 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[10px] font-black uppercase tracking-widest">
                          Auto Applied
                        </span>
                      ) : null}
                    </div>

                    <div className="mt-5 flex items-center justify-between gap-4">
                      <div className="text-xs text-slate-500">
                        {offer.auto_apply ? 'Applies automatically when eligible.' : 'Tap once to keep it available for this bill.'}
                      </div>
                      <button
                        type="button"
                        disabled={offer.auto_apply}
                        onClick={() => onSelectOffer(offer.id)}
                        className={`px-4 py-2 rounded-xl text-[11px] font-black uppercase tracking-widest transition-colors ${
                          selected
                            ? 'bg-orange-500 text-white'
                            : 'bg-slate-900 text-white hover:bg-orange-500'
                        } ${offer.auto_apply ? 'opacity-40 cursor-default' : ''}`}
                      >
                        {selected ? 'Applied' : 'Apply'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {mode === 'discount' && (
            <div className="grid lg:grid-cols-[1.3fr_1fr] gap-6">
              <div className="bg-white rounded-3xl border border-slate-200 p-6 space-y-5 shadow-sm">
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDiscountScope('ORDER')}
                    className={`rounded-2xl border px-4 py-4 text-left ${discountScope === 'ORDER' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}
                  >
                    <p className="font-black text-slate-900">Order Discount</p>
                    <p className="text-xs text-slate-500 mt-1">Apply on the full bill.</p>
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountScope('ITEM')}
                    className={`rounded-2xl border px-4 py-4 text-left ${discountScope === 'ITEM' ? 'border-orange-500 bg-orange-50' : 'border-slate-200 bg-white'}`}
                  >
                    <p className="font-black text-slate-900">Item Discount</p>
                    <p className="text-xs text-slate-500 mt-1">Apply only to selected lines.</p>
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {config.allowed_manual_discount_types.map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setDiscountType(type)}
                      className={`rounded-2xl border px-4 py-3 font-black uppercase tracking-widest text-xs ${discountType === type ? 'border-indigo-500 bg-indigo-50 text-indigo-700' : 'border-slate-200 text-slate-600'}`}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Value</label>
                  <input
                    value={discountValue}
                    onChange={event => setDiscountValue(event.target.value)}
                    placeholder={discountType === 'PERCENTAGE' ? `Max ${config.max_manual_discount_percent}%` : 'Enter amount'}
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-lg font-black outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Reason</label>
                  <input
                    value={discountReason}
                    onChange={event => setDiscountReason(event.target.value)}
                    placeholder="Manager approved"
                    className="mt-2 w-full rounded-2xl border border-slate-200 px-4 py-4 text-sm font-bold outline-none focus:border-orange-500"
                  />
                </div>

                {discountScope === 'ITEM' && (
                  <div>
                    <label className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Select Items</label>
                    <div className="mt-3 space-y-2">
                      {cartItems.map(line => (
                        <button
                          key={line.line_id}
                          type="button"
                          onClick={() => setSelectedLineIds(prev => prev.includes(line.line_id) ? prev.filter(id => id !== line.line_id) : [...prev, line.line_id])}
                          className={`w-full rounded-2xl border px-4 py-3 flex items-center justify-between text-left ${
                            selectedLineIds.includes(line.line_id) ? 'border-emerald-500 bg-emerald-50' : 'border-slate-200 bg-white'
                          }`}
                        >
                          <div>
                            <p className="font-black text-slate-900">{line.name}</p>
                            <p className="text-xs text-slate-500">{line.category || 'Menu'} • Qty {line.quantity}</p>
                          </div>
                          {selectedLineIds.includes(line.line_id) && <Check size={18} className="text-emerald-600" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      const value = Number(discountValue);
                      if (!Number.isFinite(value) || value <= 0) return;
                      const boundedValue = discountType === 'PERCENTAGE'
                        ? Math.min(value, config.max_manual_discount_percent)
                        : value;
                      onApplyManualDiscount({
                        scope: discountScope,
                        value_type: discountType,
                        value: boundedValue,
                        line_ids: discountScope === 'ITEM' ? selectedLineIds : undefined,
                        reason: discountReason || 'Manual Discount',
                      });
                      onClose();
                    }}
                    className="flex-1 rounded-2xl bg-slate-900 text-white py-4 font-black uppercase tracking-widest text-sm hover:bg-orange-500 transition-colors"
                  >
                    Apply
                  </button>
                  {manualDiscount && (
                    <button
                      type="button"
                      onClick={() => {
                        onClearManualDiscount();
                        onClose();
                      }}
                      className="rounded-2xl border border-slate-200 px-5 py-4 font-black uppercase tracking-widest text-sm text-slate-600"
                    >
                      Clear
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Rules</p>
                  <div className="space-y-3 mt-4 text-sm text-slate-600">
                    <p>Manual discounts respect the chain cap and are distributed before tax calculation.</p>
                    <p>Best order-level discount wins automatically to avoid double-discount drift.</p>
                    <p>Category and item discounts stay active in the background when configured.</p>
                  </div>
                </div>

                <div className="bg-white rounded-3xl border border-slate-200 p-5 shadow-sm">
                  <p className="text-[11px] font-black uppercase tracking-[0.25em] text-slate-400">Active Discount Catalog</p>
                  <div className="space-y-3 mt-4">
                    {discounts.length === 0 && <p className="text-sm text-slate-500">No active discount rules configured.</p>}
                    {discounts.map(rule => (
                      <div key={rule.id} className="rounded-2xl border border-slate-200 px-4 py-3">
                        <p className="font-black text-slate-900">{rule.name}</p>
                        <p className="text-xs text-slate-500 mt-1">{rule.scope} • {rule.value_type} • {rule.value}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-200 bg-white flex items-center justify-between">
          <div className="flex items-center gap-3 text-slate-500 text-sm">
            {mode === 'combos' && <Package2 size={18} />}
            {mode === 'offers' && <Gift size={18} />}
            {mode === 'discount' && <Percent size={18} />}
            <span className="font-bold">
              {mode === 'combos' ? 'Designed for 1-click upsell at checkout.' : mode === 'offers' ? 'Best auto-offers stay visible here.' : 'Manual override stays permission-aware.'}
            </span>
          </div>
          <div className="hidden sm:flex items-center gap-2 text-emerald-600 font-black text-sm">
            <Sparkles size={16} />
            Fast billing safe
          </div>
        </div>
      </div>
    </div>
  );
};

export const PromotionActionBar: React.FC<{
  savingsTotal: number;
  appliedCount: number;
  onOpen: (mode: ModalType) => void;
}> = ({ savingsTotal, appliedCount, onOpen }) => {
  const showStats = savingsTotal > 0 || appliedCount > 0;

  return (
    <div className="rounded-[26px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
    <div className="flex flex-wrap items-center gap-2">
      <button onClick={() => onOpen('combos')} className="px-4 py-2 rounded-2xl bg-slate-900 text-white text-[11px] font-black uppercase tracking-widest hover:bg-orange-500 transition-colors">
        Combos
      </button>
      <button onClick={() => onOpen('offers')} className="px-4 py-2 rounded-2xl bg-indigo-50 text-indigo-700 text-[11px] font-black uppercase tracking-widest hover:bg-indigo-100 transition-colors">
        Offers
      </button>
      <button onClick={() => onOpen('discount')} className="px-4 py-2 rounded-2xl bg-emerald-50 text-emerald-700 text-[11px] font-black uppercase tracking-widest hover:bg-emerald-100 transition-colors">
        Discount
      </button>
    </div>
    {showStats && (
      <div className="mt-3 flex items-center justify-between gap-4">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Live Savings</p>
        <p className="text-lg font-black text-emerald-600">You Saved ₹{savingsTotal.toFixed(2)}</p>
      </div>
      <div className="text-right">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Applied</p>
        <p className="text-lg font-black text-slate-900">{appliedCount}</p>
      </div>
      </div>
    )}
    </div>
  );
};
