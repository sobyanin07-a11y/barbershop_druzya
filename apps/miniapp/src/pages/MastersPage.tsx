import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTelegram } from '../hooks/useTelegram';
import type { Master } from '../types';

export function MastersPage() {
  const nav = useNavigate();
  const { haptic } = useTelegram();
  const [masters, setMasters] = useState<Master[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from('masters').select('*').eq('is_active', true).order('sort_order');
      setMasters((data as Master[]) ?? []); setLoading(false);
    })();
  }, []);

  if (loading) return <div className="loader">загрузка</div>;
  return (
    <div className="screen">
      <div className="section-title" style={{ marginTop: 4 }}>Наши мастера</div>
      {masters.map((m) => (
        <div key={m.id} className="master-card clickable" onClick={() => { haptic('light'); nav('/book', { state: { preselectedMasterId: m.id } }); }}>
          <div className="master-ava">
            {m.photo_url ? <img src={m.photo_url} alt={m.name}/> : m.name.split(' ').map(p=>p[0]).slice(0,2).join('')}
          </div>
          <div className="master-info">
            <div className="master-name">{m.name}</div>
            <div className="master-spec">{m.specialization}</div>
            <div className="master-meta"><span>★ {m.rating.toFixed(1)}</span><span>График {m.schedule.type}</span></div>
          </div>
        </div>
      ))}
    </div>
  );
}
