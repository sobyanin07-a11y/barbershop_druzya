import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTelegram } from '../hooks/useTelegram';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types';
import type { Service, Master, MasterSchedule } from '../types';

type Tab = 'bookings' | 'masters' | 'newbooking';

interface AdminBooking {
  id: string; master_id: string; service_ids: string[];
  booking_date: string; booking_time: string; duration_min: number;
  status: string; total_price: number; notes: string | null;
  client_name: string; client_phone: string; client_username: string; master_name: string;
}

const ST_LBL: Record<string, string> = {
  pending: 'Ожидает', confirmed: 'Подтверждена', completed: 'Завершена',
  cancelled: 'Отменена', no_show: 'Не пришёл'
};
const ST_CLR: Record<string, string> = {
  pending: '#C9A14D', confirmed: '#5DCAA5', completed: '#97C459',
  cancelled: '#E24B4A', no_show: '#F09595'
};

const DOW = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
const MONTHS = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
function fmtDate(ds: string): string {
  const d = new Date(ds + 'T00:00:00');
  return `${DOW[d.getDay()]}, ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function AdminPage() {
  const { user: tgUser } = useTelegram();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>('bookings');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tgUser) return;
    (async () => {
      const { data } = await supabase.rpc('check_admin', { p_telegram_id: tgUser.id });
      setIsAdmin(!!data);
      if (data) loadData();
    })();
  }, [tgUser]);

  const loadData = async () => {
    if (!tgUser) return;
    setLoading(true);
    const [{ data: bs }, { data: ms }, { data: ss }] = await Promise.all([
      supabase.rpc('admin_get_bookings', { p_admin_tg_id: tgUser.id }),
      supabase.from('masters').select('*').order('sort_order'),
      supabase.from('services').select('*').eq('is_active', true).order('sort_order')
    ]);
    setBookings((bs as AdminBooking[]) ?? []);
    setMasters((ms as Master[]) ?? []);
    setServices((ss as Service[]) ?? []);
    setLoading(false);
  };

  const changeStatus = async (id: string, status: string) => {
    if (!tgUser) return;
    await supabase.rpc('admin_update_booking_status', {
      p_admin_tg_id: tgUser.id, p_booking_id: id, p_status: status
    });
    loadData();
  };

  if (isAdmin === null) return <div className="loader">проверка доступа</div>;
  if (!isAdmin) return (
    <div style={{ padding: '80px 16px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔒</div>
      <div style={{ fontSize: 16 }}>Доступ запрещён</div>
      <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
        Ваш Telegram ID не в таблице admins
      </div>
    </div>
  );

  return (
    <div style={{ padding: '16px 16px 120px' }}>
      <div style={{ textAlign: 'center', marginBottom: 20 }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 2 }}>
          Админ-панель
        </div>
        <div style={{ fontSize: 17, fontWeight: 500, marginTop: 4 }}>Барбершоп «Друзья»</div>
      </div>

      {/* вкладки */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
        {(['bookings', 'masters', 'newbooking'] as Tab[]).map(t => (
          <button key={t} style={{
            flex: 1, padding: '11px 4px', fontSize: 12, fontWeight: tab === t ? 600 : 400,
            textAlign: 'center', borderRadius: 12,
            background: tab === t ? 'var(--gold)' : 'var(--bg-elevated)',
            color: tab === t ? 'var(--bg-dark)' : 'var(--text-main)',
            border: tab === t ? 'none' : '0.5px solid var(--border-gold)'
          }} onClick={() => setTab(t)}>
            {t === 'bookings' ? 'Записи' : t === 'masters' ? 'Мастера' : 'Новая запись'}
          </button>
        ))}
      </div>

      {loading ? <div className="loader">загрузка</div> :
        tab === 'bookings' ? <BookingsTab bookings={bookings} services={services} onStatus={changeStatus} /> :
        tab === 'masters' ? <MastersTab masters={masters} services={services} tgId={tgUser!.id} onReload={loadData} /> :
        <NewBookingTab masters={masters} services={services} tgId={tgUser!.id} onCreated={loadData} />}
    </div>
  );
}

/* ==================== ЗАПИСИ (группировка по мастерам → датам) ==================== */
function BookingsTab({ bookings, services, onStatus }: {
  bookings: AdminBooking[]; services: Service[];
  onStatus: (id: string, st: string) => void;
}) {
  const [filter, setFilter] = useState('upcoming');
  const sn = useMemo(() => {
    const m: Record<string, string> = {};
    services.forEach(sv => { m[sv.id] = sv.name; });
    return m;
  }, [services]);

  const today = new Date().toISOString().slice(0, 10);
  const list = bookings.filter(b => {
    if (filter === 'upcoming') return b.booking_date >= today && b.status !== 'cancelled';
    if (filter === 'past') return b.booking_date < today || b.status === 'completed';
    return b.status === 'cancelled';
  });

  // группировка: мастер → дата → записи
  const grouped = useMemo(() => {
    const map = new Map<string, Map<string, AdminBooking[]>>();
    for (const b of list) {
      const mName = b.master_name || 'Без мастера';
      if (!map.has(mName)) map.set(mName, new Map());
      const dateMap = map.get(mName)!;
      if (!dateMap.has(b.booking_date)) dateMap.set(b.booking_date, []);
      dateMap.get(b.booking_date)!.push(b);
    }
    // сортировка внутри каждой даты по времени
    map.forEach(dateMap => {
      dateMap.forEach(bookings => {
        bookings.sort((a, b) => a.booking_time.localeCompare(b.booking_time));
      });
    });
    return map;
  }, [list]);

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
        {[['upcoming', 'Предстоящие'], ['past', 'Прошедшие'], ['cancelled', 'Отменённые']].map(([k, l]) => (
          <button key={k} style={{
            flex: 1, padding: '9px 4px', fontSize: 12, borderRadius: 8, border: 'none', textAlign: 'center',
            background: filter === k ? 'rgba(201,161,77,0.15)' : 'transparent',
            color: filter === k ? 'var(--gold)' : 'var(--text-muted)'
          }} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      {list.length === 0 && <div className="empty">Нет записей</div>}

      {Array.from(grouped.entries()).map(([masterName, dateMap]) => (
        <div key={masterName} style={{ marginBottom: 24 }}>
          {/* мастер */}
          <div style={{
            fontSize: 14, fontWeight: 600, color: 'var(--gold)',
            padding: '10px 0 8px', borderBottom: '1px solid var(--border-gold)', marginBottom: 10
          }}>
            💈 {masterName}
          </div>

          {Array.from(dateMap.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => (
            <div key={date} style={{ marginBottom: 14, paddingLeft: 12 }}>
              {/* дата */}
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                📅 {fmtDate(date)}
              </div>

              {/* записи */}
              {items.map(b => (
                <div key={b.id} style={{
                  background: 'var(--bg-elevated)', border: '0.5px solid var(--border-gold)',
                  borderRadius: 12, padding: 14, marginBottom: 8, marginLeft: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 15, fontWeight: 500 }}>
                      {b.booking_time?.slice(0, 5)}
                    </span>
                    <span style={{
                      fontSize: 10, padding: '3px 8px', borderRadius: 20,
                      background: `${ST_CLR[b.status]}22`, color: ST_CLR[b.status]
                    }}>
                      {ST_LBL[b.status] ?? b.status}
                    </span>
                  </div>

                  <div style={{ fontSize: 14, marginBottom: 3 }}>
                    {b.client_name?.trim() || 'Без имени'}
                    {b.client_username ? ` (@${b.client_username})` : ''}
                    {b.client_phone ? ` · ${b.client_phone}` : ''}
                  </div>

                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {b.service_ids.map(id => sn[id] ?? '—').join(' + ')} · {b.total_price.toLocaleString('ru-RU')} ₽
                  </div>

                  {b.notes && (
                    <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 4, fontStyle: 'italic' }}>
                      {b.notes}
                    </div>
                  )}

                  {(b.status === 'pending' || b.status === 'confirmed') && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10 }}>
                      {b.status === 'pending' && (
                        <button style={statusBtn('#5DCAA5')} onClick={() => onStatus(b.id, 'confirmed')}>
                          Подтвердить
                        </button>
                      )}
                      <button style={statusBtn('#97C459')} onClick={() => onStatus(b.id, 'completed')}>
                        Завершить
                      </button>
                      <button style={statusBtn('#E24B4A')} onClick={() => onStatus(b.id, 'cancelled')}>
                        Отменить
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

function statusBtn(clr: string): React.CSSProperties {
  return {
    flex: 1, padding: '9px 4px', fontSize: 11, borderRadius: 8, textAlign: 'center',
    background: `${clr}18`, color: clr, border: `0.5px solid ${clr}40`
  };
}

/* ==================== МАСТЕРА ==================== */
function MastersTab({ masters, services, tgId, onReload }: {
  masters: Master[]; services: Service[]; tgId: number; onReload: () => void;
}) {
  const [ed, setEd] = useState<Master | null>(null);
  const [name, setName] = useState('');
  const [spec, setSpec] = useState('');
  const [bio, setBio] = useState('');
  const [sType, setSType] = useState('5/2');
  const [sStart, setSStart] = useState('10:00');
  const [sEnd, setSEnd] = useState('22:00');
  const [anchor, setAnchor] = useState('');
  const [mSvcs, setMSvcs] = useState<string[]>([]);

  const startEdit = async (m: Master) => {
    setEd(m);
    setName(m.name); setSpec(m.specialization ?? ''); setBio(m.bio ?? '');
    setSType(m.schedule.type); setSStart(m.schedule.start_time);
    setSEnd(m.schedule.end_time); setAnchor(m.schedule.anchor_date);
    const { data } = await supabase.from('master_services').select('service_id').eq('master_id', m.id);
    setMSvcs((data ?? []).map((r: any) => r.service_id));
  };

  const save = async () => {
    if (!ed) return;
    const sch: MasterSchedule = {
      type: sType as any, start_time: sStart, end_time: sEnd,
      anchor_date: anchor || '2026-01-01'
    };
    await supabase.rpc('admin_upsert_master', {
      p_admin_tg_id: tgId, p_master_id: ed.id, p_name: name,
      p_specialization: spec, p_bio: bio, p_schedule: sch,
      p_is_active: true, p_sort_order: ed.sort_order
    });
    await supabase.rpc('admin_set_master_services', {
      p_admin_tg_id: tgId, p_master_id: ed.id, p_service_ids: mSvcs
    });
    setEd(null);
    onReload();
  };

  if (ed) {
    return (
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--gold)', marginBottom: 16 }}>
          Редактирование: {ed.name}
        </div>

        <Field label="Имя">
          <input style={inputStyle} value={name} onChange={e => setName(e.target.value)} />
        </Field>

        <Field label="Специализация">
          <input style={inputStyle} value={spec} onChange={e => setSpec(e.target.value)} />
        </Field>

        <Field label="О мастере">
          <input style={inputStyle} value={bio} onChange={e => setBio(e.target.value)} />
        </Field>

        {/* График — 1 строка, подписи слева */}
        <div style={{ marginBottom: 14 }}>
          <div style={labelStyle}>График</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <select style={{ ...inputStyle, flex: 1 }} value={sType}
              onChange={e => setSType(e.target.value)}>
              <option value="5/2">5/2</option>
              <option value="3/3">3/3</option>
              <option value="2/2">2/2</option>
            </select>
            <input style={{ ...inputStyle, flex: 1 }} type="time" value={sStart}
              onChange={e => setSStart(e.target.value)} />
            <input style={{ ...inputStyle, flex: 1 }} type="time" value={sEnd}
              onChange={e => setSEnd(e.target.value)} />
          </div>
        </div>

        <Field label="Дата начала цикла">
          <input style={inputStyle} type="date" value={anchor}
            onChange={e => setAnchor(e.target.value)} />
        </Field>

        <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gold)', margin: '20px 0 10px' }}>
          Услуги мастера
        </div>
        {CATEGORY_ORDER.map(cat => {
          const cs = services.filter(sv => sv.category === cat);
          if (!cs.length) return null;
          return (
            <div key={cat} style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
                {CATEGORY_LABELS[cat]}
              </div>
              {cs.map(sv => (
                <div key={sv.id} style={{ display: 'flex', alignItems: 'center', padding: '7px 0', gap: 10, cursor: 'pointer' }}
                  onClick={() => setMSvcs(p => p.includes(sv.id) ? p.filter(x => x !== sv.id) : [...p, sv.id])}>
                  <Check on={mSvcs.includes(sv.id)} />
                  <span style={{ fontSize: 13 }}>{sv.name}</span>
                </div>
              ))}
            </div>
          );
        })}

        <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
          <button style={goldBtn} onClick={save}>Сохранить</button>
          <button style={outlineBtn} onClick={() => setEd(null)}>Отмена</button>
        </div>
      </div>
    );
  }

  return (
    <div>
      {masters.map(m => (
        <div key={m.id} style={{
          background: 'var(--bg-elevated)', border: '0.5px solid var(--border-gold)',
          borderRadius: 14, padding: 14, marginBottom: 10, display: 'flex', gap: 12,
          alignItems: 'center', cursor: 'pointer'
        }} onClick={() => startEdit(m)}>
          <div className="master-ava" style={{ width: 48, height: 48, fontSize: 12 }}>
            {m.photo_url ? <img src={m.photo_url} alt={m.name} /> :
              m.name.split(' ').map(p => p[0]).slice(0, 2).join('')}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 14, fontWeight: 500 }}>{m.name}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{m.specialization}</div>
            <div style={{ fontSize: 11, color: 'var(--gold)', marginTop: 2 }}>
              {m.schedule.type} · {m.schedule.start_time}–{m.schedule.end_time}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/* ==================== НОВАЯ ЗАПИСЬ ==================== */
function NewBookingTab({ masters, services, tgId, onCreated }: {
  masters: Master[]; services: Service[]; tgId: number; onCreated: () => void;
}) {
  const [cn, setCn] = useState('');
  const [cp, setCp] = useState('');
  const [mid, setMid] = useState('');
  const [selSvcs, setSelSvcs] = useState<string[]>([]);
  const [dt, setDt] = useState('');
  const [tm, setTm] = useState('');
  const [notes, setNotes] = useState('');
  const [sub, setSub] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const tp = services.filter(sv => selSvcs.includes(sv.id)).reduce((a, sv) => a + sv.price, 0);
  const td = services.filter(sv => selSvcs.includes(sv.id)).reduce((a, sv) => a + sv.duration_min, 0);

  const submit = async () => {
    if (!mid || !selSvcs.length || !dt || !tm) {
      setToast('Заполните все поля');
      setTimeout(() => setToast(null), 2000);
      return;
    }
    setSub(true);
    try {
      const { error } = await supabase.rpc('admin_create_booking', {
        p_admin_tg_id: tgId, p_client_name: cn || 'Клиент', p_client_phone: cp || null,
        p_master_id: mid, p_service_ids: selSvcs, p_booking_date: dt,
        p_booking_time: tm + ':00', p_duration_min: td, p_total_price: tp, p_notes: notes || null
      });
      if (error) throw error;
      setToast('Запись создана');
      setCn(''); setCp(''); setSelSvcs([]); setDt(''); setTm(''); setNotes('');
      onCreated();
    } catch (e: any) {
      setToast('Ошибка: ' + e.message);
    }
    setSub(false);
    setTimeout(() => setToast(null), 2500);
  };

  return (
    <div>
      <SectionTitle>Данные клиента</SectionTitle>
      <Field label="Имя клиента">
        <input style={inputStyle} value={cn} onChange={e => setCn(e.target.value)} placeholder="Иван Иванов" />
      </Field>
      <Field label="Телефон">
        <input style={inputStyle} value={cp} onChange={e => setCp(e.target.value)} placeholder="+7 900 123-45-67" />
      </Field>

      <SectionTitle>Мастер</SectionTitle>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
        {masters.filter(m => m.is_active).map(m => (
          <button key={m.id} style={{
            padding: '10px 16px', fontSize: 13, borderRadius: 10,
            background: mid === m.id ? 'var(--gold)' : 'var(--bg-elevated)',
            color: mid === m.id ? 'var(--bg-dark)' : 'var(--text-main)',
            border: mid === m.id ? 'none' : '0.5px solid var(--border-gold)',
            fontWeight: mid === m.id ? 600 : 400
          }} onClick={() => setMid(m.id)}>
            {m.name.split(' ')[0]}
          </button>
        ))}
      </div>

      <SectionTitle>Услуги</SectionTitle>
      {CATEGORY_ORDER.map(cat => {
        const cs = services.filter(sv => sv.category === cat);
        if (!cs.length) return null;
        return (
          <div key={cat} style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 11, color: 'var(--gold)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 6 }}>
              {CATEGORY_LABELS[cat]}
            </div>
            {cs.map(sv => (
              <div key={sv.id} style={{
                display: 'flex', alignItems: 'center', padding: '8px 0', gap: 10, cursor: 'pointer',
                borderBottom: '0.5px solid rgba(201,161,77,0.08)'
              }} onClick={() => setSelSvcs(p => p.includes(sv.id) ? p.filter(x => x !== sv.id) : [...p, sv.id])}>
                <Check on={selSvcs.includes(sv.id)} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>{sv.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint)' }}>{sv.duration_min} мин</div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gold)' }}>
                  {sv.price.toLocaleString('ru-RU')} ₽
                </div>
              </div>
            ))}
          </div>
        );
      })}

      <SectionTitle>Дата и время</SectionTitle>
      <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Дата</div>
          <input style={inputStyle} type="date" value={dt} onChange={e => setDt(e.target.value)} />
        </div>
        <div style={{ flex: 1 }}>
          <div style={labelStyle}>Время</div>
          <input style={inputStyle} type="time" value={tm} onChange={e => setTm(e.target.value)} />
        </div>
      </div>

      <Field label="Заметки">
        <input style={inputStyle} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Необязательно" />
      </Field>

      {selSvcs.length > 0 && (
        <div style={{
          background: 'var(--bg-elevated)', border: '0.5px solid var(--border-gold-strong)',
          borderRadius: 12, padding: 14, marginTop: 14,
          display: 'flex', justifyContent: 'space-between',
          fontSize: 15, fontWeight: 500, color: 'var(--gold)'
        }}>
          <span>Итого ({td} мин)</span>
          <span>{tp.toLocaleString('ru-RU')} ₽</span>
        </div>
      )}

      <button style={{ ...goldBtn, width: '100%', marginTop: 16 }} onClick={submit} disabled={sub}>
        {sub ? 'Создание…' : 'Создать запись'}
      </button>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

/* ==================== ОБЩИЕ КОМПОНЕНТЫ ==================== */

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={labelStyle}>{label}</div>
      {children}
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--gold)', margin: '18px 0 10px' }}>
      {children}
    </div>
  );
}

function Check({ on }: { on: boolean }) {
  return (
    <div style={{
      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
      border: on ? '1px solid var(--gold)' : '1px solid rgba(201,161,77,0.45)',
      background: on ? 'var(--gold)' : 'transparent',
      display: 'flex', alignItems: 'center', justifyContent: 'center'
    }}>
      {on && <div style={{
        width: 8, height: 4, borderLeft: '2px solid var(--bg-dark)',
        borderBottom: '2px solid var(--bg-dark)',
        transform: 'rotate(-45deg) translate(1px,-1px)'
      }} />}
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: 12, color: 'var(--text-muted)', marginBottom: 6
};

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '11px 12px', fontSize: 14, fontFamily: 'inherit',
  color: 'var(--text-main)', background: 'var(--bg-elevated)',
  border: '0.5px solid var(--border-gold)', borderRadius: 8, outline: 'none',
  boxSizing: 'border-box'
};

const goldBtn: React.CSSProperties = {
  flex: 1, padding: '14px 16px', fontSize: 14, fontWeight: 600, borderRadius: 12,
  background: 'var(--gold)', color: 'var(--bg-dark)', border: 'none', textAlign: 'center'
};

const outlineBtn: React.CSSProperties = {
  flex: 1, padding: '14px 16px', fontSize: 14, fontWeight: 500, borderRadius: 12,
  background: 'transparent', color: 'var(--gold)', border: '1px solid var(--gold)', textAlign: 'center'
};
