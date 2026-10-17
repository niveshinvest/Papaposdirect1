import { NAVIGATION_ITEMS } from '../constants';
import { ViewMode, UserRole, Organization, Outlet } from '../types';
import { universalAIService } from './UniversalAIService';
import { analyticsAIService } from './analyticsAIService';
import { aiService } from './aiService';
import { aiActionBus } from './aiActionBus';

type CopilotAction =
  | { type: 'navigate'; view: ViewMode }
  | { type: 'report'; view: ViewMode; answer: string }
  | { type: 'message'; answer: string };

interface CopilotContext {
  currentView: ViewMode;
  user: { role?: UserRole; full_name?: string; name?: string } | null;
  org: Organization | null;
  activeOutlet: Outlet | null;
}

const VIEW_KEYWORDS: Array<{ view: ViewMode; phrases: string[] }> = [
  { view: ViewMode.DASHBOARD, phrases: ['dashboard', 'overview', 'summary'] },
  { view: ViewMode.POS, phrases: ['pos', 'billing', 'bill', 'checkout', 'counter'] },
  { view: ViewMode.INVENTORY, phrases: ['inventory', 'stock', 'stockroom'] },
  { view: ViewMode.MENU_MANAGEMENT, phrases: ['menu', 'catalog', 'menu master'] },
  { view: ViewMode.REPORTS, phrases: ['reports', 'sales report', 'analytics', 'reporting'] },
  { view: ViewMode.AI_INSIGHTS, phrases: ['ai insights', 'insights', 'intelligence hub'] },
  { view: ViewMode.RECIPES, phrases: ['recipes', 'cogs', 'food cost'] },
  { view: ViewMode.PURCHASE_ORDERS, phrases: ['purchase', 'po', 'purchase orders'] },
  { view: ViewMode.KITCHEN_DISPLAY, phrases: ['kds', 'kitchen display', 'kitchen'] },
  { view: ViewMode.CRM, phrases: ['customer', 'crm', 'customers'] },
  { view: ViewMode.SETTINGS, phrases: ['settings', 'configuration'] },
  { view: ViewMode.USER_MANAGEMENT, phrases: ['staff', 'team', 'users'] },
];

const isReportQuestion = (message: string) =>
  /report|sales|slow items|top items|promote|offer|customer|profit|discount|payment mode|peak hour|stock|inventory|wastage|margin|forecast/i.test(message);

const extractSearchTerm = (message: string) => {
  const quoted = message.match(/["']([^"']+)["']/)?.[1];
  if (quoted) return quoted;

  const afterKeywords = message.match(/(?:find|search|show|open|locate|check)\s+(?:for\s+)?(.+)/i)?.[1];
  return afterKeywords ? afterKeywords.trim().replace(/\?+$/, '') : '';
};

const speak = (text: string) => {
  if (!('speechSynthesis' in window)) return;
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
};

const allowedViewsForRole = (role?: UserRole | null) =>
  NAVIGATION_ITEMS
    .filter(item => role && item.allowedRoles.includes(role))
    .map(item => item.id as ViewMode);

const findRequestedView = (message: string) => {
  const normalized = message.toLowerCase();
  return VIEW_KEYWORDS.find(entry => entry.phrases.some(phrase => normalized.includes(phrase)))?.view || null;
};

