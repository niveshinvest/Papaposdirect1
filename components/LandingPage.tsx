
import React from 'react';
import { PRICING_PLANS, COLORS, DEMO_ACCOUNT } from '../constants';
import { ShoppingBag, Package, BarChart3, BrainCircuit, Users, Receipt, Bike, Check, ArrowRight, Zap, Globe, ShieldCheck, X } from 'lucide-react';
import { SubscriptionPlan, Organization, User } from '../types';

interface LandingPageProps {
  onGetStarted: (plan: SubscriptionPlan) => void;
  onLogin: () => void;
}

const LandingPage: React.FC<LandingPageProps> = ({ onGetStarted, onLogin }) => {
  return (
    <div className="bg-white text-[#1e293b]">
      {/* Navbar */}
      <nav className="fixed top-0 left-0 right-0 bg-white/80 backdrop-blur-md z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF6B00] rounded-xl flex items-center justify-center font-black text-white text-xl">P</div>
            <span className="text-xl font-black tracking-tighter">PapaPos <span className="text-orange-500">Pro</span></span>
          </div>
          <div className="hidden md:flex items-center gap-8">
            <a href="#features" className="text-sm font-bold text-gray-500 hover:text-orange-500 transition-colors">Features</a>
            <a href="#pricing" className="text-sm font-bold text-gray-500 hover:text-orange-500 transition-colors">Pricing</a>
            <a href="#solutions" className="text-sm font-bold text-gray-500 hover:text-orange-500 transition-colors">Solutions</a>
          </div>
          <div className="flex items-center gap-4">
            <button onClick={onLogin} className="text-sm font-black text-gray-600 hover:text-orange-500 px-4">Login</button>
            <button onClick={() => onGetStarted('BASIC')} className="bg-[#1e293b] text-white px-6 py-2.5 rounded-xl font-black text-sm shadow-xl shadow-slate-200 hover:scale-105 transition-all">Start Free Trial</button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-40 pb-20 px-6">
        <div className="max-w-7xl mx-auto text-center space-y-8">
          <div className="inline-flex items-center gap-2 px-4 py-2 bg-orange-50 border border-orange-100 rounded-full">
            <span className="w-2 h-2 bg-orange-500 rounded-full animate-pulse"></span>
            <span className="text-xs font-black text-orange-600 uppercase tracking-widest">New: AI Demand Forecasting</span>
          </div>
          <h1 className="text-6xl md:text-8xl font-black tracking-tighter text-slate-900 leading-[1] max-w-5xl mx-auto">
            The Operating System for <span className="text-orange-500">Modern Restaurants.</span>
          </h1>
          <p className="text-xl text-gray-500 max-w-2xl mx-auto font-medium leading-relaxed">
            From single cafes to multi-outlet chains. Manage POS, Inventory, AI Insights, and Delivery Integrations in one unified platform.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-6">
            <button onClick={() => onGetStarted('BASIC')} className="w-full sm:w-auto px-10 py-5 bg-[#FF6B00] text-white rounded-[24px] font-black text-lg shadow-2xl shadow-orange-200 hover:scale-105 transition-all flex items-center justify-center gap-3">
              Get Started for Free <ArrowRight size={24} />
            </button>
          </div>
          <div className="pt-20">
            <div className="relative max-w-6xl mx-auto rounded-[40px] border-8 border-slate-900 overflow-hidden shadow-2xl">
              <img src="https://images.unsplash.com/photo-1552566626-52f8b828add9?w=1200&h=600&fit=crop" className="w-full object-cover" alt="App Dashboard Preview" />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/40 to-transparent"></div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-32 px-6 bg-slate-50">
        <div className="max-w-7xl mx-auto">
          <div className="text-center space-y-4 mb-20">
            <h2 className="text-4xl font-black tracking-tight">Flexible Plans for Every Scale</h2>
            <p className="text-gray-500 font-medium">Transparent pricing. No hidden fees. Cancel anytime.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {PRICING_PLANS.map((plan) => (
              <div key={plan.id} className={`bg-white p-10 rounded-[48px] border-2 transition-all hover:shadow-2xl flex flex-col justify-between ${plan.id === 'PRO' ? 'border-orange-500 scale-105 shadow-xl relative' : 'border-slate-100'}`}>
                {plan.id === 'PRO' && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-orange-500 text-white px-6 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">Most Popular</div>
                )}
                <div className="space-y-6">
                  <div>
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                    <p className="text-sm text-gray-500 font-medium mt-2">{plan.description}</p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-5xl font-black">{plan.price}</span>
                    <span className="text-gray-400 font-bold">{plan.period}</span>
                  </div>
                  <div className="space-y-4 pt-4">
                    {plan.features.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm font-bold text-slate-700">
                        <Check size={18} className="text-orange-500 shrink-0" /> {f}
                      </div>
                    ))}
                    {plan.notIncluded.map((f, i) => (
                      <div key={i} className="flex items-center gap-3 text-sm font-bold text-gray-300">
                        <X size={18} className="shrink-0" /> {f}
                      </div>
                    ))}
                  </div>
                </div>
                <button 
                  onClick={() => onGetStarted(plan.id)}
                  className={`w-full py-5 rounded-[24px] font-black text-sm uppercase tracking-widest mt-12 transition-all ${plan.id === 'PRO' ? 'bg-[#FF6B00] text-white shadow-xl shadow-orange-100' : 'bg-slate-900 text-white'}`}
                >
                  Choose {plan.name}
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Stats / Proof */}
      <section className="py-20 bg-slate-900 text-white">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-12 text-center">
          <div className="space-y-2">
            <h4 className="text-5xl font-black text-orange-500">25,000+</h4>
            <p className="text-sm font-black uppercase tracking-widest opacity-60">Restaurants Managed</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-5xl font-black text-orange-500">₹850Cr+</h4>
            <p className="text-sm font-black uppercase tracking-widest opacity-60">Monthly Transaction Value</p>
          </div>
          <div className="space-y-2">
            <h4 className="text-5xl font-black text-orange-500">99.99%</h4>
            <p className="text-sm font-black uppercase tracking-widest opacity-60">Platform Uptime</p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-white py-20 border-t border-gray-100">
        <div className="max-w-7xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-[#FF6B00] rounded-xl flex items-center justify-center font-black text-white text-xl">P</div>
            <span className="text-xl font-black tracking-tighter">PapaPos Pro</span>
          </div>
          <div className="flex gap-8 text-sm font-bold text-gray-400">
            <a href="#" className="hover:text-slate-900">Privacy Policy</a>
            <a href="#" className="hover:text-slate-900">Terms of Service</a>
            <a href="#" className="hover:text-slate-900">Security</a>
          </div>
          <p className="text-sm font-bold text-gray-400">© 2024 PapaPos Pro SaaS. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
};

export default LandingPage;
