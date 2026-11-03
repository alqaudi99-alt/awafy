# Access-rule tests

`access_rules_test.sql` simulates five users (anonymous visitor, two customers, pharmacy staff,
driver) and checks who can see and do what. It runs inside one transaction and always ends with
`RAISE EXCEPTION 'TEST RESULTS ...'`, so **nothing is saved**; the result list is in the error text.

Run against the DEV project only (SQL editor or `psql`). Last run: 3 Nov 2026, all checks passed.
Expected: anon sees 21 products and 0 unapproved dosage rows; customer B sees 0 of A's orders;
self-promotion, direct order writes, self-verification and clinical edits are all blocked;
staff cannot accept an Rx order until the prescription is approved; only the driver marks delivered;
the driver cannot see prescriptions.
