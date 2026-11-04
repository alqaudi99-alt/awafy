/**
 * Phase switches. Phase 1 = order in the app, collect and pay at the pharmacy.
 * Home delivery (Phase 2) stays in the code but is hidden until the delivery permission is granted.
 * The database enforces the same switch (platform_settings.delivery_enabled).
 */
export const DELIVERY_ENABLED = process.env.EXPO_PUBLIC_DELIVERY_ENABLED === 'true';
