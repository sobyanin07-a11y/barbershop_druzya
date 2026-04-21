import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useTelegram } from '../hooks/useTelegram';
import { CATEGORY_LABELS, CATEGORY_ORDER } from '../types';
import type { Service, Master, MasterSchedule } from '../types';

type Tab = 'bookings' | 'masters' | 'newbooking';

interface AdminBooking {
  id:string; master_id:string; service_ids:string[];
  booking_date:string; booking_time:string; duration_min:number;
  status:string; total_price:number; notes:string|null;
  client_name:string; client_phone:string; client_username:string; master_name:string;
}

const ST_LBL: Record<string,string> = { pending:'Ожидает', confirmed:'Подтверждена', completed:'Завершена', cancelled:'Отменена', no_show:'Не пришёл' };
const ST_CLR: Record<string,string> = { pending:'#C9A14D', confirmed:'#5DCAA5', completed:'#97C459', cancelled:'#E24B4A', no_show:'#F09595' };

export function AdminPage() {
  const { user: tgUser } = useTelegram();
  const [isAdmin, setIsAdmin] = useState<boolean|null>(null);
  const [tab, setTab] = useState<Tab>('bookings');
  const [bookings, setBookings] = useState<AdminBooking[]>([]);
  const [masters, setMasters] = useState<Master[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tgUser) return;
    (async () => {
      const { data } = await supabase.rpc('check_admin', { p_telegram_id: tgUser.id });
      setIsAdmin(!!data); if (data) loadData();
    })();
  }, [tgUser]);

  const loadData = async () => {
    if (!tgUser) return; setLoading(true);
    const [{data:bs},{data:ms},{data:ss}] = await Promise.all([
      supabase.rpc('admin_get_bookings', { p_admin_tg_id: tgUser.id }),
      supabase.from('masters').select('*').order('sort_order'),
      supabase.from('services').select('*').eq('is_active',true).order('sort_order')
    ]);
    setBookings((bs as AdminBooking[])??[]); setMasters((ms as Master[])??[]); setServices((ss as Service[])??[]);
    setLoading(false);
  };

  const changeStatus = async (id:string, s:string) => {
    if (!tgUser) return;
    await supabase.rpc('admin_update_booking_status', { p_admin_tg_id:tgUser.id, p_booking_id:id, p_status:s });
    loadData();
  };

  if (isAdmin===null) return <div className="loader">проверка доступа</div>;
  if (!isAdmin) return (
    <div className="screen" style={{textAlign:'center',paddingTop:80}}>
      <div style={{fontSize:48,marginBottom:16}}>🔒</div>
      <div style={{fontSize:16,color:'var(--text-main)'}}>Доступ запрещён</div>
      <div style={{fontSize:13,color:'var(--text-muted)',marginTop:8}}>Ваш Telegram ID не в таблице admins</div>
    </div>
  );

  return (
    <div className="screen" style={{paddingBottom:24}}>
      <div style={{textAlign:'center',marginBottom:16}}>
        <div style={{fontSize:12,color:'var(--gold)',textTransform:'uppercase',letterSpacing:2}}>Админ-панель</div>
        <div style={{fontSize:17,fontWeight:500,color:'var(--text-main)',marginTop:4}}>Барбершоп «Друзья»</div>
      </div>
      <div style={{display:'flex',gap:6,marginBottom:16}}>
        {(['bookings','masters','newbooking'] as Tab[]).map(t=>(
          <button key={t} style={{flex:1,padding:'10px 4px',fontSize:12,textAlign:'center',borderRadius:'var(--radius-md)',
            background:tab===t?'var(--gold)':'var(--bg-elevated)',color:tab===t?'var(--bg-dark)':'var(--text-main)',
            border:tab===t?'1px solid var(--gold)':'0.5px solid var(--border-gold)'}}
            onClick={()=>setTab(t)}>
            {t==='bookings'?'Записи':t==='masters'?'Мастера':'Новая запись'}
          </button>
        ))}
      </div>
      {loading?<div className="loader">загрузка</div>:
       tab==='bookings'?<BookingsTab bookings={bookings} services={services} onStatus={changeStatus}/>:
       tab==='masters'?<MastersTab masters={masters} services={services} tgId={tgUser!.id} onReload={loadData}/>:
       <NewBookingTab masters={masters} services={services} tgId={tgUser!.id} onCreated={loadData}/>}
    </div>
  );
}

