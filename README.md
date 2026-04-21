# Барбершоп «Друзья» — Telegram Mini App

Онлайн-запись к мастеру через Telegram. Локальная демо-версия.

---

## ЧТО НУЖНО

| Сервис | Ссылка | Цена |
|--------|--------|------|
| Node.js 20+ | https://nodejs.org | Бесплатно |
| Supabase | https://supabase.com | Бесплатно |
| GitHub | https://github.com | Бесплатно |
| Vercel | https://vercel.com | Бесплатно |

---

## ИНСТРУКЦИЯ

### 1. Supabase — база данных
1. https://supabase.com → New project → `barbershop-druzya`, Frankfurt
2. SQL Editor → вставь содержимое `supabase/migrations/001_init.sql` → Run
3. Добавь себя в админы:
```sql
insert into admins (telegram_id, name, role) values (ТВОЙ_ID, 'Имя', 'owner');
```
4. Project Settings → API → запиши URL, anon key, service_role key

### 2. Telegram-бот
@BotFather → `/newbot` → сохрани BOT_TOKEN

### 3. Фронт
```bash
cd apps/miniapp && npm install && cp .env.example .env.local
```
Заполни `.env.local` → `npm run dev` → http://localhost:5173

### 4. GitHub + Vercel
- Залей на GitHub
- Vercel → Add Project → Root Directory: `apps/miniapp` → добавь env vars → Deploy
- Сохрани Vercel URL

### 5. Подключи Mini App
@BotFather → Menu Button → вставь Vercel URL

### 6. Бот на ноутбуке
```bash
cd apps/bot && npm install && cp .env.example .env
```
Заполни `.env` → `npm start`

⚠️ Бот работает, пока открыт терминал.

---

## ВОЗМОЖНОСТИ

- ✅ Авторизация через Telegram (имя + аватар)
- ✅ Каталог 21 услуги в 5 категориях
- ✅ Мастера с индивидуальными графиками (5/2, 3/3, 2/2)
- ✅ Онлайн-запись: услуга → мастер → дата → время
- ✅ Отмена записи клиентом
- ✅ Учёт занятых слотов
- ✅ Уведомления админу о новых записях
- ✅ Админ-панель: записи / мастера / запись от имени клиента

## АДМИН-ПАНЕЛЬ

Открой `https://vercel-url/admin` из Telegram.

**Записи** — просмотр, подтверждение, завершение, отмена.
**Мастера** — редактирование графика и услуг.
**Новая запись** — для клиентов, которые позвонили или написали.

## ЧТО ПОМЕНЯТЬ

1. Добавь себя в `admins`
2. Замени демо-мастеров на реальных
3. Загрузи фото мастеров (Supabase → Storage)
4. Проверь цены в таблице `services`
