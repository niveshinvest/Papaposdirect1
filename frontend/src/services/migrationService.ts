
import { getAuthSupabase } from './supabaseService';

export interface MigrationStatus {
  currentVersion: number;
  latestAppliedAt: Date | null;
  needsUpdate: boolean;
  pendingVersions: number[];
}

// Registry of known migrations
const AVAILABLE_MIGRATIONS = [
  { version: 1, file: 'migrations_001_initial.sql' },
  { version: 2, file: 'migrations_002_outlets.sql' },
  { version: 3, file: 'migrations_003_outlet_compliance.sql' },
  { version: 4, file: 'migrations_004_fix_columns.sql' },
  { version: 5, file: 'migrations_005_whatsapp.sql' },
  { version: 6, file: 'migrations_006_reports_gst.sql' },
  { version: 7, file: 'migrations_007_core_auth.sql' },
  { version: 8, file: 'migrations_008_users_roles.sql' },
  { version: 9, file: 'migrations_009_menu_module.sql' },
  { version: 10, file: 'migrations_010_inventory_module.sql' },
  { version: 11, file: 'migrations_011_purchase_ocr.sql' },
  { version: 12, file: 'migrations_012_sales_billing.sql' },
  { version: 13, file: 'migrations_013_printer_kot.sql' },
  { version: 14, file: 'migrations_014_kitchen_display.sql' },
  { version: 15, file: 'migrations_015_dashboard_analytics.sql' },
  { version: 16, file: 'migrations_016_ai_services.sql' },
  { version: 17, file: 'migrations_017_delivery_integration.sql' },
  { version: 18, file: 'migrations_018_subscription_control.sql' },
  { version: 19, file: 'migrations_019_tables.sql' },
  { version: 20, file: 'migrations_020_fix_company_rls.sql' },
  { version: 21, file: 'migrations_021_fix_profile_rls.sql' },
  { version: 22, file: 'migrations_022_fix_recursion.sql' },
  { version: 23, file: 'migrations_023_fix_outlet_rls.sql' },
  { version: 24, file: 'migrations_024_operational_isolation.sql' },
  { version: 25, file: 'migrations_025_foundation.sql' },
  { version: 26, file: 'migrations_026_backfill.sql' },
  { version: 27, file: 'migrations_027_rls_hardening.sql' },
  { version: 28, file: 'migrations_028_bill_taxes_fix.sql' },
  { version: 29, file: 'migrations_029_menu_items_audit.sql' },
  { version: 30, file: 'migrations_030_menu_refinement.sql' },
  { version: 31, file: 'migrations_031_inventory_repair.sql' },
  { version: 32, file: 'migrations_032_customers_repair.sql' },
  { version: 35, file: 'migrations_035_inventory_type_fix.sql' },
  { version: 36, file: 'migrations_036_printer_registry.sql' },
  { version: 37, file: 'migrations_037_recipe_status.sql' },
  { version: 38, file: 'migrations_038_gst_compliance.sql' },
  { version: 39, file: 'migrations_039_staff_management.sql' },
  { version: 40, file: 'migrations_040_session_control.sql' },
  { version: 41, file: 'migrations_041_staff_compliance.sql' },
  { version: 42, file: 'migrations_042_enterprise_security.sql' },
  { version: 43, file: 'migrations_043_audit_logs_relationship.sql' },
  { version: 44, file: 'migrations_044_auto_approve_owner_terminal.sql' },
  { version: 45, file: 'migrations_045_item_tax_config.sql' },
  { version: 46, file: 'migrations_046_dashboard_aggregations.sql' },
  { version: 47, file: 'migrations_047_ai_insights.sql' },
  { version: 48, file: 'migrations_048_ai_recommendations.sql' },
  { version: 49, file: 'migrations_049_alert_delivery.sql' },
  { version: 50, file: 'migrations_050_ai_forecasting.sql' },
  { version: 51, file: 'migrations_051_ai_governance.sql' },
  { version: 52, file: 'migrations_052_ai_defense_explainability.sql' },
  { version: 53, file: 'migrations_053_payment_modes.sql' },
  { version: 54, file: 'migrations_054_staff_onboarding.sql' },
  { version: 55, file: 'migrations_055_realtime_reporting.sql' },
  { version: 56, file: 'migrations_056_analytics_rpcs.sql' },
  { version: 57, file: 'migrations_057_invoice_schema_compliance.sql' },
  { version: 58, file: 'migrations_058_staff_sessions_identity_link.sql' },
  { version: 59, file: 'migrations_059_outlet_gst_fix.sql' },
  { version: 60, file: 'migrations_060_menu_modifiers.sql' },
  { version: 61, file: 'migrations_061_invoice_modifiers.sql' },
  { version: 62, file: 'migrations_062_rls_fix.sql' },
  { version: 63, file: 'migrations_063_invoice_fix.sql' },
  { version: 64, file: 'migrations_064_kds_fix.sql' },
  { version: 65, file: 'migrations_065_pos_hardening.sql' },
  { version: 66, file: 'migrations_066_invoices_baseline.sql' },
  { version: 67, file: 'migrations_067_fix_printer_registry.sql' },
  { version: 68, file: 'migrations_068_fix_recipe_generation.sql' },
  { version: 69, file: 'migrations_069_restore_manual_recipes.sql' },
  { version: 70, file: 'migrations_070_fix_recipe_status_constraint.sql' },
  { version: 71, file: 'migrations_071_inventory_pro.sql' },
  { version: 72, file: 'migrations_072_inventory_matching.sql' },
  { version: 73, file: 'migrations_073_inventory_ledger_refs.sql' },
  { version: 74, file: 'migrations_074_schema_normalization_audit.sql' },
  { version: 75, file: 'migrations_075_pos_edit_audit.sql' },
  { version: 76, file: 'migrations_076_ai_providers.sql' },
  { version: 77, file: 'migrations_077_ai_ros.sql' },
  { version: 78, file: 'migrations_078_multi_tenant_fix.sql' },
  { version: 79, file: 'migrations_079_fix_recursion.sql' },
  { version: 80, file: 'migrations_080_staff_sessions_unique_index.sql' },
  { version: 81, file: 'migrations_081_fix_staff_history_actor.sql' },
  { version: 82, file: 'migrations_082_fix_profiles_recursion_v3.sql' },
  { version: 83, file: 'migrations_083_fix_inventory_relationships.sql' },
  { version: 84, file: 'migrations_084_security_logs.sql' },
  { version: 85, file: 'migrations_085_fix_auth_trigger.sql' },
  { version: 86, file: 'migrations_086_add_auth_user_id_to_staff.sql' },
  { version: 87, file: 'migrations_087_kitchen_logs_outlet_fix.sql' },
  { version: 88, file: 'migrations_088_profile_auth_cleanup.sql' },
  { version: 89, file: 'migrations_089_membership_rls_rebuild.sql' },
  { version: 90, file: 'migrations_090_printer_preferences.sql' },
  { version: 91, file: 'migrations_091_printer_preferences_multi_route.sql' },
  { version: 101, file: 'migrations_101_invoice_rpc_schema_fix.sql' },
  { version: 102, file: 'migrations_102_invoice_rpc_inventory_guard_fix.sql' },
  { version: 103, file: 'migrations_103_invoice_retry_trigger_fix.sql' },
  { version: 104, file: 'migrations_104_admin_invoice_item_backfill.sql' }
];

