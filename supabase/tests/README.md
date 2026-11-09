# Access-rule tests

`access_rules_test.sql` simulates five users (anonymous visitor, two customers, pharmacy staff,
driver) and checks who can see and do what. It runs inside one transaction and always ends with
`RAISE EXCEPTION 'TEST RESULTS ...'`, so **nothing is saved**; the result list is in the error text.

Run against the DEV project only (SQL editor or `psql`). Last run: 3 Nov 2026, all checks passed.
Expected: anon sees 21 products and 0 unapproved dosage rows; customer B sees 0 of A's orders;
self-promotion, direct order writes, self-verification and clinical edits are all blocked;
staff cannot accept an Rx order until the prescription is approved; only the driver marks delivered;
the driver cannot see prescriptions.

`fulfilment_options_test.sql` (migration 0009) checks the three ways to receive an order: pickup,
normal delivery, urgent delivery. Same rolled-back approach. Last run: 9 Nov 2026, 22/22 passed
(fees, pickup code privacy, wrong-code counter, status flows, driver hand-over, pause switches, anonymous blocked).

`guest_family_clinics_test.sql` (migrations 0010–0011): guest ordering with contact phone and a 2-open-order
limit, family record privacy (owner only, guests blocked), dose from latest weight (12 kg → 120–180 mg,
5–7.5 ml for 120 mg/5 ml) and stale-weight flag, clinic directory (verified only, admin-only approval).
Last run: 9 Nov 2026, 21/21 passed.

`restricted_rx_test.sql` (migration 0012): original stamped prescription medicines are pickup only, can be
prepared without an uploaded copy, cannot be handed over until a pharmacist records the original was checked;
ordinary prescription orders still wait for an approved upload. Last run: 9 Nov 2026, 11/11 passed.
