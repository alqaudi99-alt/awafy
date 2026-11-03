import { useCallback, useEffect, useState } from 'react';

import { supabase } from './supabase';
import type { Category, ProductWithOffers } from './types';

const PRODUCT_SELECT =
  'id, category_id, name_ar, name_en, usage_ar, usage_en, requires_rx, pharmacy_stock(pharmacy_id, product_id, price_omr, quantity, pharmacies(id, name_ar, name_en, delivery_fee_omr))';

type State<T> = { data: T | null; loading: boolean; error: boolean; reload: () => void };

function useQuery<T>(run: () => PromiseLike<{ data: T | null; error: unknown }>, deps: unknown[]): State<T> {
  const [nonce, setNonce] = useState(0);
  // A request is identified by its inputs; "loading" means the latest result is for older inputs.
  const key = JSON.stringify([...deps, nonce]);
  const [result, setResult] = useState<{ key: string | null; data: T | null; error: boolean }>({
    key: null,
    data: null,
    error: false,
  });

  useEffect(() => {
    let alive = true;
    run().then(
      (res) => alive && setResult({ key, data: res.error ? null : res.data, error: !!res.error }),
      () => alive && setResult({ key, data: null, error: true }),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  const loading = result.key !== key;
  return { data: result.data, loading, error: !loading && result.error, reload };
}

export function useCategories() {
  return useQuery<Category[]>(
    () => supabase.from('categories').select('id, name_ar, name_en, sort_order').order('sort_order'),
    [],
  );
}

export function useProducts(categoryId: number | null) {
  return useQuery<ProductWithOffers[]>(() => {
    let query = supabase.from('products').select(PRODUCT_SELECT).order('name_ar');
    if (categoryId) query = query.eq('category_id', categoryId);
    return query.returns<ProductWithOffers[]>();
  }, [categoryId]);
}

export function useProduct(id: number) {
  return useQuery<ProductWithOffers>(
    () => supabase.from('products').select(PRODUCT_SELECT).eq('id', id).returns<ProductWithOffers>().single(),
    [id],
  );
}

/** In-stock offers, cheapest first. */
export function availableOffers(product: ProductWithOffers) {
  return product.pharmacy_stock
    .filter((o) => o.quantity > 0 && o.pharmacies)
    .sort((a, b) => Number(a.price_omr) - Number(b.price_omr));
}

export function matchesSearch(product: ProductWithOffers, term: string) {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return product.name_ar.toLowerCase().includes(q) || (product.name_en ?? '').toLowerCase().includes(q);
}
