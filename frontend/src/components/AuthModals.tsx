
import React, { useState } from 'react';
import { X, Lock, Mail, Smartphone, ShieldCheck, ArrowRight, Loader2, CheckCircle2 } from 'lucide-react';

interface AuthModalProps {
  platform: 'hyperpure' | 'amazon';
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const AuthModals: React.FC<AuthModalProps> = ({ platform, isOpen, onClose, onSuccess }) => {
  const [step, setStep] = useState<'login' | 'otp' | 'success'>('login');
  const [isLoading, setIsLoading] = useState(false);

  if (!isOpen) return null;

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('otp');
    }, 1500);
  };

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setTimeout(() => {
      setIsLoading(false);
      setStep('success');
      setTimeout(() => {
        onSuccess();
        onClose();
        setStep('login'); // Reset for next time
      }, 1500);
    }, 1500);
  };

  const isHyperpure = platform === 'hyperpure';

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="bg-white rounded-[40px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
        
        {/* Header Section */}
        <div className={`p-10 text-white flex flex-col items-center gap-4 ${isHyperpure ? 'bg-[#1b8a4f]' : 'bg-[#232f3e]'}`}>
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center shadow-xl p-2">
            <img 
              src={isHyperpure ? 'https://hyperpure.com/static/images/hp_logo.png' : 'https://www.amazon.in/favicon.ico'} 
              className="max-h-full object-contain" 
              alt={platform} 
            />
          </div>
          <div className="text-center">
            <h3 className="text-xl font-black tracking-tight">
              {isHyperpure ? 'Hyperpure Partner' : 'Amazon Business'}
            </h3>
            <p className="text-[10px] font-black opacity-70 uppercase tracking-widest mt-1">
              Secure B2B Integration
            </p>
          </div>
          <button onClick={onClose} className="absolute top-6 right-6 p-2 text-white/50 hover:text-white transition-all">
            <X size={20} />
          </button>
        </div>

        {/* Content Section */}
        <div className="p-10">
          {step === 'login' && (
            <form onSubmit={handleLogin} className="space-y-6">
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">
                  {isHyperpure ? 'Registered Phone' : 'Work Email'}
                </label>
                <div className="relative">
                  {isHyperpure ? <Smartphone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} /> : <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />}
                  <input 
                    type={isHyperpure ? 'tel' : 'email'} 
                    required
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-slate-900 transition-all" 
                    placeholder={isHyperpure ? '+91 98765 43210' : 'admin@restaurant.com'}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Access Key / Password</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-300" size={18} />
                  <input 
                    type="password" 
                    required
                    className="w-full pl-12 pr-4 py-4 bg-gray-50 border-none rounded-2xl font-bold focus:ring-2 focus:ring-slate-900 transition-all" 
                    placeholder="••••••••"
                  />
                </div>
              </div>
              <button 
                disabled={isLoading}
                className={`w-full py-5 rounded-[24px] text-white font-black uppercase tracking-widest text-sm shadow-xl transition-all active:scale-95 flex items-center justify-center gap-2 ${isHyperpure ? 'bg-[#1b8a4f] shadow-green-100' : 'bg-[#232f3e] shadow-slate-100'}`}
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : <>Sign In <ArrowRight size={18} /></>}
              </button>
            </form>
          )}

          {step === 'otp' && (
            <form onSubmit={handleVerify} className="space-y-6 text-center">
              <div className="p-4 bg-orange-50 rounded-2xl border border-orange-100 mb-6">
                <p className="text-xs font-bold text-orange-700">A verification code has been sent to your registered mobile ending in 210.</p>
              </div>
              <div className="flex justify-center gap-3">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <input 
                    key={i}
                    type="text" 
                    maxLength={1}
                    className="w-12 h-14 bg-gray-50 border-2 border-transparent focus:border-slate-900 rounded-xl text-center font-black text-xl outline-none"
                    autoFocus={i === 1}
                  />
                ))}
              </div>
              <button 
                disabled={isLoading}
                className="w-full py-5 bg-slate-900 text-white rounded-[24px] font-black uppercase tracking-widest text-sm shadow-xl flex items-center justify-center gap-2 mt-4"
              >
                {isLoading ? <Loader2 className="animate-spin" size={20} /> : 'Verify & Link Account'}
              </button>
              <button type="button" className="text-xs font-bold text-slate-400 hover:text-slate-900 transition-colors">Resend Code</button>
            </form>
          )}

          {step === 'success' && (
            <div className="py-10 flex flex-col items-center text-center animate-in zoom-in duration-500">
               <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mb-6 shadow-inner">
                  <CheckCircle2 size={48} />
               </div>
               <h4 className="text-2xl font-black text-slate-800">Connection Successful</h4>
               <p className="text-sm font-medium text-slate-400 mt-2">
                 Your {isHyperpure ? 'Hyperpure' : 'Amazon Business'} account is now synced with Petpooja Pro.
               </p>
            </div>
          )}
        </div>

        <div className="px-10 pb-10">
           <div className="pt-6 border-t border-gray-100 flex items-center gap-3 opacity-50">
              <ShieldCheck size={16} />
              <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Bank-grade 256-bit Encryption</p>
           </div>
        </div>
      </div>
    </div>
  );
};

export default AuthModals;
