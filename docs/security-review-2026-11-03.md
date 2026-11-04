# Security review — 3 Nov 2026

Independent reviewer (separate AI agent that did not write the code). **No Critical findings.**
Secrets check passed: no keys committed, prescription storage private, prices set by the database.

Fix file: `supabase/migrations/20261103000004_security_review_fixes.sql`
**Status: applied to the dev database on 4 Nov 2026 after owner approval; 20 access checks passed.**
Findings 1–7 below are fixed and verified on the dev database.

| # | Severity | Finding | Fix status |
|---|---|---|---|
| 1 | High | Pharmacy staff could change licence number/name after verification | In fix file (column limits + admin-only verify function; dashboard updated) |
| 2 | High | Approved promotion text could be rewritten while staying live | In fix file (edit withdraws approval) |
| 3 | Med-High | Customer could change their profile phone to someone else's | In fix file (phone follows verified login number) |
| 4 | Medium | Admin could skip the prescription check | In fix file (same flow for admins; Rx gate on every step) |
| 5 | Medium | Drivers could see medicine names and rejection reasons | In fix file (drivers see address/status only) |
| 6 | Medium | Prescription file not checked, could be reused across orders | In fix file (file must exist, one use, one active per order) |
| 7 | Medium | Clinical sign-off name/date could be overwritten | In fix file |
| 8 | Medium | No access log or retention plan for prescription images | Open — needs legal advice on retention; access log planned for Milestone 6 |
| 9 | Medium | Duplicate cart lines bypassed stock check; no open-order cap; stock not reduced | Fixed (0004 + 0006: summed check, 5 open orders max, stock reserved and returned on cancel) |
| 10 | Medium | Order could go out with no driver; driver assignment not logged | Fixed (0004 + 0006: pharmacy–driver links) |
| 11 | Medium | SMS login abuse risk; login stored unencrypted on phone | Partly fixed: login now encrypted on phones. CAPTCHA + Oman-only SMS when provider chosen |
| 12 | Low-Med | Registration limits; de-verified pharmacy can still process orders | Partly in fix file (role check, 3 per account). Policy decision needed |
| 13 | Low | Unlimited prescription uploads | Open — cleanup job in Milestone 6 |

Also in fix file: text length limits. Still open (nice to have): security headers for dashboard,
hide `created_by` column, map database errors to friendly text.
