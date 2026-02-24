
import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://grcewyvwjllhzmdbaova.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_xjCGBzJboB1fozNos563ig_GUUDL0T1';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function runAudit() {
  const setupSql = `
    CREATE OR REPLACE FUNCTION public.audit_query(sql_query TEXT)
    RETURNS JSONB AS $$
    DECLARE
        result JSONB;
    BEGIN
        EXECUTE 'SELECT jsonb_agg(t) FROM (' || sql_query || ') t' INTO result;
        RETURN result;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;
    
    NOTIFY pgrst, 'reload schema';
  `;

  console.log("Setting up audit function...");
  await supabase.rpc('exec_sql', { sql_query: setupSql });

  // Wait a bit for the cache to reload
  console.log("Waiting for schema cache reload...");
  await new Promise(resolve => setTimeout(resolve, 2000));

  const queries = [
    {
      name: 'COLUMNS',
      sql: `
        SELECT table_name, column_name, data_type
        FROM information_schema.columns
        WHERE table_name IN ('orders', 'invoices', 'invoice_items', 'kitchen_orders', 'payment_modes')
        ORDER BY table_name, ordinal_position
      `
    },
    {
      name: 'CONSTRAINTS',
      sql: `
        SELECT
          tc.table_name,
          tc.constraint_name,
          cc.check_clause
        FROM information_schema.table_constraints tc
        JOIN information_schema.check_constraints cc
          ON tc.constraint_name = cc.constraint_name
        WHERE tc.table_name IN ('orders', 'invoice_items', 'invoices', 'kitchen_orders')
      `
    },
    {
      name: 'ENUMS',
      sql: `
        SELECT t.typname, e.enumlabel
        FROM pg_type t
        JOIN pg_enum e ON t.oid = e.enumtypid
        ORDER BY t.typname, e.enumsortorder
      `
    }
  ];

  for (const q of queries) {
    console.log(`--- ${q.name} START ---`);
    let retry = 3;
    while (retry > 0) {
      const { data, error } = await supabase.rpc('audit_query', { sql_query: q.sql });
      if (error) {
        if (error.message.includes('schema cache')) {
          console.log("Cache still stale, retrying...");
          await new Promise(resolve => setTimeout(resolve, 2000));
          retry--;
          continue;
        }
        console.error(`Error in ${q.name}:`, error.message);
        break;
      } else {
        console.log(JSON.stringify(data, null, 2));
        break;
      }
    }
    console.log(`--- ${q.name} END ---`);
  }
  
  // Cleanup
  await supabase.rpc('exec_sql', { sql_query: 'DROP FUNCTION public.audit_query(TEXT); NOTIFY pgrst, "reload schema";' });
}

runAudit();