function BookingsTab({bookings,services,onStatus}:{bookings:AdminBooking[];services:Service[];onStatus:(id:string,s:string)=>void}) {
  const [filter,setFilter]=useState('upcoming');
  const sn=useMemo(()=>{const m:Record<string,string>={};services.forEach(s=>{m[s.id]=s.name});return m},[services]);
  const today=new Date().toISOString().slice(0,10);
  const list=bookings.filter(b=>{
    if(filter==='upcoming') return b.booking_date>=today&&b.status!=='cancelled';
    if(filter==='past') return b.booking_date<today||b.status==='completed';
    return b.status==='cancelled';
  });
  return <>
    <div style={{display:'flex',gap:6,marginBottom:12}}>
      {[['upcoming','Предстоящие'],['past','Прошедшие'],['cancelled','Отменённые']].map(([k,l])=>(
        <button key={k} style={{flex:1,padding:'8px 4px',fontSize:11,borderRadius:'var(--radius-sm)',
          background:filter===k?'rgba(201,161,77,0.15)':'transparent',
          color:filter===k?'var(--gold)':'var(--text-muted)',border:'none',textAlign:'center'}}
          onClick={()=>setFilter(k)}>{l}</button>
      ))}
    </div>
    {list.length===0&&<div className="empty">Нет записей</div>}
    {list.map(b=>(
      <div key={b.id} className="card" style={{marginBottom:10}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
          <span style={{fontSize:14,fontWeight:500}}>{b.booking_date} · {b.booking_time?.slice(0,5)}</span>
          <span style={{fontSize:11,padding:'3px 8px',borderRadius:20,background:`${ST_CLR[b.status]}22`,color:ST_CLR[b.status]}}>{ST_LBL[b.status]??b.status}</span>
        </div>
        <div style={{fontSize:13}}>{b.client_name?.trim()||'Без имени'}{b.client_username?` (@${b.client_username})`:''}{b.client_phone?` · ${b.client_phone}`:''}</div>
        <div style={{fontSize:12,color:'var(--text-muted)',marginTop:4}}>{b.service_ids.map(id=>sn[id]??'—').join(' + ')}</div>
        <div style={{fontSize:12,color:'var(--gold)',marginTop:2}}>Мастер: {b.master_name} · {b.total_price.toLocaleString('ru-RU')} ₽</div>
        {b.notes&&<div style={{fontSize:11,color:'var(--text-faint)',marginTop:4,fontStyle:'italic'}}>{b.notes}</div>}
        {(b.status==='pending'||b.status==='confirmed')&&(
          <div style={{display:'flex',gap:6,marginTop:10}}>
            {b.status==='pending'&&<button style={{flex:1,padding:8,fontSize:12,borderRadius:'var(--radius-sm)',background:'rgba(93,202,165,0.12)',color:'#5DCAA5',border:'0.5px solid rgba(93,202,165,0.3)'}} onClick={()=>onStatus(b.id,'confirmed')}>Подтвердить</button>}
            <button style={{flex:1,padding:8,fontSize:12,borderRadius:'var(--radius-sm)',background:'rgba(151,196,89,0.12)',color:'#97C459',border:'0.5px solid rgba(151,196,89,0.3)'}} onClick={()=>onStatus(b.id,'completed')}>Завершить</button>
            <button style={{flex:1,padding:8,fontSize:12,borderRadius:'var(--radius-sm)',background:'rgba(226,75,74,0.08)',color:'#E24B4A',border:'0.5px solid rgba(226,75,74,0.25)'}} onClick={()=>onStatus(b.id,'cancelled')}>Отменить</button>
          </div>
        )}
      </div>
    ))}
  </>;
}

function MastersTab({masters,services,tgId,onReload}:{masters:Master[];services:Service[];tgId:number;onReload:()=>void}) {
  const [ed,setEd]=useState<Master|null>(null);
  const [f,setF]=useState({name:'',spec:'',bio:'',sType:'5/2',sStart:'10:00',sEnd:'22:00',anchor:''});
  const [mSvcs,setMSvcs]=useState<string[]>([]);

  const startEdit=async(m:Master)=>{
    setEd(m);setF({name:m.name,spec:m.specialization??'',bio:m.bio??'',sType:m.schedule.type,sStart:m.schedule.start_time,sEnd:m.schedule.end_time,anchor:m.schedule.anchor_date});
    const {data}=await supabase.from('master_services').select('service_id').eq('master_id',m.id);
    setMSvcs((data??[]).map((r:any)=>r.service_id));
  };

  const save=async()=>{
    if(!ed) return;
    const sch:MasterSchedule={type:f.sType as any,start_time:f.sStart,end_time:f.sEnd,anchor_date:f.anchor||'2026-01-01'};
    await supabase.rpc('admin_upsert_master',{p_admin_tg_id:tgId,p_master_id:ed.id,p_name:f.name,p_specialization:f.spec,p_bio:f.bio,p_schedule:sch,p_is_active:true,p_sort_order:ed.sort_order});
    await supabase.rpc('admin_set_master_services',{p_admin_tg_id:tgId,p_master_id:ed.id,p_service_ids:mSvcs});
    setEd(null);onReload();
  };

  if(ed) return <>
    <div className="section-title" style={{marginTop:0}}>Редактирование: {ed.name}</div>
    <div className="admin-field"><label>Имя</label><input value={f.name} onChange={e=>setF({...f,name:e.target.value})}/></div>
    <div className="admin-field"><label>Специализация</label><input value={f.spec} onChange={e=>setF({...f,spec:e.target.value})}/></div>
    <div className="admin-field"><label>О мастере</label><input value={f.bio} onChange={e=>setF({...f,bio:e.target.value})}/></div>
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:8,marginBottom:12}}>
      <div className="admin-field"><label>График</label><select value={f.sType} onChange={e=>setF({...f,sType:e.target.value})}><option value="5/2">5/2</option><option value="3/3">3/3</option><option value="2/2">2/2</option></select></div>
      <div className="admin-field"><label>С</label><input type="time" value={f.sStart} onChange={e=>setF({...f,sStart:e.target.value})}/></div>
      <div className="admin-field"><label>До</label><input type="time" value={f.sEnd} onChange={e=>setF({...f,sEnd:e.target.value})}/></div>
    </div>
    <div className="admin-field"><label>Дата начала цикла</label><input type="date" value={f.anchor} onChange={e=>setF({...f,anchor:e.target.value})}/></div>
    <div className="section-title">Услуги мастера</div>
    {CATEGORY_ORDER.map(cat=>{const cs=services.filter(s=>s.category===cat);if(!cs.length) return null;
      return <div key={cat} style={{marginBottom:12}}>
        <div style={{fontSize:11,color:'var(--gold)',textTransform:'uppercase',letterSpacing:1,marginBottom:6}}>{CATEGORY_LABELS[cat]}</div>
        {cs.map(s=><div key={s.id} style={{display:'flex',alignItems:'center',padding:'6px 0',gap:8,cursor:'pointer'}} onClick={()=>setMSvcs(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])}>
          <div className={`svc-check ${mSvcs.includes(s.id)?'on':''}`} style={{width:18,height:18}}/>
          <span style={{fontSize:13,color:'var(--text-main)'}}>{s.name}</span>
        </div>)}
      </div>})}
    <div style={{display:'flex',gap:8,marginTop:16}}>
      <button className="cta-gold" style={{flex:1}} onClick={save}>Сохранить</button>
      <button className="cta-primary" style={{flex:1}} onClick={()=>setEd(null)}>Отмена</button>
    </div>
  </>;

  return <>{masters.map(m=>(
    <div key={m.id} className="master-card clickable" onClick={()=>startEdit(m)}>
      <div className="master-ava">{m.photo_url?<img src={m.photo_url} alt={m.name}/>:m.name.split(' ').map(p=>p[0]).slice(0,2).join('')}</div>
      <div className="master-info">
        <div className="master-name">{m.name}</div><div className="master-spec">{m.specialization}</div>
        <div className="master-meta"><span>{m.schedule.type}</span><span>{m.schedule.start_time}–{m.schedule.end_time}</span></div>
      </div>
    </div>
  ))}</>;
}