export const appCopilotService = {
  speak,

  async greet(context: CopilotContext) {
    if (await aiService.checkKillSwitch()) return null;
    const name = context.user?.full_name || context.user?.name || 'team';
    const outletName = context.activeOutlet?.name || 'your outlet';
    return `Hello ${name}. PapaPOS AI is ready at ${outletName}. I can navigate by role, generate reports, explain errors, and help with sales, inventory, menu, and marketing decisions.`;
  },

  async run(message: string, context: CopilotContext): Promise<CopilotAction> {
    const trimmed = message.trim();
    if (!trimmed) {
      return { type: 'message', answer: 'Ask me to open a module, explain an issue, or generate a business report.' };
    }

    if (await aiService.checkKillSwitch()) {
      return { type: 'message', answer: 'AI is disabled by the owner kill switch. No AI actions or answers are available right now.' };
    }

    const requestedView = findRequestedView(trimmed);
    if (requestedView) {
      const allowedViews = allowedViewsForRole(context.user?.role || null);
      if (!allowedViews.includes(requestedView)) {
        return {
          type: 'message',
          answer: `Your role does not have access to ${requestedView.replace(/_/g, ' ')}. PapaPOS AI will respect your authorization level and not expose restricted data.`,
        };
      }

      if (requestedView === ViewMode.INVENTORY) {
        aiActionBus.dispatch({
          targetView: ViewMode.INVENTORY,
          type: 'FOCUS_INVENTORY',
          payload: {
            view: /master|sku/i.test(trimmed) ? 'MASTER' : /ledger|movement|history/i.test(trimmed) ? 'LEDGER' : 'STOCK',
            searchQuery: extractSearchTerm(trimmed),
            categoryFilter: /low stock/i.test(trimmed) ? 'All' : undefined,
          },
        });
      }

      if (requestedView === ViewMode.MENU_MANAGEMENT) {
        aiActionBus.dispatch({
          targetView: ViewMode.MENU_MANAGEMENT,
          type: 'FOCUS_MENU',
          payload: {
            searchQuery: extractSearchTerm(trimmed),
          },
        });
      }

      if (requestedView === ViewMode.AI_INSIGHTS) {
        aiActionBus.dispatch({
          targetView: ViewMode.AI_INSIGHTS,
          type: 'OPEN_AI_HUB',
          payload: {
            tab: /security|suspicious|cashier|fraud|delete|void/i.test(trimmed)
              ? 'SECURITY'
              : /forecast/i.test(trimmed)
                ? 'FORECAST'
                : /strategy|offer|promot/i.test(trimmed)
                  ? 'STRATEGY'
                  : 'ALERTS',
            autoRun: /refresh|scan|audit|run/i.test(trimmed),
          },
        });
      }

      return {
        type: 'navigate',
        view: requestedView,
      };
    }

    if (isReportQuestion(trimmed) && context.activeOutlet?.id) {
      aiActionBus.dispatch({
        targetView: ViewMode.REPORTS,
        type: 'RUN_REPORT',
        payload: { question: trimmed },
      });

      const now = new Date();
      const start = new Date();
      start.setDate(now.getDate() - 30);
      const report = await analyticsAIService.generateReport(trimmed, {
        outletId: context.activeOutlet.id,
        startDate: `${start.toISOString().split('T')[0]}T00:00:00.000Z`,
        endDate: `${now.toISOString().split('T')[0]}T23:59:59.999Z`,
      });

      const answer = [
        report.summary,
        report.key_findings.length ? `Key findings: ${report.key_findings.join(' ')}` : '',
        report.business_insight ? `Business insight: ${report.business_insight}` : '',
        report.actionable_suggestions.length ? `Suggestions: ${report.actionable_suggestions.join(' ')}` : '',
      ].filter(Boolean).join(' ');

      return {
        type: 'report',
        view: ViewMode.REPORTS,
        answer,
      };
    }

    const allowedViews = allowedViewsForRole(context.user?.role || null).map(view => view.replace(/_/g, ' '));
    const response = await universalAIService.generateContent({
      task_type: 'APP_COPILOT',
      prompt: trimmed,
      context: {
        current_view: context.currentView,
        role: context.user?.role || null,
        outlet_name: context.activeOutlet?.name || null,
        company_name: context.org?.name || null,
        allowed_views: allowedViews,
      },
      system_prompt: `You are PapaPOS Central AI Copilot.
You are deeply integrated into the restaurant POS and must behave like a senior restaurant operations consultant.
Rules:
- Respect role authorization. Never reveal restricted data or advise access to modules the user's role cannot access.
- If the user asks for something outside their authorization, say so clearly and briefly.
- Be action-oriented and concise.
- Help with analytics, marketing offers, customer psychology, menu, inventory, reports, suspicious events, and operational troubleshooting.
- If the user describes an error, help evaluate causes and suggest the next checks.
- Do not invent outlet-specific facts you do not have.
- Keep the answer in plain text, concise but useful.`,
    });

    return {
      type: 'message',
      answer: response.error ? `AI could not complete that request: ${response.error}` : (response.text || 'No response generated.'),
    };
  },
};
