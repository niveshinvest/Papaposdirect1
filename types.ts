

export type SubscriptionPlan = 'BASIC' | 'PRO' | 'ENTERPRISE';
export type OutletType = 'SHOP' | 'GODOWN';
export type UserRole = 'OWNER' | 'ADMIN' | 'MANAGER' | 'CASHIER' | 'KITCHEN_STAFF' | 'INVESTOR';
export type StaffStatus = 'invited' | 'active' | 'disabled';
export type TerminalStatus = 'PENDING_APPROVAL' | 'APPROVED' | 'SUSPENDED' | 'REVOKED';
export type OrderType = 'DINE_IN' | 'TAKEAWAY' | 'DELIVERY';
export type PaymentModeType = 'CASH' | 'DIGITAL' | 'CARD' | 'SPLIT' | 'OTHER';

export interface PaymentMode {
  id: string;
  company_id: string;
  outlet_id: string;
  name: string;
  type: PaymentModeType;
  is_default: boolean;
  is_active: boolean;
  priority_order: number;
}

export interface NotificationPrefs {
  whatsapp_enabled: boolean;
  email_enabled: boolean;
  quiet_hours_start: string; // HH:mm
  quiet_hours_end: string; // HH:mm
  min_severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
}

export interface AIExplainability {
  trigger_condition: string;
  data_points_evaluated: number;
  rules_applied: string[];
  thresholds_crossed: string[];
  comparisons_used: string;
  confidence_score: number;
  alternative_explanations?: string[];
}

