import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { supabase } from '../lib/supabase';
import { useTelegram } from '../hooks/useTelegram';
import type { User } from '../types';

interface UserContextValue { user: User | null; loading: boolean; }
const UserContext = createContext<UserContextValue>({ user: null, loading: true });

export function UserProvider({ children }: { children: ReactNode }) {
  const { user: tgUser } = useTelegram();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      if (tgUser) {
        // реальный Telegram-пользователь
        const { data } = await supabase.rpc('get_or_create_user', {
          p_telegram_id: tgUser.id,
          p_first_name: tgUser.first_name ?? null,
          p_last_name: tgUser.last_name ?? null,
          p_username: tgUser.username ?? null,
          p_photo_url: tgUser.photo_url ?? null
        });
        if (data) {
          const u = Array.isArray(data) ? data[0] : data;
          setUser(u as User);
        }
      } else {
        // браузер без Telegram — создаём демо-пользователя для тестирования
        const DEMO_TG_ID = 999999999;
        const { data } = await supabase.rpc('get_or_create_user', {
          p_telegram_id: DEMO_TG_ID,
          p_first_name: 'Гость',
          p_last_name: '(демо)',
          p_username: 'demo_user',
          p_photo_url: null
        });
        if (data) {
          const u = Array.isArray(data) ? data[0] : data;
          setUser(u as User);
        }
      }
      setLoading(false);
    })();
  }, [tgUser?.id]);

  return <UserContext.Provider value={{ user, loading }}>{children}</UserContext.Provider>;
}

export function useUser() { return useContext(UserContext); }
