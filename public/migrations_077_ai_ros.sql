-- Migration: AI-ROS Infrastructure
-- Description: Adds tables for AI Brain, Food Cost Guardian, Digital Twin, and AI-ROS

-- 1. Inventory AI Suggestions
CREATE TABLE IF NOT EXISTS public.inventory_ai_suggestions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    inventory_id UUID REFERENCES public.inventory(id) ON DELETE CASCADE,
    suggestion_type TEXT NOT NULL, -- 'DUPLICATE', 'NAMING', 'UNIT', 'CATEGORY', 'VENDOR'
    suggested_value TEXT,
    confidence NUMERIC(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. AI Business Insights
CREATE TABLE IF NOT EXISTS public.ai_business_insights (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    insight_type TEXT NOT NULL, -- 'BEST_SELLER', 'SLOW_SELLER', 'DEAD_STOCK', 'MARGIN', 'OPTIMIZATION'
    insight_text TEXT NOT NULL,
    confidence NUMERIC(3,2),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. AI Logs
CREATE TABLE IF NOT EXISTS public.ai_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    task_type TEXT NOT NULL,
    prompt TEXT,
    response TEXT,
    provider_used TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. AI Cache
CREATE TABLE IF NOT EXISTS public.ai_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    prompt_hash TEXT UNIQUE NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Food Cost Alerts
CREATE TABLE IF NOT EXISTS public.food_cost_alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
    alert_type TEXT NOT NULL, -- 'COST_SPIKE', 'LEAKAGE', 'VENDOR_INCREASE', 'MARGIN_COLLAPSE', 'WASTE'
    alert_message TEXT NOT NULL,
    severity TEXT NOT NULL, -- 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. Restaurant Simulations (Digital Twin)
CREATE TABLE IF NOT EXISTS public.restaurant_simulations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    simulation_date DATE NOT NULL,
    predicted_sales NUMERIC(12,2),
    predicted_orders INTEGER,
    predicted_inventory_usage JSONB,
    predicted_peak_hours JSONB,
    staffing_recommendation JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. Kitchen AI Metrics
CREATE TABLE IF NOT EXISTS public.kitchen_ai_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    order_id UUID REFERENCES public.orders(id) ON DELETE CASCADE,
    menu_item_id UUID REFERENCES public.menu_items(id) ON DELETE CASCADE,
    prep_time_seconds INTEGER,
    actual_completion_seconds INTEGER,
    delay_detected BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 8. AI Operational Actions (AI-ROS)
CREATE TABLE IF NOT EXISTS public.ai_operational_actions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
    outlet_id UUID REFERENCES public.outlets(id) ON DELETE CASCADE,
    action_type TEXT NOT NULL, -- 'AUTO_PO', 'AUTO_REORDER', 'PRICE_ADJUST', 'KITCHEN_PRIORITY'
    action_payload JSONB,
    ai_confidence NUMERIC(3,2),
    executed BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
