import { salesService } from './salesService';
import type {
  AppliedPromotionSummary,
  ComboRule,
  DiscountRule,
  ManualDiscountDraft,
  OfferRule,
  PosPromotionLineRef,
  PromotionLinePricing,
  PromotionPricingResult,
} from '../types/promotions';

const PRIORITY = {
  MANUAL: 500,
  COMBO: 400,
  BOGO: 300,
  AUTO_DISCOUNT: 200,
  CATEGORY: 100,
} as const;

const round2 = (value: number) => Number((Number.isFinite(value) ? value : 0).toFixed(2));
const clamp = (value: number, min = 0, max = Number.POSITIVE_INFINITY) => Math.min(Math.max(value, min), max);

function toMinutes(value?: string | null) {
  if (!value) return null;
  const [hours, minutes] = value.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return null;
  return hours * 60 + minutes;
}

function isWindowActive(rule: { is_active?: boolean; start_date?: string | null; end_date?: string | null; start_time?: string | null; end_time?: string | null; days_of_week?: number[] | null }, now: Date) {
  if (rule.is_active === false) return false;
  const currentDay = now.getDay();
  if (rule.days_of_week?.length && !rule.days_of_week.includes(currentDay)) return false;

  const today = new Date(now.toISOString().slice(0, 10));
  if (rule.start_date) {
    const start = new Date(rule.start_date);
    if (today < start) return false;
  }
  if (rule.end_date) {
    const end = new Date(rule.end_date);
    if (today > end) return false;
  }

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = toMinutes(rule.start_time);
  const endMinutes = toMinutes(rule.end_time);
  if (startMinutes !== null && endMinutes !== null) {
    if (startMinutes <= endMinutes) {
      if (currentMinutes < startMinutes || currentMinutes > endMinutes) return false;
    } else if (!(currentMinutes >= startMinutes || currentMinutes <= endMinutes)) {
      return false;
    }
  }

  return true;
}

function isLineEligible(line: PosPromotionLineRef, filters?: { item_filters?: string[] | null; category_filters?: string[] | null }) {
  const itemMatch = !filters?.item_filters?.length || filters.item_filters.includes(line.item_id);
  const categoryMatch = !filters?.category_filters?.length || filters.category_filters.includes(String(line.category || ''));
  return itemMatch && categoryMatch;
}

function getLineBaseAmount(line: PosPromotionLineRef) {
  const modifierTotal = (line.selected_modifiers || []).reduce((sum, mod) => sum + Number(mod.price || 0), 0);
  return round2((Number(line.unit_price || 0) + modifierTotal) * Number(line.quantity || 0));
}

function pickDiscountValue(baseAmount: number, valueType: 'FLAT' | 'PERCENTAGE', value: number, maxDiscountAmount?: number | null) {
  const raw = valueType === 'PERCENTAGE' ? (baseAmount * value) / 100 : value;
  const capped = maxDiscountAmount ? Math.min(raw, maxDiscountAmount) : raw;
  return round2(clamp(capped, 0, baseAmount));
}

