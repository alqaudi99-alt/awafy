/**
 * Launch setup (owner decision 7 Nov 2026): three ways to receive an order from day one —
 * collect at the pharmacy, normal delivery, urgent delivery.
 * Delivery can be paused by setting EXPO_PUBLIC_DELIVERY_ENABLED=false; the database enforces
 * the same switch (platform_settings.delivery_enabled / urgent_delivery_enabled).
 */
export const DELIVERY_ENABLED = process.env.EXPO_PUBLIC_DELIVERY_ENABLED !== 'false';

/** First company contact number (owner's number until a company line exists). */
export const COMPANY_PHONE = '+96899022641';
export const COMPANY_WHATSAPP_URL = 'https://wa.me/96899022641';
