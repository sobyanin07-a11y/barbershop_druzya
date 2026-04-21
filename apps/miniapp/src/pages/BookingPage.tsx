import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useUser } from '../hooks/useUser';
import { useTelegram } from '../hooks/useTelegram';
import { generateTimeSlots, isSlotAvailable, getAvailableDates, formatDateKey, formatDayOfWeek, formatDateHuman } from '../lib/schedule';
import type { Service, Master } from '../types';
import { CATEGORY_LABELS, CATEGORY_ORDER, ServiceCategory } from '../types';

interface LocState { preselectedServiceId?: string; preselectedMasterId?: string; }

export function BookingPage() {
  const nav = useNavigate();
  const loc = useLocation();
  const { user } = useUser();
  const { haptic, hapticSuccess, hapticError } = useTelegram();
  const st = (loc.state as LocState) ?? {};

  const [services, setServices] = useState<Service[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [selSvcId, setSelSvcId] = useState<string | null>(null);
  const [selMasterId, setSelMasterId] = useState<string | null>(null);
  const [selDate, setSelDate] = useState<Date | null>(null);
  const [selTime, setSelTime] = useState<string | null>(null);
  const [dateBookings, setDateBookings] = useState<{ booking_time: string; duration_min: number }[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: ss }, { data: ms }] = await Promise.all([
        supabase.from('services').select('*').eq('is_active', true).order('sort_order'),
        supabase.from('masters').select('*').eq('is_active', true).order('sort_order')
      ]);
      setServices((ss as Service[]) ?? []);
      setMasters((ms as Master[]) ?? []);
    })();
  }, []);

  useEffect(() => {
    if (st.preselectedServiceId && !selSvcId) setSelSvcId(st.preselectedServiceId);
    if (st.preselectedMasterId && !selMasterId) setSelMasterId(st.preselectedMasterId);
  }, [st.preselectedServiceId, st.preselectedMasterId, services.length]);

  const selSvc = useMemo(() => services.find(s => s.id === selSvcId) ?? null, [services, selSvcId]);
  const master = useMemo(() => masters.find(m => m.id === selMasterId) ?? null, [masters, selMasterId]);
  const dates = useMemo(() => master ? getAvailableDates(master, 14) : [], [master]);
  const slots = useMemo(() => master ? generateTimeSlots(master.schedule, 30) : [], [master]);

  // группировка услуг по категориям
  const grouped = useMemo(() => {
    const m = new Map<ServiceCategory, Service[]>();
    for (const s of services) {
      if (!m.has(s.category)) m.set(s.category, []);
      m.get(s.category)!.push(s);
    }
    return m;
  }, [services]);

  useEffect(() => {
    if (!master || !selDate) { setDateBookings([]); return; }
    (async () => {
      const { data } = await supabase.from('bookings').select('booking_time,duration_min')
        .eq('master_id', master.id).eq('booking_date', formatDateKey(selDate)).in('status', ['pending', 'confirmed']);
      setDateBookings(data ?? []);
    })();
  }, [master, selDate]);

  const canSubmit = user && selSvcId && selMasterId && selDate && selTime;

  const pickService = (id: string) => {
    haptic('light');
    setSelSvcId(id);
    // сбросить дальнейшие шаги при смене услуги
    setSelMasterId(null); setSelDate(null); setSelTime(null);
  };

  const pickMaster = (id: string) => {
    haptic('light');
    setSelMasterId(id);
    setSelDate(null); setSelTime(null);
  };

  const pickDate = (d: Date) => {
    haptic('light');
    setSelDate(d); setSelTime(null);
  };

  const pickTime = (t: string) => {
    haptic('light');
    setSelTime(t);
  };

  const submit = async () => {
    if (!canSubmit || !user || !selSvc || submitting) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.from('bookings').insert({
        user_id: user.id,
        master_id: selMasterId!,
        service_ids: [selSvcId!],
        booking_date: formatDateKey(selDate!),
        booking_time: selTime! + ':00',
        duration_min: selSvc.duration_min,
        status: 'pending',
        total_price: selSvc.price
      });
      if (error) throw error;
      hapticSuccess();
      setToast('Запись создана!');
      setTimeout(() => { setToast(null); nav('/'); }, 1800);
    } catch (e) {
      hapticError();
      setToast('Ошибка. Попробуйте ещё раз.');
      setTimeout(() => setToast(null), 2500);
    }
    setSubmitting(false);
  };

  return (
    <div className="screen">

      {/* ===== ШАГ 1: УСЛУГА ===== */}
      <div className="book-step">
        <div className="step-header" onClick={() => { if (selSvcId) { setSelSvcId(null); setSelMasterId(null); setSelDate(null); setSelTime(null); } }}>
          <div className="step-label">1. Услуга</div>
          {selSvc && <div className="step-change">изменить</div>}
        </div>

        {selSvc ? (
          <div className="step-summary">
            <div className="step-summary-title">{selSvc.name}</div>
            <div className="step-summary-sub">{selSvc.duration_min} мин · {selSvc.price.toLocaleString('ru-RU')} ₽</div>
          </div>
        ) : (
          CATEGORY_ORDER.map(cat => {
            const list = grouped.get(cat);
            if (!list?.length) return null;
            return (
              <div key={cat} className="cat-section" style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6, paddingTop: 4 }}>
                  {CATEGORY_LABELS[cat]}
                </div>
                {list.map(s => (
                  <div key={s.id} className="svc-row clickable" onClick={() => pickService(s.id)}>
                    <div>
                      <div className="svc-name">{s.name}</div>
                      <div className="svc-dur">{s.duration_min} мин</div>
                    </div>
                    <div className="svc-price">{s.price.toLocaleString('ru-RU')} ₽</div>
                  </div>
                ))}
              </div>
            );
          })
        )}
      </div>

      {/* ===== ШАГ 2: МАСТЕР ===== */}
      {selSvcId && (
        <div className="book-step">
          <div className="step-header" onClick={() => { if (selMasterId) { setSelMasterId(null); setSelDate(null); setSelTime(null); } }}>
            <div className="step-label">2. Мастер</div>
            {master && <div className="step-change">изменить</div>}
          </div>

          {master ? (
            <div className="step-summary">
              <div className="step-summary-title">{master.name}</div>
              <div className="step-summary-sub">{master.specialization}</div>
            </div>
          ) : (
            masters.map(m => (
              <div key={m.id} className="master-card clickable" onClick={() => pickMaster(m.id)}>
                <div className="master-ava">
                  {m.photo_url ? <img src={m.photo_url} alt={m.name} /> : m.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
                </div>
                <div className="master-info">
                  <div className="master-name">{m.name}</div>
                  <div className="master-spec">{m.specialization}</div>
                  <div className="master-meta">
                    <span>★ {m.rating.toFixed(1)}</span>
                    <span>{m.schedule.start_time}–{m.schedule.end_time}</span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* ===== ШАГ 3: ДАТА ===== */}
      {master && (
        <div className="book-step">
          <div className="step-header" onClick={() => { if (selDate) { setSelDate(null); setSelTime(null); } }}>
            <div className="step-label">3. Дата</div>
            {selDate && <div className="step-change">изменить</div>}
          </div>

          {selDate ? (
            <div className="step-summary">
              <div className="step-summary-title">{formatDayOfWeek(selDate)}, {formatDateHuman(selDate)}</div>
            </div>
          ) : (
            <div className="date-row">
              {dates.map(d => {
                const k = formatDateKey(d);
                return (
                  <div key={k} className="date-chip" onClick={() => pickDate(d)}>
                    <div className="date-dow">{formatDayOfWeek(d)}</div>
                    <div className="date-num">{d.getDate()}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== ШАГ 4: ВРЕМЯ ===== */}
      {selDate && (
        <div className="book-step">
          <div className="step-header" onClick={() => { if (selTime) setSelTime(null); }}>
            <div className="step-label">4. Время</div>
            {selTime && <div className="step-change">изменить</div>}
          </div>

          {selTime ? (
            <div className="step-summary">
              <div className="step-summary-title">{selTime}</div>
            </div>
          ) : (
            <div className="time-grid">
              {slots.map(t => {
                const ok = isSlotAvailable(t, selSvc?.duration_min ?? 30, dateBookings);
                return (
                  <div key={t} className={`time-slot ${!ok ? 'off' : ''}`}
                    onClick={() => ok && pickTime(t)}>{t}</div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ===== ИТОГ + КНОПКА ===== */}
      {canSubmit && selSvc && master && selDate && (
        <>
          <div className="summary-box">
            <div className="summary-line"><span>Услуга</span><span>{selSvc.name}</span></div>
            <div className="summary-line"><span>Мастер</span><span>{master.name}</span></div>
            <div className="summary-line"><span>Дата</span><span>{formatDayOfWeek(selDate)}, {formatDateHuman(selDate)}</span></div>
            <div className="summary-line"><span>Время</span><span>{selTime}</span></div>
            <div className="summary-total">
              <span>К оплате</span>
              <span>{selSvc.price.toLocaleString('ru-RU')} ₽</span>
            </div>
          </div>
          <button className="cta-gold" style={{ marginTop: 14 }} onClick={submit} disabled={submitting}>
            {submitting ? 'Создаём запись…' : 'Подтвердить запись'}
          </button>
        </>
      )}

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