function NewBookingTab({masters,services,tgId,onCreated}:{masters:Master[];services:Service[];tgId:number;onCreated:()=>void}) {
  const [cn,setCn]=useState('');const [cp,setCp]=useState('');const [mid,setMid]=useState('');
  const [ss,setSs]=useState<string[]>([]);const [dt,setDt]=useState('');const [tm,setTm]=useState('');
  const [notes,setNotes]=useState('');const [sub,setSub]=useState(false);const [toast,setToast]=useState<string|null>(null);
  const tp=services.filter(s=>ss.includes(s.id)).reduce((a,s)=>a+s.price,0);
  const td=services.filter(s=>ss.includes(s.id)).reduce((a,s)=>a+s.duration_min,0);

  const submit=async()=>{
    if(!mid||!ss.length||!dt||!tm){setToast('Заполните все поля');setTimeout(()=>setToast(null),2000);return;}
    setSub(true);
    try{
      const {error}=await supabase.rpc('admin_create_booking',{p_admin_tg_id:tgId,p_client_name:cn||'Клиент',p_client_phone:cp||null,
        p_master_id:mid,p_service_ids:ss,p_booking_date:dt,p_booking_time:tm+':00',p_duration_min:td,p_total_price:tp,p_notes:notes||null});
      if(error) throw error;
      setToast('Запись создана');setCn('');setCp('');setSs([]);setDt('');setTm('');setNotes('');onCreated();
    }catch(e:any){setToast('Ошибка: '+e.message);}
    setSub(false);setTimeout(()=>setToast(null),2500);
  };

  return <>
    <div className="section-title" style={{marginTop:0}}>Данные клиента</div>
    <div className="admin-field"><label>Имя</label><input value={cn} onChange={e=>setCn(e.target.value)} placeholder="Иван Иванов"/></div>
    <div className="admin-field"><label>Телефон</label><input value={cp} onChange={e=>setCp(e.target.value)} placeholder="+7 900 123-45-67"/></div>
    <div className="section-title">Мастер</div>
    <div style={{display:'flex',gap:6,flexWrap:'wrap',marginBottom:12}}>
      {masters.filter(m=>m.is_active).map(m=>(
        <button key={m.id} style={{padding:'8px 14px',fontSize:12,borderRadius:'var(--radius-md)',
          background:mid===m.id?'var(--gold)':'var(--bg-elevated)',color:mid===m.id?'var(--bg-dark)':'var(--text-main)',
          border:mid===m.id?'1px solid var(--gold)':'0.5px solid var(--border-gold)'}}
          onClick={()=>setMid(m.id)}>{m.name.split(' ')[0]}</button>
      ))}
    </div>
    <div className="section-title">Услуги</div>
    {services.map(s=>(
      <div key={s.id} className="svc-row clickable" onClick={()=>setSs(p=>p.includes(s.id)?p.filter(x=>x!==s.id):[...p,s.id])}>
        <div style={{display:'flex',alignItems:'center',flex:1}}>
          <div className={`svc-check ${ss.includes(s.id)?'on':''}`} style={{width:18,height:18,marginRight:8}}/>
          <div><div className="svc-name">{s.name}</div><div className="svc-dur">{s.duration_min} мин</div></div>
        </div>
        <div className="svc-price">{s.price.toLocaleString('ru-RU')} ₽</div>
      </div>
    ))}
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginTop:14}}>
      <div className="admin-field"><label>Дата</label><input type="date" value={dt} onChange={e=>setDt(e.target.value)}/></div>
      <div className="admin-field"><label>Время</label><input type="time" value={tm} onChange={e=>setTm(e.target.value)}/></div>
    </div>
    <div className="admin-field"><label>Заметки</label><input value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Необязательно"/></div>
    {ss.length>0&&<div className="summary-box" style={{marginTop:12}}><div className="summary-total"><span>Итого ({td} мин)</span><span>{tp.toLocaleString('ru-RU')} ₽</span></div></div>}
    <button className="cta-gold" style={{marginTop:14}} onClick={submit} disabled={sub}>{sub?'Создание…':'Создать запись'}</button>
    {toast&&<div className="toast">{toast}</div>}
  </>;
}
