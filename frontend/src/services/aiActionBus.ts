import { ViewMode } from '../types';

export type PapaPosAIAction =
  | {
      targetView: ViewMode.REPORTS;
      type: 'RUN_REPORT';
      payload: { question: string };
    }
  | {
      targetView: ViewMode.INVENTORY;
      type: 'FOCUS_INVENTORY';
      payload: {
        view?: 'STOCK' | 'LEDGER' | 'MASTER';
        searchQuery?: string;
        categoryFilter?: string;
      };
    }
  | {
      targetView: ViewMode.MENU_MANAGEMENT;
      type: 'FOCUS_MENU';
      payload: { searchQuery?: string };
    }
  | {
      targetView: ViewMode.AI_INSIGHTS;
      type: 'OPEN_AI_HUB';
      payload: {
        tab?: 'ALERTS' | 'STRATEGY' | 'FORECAST' | 'SECURITY';
        autoRun?: boolean;
      };
    };

const ACTION_EVENT = 'papapos-ai-action';
const STORAGE_KEY = 'papapos-ai-pending-action';

export const aiActionBus = {
  dispatch(action: PapaPosAIAction) {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
    window.dispatchEvent(new CustomEvent(ACTION_EVENT, { detail: action }));
  },

  subscribe(handler: (action: PapaPosAIAction) => void) {
    const listener = (event: Event) => {
      const detail = (event as CustomEvent<PapaPosAIAction>).detail;
      if (detail) handler(detail);
    };

    window.addEventListener(ACTION_EVENT, listener as EventListener);
    return () => window.removeEventListener(ACTION_EVENT, listener as EventListener);
  },

  consumePending(targetView: ViewMode) {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;

    try {
      const parsed = JSON.parse(raw) as PapaPosAIAction;
      if (parsed.targetView !== targetView) return null;
      sessionStorage.removeItem(STORAGE_KEY);
      return parsed;
    } catch {
      sessionStorage.removeItem(STORAGE_KEY);
      return null;
    }
  },
};
