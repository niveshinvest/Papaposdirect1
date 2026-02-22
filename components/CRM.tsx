
import React, { useState } from 'react';
import { 
  Users, Search, Plus, Filter, 
  MessageSquare, Mail, Phone, 
  TrendingUp, Star, Award, ChevronRight,
  Download, Calendar, X, History, Gift, MapPin,
  Cake, Heart, UserPlus, Trash2
} from 'lucide-react';
import { Customer } from '../constants';

interface CRMProps {
  customers: Customer[];
  onSaveCustomer: (customer: Customer) => Promise<void>;
  onDeleteCustomer: (id: string) => Promise<void>;
}

const CRM: React.FC<CRMProps> = ({ customers, onSaveCustomer, onDeleteCustomer }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  
  const [formData, setFormData] = useState<Omit<Customer, 'id' | 'orders' | 'spent' | 'points' | 'lastSeen' | 'tier'>>({
    name: '',
    phone: '',
    email: '',
    birthday: '',
    anniversary: ''
  });

  const filteredCustomers = customers.filter(c => 
    (c.name || '').toLowerCase().includes(searchQuery.toLowerCase()) || 
    (c.phone || '').includes(searchQuery)
  );

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const newCustomer: Customer = {
      ...formData,
      id: `CUST-${Date.now()}`,
      orders: 0,
      spent: 0,
      points: 0,
      lastSeen: 'Just now',
      tier: 'New'
    };
    await onSaveCustomer(newCustomer);
    setIsAddModalOpen(false);
    setFormData({ name: '', phone: '', email: '', birthday: '', anniversary: '' });
  };

  return (
    <div className="p-8 space-y-8 min-h-screen pb-20 max-w-7xl mx-auto">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-gray-800 tracking-tight">Customer Database</h2>
          <p className="text-sm text-gray-500 font-medium">Manage loyalty profiles and engagement history.</p>
        </div>
        <div className="flex gap-3">
          <button className="flex items-center gap-2 px-4 py-2 border-2 border-gray-100 bg-white rounded-xl font-bold text-gray-600 hover:bg-gray-50 transition-all">
            <Download size={18} /> Export List
          </button>
          <button 
            onClick={() => setIsAddModalOpen(true)}
            className="flex items-center gap-2 bg-[#FF6B00] text-white px-6 py-2.5 rounded-xl font-bold shadow-xl shadow-orange-100 hover:scale-105 transition-all"
          >
            <Plus size={20} /> New Profile
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-blue-100 text-blue-600 rounded-2xl"><Users size={24} /></div>
          <div><p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Guests</p><h3 className="text-2xl font-black text-gray-800">{customers.length}</h3></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-purple-100 text-purple-600 rounded-2xl"><Star size={24} /></div>
          <div><p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Gold/Plat</p><h3 className="text-2xl font-black text-gray-800">{customers.filter(c => ['Gold', 'Platinum'].includes(c.tier)).length}</h3></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-green-100 text-green-600 rounded-2xl"><TrendingUp size={24} /></div>
          <div><p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Active/30d</p><h3 className="text-2xl font-black text-gray-800">88%</h3></div>
        </div>
        <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm flex items-center gap-4">
          <div className="p-3 bg-orange-100 text-orange-600 rounded-2xl"><Gift size={24} /></div>
          <div><p className="text-gray-500 text-[10px] font-black uppercase tracking-widest">Rewardable</p><h3 className="text-2xl font-black text-gray-800">{customers.filter(c => c.points > 100).length}</h3></div>
        </div>
      </div>

      <div className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
        <div className="p-6 border-b flex bg-gray-50/30 gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
            <input 
              type="text" 
              placeholder="Search by name or phone..." 
              className="w-full pl-12 pr-4 py-3 bg-white border border-gray-200 rounded-2xl outline-none focus:ring-2 focus:ring-orange-500 transition-all font-medium text-slate-900" 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="bg-gray-50 text-gray-400 text-[10px] font-black uppercase tracking-widest">
              <tr>
                <th className="px-8 py-5">Guest</th>
                <th className="px-8 py-5">Contact</th>
                <th className="px-8 py-5 text-center">Tier</th>
                <th className="px-8 py-5 text-center">Orders</th>
                <th className="px-8 py-5 text-center">Spent</th>
                <th className="px-8 py-5 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filteredCustomers.map((customer) => {
                const initial = (customer.name || 'G').charAt(0);
                return (
                  <tr 
                    key={customer.id} 
                    className="hover:bg-gray-50/80 transition-colors group cursor-pointer"
                    onClick={() => setSelectedCustomer(customer)}
                  >
                    <td className="px-8 py-6">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center font-black text-slate-400 uppercase">{initial}</div>
                        <div>
                          <p className="font-bold text-gray-800">{customer.name || 'Anonymous'}</p>
                          <p className="text-[10px] text-gray-400 font-black uppercase tracking-widest">{customer.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-8 py-6">
                      <p className="text-sm font-medium text-gray-600 flex items-center gap-2"><Phone size={12} className="text-gray-300" /> {customer.phone}</p>
                    </td>
                    <td className="px-8 py-6 text-center">
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${
                        customer.tier === 'Platinum' ? 'bg-indigo-100 text-indigo-700' :
                        customer.tier === 'Gold' ? 'bg-yellow-100 text-yellow-700' :
                        customer.tier === 'Silver' ? 'bg-slate-100 text-slate-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {customer.tier}
                      </span>
                    </td>
                    <td className="px-8 py-6 text-center font-bold text-gray-800">{customer.orders}</td>
                    <td className="px-8 py-6 text-center font-black text-gray-800">₹{customer.spent.toLocaleString()}</td>
                    <td className="px-8 py-6 text-right">
                      <button onClick={(e) => { e.stopPropagation(); onDeleteCustomer(customer.id); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={18} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-[48px] w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in duration-300">
              <div className="p-10 bg-orange-500 text-white flex flex-col items-center gap-4">
                 <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md"><Plus size={32} /></div>
                 <h3 className="text-2xl font-black tracking-tight">Create Profile</h3>
              </div>
              <form onSubmit={handleSave} className="p-10 space-y-6">
                 <input className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl font-bold text-slate-900" placeholder="Full Name" required value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} />
                 <input className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl font-bold text-slate-900" placeholder="Phone" required value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} />
                 <input className="w-full px-5 py-4 bg-gray-50 border-none rounded-2xl font-bold text-slate-900" placeholder="Email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} />
                 <button type="submit" className="w-full py-5 bg-[#FF6B00] rounded-[24px] text-white font-black uppercase tracking-widest text-sm shadow-xl shadow-orange-100">Add Customer</button>
                 <button type="button" onClick={() => setIsAddModalOpen(false)} className="w-full text-gray-400 font-black uppercase tracking-widest text-[10px]">Cancel</button>
              </form>
           </div>
        </div>
      )}

      {selectedCustomer && (
        <div className="fixed inset-0 z-[150] flex items-center justify-end bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-xl h-screen shadow-2xl flex flex-col animate-in slide-in-from-right duration-500">
            <div className="p-8 border-b bg-gray-50/50 flex justify-between items-center">
               <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-slate-900 text-white rounded-[20px] flex items-center justify-center text-xl font-black">{(selectedCustomer.name || 'G').charAt(0)}</div>
                  <div>
                    <h3 className="text-xl font-black text-gray-800">{selectedCustomer.name || 'Guest'}</h3>
                    <p className="text-xs font-bold text-gray-500">{selectedCustomer.phone}</p>
                  </div>
               </div>
               <button onClick={() => setSelectedCustomer(null)} className="p-2 hover:bg-white border rounded-full transition-all"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
               <div className="grid grid-cols-3 gap-4 text-center">
                  <div className="p-6 bg-orange-50 rounded-[32px] border border-orange-100"><p className="text-[10px] font-black uppercase text-orange-400">Visits</p><p className="text-2xl font-black text-orange-600">{selectedCustomer.orders}</p></div>
                  <div className="p-6 bg-blue-50 rounded-[32px] border border-blue-100"><p className="text-[10px] font-black uppercase text-blue-400">Spent</p><p className="text-xl font-black text-blue-600">₹{selectedCustomer.spent}</p></div>
                  <div className="p-6 bg-purple-50 rounded-[32px] border border-purple-100"><p className="text-[10px] font-black uppercase text-purple-400">Points</p><p className="text-2xl font-black text-purple-600">{selectedCustomer.points}</p></div>
               </div>
            </div>
            <div className="p-8 border-t bg-white">
               <button onClick={() => setSelectedCustomer(null)} className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black uppercase tracking-widest text-xs">Close Profile</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CRM;
