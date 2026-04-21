export type ServiceCategory = 'haircut' | 'beard' | 'combo' | 'coloring' | 'spa';

export const CATEGORY_LABELS: Record<ServiceCategory, string> = {
  haircut: 'Стрижки', beard: 'Борода и бритьё', combo: 'Комплексы',
  coloring: 'Тонирование и укладка', spa: 'СПА и уход'
};
export const CATEGORY_ORDER: ServiceCategory[] = ['haircut', 'beard', 'combo', 'coloring', 'spa'];

export interface Service {
  id: string; name: string; category: ServiceCategory;
  price: number; duration_min: number; description: string | null;
  is_active: boolean; is_popular: boolean; sort_order: number;
}

export type ScheduleType = '5/2' | '3/3' | '2/2' | 'custom';
export interface MasterSchedule {
  type: ScheduleType; start_time: string; end_time: string; anchor_date: string;
}

export interface Master {
  id: string; name: string; photo_url: string | null;
  specialization: string | null; bio: string | null;
  rating: number; schedule: MasterSchedule;
  is_active: boolean; sort_order: number;
}

export interface User {
  id: string; telegram_id: number;
  first_name: string | null; last_name: string | null;
  username: string | null; phone: string | null; photo_url: string | null;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled' | 'no_show';
export interface Booking {
  id: string; user_id: string; master_id: string; service_ids: string[];
  booking_date: string; booking_time: string; duration_min: number;
  status: BookingStatus; total_price: number; notes: string | null; created_at: string;
}