export const getDatabaseVersion = async (): Promise<MigrationStatus> => {
  const supabase = getAuthSupabase();
  const allKnownVersions = AVAILABLE_MIGRATIONS.map(m => m.version);
  
  if (!supabase) return { 
    currentVersion: 0, 
    latestAppliedAt: null, 
    needsUpdate: true, 
    pendingVersions: allKnownVersions 
  };

  try {
    const { data, error } = await supabase
      .from('schema_migrations')
      .select('*')
      .order('version', { ascending: false });

    if (error) {
      if (error.code === '42P01' || error.code === 'PGRST116') return { 
        currentVersion: 0, 
        latestAppliedAt: null, 
        needsUpdate: true, 
        pendingVersions: allKnownVersions 
      };
      throw new Error(error.message);
    }

    const appliedVersions = new Set(data?.map(m => m.version) || []);
    const pending = AVAILABLE_MIGRATIONS
      .filter(m => !appliedVersions.has(m.version))
      .map(m => m.version);

    return {
      currentVersion: data && data.length > 0 ? data[0].version : 0,
      latestAppliedAt: data && data.length > 0 ? new Date(data[0].applied_at) : null,
      needsUpdate: pending.length > 0,
      pendingVersions: pending
    };
  } catch (e: any) {
    console.error("Failed to check DB version:", e);
    const isFetchError = e instanceof TypeError && e.message.includes('fetch');
    return { 
      currentVersion: 0, 
      latestAppliedAt: null, 
      needsUpdate: true, 
      pendingVersions: allKnownVersions,
      error: isFetchError ? "Cloud connection failed. Check your Supabase URL and Internet." : e.message
    } as any;
  }
};

export const applyMigration = async (version: number, sql: string): Promise<{ success: boolean; message: string }> => {
  const supabase = getAuthSupabase();
  if (!supabase) return { success: false, message: "Supabase not initialized" };

  try {
    const { error } = await supabase.rpc('exec_sql', { sql_query: sql });
    
    if (error) {
      console.error("Migration execution failed:", error);
      return { success: false, message: error.message };
    }

    return { success: true, message: `Migration ${version} applied successfully.` };
  } catch (e: any) {
    return { success: false, message: e.message };
  }
};

export const getMigrationFile = (version: number) => {
  return AVAILABLE_MIGRATIONS.find(m => m.version === version)?.file;
};
