-- 0013 · Owner request 13 Nov 2026: a visual, marketplace-style storefront (like large shopping apps),
-- limited to medicines, health products and cosmetics.
-- Adds display fields (category icon/colour, product image, "was" price for offers) and dev demo items
-- for beauty and hair care. Nothing is dropped or rewritten.

alter table public.categories
  add column icon text check (icon ~ '^[a-z0-9-]{2,40}$'),
  add column color text check (color ~ '^#[0-9A-Fa-f]{6}$');

alter table public.products
  add column image_url text check (image_url ~ '^https://[^[:space:]]+$' and char_length(image_url) <= 500);

-- A pharmacy may show a previous price to mark an offer. Offers are only shown on products that do not
-- need a prescription (medicine advertising rules); the app filters on that too.
alter table public.pharmacy_stock
  add column compare_at_price_omr numeric(10, 3),
  add constraint pharmacy_stock_compare_at_check check (compare_at_price_omr is null or compare_at_price_omr > price_omr);

update public.categories set icon = v.icon, color = v.color, sort_order = v.sort_order
from (values
  (3, 'thermometer', '#E8743B', 1),
  (5, 'weather-windy', '#2F80ED', 2),
  (2, 'baby-face-outline', '#E05A8A', 3),
  (8, 'pill', '#F2994A', 4),
  (4, 'hand-heart-outline', '#00897B', 5),
  (6, 'spray-bottle', '#7E57C2', 8),
  (7, 'eye-outline', '#0097A7', 9),
  (9, 'stomach', '#43A047', 10),
  (1, 'medical-bag', '#6F7975', 12)
) as v(id, icon, color, sort_order)
where categories.id = v.id;

insert into public.categories (name_ar, name_en, sort_order, icon, color)
select v.* from (values
  ('مستحضرات التجميل', 'Beauty & Cosmetics', 6, 'lipstick', '#D81B60'),
  ('العناية بالشعر', 'Hair Care', 7, 'hair-dryer-outline', '#8D6E63')
) as v(name_ar, name_en, sort_order, icon, color)
where not exists (select 1 from public.categories c where c.name_en = v.name_en);

-- Demo beauty and hair-care items (generic names, no brands). Development data only.
insert into public.products (category_id, name_ar, name_en, usage_ar, usage_en)
select v.* from (values
  (4, 'واقي شمس SPF50 للبشرة الحساسة 50مل', 'Sunscreen SPF50 for sensitive skin 50ml', 'يوضع قبل التعرض للشمس بـ15 دقيقة ويُجدد كل ساعتين', 'Apply 15 minutes before sun exposure, reapply every 2 hours'),
  (4, 'مرطب بشرة بحمض الهيالورونيك 50مل', 'Hyaluronic acid moisturiser 50ml', 'صباحاً ومساءً على بشرة نظيفة', 'Morning and evening on clean skin'),
  (4, 'غسول وجه لطيف للبشرة الدهنية 200مل', 'Gentle face wash for oily skin 200ml', 'مرتين يومياً ثم يُشطف بالماء', 'Twice daily, rinse with water'),
  ((select id from public.categories where name_en = 'Beauty & Cosmetics'), 'سيروم فيتامين سي للوجه 30مل', 'Vitamin C face serum 30ml', 'قطرتان صباحاً قبل المرطب وواقي الشمس', 'Two drops in the morning before moisturiser and sunscreen'),
  ((select id from public.categories where name_en = 'Beauty & Cosmetics'), 'مرطب شفاه بزبدة الشيا', 'Shea butter lip balm', 'عند الحاجة', 'As needed'),
  ((select id from public.categories where name_en = 'Beauty & Cosmetics'), 'ماء ميسيلار لإزالة المكياج 400مل', 'Micellar cleansing water 400ml', 'على قطنة لإزالة المكياج', 'On a cotton pad to remove make-up'),
  ((select id from public.categories where name_en = 'Beauty & Cosmetics'), 'كريم يدين مرطب 75مل', 'Moisturising hand cream 75ml', 'عدة مرات يومياً', 'Several times a day'),
  ((select id from public.categories where name_en = 'Hair Care'), 'شامبو ضد القشرة 200مل', 'Anti-dandruff shampoo 200ml', 'مرتين أسبوعياً، يُترك دقيقتين ثم يُشطف', 'Twice a week, leave 2 minutes then rinse'),
  ((select id from public.categories where name_en = 'Hair Care'), 'زيت مغذٍ للشعر 100مل', 'Nourishing hair oil 100ml', 'على أطراف الشعر بعد الاستحمام', 'On hair ends after washing'),
  ((select id from public.categories where name_en = 'Hair Care'), 'بلسم للشعر الجاف 250مل', 'Conditioner for dry hair 250ml', 'بعد الشامبو، يُترك 3 دقائق', 'After shampoo, leave 3 minutes'),
  (2, 'كريم الحفاض للرضع 100مل', 'Baby nappy cream 100ml', 'عند كل تغيير حفاض', 'At every nappy change'),
  (8, 'فيتامين د3 1000 وحدة أقراص', 'Vitamin D3 1000 IU tablets', 'حسب إرشادات العبوة أو الطبيب', 'As per pack or doctor')
) as v(category_id, name_ar, name_en, usage_ar, usage_en)
where not exists (select 1 from public.products p where p.name_en = v.name_en);

-- Stock at the three demo pharmacies, with some "was" prices to demo offers.
insert into public.pharmacy_stock (pharmacy_id, product_id, price_omr, quantity, compare_at_price_omr)
select ph.id, pr.id,
       round((p.base * (1 + 0.08 * (row_number() over (partition by pr.id order by ph.license_number) - 1)))::numeric, 3),
       40,
       case when p.offer and ph.license_number = 'DEMO-1' then round((p.base * 1.25)::numeric, 3) end
from public.pharmacies ph
cross join (values
  ('Sunscreen SPF50 for sensitive skin 50ml', 6.500, true), ('Hyaluronic acid moisturiser 50ml', 5.900, false), ('Gentle face wash for oily skin 200ml', 3.200, true), ('Vitamin C face serum 30ml', 7.800, true), ('Shea butter lip balm', 1.200, false),
  ('Micellar cleansing water 400ml', 4.500, true), ('Moisturising hand cream 75ml', 1.900, false), ('Anti-dandruff shampoo 200ml', 3.600, true), ('Nourishing hair oil 100ml', 4.900, false), ('Conditioner for dry hair 250ml', 3.100, false),
  ('Baby nappy cream 100ml', 2.400, true), ('Vitamin D3 1000 IU tablets', 2.900, true)
) as p(pname, base, offer)
join public.products pr on pr.name_en = p.pname
where ph.license_number in ('DEMO-1', 'DEMO-2', 'DEMO-3')
on conflict (pharmacy_id, product_id) do nothing;

-- A few offers on existing non-prescription items too.
update public.pharmacy_stock s set compare_at_price_omr = round(s.price_omr * 1.2, 3)
from public.pharmacies ph
where ph.id = s.pharmacy_id and ph.license_number = 'DEMO-1' and s.product_id in (15, 16, 20);
