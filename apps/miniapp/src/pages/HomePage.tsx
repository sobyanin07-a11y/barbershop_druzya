import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUser } from '../hooks/useUser';
import { useTelegram } from '../hooks/useTelegram';
import { Logo } from '../components/Logo';
import type { Service, Booking, Master } from '../types';
import { formatDateHuman, formatDayOfWeek } from '../lib/schedule';

export function HomePage() {
  const nav = useNavigate();
  const { user } = useUser();
  const { user: tgUser, haptic } = useTelegram();
  const [popular, setPopular] = useState<Service[]>([]);
  const [nextBooking, setNextBooking] = useState<(Booking & { master?: Master; services?: Service[] }) | null>(null);

  const displayName = tgUser?.first_name ?? user?.first_name ?? null;

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('services').select('*')
        .eq('is_popular', true).eq('is_active', true).order('sort_order').limit(3);
      setPopular((data as Service[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (!tgUser) return;
    (async () => {
      const { data: bookings } = await supabase.rpc('get_my_bookings', { p_telegram_id: tgUser.id });
      if (!bookings || bookings.length === 0) { setNextBooking(null); return; }
      const today = new Date().toISOString().slice(0, 10);
      const upcoming = (bookings as Booking[]).find(
        (b) => b.booking_date >= today && (b.status === 'pending' || b.status === 'confirmed')
      );
      if (!upcoming) { setNextBooking(null); return; }
      const [{ data: master }, { data: services }] = await Promise.all([
        supabase.from('masters').select('*').eq('id', upcoming.master_id).single(),
        supabase.from('services').select('*').in('id', upcoming.service_ids)
      ]);
      setNextBooking({ ...upcoming, master: master as Master, services: (services as Service[]) ?? [] });
    })();
  }, [tgUser]);

  const cancelBooking = async () => {
    if (!tgUser || !nextBooking) return;
    if (!confirm('Отменить запись?')) return;
    haptic('medium');
    const { data } = await supabase.rpc('cancel_my_booking', {
      p_telegram_id: tgUser.id, p_booking_id: nextBooking.id
    });
    if (data) setNextBooking(null);
  };

  return (
    <div className="screen">
      <Logo />
      <div className="greet">
        <h3>{displayName ? `Здравствуйте, ${displayName}` : 'Добро пожаловать'}</h3>
        <p>Рады видеть вас снова</p>
      </div>

      <button className="cta-primary" onClick={() => { haptic('medium'); nav('/book'); }}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>
        </svg>
        Записаться
      </button>

      {nextBooking && (
        <div className="card">
          <div className="card-label">Ближайшая запись</div>
          <div className="card-val">
            {(() => { const d = new Date(nextBooking.booking_date + 'T00:00:00');
              return `${formatDayOfWeek(d)}, ${formatDateHuman(d)} · ${nextBooking.booking_time.slice(0,5)}`; })()}
          </div>
          <div className="card-sub">
            {nextBooking.services?.map((s) => s.name).join(' + ')}
            {nextBooking.master ? ` · ${nextBooking.master.name.split(' ')[0]}` : ''}
          </div>
          <button className="cancel-btn" onClick={cancelBooking}>Отменить запись</button>
        </div>
      )}

      {popular.length > 0 && (
        <>
          <div className="section-title">Популярные услуги</div>
          {popular.map((s) => (
            <div key={s.id} className="svc-row clickable" onClick={() => { haptic('light'); nav('/book', { state: { preselectedServiceId: s.id } }); }}>
              <div><div className="svc-name">{s.name}</div><div className="svc-dur">{s.duration_min} мин</div></div>
              <div className="svc-price">{s.price.toLocaleString('ru-RU')} ₽</div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
