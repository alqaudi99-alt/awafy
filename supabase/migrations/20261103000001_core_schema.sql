-- Awafy core schema: users, pharmacies, catalogue, orders, prescriptions, clinical content.
-- Security model: Row Level Security on every table. Order and prescription state changes go
-- through SECURITY DEFINER functions (see 0002) so prices and transitions are enforced server-side.

-- ---------- Types ----------
create type public.app_role as enum ('customer', 'pharmacy_staff', 'driver', 'admin', 'clinical_reviewer');
create type public.order_status as enum (
  'awaiting_prescription', 'placed', 'accepted', 'preparing', 'out_for_delivery', 'delivered', 'cancelled'
);
create type public.rx_status as enum ('pending', 'approved', 'rejected');
create type public.review_status as enum ('pending_review', 'approved', 'retired');

-- ---------- People ----------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  role public.app_role not null default 'customer',
  preferred_lang text not null default 'ar' check (preferred_lang in ('ar', 'en')),
  created_at timestamptz not null default now()
);

-- ---------- Pharmacies ----------
create table public.pharmacies (
  id uuid primary key default gen_random_uuid(),
  name_ar text not null,
  name_en text,
  license_number text not null,
  phone text,
  address text,
  lat double precision,
  lng double precision,
  delivery_fee_omr numeric(10, 3) not null default 0 check (delivery_fee_omr >= 0),
  is_verified boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.pharmacy_staff (
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  primary key (pharmacy_id, user_id)
);
create index pharmacy_staff_user_idx on public.pharmacy_staff (user_id);

-- ---------- Catalogue ----------
create table public.categories (
  id smallint generated always as identity primary key,
  name_ar text not null,
  name_en text not null,
  sort_order smallint not null default 0
);

create table public.products (
  id bigint generated always as identity primary key,
  category_id smallint references public.categories (id) on delete set null,
  name_ar text not null,
  name_en text,
  usage_ar text,
  usage_en text,
  requires_rx boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);
create index products_category_idx on public.products (category_id);

create table public.pharmacy_stock (
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete cascade,
  price_omr numeric(10, 3) not null check (price_omr > 0),
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  primary key (pharmacy_id, product_id)
);
create index pharmacy_stock_product_idx on public.pharmacy_stock (product_id);

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  pharmacy_id uuid not null references public.pharmacies (id) on delete cascade,
  text_ar text not null,
  text_en text,
  is_approved boolean not null default false,
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------- Customers ----------
create table public.addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  label text,
  details text not null,
  lat double precision,
  lng double precision,
  created_at timestamptz not null default now()
);
create index addresses_user_idx on public.addresses (user_id);

-- ---------- Orders ----------
create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users (id) on delete restrict,
  pharmacy_id uuid not null references public.pharmacies (id) on delete restrict,
  address_id uuid references public.addresses (id) on delete set null,
  delivery_address text not null,           -- snapshot at order time
  status public.order_status not null,
  payment_method text not null default 'cash_on_delivery' check (payment_method in ('cash_on_delivery')),
  subtotal_omr numeric(10, 3) not null,
  delivery_fee_omr numeric(10, 3) not null,
  total_omr numeric(10, 3) not null,
  requires_rx boolean not null default false,
  driver_id uuid references auth.users (id) on delete set null,
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index orders_customer_idx on public.orders (customer_id, created_at desc);
create index orders_pharmacy_idx on public.orders (pharmacy_id, status);
create index orders_driver_idx on public.orders (driver_id) where driver_id is not null;

create table public.order_items (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  product_id bigint not null references public.products (id) on delete restrict,
  product_name text not null,               -- snapshot
  quantity integer not null check (quantity > 0 and quantity <= 99),
  unit_price_omr numeric(10, 3) not null
);
create index order_items_order_idx on public.order_items (order_id);

create table public.order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references public.orders (id) on delete cascade,
  status public.order_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on public.order_events (order_id, created_at);

create table public.prescriptions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  customer_id uuid not null references auth.users (id) on delete cascade,
  storage_path text not null,
  status public.rx_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  review_note text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index prescriptions_order_idx on public.prescriptions (order_id);

-- ---------- Clinical reference content ----------
create table public.dosage_reference (
  id bigint generated always as identity primary key,
  drug_name_ar text not null,
  drug_name_en text,
  age_group_ar text,
  age_group_en text,
  min_weight_kg numeric,
  dose_text text,
  weight_based boolean not null default false,
  per_kg_low numeric,
  per_kg_high numeric,
  max_single_mg numeric,
  max_daily text,                            -- free text until units are standardised by reviewer
  frequency_ar text,
  frequency_en text,
  warnings_ar text,
  warnings_en text,
  requires_rx boolean not null default false,
  review_status public.review_status not null default 'pending_review',
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_date timestamptz,
  updated_at timestamptz not null default now()
);

create table public.symptom_reference (
  id bigint generated always as identity primary key,
  body_region text not null,
  name_ar text not null,
  name_en text,
  age_group_ar text,
  age_group_en text,
  suggestion_ar text,
  suggestion_en text,
  red_flags_ar text,
  red_flags_en text,
  review_status public.review_status not null default 'pending_review',
  review_note text,
  reviewed_by uuid references auth.users (id) on delete set null,
  review_date timestamptz,
  updated_at timestamptz not null default now()
);

create table public.clinical_audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id bigint not null,
  action text not null,
  old_row jsonb,
  new_row jsonb,
  changed_by uuid,
  changed_at timestamptz not null default now()
);

-- ---------- Row Level Security on everything ----------
alter table public.profiles enable row level security;
alter table public.pharmacies enable row level security;
alter table public.pharmacy_staff enable row level security;
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.pharmacy_stock enable row level security;
alter table public.promotions enable row level security;
alter table public.addresses enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.order_events enable row level security;
alter table public.prescriptions enable row level security;
alter table public.dosage_reference enable row level security;
alter table public.symptom_reference enable row level security;
alter table public.clinical_audit_log enable row level security;
