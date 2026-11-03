import { createClient } from '@supabase/supabase-js';

// Publishable values only; every read/write is checked by Row Level Security in the database.
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
if (!url || !key) throw new Error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY (see .env.example)');

export const supabase = createClient(url, key);

export type OrderStatus =
  | 'awaiting_prescription'
  | 'placed'
  | 'accepted'
  | 'preparing'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export const STATUS_AR: Record<OrderStatus, string> = {
  awaiting_prescription: 'بانتظار الوصفة',
  placed: 'طلب جديد',
  accepted: 'مقبول',
  preparing: 'قيد التجهيز',
  out_for_delivery: 'خرج للتوصيل',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

/** The next step pharmacy staff can take from each status (enforced again in the database). */
export const NEXT_STEP: Partial<Record<OrderStatus, { to: OrderStatus; label: string }>> = {
  placed: { to: 'accepted', label: 'قبول الطلب' },
  accepted: { to: 'preparing', label: 'بدء التجهيز' },
  preparing: { to: 'out_for_delivery', label: 'تسليم للمندوب' },
};

export const omr = (n: number) => `${Number(n).toFixed(3)} ر.ع`;

export function errorText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String(e.message) : 'حدث خطأ غير متوقع';
}
