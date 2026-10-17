import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getSupabase } from '../../services/supabaseService';

const client = getSupabase();

export const useKpis = (outletId?: string) => {
  return useQuery({
    queryKey: ['inventory', 'kpis', outletId],
    queryFn: async () => {
      // Lightweight server queries; backend RPCs expected
      const { data } = await client.rpc('get_inventory_kpis', { p_outlet: outletId || null });
      return data || {};
    },
  });
};

export const useItems = () => {
  return useQuery({
    queryKey: ['inventory', 'items'],
    queryFn: async () => {
      const { data } = await client.from('items').select('*');
      return data || [];
    },
  });
};

export const useSuppliers = () => {
  return useQuery({
    queryKey: ['inventory', 'suppliers'],
    queryFn: async () => {
      const { data } = await client.from('suppliers').select('*');
      return data || [];
    },
  });
};

export const useBrands = () => {
  return useQuery({
    queryKey: ['inventory', 'brands'],
    queryFn: async () => {
      const { data } = await client.from('brands').select('*');
      return data || [];
    },
  });
};

export const useStockBatches = (outletId?: string) => {
  return useQuery({
    queryKey: ['inventory', 'batches', outletId],
    queryFn: async () => {
      const { data } = await client.from('inventory_batches').select('*, items(*)').eq('outlet_id', outletId || null);
      return data || [];
    },
    enabled: Boolean(outletId),
  });
};

export const useTransfers = () => {
  return useQuery({
    queryKey: ['inventory', 'transfers'],
    queryFn: async () => {
      const { data } = await client.from('stock_transfers').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });
};

export const useCreateBrand = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await client.from('brands').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }),
  });
};

export const useDeleteBrand = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await client.from('brands').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'brands'] }),
  });
};

export const useCreateTransfer = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await client.from('stock_transfers').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'transfers'] }),
  });
};

export const useCreateItem = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await client.from('items').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'items'] }),
  });
};

export const useStockAdjustments = () => {
  return useQuery({
    queryKey: ['inventory', 'adjustments'],
    queryFn: async () => {
      const { data } = await client.from('stock_adjustments').select('*').order('created_at', { ascending: false });
      return data || [];
    },
  });
};

export const useCreateAdjustment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data, error } = await client.from('stock_adjustments').insert(payload).select().single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory', 'adjustments'] }),
  });
};

export default {};
