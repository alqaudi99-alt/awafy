export type Lang = 'ar' | 'en';

export type Category = { id: number; name_ar: string; name_en: string; sort_order: number };

export type Product = {
  id: number;
  category_id: number | null;
  name_ar: string;
  name_en: string | null;
  usage_ar: string | null;
  usage_en: string | null;
  requires_rx: boolean;
};

export type Pharmacy = {
  id: string;
  name_ar: string;
  name_en: string | null;
  delivery_fee_omr: number;
};

export type Offer = {
  pharmacy_id: string;
  product_id: number;
  price_omr: number;
  quantity: number;
  pharmacies: Pharmacy | null;
};

export type ProductWithOffers = Product & { pharmacy_stock: Offer[] };

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

export type Order = {
  id: string;
  status: OrderStatus;
  total_omr: number;
  subtotal_omr: number;
  delivery_fee_omr: number;
  requires_rx: boolean;
  fulfilment: 'pickup' | 'delivery';
  delivery_address: string | null;
  cancel_reason: string | null;
  created_at: string;
  pharmacies: Pharmacy | null;
};

export type OrderEvent = { id: number; status: OrderStatus; note: string | null; created_at: string };

export type Address = { id: string; label: string | null; details: string };

export type CartLine = {
  productId: number;
  nameAr: string;
  nameEn: string | null;
  priceOmr: number;
  quantity: number;
  requiresRx: boolean;
};

export type Cart = { pharmacyId: string | null; pharmacyNameAr: string; pharmacyNameEn: string | null; lines: CartLine[] };
