import { useEffect, useState } from 'react';

interface TelegramUser {
  id: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  language_code?: string;
}

interface TelegramWebApp {
  initData: string;
  initDataUnsafe: { user?: TelegramUser; start_param?: string };
  ready: () => void;
  expand: () => void;
  close: () => void;
  themeParams: Record<string, string>;
  HapticFeedback?: {
    impactOccurred: (style: 'light' | 'medium' | 'heavy') => void;
    notificationOccurred: (type: 'success' | 'warning' | 'error') => void;
    selectionChanged: () => void;
  };
  MainButton: {
    text: string;
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
    setText: (t: string) => void;
    enable: () => void;
    disable: () => void;
  };
  BackButton: {
    show: () => void;
    hide: () => void;
    onClick: (cb: () => void) => void;
    offClick: (cb: () => void) => void;
  };
  setHeaderColor: (color: string) => void;
  setBackgroundColor: (color: string) => void;
}

declare global {
  interface Window {
    Telegram?: { WebApp: TelegramWebApp };
  }
}

export function useTelegram() {
  const [tg, setTg] = useState<TelegramWebApp | null>(null);
  const [user, setUser] = useState<TelegramUser | null>(null);
  const [startParam, setStartParam] = useState<string | null>(null);

  useEffect(() => {
    const webApp = window.Telegram?.WebApp;
    if (!webApp) {
      console.warn('[telegram] Telegram WebApp недоступен — запущено вне Telegram');
      return;
    }

    webApp.ready();
    webApp.expand();
    webApp.setHeaderColor('#0A1F19');
    webApp.setBackgroundColor('#0F2A22');

    setTg(webApp);
    setUser(webApp.initDataUnsafe.user ?? null);
    setStartParam(webApp.initDataUnsafe.start_param ?? null);
  }, []);

  const haptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
    tg?.HapticFeedback?.impactOccurred(style);
  };

  const hapticSuccess = () => tg?.HapticFeedback?.notificationOccurred('success');
  const hapticError = () => tg?.HapticFeedback?.notificationOccurred('error');

  return { tg, user, startParam, haptic, hapticSuccess, hapticError };
}
