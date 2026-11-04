-- Phase 1 = order and collect at the pharmacy. New statuses (must be committed before use).
alter type public.order_status add value if not exists 'ready_for_pickup' after 'preparing';
alter type public.order_status add value if not exists 'collected' after 'ready_for_pickup';
