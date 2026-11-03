# Project status (mirror of the Notion dashboard)

Live dashboard: Notion → "Awafy (عوافي) — Project Dashboard" (private draft page) with the "Awafy Tasks" tracker.

**Stage:** Milestone 1 — Foundation, in progress (started 3 Nov 2026).

## Done
- Environment audit; CLAUDE.md; v1 requirements (`docs/requirements.md`)
- Supabase dev project `awafy-dev` (free plan, Mumbai, fictional data only)
- Database: 15 tables, Row Level Security on all, order/prescription functions, private prescription storage,
  clinical approval + audit log. Access-rule tests: all checks passed (`supabase/tests`)
- Customer app starter (`apps/mobile`): catalogue, price comparison, persistent cart, phone login,
  checkout (cash on delivery), live tracking, prescription upload. Type check, lint and web build pass.
- Pharmacy dashboard starter (`apps/dashboard`): orders with live alerts, prescription review,
  stock and prices, pharmacy registration and admin verification. Builds cleanly.

## Blocked
- GitHub not linked → code not yet uploaded
- Phone login needs an SMS provider configured in Supabase Auth

## Owner decisions needed
1. Fix or hide the dosage calculator on the live prototype (honey and children's ibuprofen errors)
2. Link GitHub
3. SMS provider for login
4. Clinical tools in v1 or v2
5. Pilot pharmacy and reviewing pharmacist
6. Legal advisor (MOH licensing, data location)
7. Web addresses
8. Recurring automations

## Known gaps in the starter code
- Driver mode not built; driver assignment exists in the database only
- Dashboard is Arabic-only; app language switch changes text but native layout follows device direction
- App icons are Expo placeholders until brand icons are supplied
- Clinical content (dosage/symptoms) is in `supabase/seed.sql` but not loaded or shown until reviewed
