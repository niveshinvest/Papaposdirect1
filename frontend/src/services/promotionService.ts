import { API_BASE } from './config';
import { db } from './db';
import { authService, getSupabase, getTenantAuthHeaders } from './supabaseService';
import type { ComboRule, DiscountRule, OfferRule, PromotionConfig, PromotionWindow } from '../types/promotions';

const DEFAULT_PROMOTION_CONFIG: PromotionConfig = {
  max_manual_discount_percent: 20,
  allowed_manual_discount_types: ['FLAT', 'PERCENTAGE'],
  allow_cashier_manual_discount: false,
};

function assertPromotionWindow(ruleName: string, window: PromotionWindow) {
  if (!window.start_date || !window.end_date || !window.start_time || !window.end_time) {
    throw new Error(`${ruleName} requires start/end date and start/end time.`);
  }

  if (window.start_date > window.end_date) {
    throw new Error(`${ruleName} start date cannot be after end date.`);
  }

  if ((window.days_of_week || []).length === 0) {
    throw new Error(`${ruleName} must apply on at least one day.`);
  }
}

async function fetchWithAuth<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: await getTenantAuthHeaders({
      'Content-Type': 'application/json',
    }),
  });

  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload?.error || `Failed request for ${path}`);
  }

  return response.json();
}

