/**
 * Скрипт напоминаний.
 * Запускается cron'ом раз в час.
 * Отправляет напоминания за ~24 часа до визита и за ~2 часа до визита.
 *
 * Пример cron: 0 * * * * cd /path/to/bot && npm run reminders
 */
import 'dotenv/config';
import { Bot } from 'grammy';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const bot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false }
});

async function run() {
  const now = new Date();

  // окна напоминаний — берём +/- 30 минут вокруг заданных точек
  const targets = [
    { hoursAhead: 24, label: '24h' },
    { hoursAhead: 2, label: '2h' }
  ];

  for (const t of targets) {
    const center = new Date(now.getTime() + t.hoursAhead * 3600_000);
    const from = new Date(center.getTime() - 30 * 60_000);
    const to   = new Date(center.getTime() + 30 * 60_000);

    const fromDate = from.toISOString().slice(0, 10);
    const toDate   = to.toISOString().slice(0, 10);

    const { data: bookings, error } = await supabase
      .from('bookings')
      .select('id, booking_date, booking_time, master_id, service_ids, user_id, status')
      .in('status', ['pending', 'confirmed'])
      .gte('booking_date', fromDate)
      .lte('booking_date', toDate);

    if (error || !bookings) continue;

    for (const b of bookings) {
      // собираем точный datetime визита
      const dt = new Date(`${b.booking_date}T${b.booking_time}`);
      if (dt < from || dt > to) continue;

      const { data: user } = await supabase.from('users').select('telegram_id, first_name').eq('id', b.user_id).single();
      if (!user?.telegram_id) continue;

      const { data: master } = await supabase.from('masters').select('name').eq('id', b.master_id).single();
      const { data: services } = await supabase.from('services').select('name').in('id', b.service_ids);
      const svcList = (services ?? []).map((s: any) => s.name).join(' + ');

      const timeStr = String(b.booking_time).slice(0, 5);
      const msg = t.hoursAhead === 24
        ? `Напоминаем: завтра в *${timeStr}* у вас запись в барбершоп «Друзья»\n\n✂️ ${svcList}\n💈 Мастер: ${master?.name ?? '—'}`
        : `Через 2 часа ждём вас в барбершопе «Друзья» 💈\n\n*${timeStr}* — ${svcList}\nМастер: ${master?.name ?? '—'}`;

      try {
        await bot.api.sendMessage(Number(user.telegram_id), msg, { parse_mode: 'Markdown' });
      } catch (err) {
        console.error(`[reminder ${t.label}] ошибка для ${user.telegram_id}:`, err);
      }
    }
  }

  console.log(`✓ Напоминания отправлены (${new Date().toISOString()})`);
}

run().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
