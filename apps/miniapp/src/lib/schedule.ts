import type { Master, MasterSchedule } from '../types';

/**
 * Рабочий ли это день для мастера с учётом его графика.
 */
export function isWorkingDay(schedule: MasterSchedule, date: Date): boolean {
  const anchor = new Date(schedule.anchor_date + 'T00:00:00');
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);

  const msInDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.floor((target.getTime() - anchor.getTime()) / msInDay);

  // если до anchor_date — считаем работой по общему правилу
  const daysFromAnchor = Math.abs(diffDays);

  switch (schedule.type) {
    case '5/2': {
      // Пн–Пт рабочие, Сб–Вс выходные (простая модель)
      const dow = target.getDay(); // 0=вс, 6=сб
      return dow >= 1 && dow <= 5;
    }
    case '3/3': {
      // 3 рабочих, 3 выходных — цикл 6 дней от anchor_date
      const cyclePos = daysFromAnchor % 6;
      return cyclePos < 3;
    }
    case '2/2': {
      // 2 через 2 — цикл 4 дня
      const cyclePos = daysFromAnchor % 4;
      return cyclePos < 2;
    }
    case 'custom':
    default:
      return true;
  }
}

/**
 * Список временных слотов для мастера на заданную дату (шаг 30 мин).
 * Возвращает массив "HH:MM".
 */
export function generateTimeSlots(schedule: MasterSchedule, slotStep = 30): string[] {
  const [sh, sm] = schedule.start_time.split(':').map(Number);
  const [eh, em] = schedule.end_time.split(':').map(Number);
  const startMin = sh * 60 + sm;
  const endMin = eh * 60 + em;

  const slots: string[] = [];
  for (let m = startMin; m < endMin; m += slotStep) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    slots.push(`${String(h).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
  }
  return slots;
}

/**
 * Проверка: свободен ли слот с учётом длительности и занятых записей.
 * bookings — записи этого мастера на эту дату.
 */
export function isSlotAvailable(
  slotStart: string,         // "HH:MM"
  durationMin: number,
  bookings: Array<{ booking_time: string; duration_min: number }>
): boolean {
  const [sh, sm] = slotStart.split(':').map(Number);
  const slotStartMin = sh * 60 + sm;
  const slotEndMin = slotStartMin + durationMin;

  for (const b of bookings) {
    const [bh, bm] = b.booking_time.slice(0, 5).split(':').map(Number);
    const bStart = bh * 60 + bm;
    const bEnd = bStart + b.duration_min;
    // пересечение интервалов
    if (slotStartMin < bEnd && slotEndMin > bStart) return false;
  }
  return true;
}

/**
 * Генерирует список ближайших N рабочих дней для мастера.
 */
export function getAvailableDates(master: Master, daysAhead = 14): Date[] {
  const result: Date[] = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (let i = 0; i < daysAhead + 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    if (isWorkingDay(master.schedule, d)) {
      result.push(d);
      if (result.length >= daysAhead) break;
    }
  }
  return result;
}

export function formatDateKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const DOW_LABELS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];
export function formatDayOfWeek(date: Date): string {
  return DOW_LABELS[date.getDay()];
}

const MONTH_LABELS = [
  'января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
  'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'
];
export function formatDateHuman(date: Date): string {
  return `${date.getDate()} ${MONTH_LABELS[date.getMonth()]}`;
}