export const promotionService = {
  async loadActivePromotions(outletId: string) {
    const cached = await Promise.all([
      db.discounts.where('outlet_id').equals(outletId).toArray().catch(() => []),
      db.offers.where('outlet_id').equals(outletId).toArray().catch(() => []),
      db.combos.where('outlet_id').equals(outletId).toArray().catch(() => []),
    ]);

    try {
      const [discountPayload, offerPayload, comboPayload] = await Promise.all([
        fetchWithAuth<{ discounts: DiscountRule[]; config?: PromotionConfig }>(`/api/discounts/active?outlet_id=${encodeURIComponent(outletId)}`),
        fetchWithAuth<{ offers: OfferRule[] }>(`/api/offers/active?outlet_id=${encodeURIComponent(outletId)}`),
        fetchWithAuth<{ combos: ComboRule[] }>(`/api/combos?outlet_id=${encodeURIComponent(outletId)}`),
      ]);

      await Promise.all([
        db.discounts.bulkPut(discountPayload.discounts.map(rule => ({ ...rule, outlet_id: outletId }))),
        db.offers.bulkPut(offerPayload.offers.map(rule => ({ ...rule, outlet_id: outletId }))),
        db.combos.bulkPut(comboPayload.combos.map(rule => ({ ...rule, outlet_id: outletId }))),
      ]);

      return {
        discounts: discountPayload.discounts,
        offers: offerPayload.offers,
        combos: comboPayload.combos,
        config: discountPayload.config || DEFAULT_PROMOTION_CONFIG,
      };
    } catch (error) {
      console.warn('Promotion load falling back to offline cache:', error);
      return {
        discounts: cached[0] as DiscountRule[],
        offers: cached[1] as OfferRule[],
        combos: cached[2] as ComboRule[],
        config: DEFAULT_PROMOTION_CONFIG,
      };
    }
  },

  async saveDiscount(rule: Partial<DiscountRule> & { outlet_id: string; company_id?: string }) {
    const profile = await authService.getProfile();
    const client = getSupabase();
    assertPromotionWindow(rule.name || 'Discount', rule);
    const payload = {
      ...rule,
      company_id: rule.company_id || profile.company_id,
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    };
    const { data, error } = await client.from('discounts').upsert(payload).select('*').single();
    if (error) throw new Error(error.message);
    return data as DiscountRule;
  },

  async saveOffer(rule: Partial<OfferRule> & { outlet_id: string; company_id?: string }) {
    const profile = await authService.getProfile();
    const client = getSupabase();
    assertPromotionWindow(rule.name || 'Offer', rule);
    const offerPayload = {
      id: rule.id,
      company_id: rule.company_id || profile.company_id,
      outlet_id: rule.outlet_id,
      name: rule.name,
      type: rule.type,
      description: rule.description || null,
      is_active: rule.is_active ?? true,
      auto_apply: rule.auto_apply ?? true,
      priority: rule.priority ?? 300,
      start_date: rule.start_date || null,
      end_date: rule.end_date || null,
      start_time: rule.start_time || null,
      end_time: rule.end_time || null,
      days_of_week: rule.days_of_week || [],
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('offers').upsert(offerPayload).select('*').single();
    if (error) throw new Error(error.message);

    await client.from('offer_conditions').delete().eq('offer_id', data.id);
    await client.from('offer_rewards').delete().eq('offer_id', data.id);

    if (rule.conditions) {
      const { error: conditionError } = await client.from('offer_conditions').insert({
        company_id: offerPayload.company_id,
        offer_id: data.id,
        ...rule.conditions,
      });
      if (conditionError) throw new Error(conditionError.message);
    }

    if (rule.rewards) {
      const { error: rewardError } = await client.from('offer_rewards').insert({
        company_id: offerPayload.company_id,
        offer_id: data.id,
        ...rule.rewards,
      });
      if (rewardError) throw new Error(rewardError.message);
    }

    return {
      ...(data as OfferRule),
      conditions: rule.conditions || null,
      rewards: rule.rewards || null,
    };
  },

  async saveCombo(rule: Partial<ComboRule> & { outlet_id: string; company_id?: string }) {
    const profile = await authService.getProfile();
    const client = getSupabase();
    assertPromotionWindow(rule.name || 'Combo', rule);
    const comboPayload = {
      id: rule.id,
      company_id: rule.company_id || profile.company_id,
      outlet_id: rule.outlet_id,
      name: rule.name,
      description: rule.description || null,
      type: rule.type,
      price: rule.price,
      is_active: rule.is_active ?? true,
      auto_apply: rule.auto_apply ?? false,
      priority: rule.priority ?? 400,
      start_date: rule.start_date || null,
      end_date: rule.end_date || null,
      start_time: rule.start_time || null,
      end_time: rule.end_time || null,
      days_of_week: rule.days_of_week || [],
      created_by: profile.id,
      updated_at: new Date().toISOString(),
    };

    const { data, error } = await client.from('combos').upsert(comboPayload).select('*').single();
    if (error) throw new Error(error.message);

    await client.from('combo_items').delete().eq('combo_id', data.id);
    if (rule.groups?.length) {
      const { error: itemsError } = await client.from('combo_items').insert(
        rule.groups.map((group, index) => ({
          ...group,
          company_id: comboPayload.company_id,
          combo_id: data.id,
          sort_order: index,
        }))
      );
      if (itemsError) throw new Error(itemsError.message);
    }

    return {
      ...(data as ComboRule),
      groups: rule.groups || [],
    };
  },

  async deleteRule(table: 'discounts' | 'offers' | 'combos', id: string) {
    const client = getSupabase();
    const { error } = await client.from(table).delete().eq('id', id);
    if (error) throw new Error(error.message);
    return true;
  },

  async saveConfig(outletId: string, config: PromotionConfig) {
    const profile = await authService.getProfile();
    const client = getSupabase();
    const { data, error } = await client
      .from('discount_settings')
      .upsert({
        company_id: profile.company_id,
        outlet_id: outletId,
        ...config,
        updated_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return data as PromotionConfig;
  },

  async fetchPromotionUsage(outletId?: string | null, startDate?: string, endDate?: string) {
    const profile = await authService.getProfile();
    let query = getSupabase()
      .from('promotion_usage')
      .select('*')
      .eq('company_id', profile.company_id)
      .order('created_at', { ascending: false });

    if (outletId) query = query.eq('outlet_id', outletId);
    if (startDate) query = query.gte('created_at', startDate);
    if (endDate) query = query.lte('created_at', endDate);

    const { data, error } = await query.limit(200);
    if (error) throw new Error(error.message);
    return data || [];
  },
};
