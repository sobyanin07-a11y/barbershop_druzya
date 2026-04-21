import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTelegram } from '../hooks/useTelegram';
import { CATEGORY_LABELS, CATEGORY_ORDER, Service, ServiceCategory } from '../types';

export function ServicesPage() {
  const nav = useNavigate();
  const { haptic } = useTelegram();
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('services').select('*').eq('is_active', true).order('sort_order');
      setServices((data as Service[]) ?? []); setLoading(false);
    })();
  }, []);

  const grouped = useMemo(() => {
    const m = new Map<ServiceCategory, Service[]>();
    for (const s of services) { if (!m.has(s.category)) m.set(s.category, []); m.get(s.category)!.push(s); }
    return m;
  }, [services]);

  if (loading) return <div className="loader">загрузка</div>;
  return (
    <div className="screen">
      {CATEGORY_ORDER.map((cat) => {
        const list = grouped.get(cat);
        if (!list?.length) return null;
        return (
          <div key={cat} className="cat-section">
            <div className="cat-header">
              <div className="cat-header-title">{CATEGORY_LABELS[cat]}</div>
              <div className="cat-header-count">{list.length}</div>
            </div>
            {list.map((s) => (
              <div key={s.id} className="svc-row clickable" onClick={() => { haptic('light'); nav('/book', { state: { preselectedServiceId: s.id } }); }}>
                <div><div className="svc-name">{s.name}</div><div className="svc-dur">{s.duration_min} мин</div></div>
                <div className="svc-price">{s.price.toLocaleString('ru-RU')} ₽</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
