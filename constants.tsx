
import React from 'react';
import { LayoutDashboard, Receipt, Package, BarChart3, BrainCircuit, Users, Settings, FileText, ShoppingCart, Bike, Check, X, MapPin, Repeat, ChefHat, BookOpen, MonitorPlay, MessageSquare, FileSpreadsheet, ShieldCheck, Monitor } from 'lucide-react';
import { MenuItem, Table, InventoryItem, InventoryCategory, SubscriptionPlan, UserRole, PaymentMethod, Organization, User } from './types';

export const COLORS = {
  primary: '#FF6B00',
  secondary: '#1e293b',
  success: '#10b981',
  danger: '#ef4444',
  warning: '#f59e0b',
  bg: '#f8fafc',
  hyperpure: '#1b8a4f'
};

export const DEFAULT_PAYMENT_METHODS: PaymentMethod[] = [
  // Added casting to any for demo data to bypass SyncMetadata requirements
  { id: 'pm-1', name: 'Cash', type: 'CASH', isDefault: true, isEnabled: true } as any,
  { id: 'pm-2', name: 'Card', type: 'CARD', isDefault: false, isEnabled: true } as any,
  { id: 'pm-3', name: 'UPI', type: 'UPI', isDefault: false, isEnabled: true } as any,
];

export const DEMO_ACCOUNT = {
  org: {
    id: 'ORG-DEMO-001',
    name: 'PapaPos Grand Cuisine',
    plan: 'ENTERPRISE' as SubscriptionPlan,
    ownerName: 'Super Admin',
    email: 'demo@papapos.pro',
    outlets: [], 
    paymentMethods: DEFAULT_PAYMENT_METHODS
  } as Organization,
  user: {
    id: 'USR-DEMO-001',
    name: 'Default Owner',
    email: 'demo@papapos.pro',
    role: 'OWNER' as UserRole,
    assignedOutletIds: ['OUT-001', 'OUT-002', 'OUT-003']
  } as User
};

export const PRICING_PLANS = [
  {
    id: 'BASIC' as SubscriptionPlan,
    name: 'Basic',
    price: '₹1,499',
    period: '/month/outlet',
    description: 'Perfect for small cafes and cloud kitchens.',
    features: ['Standard Billing / POS', 'Up to 20 Tables', 'Standard CRM', 'Email Support'],
    notIncluded: ['Inventory Management', 'AI Insights', 'Multi-outlet Support']
  },
  {
    id: 'PRO' as SubscriptionPlan,
    name: 'Pro',
    price: '₹2,999',
    period: '/month/outlet',
    description: 'The complete solution for full-service restaurants.',
    features: ['Everything in Basic', 'Inventory Management', 'Advanced CRM', 'Delivery Integrations', 'Priority Support'],
    notIncluded: ['AI Insights', 'Custom Reports']
  },
  {
    id: 'ENTERPRISE' as SubscriptionPlan,
    name: 'Enterprise',
    price: '₹5,999',
    period: '/month/outlet',
    description: 'For growing brands and multiple outlets.',
    features: ['Everything in Pro', 'AI Business Insights', 'Multi-outlet Dashboard', 'Central Warehouse Support', '24/7 Account Manager'],
    notIncluded: []
  }
];

// CLONE OVERRIDE: Set all minPlan to 'BASIC' to unlock every module for testing
export const NAVIGATION_ITEMS = [
  { id: 'DASHBOARD', label: 'Dashboard', icon: <LayoutDashboard size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN', 'INVESTOR'] as UserRole[] },
  { id: 'POS', label: 'Billing / POS', icon: <Receipt size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'CASHIER', 'ADMIN'] as UserRole[] },
  { id: 'KITCHEN_DISPLAY', label: 'Kitchen Display', icon: <MonitorPlay size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'KITCHEN_STAFF', 'CASHIER', 'ADMIN'] as UserRole[] },
  { id: 'MENU_MANAGEMENT', label: 'Menu Master', icon: <BookOpen size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'USER_MANAGEMENT', label: 'Team & Access', icon: <ShieldCheck size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'ADMIN'] as UserRole[] },
  { id: 'TERMINAL_MANAGEMENT', label: 'POS Fleet', icon: <Monitor size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'ADMIN'] as UserRole[] },
  { id: 'OUTLETS', label: 'Outlets', icon: <MapPin size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'ADMIN'] as UserRole[] },
  { id: 'WHATSAPP', label: 'WhatsApp Bot', icon: <MessageSquare size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'GST_REPORTS', label: 'GST Compliance', icon: <FileSpreadsheet size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN', 'INVESTOR'] as UserRole[] },
  { id: 'TRANSFERS', label: 'Stock Transfers', icon: <Repeat size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'DELIVERY_PARTNERS', label: 'Delivery Partners', icon: <Bike size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'INVENTORY', label: 'Inventory', icon: <Package size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'KITCHEN_STAFF', 'ADMIN'] as UserRole[] },
  { id: 'RECIPES', label: 'Recipes / COGS', icon: <ChefHat size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'PURCHASE_ORDERS', label: 'Purchase Orders', icon: <FileText size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'REPORTS', label: 'Reports', icon: <BarChart3 size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN', 'INVESTOR'] as UserRole[] },
  { id: 'AI_INSIGHTS', label: 'AI Insights', icon: <BrainCircuit size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN', 'INVESTOR'] as UserRole[] },
  { id: 'CRM', label: 'Customers', icon: <Users size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'MANAGER', 'ADMIN'] as UserRole[] },
  { id: 'SETTINGS', label: 'Settings', icon: <Settings size={20} />, minPlan: 'BASIC' as SubscriptionPlan, allowedRoles: ['OWNER', 'ADMIN'] as UserRole[] },
];

export interface Customer {
  id: string;
  name: string;
  phone: string;
  email: string;
  orders: number;
  spent: number;
  points: number;
  lastSeen: string;
  tier: 'New' | 'Silver' | 'Gold' | 'Platinum';
  birthday?: string;
  anniversary?: string;
}
