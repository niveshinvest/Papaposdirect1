export type PromotionValueType = 'FLAT' | 'PERCENTAGE';
export type DiscountScope = 'ORDER' | 'ITEM' | 'CATEGORY' | 'CUSTOMER';
export type OfferType = 'BOGO' | 'BUY_X_GET_Y' | 'FREE_ADDON' | 'PERCENTAGE' | 'FLAT';
export type ComboType = 'FIXED' | 'BUILD_YOUR_OWN';
export type ComboGroupMode = 'FIXED' | 'CHOICE';
export type PromotionSourceKind = 'DISCOUNT' | 'OFFER' | 'COMBO';

export interface PromotionWindow {
  start_date?: string | null;
  end_date?: string | null;
  start_time?: string | null;
  end_time?: string | null;
  days_of_week?: number[] | null;
}

export interface DiscountRule extends PromotionWindow {
  id: string;
  company_id?: string;
  outlet_id?: string;
  name: string;
  code?: string | null;
  is_active: boolean;
  auto_apply: boolean;
  scope: DiscountScope;
  value_type: PromotionValueType;
  value: number;
  min_order_amount?: number | null;
  max_discount_amount?: number | null;
  category_filters?: string[] | null;
  item_filters?: string[] | null;
  customer_filters?: string[] | null;
  priority?: number | null;
  stack_mode?: 'EXCLUSIVE' | 'ORDER_LEVEL';
  created_by?: string | null;
}

export interface OfferCondition {
  buy_quantity?: number | null;
  reward_quantity?: number | null;
  item_filters?: string[] | null;
  category_filters?: string[] | null;
  min_order_amount?: number | null;
}

export interface OfferReward {
  item_filters?: string[] | null;
  category_filters?: string[] | null;
  discount_type?: PromotionValueType | 'FREE';
  discount_value?: number | null;
  add_on_name?: string | null;
}

export interface OfferRule extends PromotionWindow {
  id: string;
  company_id?: string;
  outlet_id?: string;
  name: string;
  type: OfferType;
  description?: string | null;
  is_active: boolean;
  auto_apply: boolean;
  priority?: number | null;
  conditions?: OfferCondition | null;
  rewards?: OfferReward | null;
}

export interface ComboGroup {
  id: string;
  label: string;
  mode: ComboGroupMode;
  required_quantity: number;
  item_filters?: string[] | null;
  category_filters?: string[] | null;
  fixed_items?: string[] | null;
}

export interface ComboRule extends PromotionWindow {
  id: string;
  company_id?: string;
  outlet_id?: string;
  name: string;
  description?: string | null;
  type: ComboType;
  price: number;
  is_active: boolean;
  auto_apply: boolean;
  priority?: number | null;
  groups: ComboGroup[];
}

export interface ManualDiscountDraft {
  scope: 'ORDER' | 'ITEM';
  value_type: PromotionValueType;
  value: number;
  line_ids?: string[];
  reason?: string;
}

export interface PromotionConfig {
  max_manual_discount_percent: number;
  allowed_manual_discount_types: PromotionValueType[];
  allow_cashier_manual_discount: boolean;
}

export interface PosPromotionLineRef {
  line_id: string;
  item_id: string;
  name: string;
  category?: string;
  quantity: number;
  unit_price: number;
  tax_percentage: number;
  price_includes_tax: boolean;
  hsn_code?: string;
  selected_modifiers?: Array<{ id: string; name: string; price: number }>;
  combo_id?: string;
  combo_instance_id?: string;
  combo_group_id?: string;
  combo_label?: string;
}

export interface AppliedPromotionSummary {
  id: string;
  name: string;
  kind: PromotionSourceKind;
  source_type: string;
  auto_applied: boolean;
  priority: number;
  amount: number;
  affected_line_ids: string[];
  description?: string;
}

export interface PromotionLinePricing {
  line_id: string;
  base_amount: number;
  line_discount: number;
  order_discount_share: number;
  final_amount: number;
  applied_promotions: AppliedPromotionSummary[];
}

export interface PromotionPricingResult {
  subtotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  grandTotal: number;
  roundOff: number;
  itemCount: number;
  savingsTotal: number;
  discountTotal: number;
  taxBreakup: Record<number, { taxable: number; cgst: number; sgst: number; igst: number; totalTax: number }>;
  processedItems: any[];
  appliedPromotions: AppliedPromotionSummary[];
  autoAppliedPromotions: AppliedPromotionSummary[];
  linePricing: Record<string, PromotionLinePricing>;
}
