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
  | 'ready_for_pickup'
  | 'collected'
  | 'out_for_delivery'
  | 'delivered'
  | 'cancelled';

export const STATUS_AR: Record<OrderStatus, string> = {
  awaiting_prescription: 'بانتظار الوصفة',
  placed: 'طلب جديد',
  accepted: 'مقبول',
  preparing: 'قيد التجهيز',
  ready_for_pickup: 'جاهز للاستلام',
  collected: 'تم الاستلام',
  out_for_delivery: 'خرج للتوصيل',
  delivered: 'تم التوصيل',
  cancelled: 'ملغي',
};

/** The next step pharmacy staff can take (enforced again in the database). Hand-over uses the pickup code. */
export type Fulfilment = 'pickup' | 'delivery' | 'urgent_delivery';

export const FULFILMENT_AR: Record<Fulfilment, string> = {
  pickup: 'استلام من الصيدلية',
  delivery: 'توصيل عادي',
  urgent_delivery: 'توصيل مستعجل',
};

export function nextStep(status: OrderStatus, fulfilment: Fulfilment): { to: OrderStatus; label: string } | null {
  if (status === 'placed') return { to: 'accepted', label: 'قبول الطلب' };
  if (status === 'accepted') return { to: 'preparing', label: 'بدء التجهيز' };
  if (status === 'preparing') return fulfilment === 'pickup'
    ? { to: 'ready_for_pickup', label: 'جاهز للاستلام — أبلغ العميل' }
    : { to: 'out_for_delivery', label: 'تسليم للمندوب' };
  return null;
}

export const omr = (n: number) => `${Number(n).toFixed(3)} ر.ع`;

export function errorText(e: unknown): string {
  return e && typeof e === 'object' && 'message' in e ? String(e.message) : 'حدث خطأ غير متوقع';
}
