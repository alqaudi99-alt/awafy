-- Separate the two kinds of daily maximum that the prototype mixed up (e.g. ibuprofen 30 = mg/kg/day).
alter table public.dosage_reference
  add column max_daily_mg numeric check (max_daily_mg > 0),
  add column max_daily_mg_per_kg numeric check (max_daily_mg_per_kg > 0),
  add constraint dosage_weight_fields check (
    (weight_based and per_kg_low is not null and per_kg_high is not null and per_kg_low <= per_kg_high)
    or (not weight_based and per_kg_low is null and per_kg_high is null));
comment on column public.dosage_reference.max_daily is 'Legacy free text from prototype; use max_daily_mg / max_daily_mg_per_kg';
