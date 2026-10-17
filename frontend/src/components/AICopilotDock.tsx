import React, { useEffect, useMemo, useState } from 'react';
import { Mic, MicOff, BrainCircuit, Send, Sparkles, X } from 'lucide-react';
import { Organization, Outlet, ViewMode } from '../types';
import { appCopilotService } from '../services/appCopilotService';

interface AICopilotDockProps {
  currentView: ViewMode;
  user: any;
  org: Organization | null;
  activeOutlet: Outlet | null;
  onNavigate: (view: ViewMode) => void;
}

const AICopilotDock: React.FC<AICopilotDockProps> = ({ currentView, user, org, activeOutlet, onNavigate }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<Array<{ role: 'assistant' | 'user'; text: string }>>([]);

  const greetingKey = useMemo(() => `${user?.id || 'guest'}:${activeOutlet?.id || 'no-outlet'}`, [user?.id, activeOutlet?.id]);

  useEffect(() => {
    let cancelled = false;
    const maybeGreet = async () => {
      const storageKey = `papapos_ai_greeted_${greetingKey}`;
      if (sessionStorage.getItem(storageKey) === 'true') return;
      const greeting = await appCopilotService.greet({ currentView, user, org, activeOutlet });
      if (!cancelled && greeting) {
        setMessages([{ role: 'assistant', text: greeting }]);
        sessionStorage.setItem(storageKey, 'true');
      }
    };
    maybeGreet();
    return () => {
      cancelled = true;
    };
  }, [greetingKey, currentView, user, org, activeOutlet]);

  const sendMessage = async (message: string) => {
    const trimmed = message.trim();
    if (!trimmed) return;

    setMessages(prev => [...prev, { role: 'user', text: trimmed }]);
    setInput('');
    setLoading(true);

    try {
      const result = await appCopilotService.run(trimmed, { currentView, user, org, activeOutlet });

      if (result.type === 'navigate') {
        const answer = `Opening ${result.view.replace(/_/g, ' ')} for you.`;
        setMessages(prev => [...prev, { role: 'assistant', text: answer }]);
        appCopilotService.speak(answer);
        onNavigate(result.view);
      } else if (result.type === 'report') {
        setMessages(prev => [...prev, { role: 'assistant', text: result.answer }]);
        appCopilotService.speak(result.answer);
        onNavigate(result.view);
      } else {
        setMessages(prev => [...prev, { role: 'assistant', text: result.answer }]);
        appCopilotService.speak(result.answer);
      }
    } finally {
      setLoading(false);
    }
  };

  const toggleVoice = () => {
    if (isListening) {
      setIsListening(false);
      return;
    }

    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser.');
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    setIsListening(true);

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript || '';
      setIsListening(false);
      setInput(transcript);
      void sendMessage(transcript);
    };

    recognition.onerror = () => {
      setIsListening(false);
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  return (
    <>
      <button
        onClick={() => setIsOpen(prev => !prev)}
        className="fixed bottom-24 right-6 z-[1100] w-16 h-16 rounded-full bg-slate-900 text-white shadow-2xl flex items-center justify-center border-4 border-white"
      >
        {isOpen ? <X size={24} /> : <BrainCircuit size={24} />}
      </button>

      {isOpen && (
        <div className="fixed bottom-44 right-6 z-[1100] w-[360px] max-w-[calc(100vw-2rem)] bg-white rounded-[32px] shadow-2xl border border-slate-200 overflow-hidden">
          <div className="p-5 bg-slate-900 text-white flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center">
              <Sparkles size={20} />
            </div>
            <div>
              <p className="font-black text-sm">PapaPOS AI Copilot</p>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Role-aware, voice-ready, cross-module</p>
            </div>
          </div>

          <div className="p-4 max-h-[340px] overflow-y-auto space-y-3 bg-slate-50">
            {messages.length === 0 && (
              <div className="text-sm font-medium text-slate-500">Ask me to open a module, explain an error, generate a report, or suggest business actions.</div>
            )}
            {messages.map((message, index) => (
              <div
                key={`${message.role}-${index}`}
                className={`rounded-2xl px-4 py-3 text-sm ${message.role === 'assistant' ? 'bg-white text-slate-700 border border-slate-200' : 'bg-indigo-600 text-white ml-8'}`}
              >
                {message.text}
              </div>
            ))}
            {loading && (
              <div className="rounded-2xl px-4 py-3 text-sm bg-white text-slate-500 border border-slate-200">
                Thinking through your POS context...
              </div>
            )}
          </div>

          <div className="p-4 border-t border-slate-100 bg-white">
            <div className="flex items-end gap-3">
              <textarea
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Ask for reports, navigation, troubleshooting, marketing help..."
                className="flex-1 min-h-[56px] max-h-[120px] resize-none rounded-2xl border border-slate-200 px-4 py-3 font-medium text-slate-700 outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <div className="flex flex-col gap-2">
                <button
                  onClick={toggleVoice}
                  className={`w-12 h-12 rounded-2xl flex items-center justify-center ${isListening ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-700'}`}
                >
                  {isListening ? <MicOff size={18} /> : <Mic size={18} />}
                </button>
                <button
                  onClick={() => void sendMessage(input)}
                  disabled={loading}
                  className="w-12 h-12 rounded-2xl bg-slate-900 text-white flex items-center justify-center disabled:opacity-50"
                >
                  <Send size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default AICopilotDock;
