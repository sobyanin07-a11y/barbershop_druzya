import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUser } from '../hooks/useUser';
import { useTelegram } from '../hooks/useTelegram';
import type { Booking, Master } from '../types';
import { formatDateHuman } from '../lib/schedule';

const STATUS_LABELS: Record<string, string> = {
  pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена',
  cancelled: 'Отменена', no_show: 'Не пришёл'
};

export function ProfilePage() {
  const nav = useNavigate();
  const { user, loading: userLoading } = useUser();
  const { user: tgUser } = useTelegram();
  const [history, setHistory] = useState<(Booking & { master_name?: string })[]>([]);
  const [svcNames, setSvcNames] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);

  const telegramId = tgUser?.id ?? user?.telegram_id;

  useEffect(() => {
    if (!telegramId) return;
    (async () => {
      // проверяем является ли пользователь админом
      const { data: adminCheck } = await supabase.rpc('check_admin', { p_telegram_id: telegramId });
      setIsAdmin(!!adminCheck);

      const { data } = await supabase.rpc('get_my_bookings', { p_telegram_id: telegramId });
      const bookings = (data as Booking[]) ?? [];

      const mIds = Array.from(new Set(bookings.map(b => b.master_id)));
      let mMap: Record<string, string> = {};
      if (mIds.length > 0) {
        const { data: ms } = await supabase.from('masters').select('id,name').in('id', mIds);
        (ms ?? []).forEach((m: any) => { mMap[m.id] = m.name; });
      }
      setHistory(bookings.map(b => ({ ...b, master_name: mMap[b.master_id] })));

      const sIds = Array.from(new Set(bookings.flatMap(b => b.service_ids)));
      if (sIds.length > 0) {
        const { data: ss } = await supabase.from('services').select('id,name').in('id', sIds);
        const c: Record<string, string> = {};
        (ss ?? []).forEach((s: any) => { c[s.id] = s.name; });
        setSvcNames(c);
      }
      setLoaded(true);
    })();
  }, [telegramId]);

  if (userLoading) return <div className="loader">загрузка профиля</div>;
  if (!user) return <div className="empty">Не удалось загрузить профиль</div>;

  const displayFirst = tgUser?.first_name ?? user.first_name ?? 'Гость';
  const displayLast = tgUser?.last_name ?? user.last_name ?? '';
  const displayPhoto = tgUser?.photo_url ?? user.photo_url;

  return (
    <div className="screen">
      <div className="profile-hero">
        <div className="profile-ava">
          {displayPhoto ? <img src={displayPhoto} alt="" /> : (displayFirst[0] ?? '?').toUpperCase()}
        </div>
        <div className="profile-name">{displayFirst} {displayLast}</div>
      </div>

      {/* кнопка Админ — видна только администраторам */}
      {isAdmin && (
        <button
          onClick={() => nav('/admin')}
          style={{
            width: '100%', marginBottom: 16, padding: '12px',
            background: 'rgba(201,161,77,0.1)', border: '1px solid var(--gold)',
            borderRadius: 'var(--radius-md)', color: 'var(--gold)',
            fontSize: 14, fontWeight: 500, display: 'flex', alignItems: 'center',
            justifyContent: 'center', gap: 8
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
          </svg>
          Панель администратора
        </button>
      )}

      <div className="section-title">Мои записи</div>
      {!loaded && <div className="loader" style={{ minHeight: '20vh' }}>загрузка</div>}
      {loaded && history.length === 0 && <div className="empty">Пока записей нет</div>}
      {history.map(b => {
        const d = new Date(b.booking_date + 'T00:00:00');
        return (
          <div key={b.id} className="history-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div className="history-date">{formatDateHuman(d)}, {d.getFullYear()} · {b.booking_time.slice(0, 5)}</div>
              <span style={{ fontSize: 11, color: b.status === 'cancelled' ? '#E24B4A' : 'var(--gold)' }}>
                {STATUS_LABELS[b.status] ?? b.status}
              </span>
            </div>
            <div className="history-svc">{b.service_ids.map(id => svcNames[id] ?? '—').join(' + ')}</div>
            <div className="history-meta">{b.master_name ?? '—'} · {b.total_price.toLocaleString('ru-RU')} ₽</div>
          </div>
        );
      })}

      <div style={{ textAlign: 'center', marginTop: 24, fontSize: 11, color: 'var(--text-faint)' }}>
        Барбершоп «Друзья»
      </div>
    </div>
  );
}
