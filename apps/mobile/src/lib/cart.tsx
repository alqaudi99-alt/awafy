import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

import type { Cart, CartLine, Pharmacy } from './types';

const CART_KEY = 'awafy.cart.v1';
const EMPTY: Cart = { pharmacyId: null, pharmacyNameAr: '', pharmacyNameEn: null, lines: [] };

function readCart(): Cart {
  try {
    const raw = globalThis.localStorage?.getItem(CART_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Cart;
    return Array.isArray(parsed.lines) ? parsed : EMPTY;
  } catch {
    return EMPTY;
  }
}

type AddResult = 'added' | 'different_pharmacy';

type CartValue = {
  cart: Cart;
  count: number;
  subtotal: number;
  hasRx: boolean;
  add: (pharmacy: Pharmacy, line: Omit<CartLine, 'quantity'>, options?: { replace?: boolean }) => AddResult;
  setQuantity: (productId: number, quantity: number) => void;
  remove: (productId: number) => void;
  clear: () => void;
};

const CartContext = createContext<CartValue | null>(null);

export function CartProvider({ children }: { children: ReactNode }) {
  const [cart, setCart] = useState<Cart>(readCart);

  // Cart survives app restarts (prototype lost it on refresh). Prices are re-checked by the server.
  useEffect(() => {
    try {
      globalThis.localStorage?.setItem(CART_KEY, JSON.stringify(cart));
    } catch {
      // storage unavailable
    }
  }, [cart]);

  const add = useCallback<CartValue['add']>((pharmacy, line, options) => {
    if (cart.pharmacyId && cart.pharmacyId !== pharmacy.id && !options?.replace) {
      return 'different_pharmacy';
    }
    setCart((current) => {
      const base = current.pharmacyId === pharmacy.id ? current : { ...EMPTY };
      const existing = base.lines.find((l) => l.productId === line.productId);
      const lines = existing
        ? base.lines.map((l) => (l.productId === line.productId ? { ...l, quantity: Math.min(l.quantity + 1, 99) } : l))
        : [...base.lines, { ...line, quantity: 1 }];
      return { pharmacyId: pharmacy.id, pharmacyNameAr: pharmacy.name_ar, pharmacyNameEn: pharmacy.name_en, lines };
    });
    return 'added';
  }, [cart.pharmacyId]);

  const setQuantity = useCallback((productId: number, quantity: number) => {
    setCart((current) => {
      const lines = current.lines
        .map((l) => (l.productId === productId ? { ...l, quantity: Math.max(0, Math.min(quantity, 99)) } : l))
        .filter((l) => l.quantity > 0);
      return lines.length ? { ...current, lines } : EMPTY;
    });
  }, []);

  const remove = useCallback((productId: number) => setQuantity(productId, 0), [setQuantity]);
  const clear = useCallback(() => setCart(EMPTY), []);

  const value = useMemo<CartValue>(() => {
    const count = cart.lines.reduce((n, l) => n + l.quantity, 0);
    const subtotal = cart.lines.reduce((sum, l) => sum + l.quantity * l.priceOmr, 0);
    const hasRx = cart.lines.some((l) => l.requiresRx);
    return { cart, count, subtotal, hasRx, add, setQuantity, remove, clear };
  }, [cart, add, setQuantity, remove, clear]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart(): CartValue {
  const value = useContext(CartContext);
  if (!value) throw new Error('useCart must be used inside CartProvider');
  return value;
}