export function calculatePromotionPricing(params: {
  cart: PosPromotionLineRef[];
  discounts: DiscountRule[];
  offers: OfferRule[];
  combos: ComboRule[];
  manualDiscount: ManualDiscountDraft | null;
  selectedOfferIds: string[];
  outletState: string;
  destState: string;
  gstRegistered: boolean;
  now?: Date;
}): PromotionPricingResult {
  const now = params.now || new Date();
  const cart = params.cart.filter(line => line.quantity > 0);
  const activeDiscounts = params.discounts.filter(rule => isWindowActive(rule, now));
  const activeOffers = params.offers.filter(rule => isWindowActive(rule, now) && (rule.auto_apply || params.selectedOfferIds.includes(rule.id)));
  const activeCombos = params.combos.filter(rule => isWindowActive(rule, now));
  const subtotalBeforeDiscount = round2(cart.reduce((sum, line) => sum + getLineBaseAmount(line), 0));

  const lineDiscounts = new Map<string, number>();
  const linePromotionBuckets = new Map<string, AppliedPromotionSummary[]>();
  const linePriority = new Map<string, number>();
  const appliedPromotions: AppliedPromotionSummary[] = [];

  const addLinePromotion = (summary: AppliedPromotionSummary, allocation: Record<string, number>) => {
    let appliedAmount = 0;

    Object.entries(allocation).forEach(([lineId, amount]) => {
      const safeAmount = round2(amount);
      if (safeAmount <= 0) return;

      const existingBase = getLineBaseAmount(cart.find(line => line.line_id === lineId)!);
      const usedDiscount = lineDiscounts.get(lineId) || 0;
      const priority = linePriority.get(lineId) || 0;
      if (summary.priority < priority) return;

      const allowedAmount = clamp(safeAmount, 0, existingBase - usedDiscount);
      if (allowedAmount <= 0) return;

      if (summary.priority > priority) {
        lineDiscounts.set(lineId, 0);
        linePromotionBuckets.set(lineId, []);
      }

      linePriority.set(lineId, summary.priority);
      lineDiscounts.set(lineId, round2((lineDiscounts.get(lineId) || 0) + allowedAmount));
      linePromotionBuckets.set(lineId, [...(linePromotionBuckets.get(lineId) || []), { ...summary, amount: allowedAmount, affected_line_ids: [lineId] }]);
      appliedAmount += allowedAmount;
    });

    if (appliedAmount > 0) {
      appliedPromotions.push({ ...summary, amount: round2(appliedAmount) });
    }
  };

  const allocateAcrossLines = (lineIds: string[], totalAmount: number) => {
    const relevant = cart.filter(line => lineIds.includes(line.line_id));
    const baseTotal = relevant.reduce((sum, line) => sum + getLineBaseAmount(line), 0);
    let remaining = round2(totalAmount);
    const result: Record<string, number> = {};

    relevant.forEach((line, index) => {
      const base = getLineBaseAmount(line);
      const proportional = index === relevant.length - 1 ? remaining : round2((base / (baseTotal || 1)) * totalAmount);
      const applied = clamp(proportional, 0, remaining);
      result[line.line_id] = applied;
      remaining = round2(remaining - applied);
    });

    return result;
  };

  activeCombos.forEach(combo => {
    const comboInstances = new Map<string, PosPromotionLineRef[]>();
    cart.forEach(line => {
      if (line.combo_id === combo.id && line.combo_instance_id) {
        const current = comboInstances.get(line.combo_instance_id) || [];
        current.push(line);
        comboInstances.set(line.combo_instance_id, current);
      }
    });

    comboInstances.forEach(lines => {
      const baseAmount = round2(lines.reduce((sum, line) => sum + getLineBaseAmount(line), 0));
      const discount = round2(Math.max(0, baseAmount - combo.price));
      if (discount <= 0) return;
      addLinePromotion(
        {
          id: combo.id,
          name: combo.name,
          kind: 'COMBO',
          source_type: combo.type,
          auto_applied: false,
          priority: Number(combo.priority || PRIORITY.COMBO),
          amount: discount,
          affected_line_ids: lines.map(line => line.line_id),
          description: combo.description || undefined,
        },
        allocateAcrossLines(lines.map(line => line.line_id), discount)
      );
    });
  });

  activeOffers.forEach(offer => {
  const buyQty = Number(offer.conditions?.buy_quantity || 1);
  const rewardQty = Number(offer.conditions?.reward_quantity || 1);

  // ✅ BUY LINES (CONDITION)
  const buyLines = cart.filter(line =>
    isLineEligible(line, offer.conditions || undefined)
  );

  if (!buyLines.length) return;

  // ✅ REWARD LINES (SEPARATE FILTER)
  const rewardLines = cart.filter(line =>
    isLineEligible(line, offer.rewards || undefined)
  );

  if (!rewardLines.length) return;

  // ✅ BUY UNITS
  const buyUnits = buyLines.flatMap(line =>
    Array.from({ length: line.quantity }).map(() => ({
      line_id: line.line_id,
      amount: round2(getLineBaseAmount(line) / line.quantity),
    }))
  );

  // ✅ REWARD UNITS
  const rewardUnits = rewardLines.flatMap(line =>
    Array.from({ length: line.quantity }).map(() => ({
      line_id: line.line_id,
      amount: round2(getLineBaseAmount(line) / line.quantity),
    }))
  );

  if (!buyUnits.length || !rewardUnits.length) return;

  // ✅ QUALIFYING SETS (BASED ONLY ON BUY)
  const qualifyingSets = Math.floor(
    buyUnits.length / Math.max(1, buyQty)
  );

  if (qualifyingSets <= 0) return;

  const candidateRewards = [...rewardUnits].sort((a, b) => a.amount - b.amount);

  let discountAmount = 0;
  const rewardAllocations: Record<string, number> = {};

  // ✅ BUY_X_GET_Y / BOGO FIXED
  if (offer.type === 'BOGO' || offer.type === 'BUY_X_GET_Y') {
    const totalRewardUnits = Math.min(
      rewardUnits.length,
      qualifyingSets * rewardQty
    );

    for (let i = 0; i < totalRewardUnits; i++) {
      const reward = candidateRewards[i];

      let discountPerUnit = reward.amount;

      // ✅ SUPPORT ₹ OFF (NOT JUST FREE)
      if (offer.rewards?.discount_type === "FLAT") {
        discountPerUnit = Math.min(
          reward.amount,
          offer.rewards.discount_value || 0
        );
      }

      if (offer.rewards?.discount_type === "PERCENTAGE") {
        discountPerUnit =
          (reward.amount * (offer.rewards.discount_value || 0)) / 100;
      }

      rewardAllocations[reward.line_id] = round2(
        (rewardAllocations[reward.line_id] || 0) + discountPerUnit
      );

      discountAmount += discountPerUnit;
    }
  }

  // ✅ FLAT / PERCENTAGE ON REWARD ITEMS ONLY
  else if (offer.type === 'PERCENTAGE' || offer.type === 'FLAT') {
    const baseAmount = rewardLines.reduce(
      (sum, line) => sum + getLineBaseAmount(line),
      0
    );

    discountAmount = pickDiscountValue(
      baseAmount,
      offer.type === 'PERCENTAGE' ? 'PERCENTAGE' : 'FLAT',
      Number(offer.rewards?.discount_value || 0)
    );

    Object.assign(
      rewardAllocations,
      allocateAcrossLines(
        rewardLines.map(line => line.line_id),
        discountAmount
      )
    );
  }

  // ✅ FREE ADDON (CHEAPEST REWARD ONLY)
  else if (offer.type === 'FREE_ADDON') {
    const cheapest = candidateRewards[0];
    if (cheapest) {
      rewardAllocations[cheapest.line_id] = cheapest.amount;
      discountAmount += cheapest.amount;
    }
  }

  discountAmount = round2(discountAmount);
  if (discountAmount <= 0) return;

  addLinePromotion(
    {
      id: offer.id,
      name: offer.name,
      kind: 'OFFER',
      source_type: offer.type,
      auto_applied: offer.auto_apply,
      priority: Number(offer.priority || PRIORITY.BOGO),
      amount: discountAmount,
      affected_line_ids: Object.keys(rewardAllocations),
      description: offer.description || undefined,
    },
    rewardAllocations
  );
});

  activeDiscounts.forEach(discount => {
    if (discount.scope === 'ORDER') return;
    const eligibleLines = cart.filter(line => {
      if (discount.scope === 'ITEM') {
        return isLineEligible(line, {
          item_filters: discount.item_filters,
          category_filters: undefined,
        });
      }
      if (discount.scope === 'CATEGORY') {
        return isLineEligible(line, {
          item_filters: undefined,
          category_filters: discount.category_filters,
        });
      }
      return false;
    });

    eligibleLines.forEach(line => {
      const baseAmount = getLineBaseAmount(line);
      const discountAmount = pickDiscountValue(baseAmount, discount.value_type, Number(discount.value || 0), discount.max_discount_amount);
      if (discountAmount <= 0) return;
      addLinePromotion(
        {
          id: discount.id,
          name: discount.name,
          kind: 'DISCOUNT',
          source_type: `${discount.scope}_${discount.value_type}`,
          auto_applied: discount.auto_apply,
          priority: Number(discount.priority || (discount.scope === 'CATEGORY' ? PRIORITY.CATEGORY : PRIORITY.AUTO_DISCOUNT)),
          amount: discountAmount,
          affected_line_ids: [line.line_id],
        },
        { [line.line_id]: discountAmount }
      );
    });
  });

  let orderDiscountAmount = 0;
  const orderLevelCandidates: AppliedPromotionSummary[] = [];

  activeDiscounts
    .filter(discount => discount.scope === 'ORDER')
    .forEach(discount => {
      if (discount.min_order_amount && subtotalBeforeDiscount < discount.min_order_amount) return;
      const discountAmount = pickDiscountValue(subtotalBeforeDiscount, discount.value_type, Number(discount.value || 0), discount.max_discount_amount);
      if (discountAmount <= 0) return;
      orderLevelCandidates.push({
        id: discount.id,
        name: discount.name,
        kind: 'DISCOUNT',
        source_type: `ORDER_${discount.value_type}`,
        auto_applied: discount.auto_apply,
        priority: Number(discount.priority || PRIORITY.AUTO_DISCOUNT),
        amount: discountAmount,
        affected_line_ids: cart.map(line => line.line_id),
      });
    });

  if (params.manualDiscount && params.manualDiscount.value > 0) {
    if (params.manualDiscount.scope === 'ITEM' && params.manualDiscount.line_ids?.length) {
      params.manualDiscount.line_ids.forEach(lineId => {
        const line = cart.find(entry => entry.line_id === lineId);
        if (!line) return;
        const baseAmount = getLineBaseAmount(line);
        const discountAmount = pickDiscountValue(baseAmount, params.manualDiscount!.value_type, params.manualDiscount!.value);
        if (discountAmount <= 0) return;
        addLinePromotion(
          {
            id: 'manual-discount',
            name: params.manualDiscount?.reason || 'Manual Discount',
            kind: 'DISCOUNT',
            source_type: `MANUAL_${params.manualDiscount.value_type}`,
            auto_applied: false,
            priority: PRIORITY.MANUAL,
            amount: discountAmount,
            affected_line_ids: [line.line_id],
          },
          { [line.line_id]: discountAmount }
        );
      });
    } else if (params.manualDiscount.scope === 'ORDER') {
      const discountAmount = pickDiscountValue(subtotalBeforeDiscount, params.manualDiscount.value_type, params.manualDiscount.value);
      if (discountAmount > 0) {
        orderLevelCandidates.push({
          id: 'manual-order-discount',
          name: params.manualDiscount.reason || 'Manual Discount',
          kind: 'DISCOUNT',
          source_type: `MANUAL_${params.manualDiscount.value_type}`,
          auto_applied: false,
          priority: PRIORITY.MANUAL,
          amount: discountAmount,
          affected_line_ids: cart.map(line => line.line_id),
        });
      }
    }
  }

  const chosenOrderDiscount = orderLevelCandidates.sort((left, right) => (right.priority - left.priority) || (right.amount - left.amount))[0];
  if (chosenOrderDiscount) {
    orderDiscountAmount = chosenOrderDiscount.amount;
    appliedPromotions.push(chosenOrderDiscount);
  }

  const linePricing: Record<string, PromotionLinePricing> = {};
  let remainingOrderShare = round2(orderDiscountAmount);
  const distributableLines = cart.map(line => {
    const baseAmount = getLineBaseAmount(line);
    const lineDiscount = round2(lineDiscounts.get(line.line_id) || 0);
    return {
      line,
      baseAmount,
      netAfterLine: round2(Math.max(0, baseAmount - lineDiscount)),
    };
  });
  const distributableTotal = distributableLines.reduce((sum, entry) => sum + entry.netAfterLine, 0);

  distributableLines.forEach((entry, index) => {
    const orderShare = chosenOrderDiscount
      ? (index === distributableLines.length - 1
          ? remainingOrderShare
          : round2((entry.netAfterLine / (distributableTotal || 1)) * orderDiscountAmount))
      : 0;
    const safeOrderShare = round2(clamp(orderShare, 0, remainingOrderShare));
    remainingOrderShare = round2(remainingOrderShare - safeOrderShare);
    const finalAmount = round2(Math.max(0, entry.baseAmount - (lineDiscounts.get(entry.line.line_id) || 0) - safeOrderShare));
    linePricing[entry.line.line_id] = {
      line_id: entry.line.line_id,
      base_amount: entry.baseAmount,
      line_discount: round2(lineDiscounts.get(entry.line.line_id) || 0),
      order_discount_share: safeOrderShare,
      final_amount: finalAmount,
      applied_promotions: [
        ...(linePromotionBuckets.get(entry.line.line_id) || []),
        ...(chosenOrderDiscount ? [{ ...chosenOrderDiscount, amount: safeOrderShare, affected_line_ids: [entry.line.line_id] }] : []),
      ].filter(promo => promo.amount > 0),
    };
  });

  const processedItems = cart.map(line => {
    const pricing = linePricing[line.line_id];
    const effectiveUnit = round2(pricing.final_amount / Math.max(1, line.quantity));
    const processed = salesService.calculateItemGst(
      {
        id: line.item_id,
        name: line.name,
        price: effectiveUnit,
        base_price: effectiveUnit,
        category: String(line.category || ''),
        image: '',
        available: true,
        hsn_code: line.hsn_code,
        tax_percentage: line.tax_percentage,
        price_includes_tax: line.price_includes_tax,
      } as any,
      line.quantity,
      params.outletState,
      params.destState,
      params.gstRegistered,
      line.selected_modifiers ? [] : undefined
    );

    return {
      ...processed,
      line_id: line.line_id,
      menu_item_id: line.item_id,
      discount_amount: round2(pricing.line_discount + pricing.order_discount_share),
      base_amount: pricing.base_amount,
      combo_id: line.combo_id || null,
      combo_instance_id: line.combo_instance_id || null,
      combo_group_id: line.combo_group_id || null,
      combo_label: line.combo_label || null,
      applied_promotions: pricing.applied_promotions,
      original_unit_price: line.unit_price,
      selected_modifiers: line.selected_modifiers || [],
    };
  });

  const subtotal = round2(processedItems.reduce((sum, item) => sum + (item.taxable_value || 0), 0));
  const cgst = round2(processedItems.reduce((sum, item) => sum + (item.cgst_amount || 0), 0));
  const sgst = round2(processedItems.reduce((sum, item) => sum + (item.sgst_amount || 0), 0));
  const igst = round2(processedItems.reduce((sum, item) => sum + (item.igst_amount || 0), 0));
  const totalTax = round2(cgst + sgst + igst);
  const rawGrandTotal = round2(subtotal + totalTax);
  const grandTotal = Math.round(rawGrandTotal);
  const roundOff = round2(grandTotal - rawGrandTotal);

  const taxBreakup: PromotionPricingResult['taxBreakup'] = {};
  processedItems.forEach(item => {
    const rate = Number(item.tax_percentage || 0);
    if (!taxBreakup[rate]) {
      taxBreakup[rate] = { taxable: 0, cgst: 0, sgst: 0, igst: 0, totalTax: 0 };
    }
    taxBreakup[rate].taxable = round2(taxBreakup[rate].taxable + (item.taxable_value || 0));
    taxBreakup[rate].cgst = round2(taxBreakup[rate].cgst + (item.cgst_amount || 0));
    taxBreakup[rate].sgst = round2(taxBreakup[rate].sgst + (item.sgst_amount || 0));
    taxBreakup[rate].igst = round2(taxBreakup[rate].igst + (item.igst_amount || 0));
    taxBreakup[rate].totalTax = round2(taxBreakup[rate].totalTax + (item.cgst_amount || 0) + (item.sgst_amount || 0) + (item.igst_amount || 0));
  });

  return {
    subtotal,
    cgst,
    sgst,
    igst,
    totalTax,
    grandTotal,
    roundOff,
    itemCount: cart.reduce((sum, line) => sum + line.quantity, 0),
    savingsTotal: round2(appliedPromotions.reduce((sum, promo) => sum + promo.amount, 0)),
    discountTotal: round2(appliedPromotions.reduce((sum, promo) => sum + promo.amount, 0)),
    taxBreakup,
    processedItems,
    appliedPromotions,
    autoAppliedPromotions: appliedPromotions.filter(promo => promo.auto_applied),
    linePricing,
  };
}
