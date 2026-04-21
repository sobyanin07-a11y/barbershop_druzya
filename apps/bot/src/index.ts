import 'dotenv/config';
import { Bot, InlineKeyboard } from 'grammy';
import { createClient } from '@supabase/supabase-js';

const BOT_TOKEN = process.env.BOT_TOKEN!;
const MINIAPP_URL = process.env.MINIAPP_URL!;
const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ADMIN_CHAT_ID = process.env.ADMIN_CHAT_ID;

if (!BOT_TOKEN || !MINIAPP_URL || !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Заполни .env — см. .env.example');
  process.exit(1);
}

const bot = new Bot(BOT_TOKEN);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

bot.command('start', async (ctx) => {
  const kb = new InlineKeyboard().webApp('📱 Открыть приложение', MINIAPP_URL);
  await ctx.reply(
    `*Барбершоп «Друзья»* 💈\n\n` +
    `*Что здесь можно делать:*\n` +
    `✂️ Записаться на стрижку к мастеру\n` +
    `📋 Посмотреть расписание мастеров\n` +
    `🗓 Управлять своими записями\n\n` +
    `Нажимайте кнопку ниже! 👇`,
    { parse_mode: 'Markdown', reply_markup: kb }
  );
});

bot.command('app', async (ctx) => {
  const kb = new InlineKeyboard().webApp('📱 Открыть приложение', MINIAPP_URL);
  await ctx.reply('Барбершоп «Друзья»', { reply_markup: kb });
});

bot.command('help', async (ctx) => {
  await ctx.reply(
    `*Справка* ℹ️\n\n` +
    `/start — приветствие\n` +
    `/app — открыть приложение\n` +
    `/help — эта справка\n\n` +
    `Все действия — внутри приложения 👆`,
    { parse_mode: 'Markdown' }
  );
});

bot.on('message', async (ctx) => {
  const kb = new InlineKeyboard().webApp('📱 Открыть приложение', MINIAPP_URL);
  await ctx.reply('Всё управление внутри приложения 👇', { reply_markup: kb });
});

// уведомление админу о новой записи
if (ADMIN_CHAT_ID) {
  supabase.channel('bookings-new')
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'bookings' }, async (payload) => {
      try {
        const b: any = payload.new;
        const { data: master } = await supabase.from('masters').select('name').eq('id', b.master_id).single();
        const { data: user } = await supabase.from('users').select('first_name,last_name,phone,username').eq('id', b.user_id).single();
        const { data: services } = await supabase.from('services').select('name').in('id', b.service_ids);
        const name = [user?.first_name, user?.last_name].filter(Boolean).join(' ') || 'Клиент';
        const contact = user?.username ? `@${user.username}` : (user?.phone ?? '');
        const svcs = (services ?? []).map((s: any) => s.name).join(' + ');
        await bot.api.sendMessage(ADMIN_CHAT_ID,
          `🆕 *Новая запись*\n\n👤 ${name} ${contact}\n💈 ${master?.name ?? '—'}\n✂️ ${svcs}\n📅 ${b.booking_date} в ${String(b.booking_time).slice(0,5)}\n💰 ${b.total_price} ₽`,
          { parse_mode: 'Markdown' }
        );
      } catch (err) { console.error('[notify]', err); }
    }).subscribe();
}

console.log('🤖 Бот запущен. MiniApp URL:', MINIAPP_URL);
bot.start();
