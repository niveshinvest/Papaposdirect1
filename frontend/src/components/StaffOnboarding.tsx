import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2, CheckCircle2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { staffService } from '../services/staffService';

const StaffOnboarding: React.FC = () => {
  const navigate = useNavigate();
  const { token } = useParams<{ token: string }>();
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [invite, setInvite] = useState<any>(null);
  const [step, setStep] = useState<'verify' | 'setup' | 'success'>('verify');
  const [formData, setFormData] = useState({
    password: '',
    confirmPassword: '',
  });

  useEffect(() => {
    async function loadInvite() {
      try {
        const data = await staffService.verifyOnboardingToken(token);
        setInvite(data);
        setStep('setup');
      } catch (error: any) {
        alert(error.message || 'Invalid or expired invite link.');
        navigate('/auth');
      } finally {
        setLoading(false);
      }
    }

    loadInvite();
  }, [token, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      alert('Passwords do not match');
      return;
    }

    setProcessing(true);
    try {
      await staffService.completeOnboarding(
        token || '',
        formData.password,
        '',
        invite?.full_name || ''
      );
      setStep('success');
    } catch (error: any) {
      alert(error.message || 'Failed to complete onboarding');
    } finally {
      setProcessing(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <Loader2 className="animate-spin" size={40} />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="bg-white p-10 rounded-3xl w-full max-w-xl shadow-xl">
        {step === 'setup' && (
          <>
            <h2 className="text-2xl font-bold mb-2">Complete Your Setup</h2>
            <p className="text-slate-600 mb-6">
              {invite?.full_name || invite?.email} invited as {invite?.role}
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <input
                type="password"
                placeholder="Create password"
                required
                className="w-full p-3 border rounded-xl"
                value={formData.password}
                onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              />
              <input
                type="password"
                placeholder="Confirm password"
                required
                className="w-full p-3 border rounded-xl"
                value={formData.confirmPassword}
                onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
              />
              <button className="w-full bg-slate-900 text-white py-3 rounded-xl">
                {processing ? 'Activating...' : 'Activate Account'}
              </button>
            </form>
          </>
        )}

        {step === 'success' && (
          <div className="text-center">
            <CheckCircle2 size={40} className="mx-auto text-green-500" />
            <h2 className="text-xl font-bold mt-4">Account Activated</h2>
            <button
              onClick={() => navigate('/auth')}
              className="mt-4 bg-green-600 text-white px-6 py-2 rounded-xl"
            >
              Go to Login
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default StaffOnboarding;
