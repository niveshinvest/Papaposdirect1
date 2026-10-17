
import React, { useState, useEffect, useMemo } from 'react';
import { Store, Building2, ArrowRight, Plus, Loader2, LogOut, CheckCircle2, MapPin } from 'lucide-react';
import { companyService, outletService, authService } from '../services/supabaseService';
import { Company, Outlet, CompanyUser } from '../types';

interface TenantSelectionProps {
  onComplete: (company: Company, outlet: Outlet, role: string) => void;
  onSignOut: () => void;
}

export const TenantSelection: React.FC<TenantSelectionProps> = ({ onComplete, onSignOut }) => {
  const [step, setStep] = useState<'COMPANY' | 'OUTLET' | 'CREATE'>('COMPANY');
  const [companies, setCompanies] = useState<CompanyUser[]>([]);
  const [outlets, setOutlets] = useState<Outlet[]>([]);
  const [selectedCompanyUser, setSelectedCompanyUser] = useState<CompanyUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [profile, setProfile] = useState<any>(null);

  const canCreateCompany = useMemo(() => {
    const role = String(profile?.role || '').toUpperCase();
    return role === 'OWNER' || role === 'ADMIN';
  }, [profile?.role]);

  useEffect(() => {
    loadCompanies();
  }, []);

  const loadCompanies = async () => {
    setLoading(true);
    try {
      const [data, currentProfile] = await Promise.all([
        companyService.fetchUserCompanies(),
        authService.getProfile(),
      ]);
      setProfile(currentProfile);
      setCompanies(data);
      const role = String(currentProfile?.role || '').toUpperCase();
      const allowCreate = role === 'OWNER' || role === 'ADMIN';
      if (data.length === 0) {
        setStep(allowCreate ? 'CREATE' : 'COMPANY');
      } else if (data.length === 1) {
        handleSelectCompany(data[0], currentProfile);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectCompany = async (cu: CompanyUser, resolvedProfile?: any) => {
    setSelectedCompanyUser(cu);
    setLoading(true);
    try {
      const activeProfile = resolvedProfile || profile || (await authService.getProfile());
      const data = await outletService.fetchByCompany(cu.company_id);
      const allowedOutletIds = new Set(
        (activeProfile?.outlets || [])
          .map((outlet: any) => outlet?.id)
          .filter((id: string | undefined): id is string => Boolean(id))
      );

      const normalizedRole = String(cu.role || '').toUpperCase();
      const filteredOutlets =
        normalizedRole === 'OWNER'
          ? data
          : data.filter((outlet) => allowedOutletIds.has(outlet.id));

      setOutlets(filteredOutlets);
      if (filteredOutlets.length === 1) {
        onComplete(cu.companies!, filteredOutlets[0], cu.role);
      } else {
        setStep('OUTLET');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCompany = async () => {
    if (!newCompanyName.trim()) return;
    setLoading(true);
    try {
      const company = await companyService.createCompany(newCompanyName);
      // Refresh companies
      const data = await companyService.fetchUserCompanies();
      setCompanies(data);
      const newCu = data.find(cu => cu.company_id === company.id);
      if (newCu) {
        handleSelectCompany(newCu);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  if (loading && step === 'COMPANY' && companies.length === 0) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white">
        <Loader2 className="animate-spin text-orange-500 mb-4" size={48} />
        <p className="font-black uppercase tracking-widest text-[10px]">Syncing Enterprise Grid...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
      <div className="w-full max-w-xl bg-white rounded-[48px] shadow-2xl overflow-hidden flex flex-col animate-in zoom-in duration-500">
        <div className="p-12 bg-slate-900 text-white flex flex-col items-center gap-4 relative overflow-hidden">
          <div className="absolute top-0 right-0 p-20 opacity-5"><Building2 size={200} /></div>
          <div className="w-16 h-16 bg-orange-600 rounded-[24px] flex items-center justify-center shadow-2xl">
            <Store size={32} className="text-white" />
          </div>
          <div className="text-center space-y-1">
            <h2 className="text-3xl font-black tracking-tighter uppercase">
              {step === 'COMPANY' ? 'Select Company' : step === 'OUTLET' ? 'Select Outlet' : 'Initialize Brand'}
            </h2>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
              {step === 'COMPANY' ? 'Choose your active workspace' : step === 'OUTLET' ? `Welcome to ${selectedCompanyUser?.companies?.name}` : 'Start your PapaPOS journey'}
            </p>
          </div>
        </div>

        <div className="p-10 flex-1 overflow-y-auto max-h-[500px] space-y-4 custom-scrollbar">
          {error && (
            <div className="p-4 bg-rose-50 border border-rose-100 text-rose-600 rounded-2xl text-xs font-bold flex items-center gap-3">
              <div className="w-2 h-2 bg-rose-500 rounded-full animate-pulse" />
              {error}
            </div>
          )}

          {step === 'COMPANY' && (
            <div className="grid gap-3">
              {companies.map((cu) => (
                <button
                  key={cu.id}
                  onClick={() => handleSelectCompany(cu)}
                  className="group p-6 bg-slate-50 hover:bg-slate-900 hover:text-white rounded-[32px] border border-slate-100 transition-all flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white group-hover:bg-white/10 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-white/10">
                      <Building2 size={20} className="text-slate-400 group-hover:text-white" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 group-hover:text-white uppercase text-sm tracking-tight">{cu.companies?.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 group-hover:text-slate-500 uppercase tracking-widest">{cu.role}</p>
                    </div>
                  </div>
                  <ArrowRight size={20} className="text-slate-300 group-hover:text-white transition-transform group-hover:translate-x-1" />
                </button>
              ))}
              {canCreateCompany && (
                <button
                  onClick={() => setStep('CREATE')}
                  className="p-6 border-2 border-dashed border-slate-200 hover:border-orange-500 hover:bg-orange-50 rounded-[32px] transition-all flex items-center justify-center gap-3 text-slate-400 hover:text-orange-600 group"
                >
                  <Plus size={20} className="group-hover:scale-110 transition-transform" />
                  <span className="font-black uppercase text-xs tracking-widest">Create New Company</span>
                </button>
              )}
            </div>
          )}

          {step === 'OUTLET' && (
            <div className="grid gap-3">
              {outlets.length === 0 && (
                <div className="rounded-[32px] border border-amber-200 bg-amber-50 px-6 py-8 text-center">
                  <p className="text-xs font-black uppercase tracking-[0.24em] text-amber-700">No assigned outlets</p>
                  <p className="mt-3 text-sm font-medium text-amber-900">
                    This login is active, but no outlet has been assigned to it yet. Ask an owner or admin to map outlet access.
                  </p>
                </div>
              )}
              {outlets.map((o) => (
                <button
                  key={o.id}
                  onClick={() => onComplete(selectedCompanyUser!.companies!, o, selectedCompanyUser!.role)}
                  className="group p-6 bg-slate-50 hover:bg-orange-600 hover:text-white rounded-[32px] border border-slate-100 transition-all flex items-center justify-between text-left"
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 bg-white group-hover:bg-white/10 rounded-2xl flex items-center justify-center shadow-sm border border-slate-100 group-hover:border-white/10">
                      <MapPin size={20} className="text-slate-400 group-hover:text-white" />
                    </div>
                    <div>
                      <h4 className="font-black text-slate-900 group-hover:text-white uppercase text-sm tracking-tight">{o.name}</h4>
                      <p className="text-[10px] font-bold text-slate-400 group-hover:text-orange-200 uppercase tracking-widest">{o.id}</p>
                    </div>
                  </div>
                  <CheckCircle2 size={20} className="text-slate-300 group-hover:text-white transition-transform group-hover:scale-110" />
                </button>
              ))}
              <button
                onClick={() => setStep('COMPANY')}
                className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-900 transition-colors"
              >
                ← Back to Companies
              </button>
            </div>
          )}

          {step === 'CREATE' && (
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Company Name</label>
                <input
                  type="text"
                  className="w-full p-5 bg-slate-50 border-none rounded-[24px] font-bold text-slate-900 outline-none focus:ring-2 focus:ring-orange-500"
                  placeholder="e.g. Papa Burger HQ"
                  value={newCompanyName}
                  onChange={(e) => setNewCompanyName(e.target.value)}
                />
              </div>
              <button
                disabled={loading || !newCompanyName.trim()}
                onClick={handleCreateCompany}
                className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-3 active:scale-95 transition-all disabled:opacity-50"
              >
                {loading ? <Loader2 className="animate-spin" size={24} /> : 'Initialize Company'}
                {!loading && <ArrowRight size={18} />}
              </button>
              {companies.length > 0 && (
                <button
                  onClick={() => setStep('COMPANY')}
                  className="w-full py-4 text-slate-400 font-black uppercase text-[10px] tracking-widest hover:text-slate-900 transition-colors"
                >
                  Cancel
                </button>
              )}
            </div>
          )}
        </div>

        <div className="p-8 border-t bg-slate-50 flex justify-center">
          <button
            onClick={onSignOut}
            className="flex items-center gap-2 text-slate-400 hover:text-rose-600 font-black uppercase text-[10px] tracking-widest transition-colors"
          >
            <LogOut size={14} />
            Sign Out of PapaPOS
          </button>
        </div>
      </div>
    </div>
  );
};