export interface AIComputeMetadata {
  computation_time_ms: number;
  data_volume_rows: number;
  execution_reason: string;
  cost_tier: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface AIDataLineage {
  tables: string[];
  date_range: { start: string; end: string };
  limitations: string[];
}

export interface Organization {
  id: string;
  name: string;
  plan: SubscriptionPlan;
  ownerName: string;
  email: string;
  logo?: string;
  outlets: Outlet[];
  paymentMethods: PaymentMethod[];
  notification_prefs?: NotificationPrefs;
  ai_kill_switch?: boolean;
}

export interface AIInsight {
  id: string;
  company_id: string;
  outlet_id?: string;
  severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  category: 'SALES' | 'PAYMENTS' | 'STAFF' | 'FLEET' | 'COMPLIANCE' | 'MARGIN';
  title: string;
  summary: string;
  explanation: string;
  recommended_action: string;
  data_points: any;
  source_tables: string[];
  confidence_score: number;
  is_read: boolean;
  is_dismissed: boolean;
  generated_at: string;
  explanation_object?: AIExplainability;
  data_lineage?: AIDataLineage;
  compute_metadata?: AIComputeMetadata;
  legal_disclaimer: string;
}

export interface AIForecast {
  id: string;
  company_id: string;
  outlet_id?: string;
  horizon: '7_DAYS' | '30_DAYS';
  predicted_revenue_min: number;
  predicted_revenue_max: number;
  predicted_orders: number;
  peak_days: string[];
  slow_days: string[];
  confidence_score: number;
  assumptions: string;
  historical_baseline_revenue: number;
  error_margin_percent: number;
  generated_at: string;
  explanation_object?: AIExplainability;
  data_lineage?: AIDataLineage;
  compute_metadata?: AIComputeMetadata;
  legal_disclaimer: string;
}

export interface AIRecommendation {
  id: string;
  company_id: string;
  outlet_id?: string;
  type: 'PRICING' | 'MENU' | 'STAFFING';
  title: string;
  description: string;
  rationale: string;
  expected_impact: string;
  current_value: any;
  suggested_value: any;
  confidence_score: number;
  risk_assessment?: string;
  status: 'PENDING' | 'APPROVED' | 'DISMISSED' | 'APPLIED';
  created_at: string;
  approved_at?: string;
  approved_by?: string;
  metadata?: any;
  explanation_object?: AIExplainability;
  data_lineage?: AIDataLineage;
  compute_metadata?: AIComputeMetadata;
  legal_disclaimer: string;
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  assignedOutletIds: string[];
}

export interface Outlet {
  id: string;
  name: string;
  short_code: string;
  type: OutletType;
  location: string;
  address?: string;
  city?: string;
  pincode?: string;
  state?: string;
  state_code?: string;
  gst_number?: string;
  gst_state_code?: string;
  gst_registered: boolean;
  subscriptionActive: boolean;
  contactPerson: string;
  phoneNumber?: string;
  company_id: string;
}

export interface Modifier {
  id: string;
  name: string;
  price: number;
  is_active: boolean;
}

export interface CartItem extends MenuItem {
  quantity: number;
  taxable_value: number;
  cgst_amount: number;
  sgst_amount: number;
  igst_amount: number;
  total_amount: number;
  selected_modifiers?: Modifier[];
}

export interface MenuItem {
  id: string;
  name: string;
  price: number;
  base_price?: number;
  category: string;
  image: string;
  available: boolean;
  hsn_code?: string;
  tax_percentage: number;
  price_includes_tax: boolean;
  gst_rate?: number;
  is_tax_inclusive?: boolean;
  modifiers?: Modifier[];
}

export interface Invoice {
  id: string;
  company_id: string;
  outlet_id: string;
  invoice_number: string;
  invoice_date: string;
  order_id: string;
  seller_gstin: string;
  seller_legal_name: string;
  seller_trade_name: string;
  seller_state_code: string;
  buyer_name?: string;
  buyer_gstin?: string;
  buyer_state_code: string;
  place_of_supply: string;
  invoice_type: 'B2B' | 'B2C';
  billing_state_code: string;
  outlet_state_code: string;
  taxable_value: number;
  subtotal: number;
  cgst_total: number;
  sgst_total: number;
  igst_total: number;
  total_tax: number;
  round_off: number;
  grand_total: number;
  payment_method: string;
  payment_mode_id?: string;
  payment_mode_name?: string;
  sync_status?: 'synced' | 'pending';
  finalized_by_user_id?: string;
  finalized_at?: string;
  printer_id?: string;
  qr_payload?: string;
  irn?: string;
  irn_generated_at?: string;
  irp_status: 'NOT_GENERATED' | 'PENDING' | 'GENERATED' | 'FAILED';
}

export interface Order {
  id: string;
  tableId: string;
  orderType: OrderType;
  items: CartItem[];
  subtotal: number;
  cgst: number;
  sgst: number;
  total: number;
  paymentMethodId: string;
  status: 'pending' | 'preparing' | 'ready' | 'completed' | 'cancelled';
  timestamp: Date;
  isEdited?: boolean;
  editReason?: string;
  editTimestamp?: Date;
  company_id: string;
  outlet_id: string;
  sync_status?: 'synced' | 'pending';
}

export interface Table {
  id: string;
  name: string;
  section: string;
  status: 'available' | 'occupied' | 'reserved';
  capacity: number;
}

// Fix: Added missing TERMINAL_MANAGEMENT member to ViewMode enum
export enum ViewMode {
  LANDING = 'LANDING',
  AUTH = 'AUTH',
  DASHBOARD = 'DASHBOARD',
  POS = 'POS',
  KITCHEN_DISPLAY = 'KITCHEN_DISPLAY',
  INVENTORY = 'INVENTORY',
  RECIPES = 'RECIPES',
  MENU_MANAGEMENT = 'MENU_MANAGEMENT',
  OUTLETS = 'OUTLETS',
  TRANSFERS = 'TRANSFERS',
  PURCHASE_ORDERS = 'PURCHASE_ORDERS',
  REPORTS = 'REPORTS',
  AI_INSIGHTS = 'AI_INSIGHTS',
  CRM = 'CRM',
  SETTINGS = 'SETTINGS',
  DELIVERY_PARTNERS = 'DELIVERY_PARTNERS',
  MOBILE_MENU = 'MOBILE_MENU',
  PROFILE = 'PROFILE',
  RECYCLE_BIN = 'RECYCLE_BIN',
  WHATSAPP = 'WHATSAPP',
  GST_REPORTS = 'GST_REPORTS',
  USER_MANAGEMENT = 'USER_MANAGEMENT',
  TERMINAL_MANAGEMENT = 'TERMINAL_MANAGEMENT'
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  hsnCode?: string;
  unitPrice?: number;
  unit: string;
  salesUnit?: string;
}

export interface InventoryCategory {
  id: string;
  name: string;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  quantity: number;
  cost: number;
}

export interface Recipe {
  id: string;
  name: string;
  menuItemId?: string;
  inventoryItemId?: string;
  ingredients: RecipeIngredient[];
  totalCost: number;
  yield: number;
  status: 'DRAFT' | 'QUEUED' | 'FINALIZED' | 'REJECTED';
}

export interface PurchaseOrder {
  id: string;
  vendor: string;
  orderDate: Date;
  status: string;
  totalAmount?: number;
}

export interface StockTransferItem {
  inventoryItemId: string;
  name: string;
  quantity: number;
  unit: string;
}

export interface StockTransfer {
  id: string;
  fromOutletId: string;
  toOutletId: string;
  items: StockTransferItem[];
  status: 'REQUESTED' | 'DISPATCHED' | 'RECEIVED';
  timestamp: Date;
  remarks?: string;
}

export interface GstReport {
  id: string;
  month: number;
  year: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalInvoiceValue: number;
  status: 'DRAFT' | 'FINALIZED' | 'FILED';
  generatedAt: Date;
}

export interface ReportSnapshot {
  id: string;
  date: string; // YYYY-MM-DD
  totalSales: number;
  orderCount: number;
  avgOrderValue: number;
  topCategory: string;
  wasteValue: number;
  laborCost?: number;
}

export interface PrinterConfig {
  id: string;
  name: string;
  type: 'KOT' | 'BILL' | 'BOTH';
  interface: 'NETWORK' | 'USB' | 'BLUETOOTH';
  address: string;
  isEnabled: boolean;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION';
  content: string;
  status: 'APPROVED' | 'PENDING' | 'REJECTED';
  variables: string[];
}

export interface WhatsAppLog {
  id: string;
  recipientPhone: string;
  customerName: string;
  templateName: string;
  status: 'SENT' | 'DELIVERED' | 'READ' | 'FAILED';
  timestamp: Date;
  orderId?: string;
}

export interface PaymentMethod {
  id: string;
  name: string;
  type: 'CASH' | 'CARD' | 'UPI' | 'OTHER';
  isDefault: boolean;
  isEnabled: boolean;
  icon?: string;
}

export interface POSIdentifier {
  terminal_id: string;
  name: string;
  status: TerminalStatus;
  last_seen_at: Date;
  outlet_id?: string;
}

export interface StaffHistory {
  id: string;
  company_id: string;
  staff_id: string;
  actor_id: string;
  event_type: 'ROLE_CHANGE' | 'OUTLET_CHANGE' | 'STATUS_CHANGE' | 'AUTH_EVENT' | 'TERMINAL_ACTION';
  old_value: any;
  new_value: any;
  reason: string;
  timestamp: Date;
  actor_name?: string;
}

export interface StaffSession {
  id: string;
  user_id: string;
  company_id: string;
  terminal_id: string;
  device_name: string;
  outlet_id: string;
  last_active_at: Date;
  status: 'active' | 'revoked' | 'expired';
  is_offline_session?: boolean;
}

export interface SessionConfig {
  company_id: string;
  role: UserRole;
  max_sessions: number;
}

export interface StaffUser {
  id: string;
  email: string;
  full_name: string;
  company_id: string;
  role: UserRole;
  outlet_ids: string[];
  status: StaffStatus;
  created_at: Date;
  created_by: string;
  // Fix: Added is_verified and token_expires_at to StaffUser for onboarding lifecycle tracking
  is_verified?: boolean;
  token_expires_at?: string;
}

export interface AIProvider {
  id: string;
  company_id: string;
  provider_name: 'gemini' | 'openai' | 'claude' | 'openrouter' | 'local';
  api_key?: string;
  model: string;
  base_url?: string;
  is_default: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface AIPart {
  text?: string;
  inline_data?: {
    mime_type: string;
    data: string;
  };
}

export interface AIRequest {
  task_type?: string;
  prompt?: string;
  parts?: AIPart[];
  context?: any;
  system_prompt?: string;
  temperature?: number;
  max_tokens?: number;
  response_mime_type?: string;
  response_schema?: any;
  company_id?: string;
  outlet_id?: string;
}

export interface AIResponse {
  text: string;
  raw?: any;
  error?: string;
}

export interface AuditLog {
  id: string;
  action: string;
  actor_user_id: string;
  target_user_id?: string;
  old_value?: any;
  new_value?: any;
  metadata?: any;
  timestamp: Date;
}