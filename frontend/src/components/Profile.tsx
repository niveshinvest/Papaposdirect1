
import React, { useState, useEffect } from 'react';
import { User, Organization, StaffSession } from '../types';
import { 
  User as UserIcon, Mail, Shield, Smartphone, 
  Key, LogOut, ChevronRight, Bell, History, 
  ShieldCheck, Smartphone as DeviceIcon, Globe, MapPin, Award,
  Monitor, Tablet, Smartphone as PhoneIcon, XCircle, Loader2, RefreshCw
} from 'lucide-react';
import { sessionService } from '../services/sessionService';

interface ProfileProps {
  user: any | null;
  org: Organization | null;
  onSignOut: () => void;
}

const Profile: React.FC<ProfileProps> = ({ user, org, onSignOut }) => {
  const [sessions, setSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const displayName = user?.full_name || user?.name || 'Staff Member';
  const email = user?.email || 'No email provided';
  const role = user?.role || 'CASHIER';

  useEffect(() => {
    loadSessions();
  }, []);

  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const data = await sessionService.fetchActiveSessions();
      setSessions(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm("Revoke this session immediately? The staff user will be logged out.")) return;
    setRevokingId(id);
    try {
      await sessionService.revokeSession(id);
      await loadSessions();
    } catch (e) {
      alert("Failed to revoke session.");
    } finally {
      setRevokingId(null);
    }
  };

  const getDeviceIcon = (name: string) => {
    const lower = name.toLowerCase();
    if (lower.includes('mobile') || lower.includes('phone')) return <PhoneIcon size={20} className="text-orange-500" />;
    if (lower.includes('tablet') || lower.includes('ipad')) return <Tablet size={20} className="text-blue-500" />;
    return <Monitor size={20} className="text-indigo-500" />;
  };

  return (
    <div className="p-4 md:p-8 space-y-8 pb-32 max-w-5xl mx-auto animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="bg-slate-900 rounded-[48px] p-8 md:p-12 text-white relative overflow-hidden shadow-2xl">
        <div className="absolute top-0 right-0 p-20 opacity-10">
          <Shield size={240} />
        </div>
        <div className="relative z-10 flex flex-col md:flex-row items-center gap-8">
          <div className="w-32 h-32 rounded-[40px] bg-indigo-500 flex items-center justify-center font-black text-5xl shadow-xl border-4 border-white/20">
            {displayName.charAt(0)}
          </div>
          <div className="text-center md:text-left space-y-2">
            <div className="flex flex-col md:flex-row items-center gap-3">
              <h2 className="text-3xl md:text-4xl font-black tracking-tighter">{displayName}</h2>
              <span className="px-4 py-1 bg-green-500/20 border border-green-500/30 text-green-400 rounded-full text-[10px] font-black uppercase tracking-widest">
                Verified Account
              </span>
            </div>
            <p className="text-slate-400 font-medium text-lg">{email}</p>
            <div className="flex flex-wrap justify-center md:justify-start gap-3 mt-4">
              <span className="px-4 py-1.5 bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <Award size={14} className="text-orange-500" /> {role} Access
              </span>
              <span className="px-4 py-1.5 bg-white/10 rounded-xl text-xs font-black uppercase tracking-widest flex items-center gap-2">
                <ShieldCheck size={14} className="text-blue-400" /> {org?.plan} Plan
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="md:col-span-2 space-y-8">
          {/* Active Sessions Management */}
          <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b bg-gray-50/50 flex justify-between items-center">
               <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                 <Smartphone size={20} className="text-indigo-500" /> Active Devices
               </h3>
               <button onClick={loadSessions} className="p-2 hover:bg-white rounded-lg transition-all text-slate-400">
                  <RefreshCw size={16} className={loadingSessions ? 'animate-spin' : ''} />
               </button>
            </div>
            <div className="p-8 space-y-4">
               {loadingSessions && sessions.length === 0 ? (
                 <div className="py-10 flex flex-col items-center justify-center gap-2 text-slate-300">
                    <Loader2 className="animate-spin" />
                    <p className="text-[10px] font-black uppercase">Scanning Hardware Nodes...</p>
                 </div>
               ) : sessions.length === 0 ? (
                 <div className="py-10 text-center text-slate-300">
                    <p className="text-xs font-black uppercase">No active hardware sessions</p>
                 </div>
               ) : sessions.map(session => (
                 <div key={session.id} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100 group">
                    <div className="flex items-center gap-4">
                       <div className="p-3 bg-white rounded-2xl shadow-sm">
                          {getDeviceIcon(session.device_name)}
                       </div>
                       <div>
                          <p className="font-black text-slate-800 text-sm">{session.device_name}</p>
                          <div className="flex items-center gap-2 mt-0.5">
                             <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{session.profiles?.full_name}</span>
                             <span className="w-1 h-1 bg-slate-300 rounded-full"></span>
                             <span className="text-[9px] font-bold text-emerald-500 uppercase">Active Now</span>
                          </div>
                       </div>
                    </div>
                    <button 
                      onClick={() => handleRevoke(session.id)}
                      disabled={revokingId === session.id}
                      className="p-3 text-slate-300 hover:text-rose-500 hover:bg-rose-50 rounded-2xl transition-all"
                    >
                       {revokingId === session.id ? <Loader2 className="animate-spin" size={20} /> : <XCircle size={20} />}
                    </button>
                 </div>
               ))}
               <div className="pt-4 p-4 bg-indigo-50 rounded-3xl border border-indigo-100">
                  <p className="text-[10px] font-medium text-indigo-700 leading-relaxed">
                    <b>Admin Policy:</b> {role === 'OWNER' ? 'Multi-device allowed.' : 'Single device strictly enforced for staff roles. New logins will automatically terminate oldest active session.'}
                  </p>
               </div>
            </div>
          </section>

          <section className="bg-white rounded-[40px] border border-gray-100 shadow-sm overflow-hidden">
            <div className="p-8 border-b bg-gray-50/50">
               <h3 className="text-xl font-black text-slate-800 flex items-center gap-3">
                 <Shield size={20} className="text-indigo-500" /> Security & Privacy
               </h3>
            </div>
            <div className="p-8 space-y-4">
               {[
                 { title: 'Two-Factor Authentication', status: 'Enabled', icon: <Smartphone className="text-green-500" />, desc: 'Extra layer of security for your account logins.' },
                 { title: 'Biometric Login', status: 'Disabled', icon: <DeviceIcon className="text-slate-300" />, desc: 'Use fingerprint or face recognition on mobile.' },
                 { title: 'Session Timeout', status: '8 Hours', icon: <History className="text-blue-500" />, desc: 'Automatically sign out after period of inactivity.' }
               ].map((item, idx) => (
                 <div key={idx} className="flex items-center justify-between p-6 bg-slate-50 rounded-3xl border border-slate-100">
                    <div className="flex items-center gap-4">
                       <div className="p-3 bg-white rounded-2xl shadow-sm">
                          {item.icon}
                       </div>
                       <div>
                          <p className="font-black text-slate-800 text-sm">{item.title}</p>
                          <p className="text-[10px] text-slate-400 font-bold mt-0.5">{item.desc}</p>
                       </div>
                    </div>
                    <div className="flex items-center gap-3">
                       <span className={`text-[10px] font-black uppercase tracking-widest ${item.status === 'Enabled' ? 'text-green-600' : 'text-slate-400'}`}>{item.status}</span>
                       <ChevronRight size={16} className="text-slate-300" />
                    </div>
                 </div>
               ))}
            </div>
          </section>
        </div>

        <div className="space-y-8">
           <section className="bg-indigo-600 rounded-[40px] p-8 text-white space-y-6 shadow-xl shadow-indigo-100">
              <h4 className="text-lg font-black flex items-center gap-2 uppercase tracking-tight">
                <Bell size={20} /> Alerts Config
              </h4>
              <div className="space-y-4">
                 <div className="flex justify-between items-center opacity-80">
                    <span className="text-xs font-bold">Email Notifications</span>
                    <div className="w-10 h-5 bg-white/20 rounded-full relative"><div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div></div>
                 </div>
                 <div className="flex justify-between items-center opacity-80">
                    <span className="text-xs font-bold">POS Activity SMS</span>
                    <div className="w-10 h-5 bg-white/20 rounded-full relative"><div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full"></div></div>
                 </div>
              </div>
           </section>

           <button 
             onClick={onSignOut}
             className="w-full p-8 bg-red-50 text-red-600 rounded-[40px] flex flex-col items-center gap-2 hover:bg-red-100 transition-all group"
           >
             <LogOut size={32} className="group-hover:scale-110 transition-transform" />
             <span className="font-black uppercase tracking-widest text-xs">Sign Out Everywhere</span>
           </button>
        </div>
      </div>
    </div>
  );
};

export default Profile;
