# Awafy (عوافي) — Version 1 Requirements

Status: DRAFT for owner sign-off (Milestone 2). Baseline: prototype at `awaffy.ethraamed.net/awafy/`
(reviewed 3 Nov 2026) and developer spec at `dwa.ethraamed.net/index.md`.

## 1. Goal of version 1 (Phase 1 = order and collect) — owner decision 4 Nov 2026

A customer orders over-the-counter and prescription medicines in the app from a licensed partner
pharmacy, uploads a prescription when needed, and **collects the order at the pharmacy, paying at the
counter**. The customer shows a 6-digit pickup code; the pharmacist enters it to hand over.
Home delivery is **Phase 2** (needs a separate permission); it is built but switched off.
Dosage calculator, symptom helper and growth tools are **in version 1**, shown only after
pharmacist approval. Clinical reviewers: the owner and his colleague Ahmed (licensed pharmacists).

## 2. Users and roles

| Role | Uses | Can see |
|---|---|---|
| Customer (patient or carer) | Mobile app / web app | Own profile, addresses, orders, prescriptions, reminders |
| Pharmacy staff | Dashboard | Orders and prescriptions sent to their pharmacy; their stock and prices |
| Delivery driver | Mobile app (driver mode) | Orders assigned to them: address, phone, status |
| Platform admin | Dashboard | Everything; verifies pharmacies; edits catalogue and clinical content |
| Clinical reviewer (licensed pharmacist) | Dashboard | Dosage and symptom content; approves each record |

## 3. Features carried over from the prototype

| Prototype screen | Version 1 | Change from prototype |
|---|---|---|
| Home, promotions | Yes | Promotions entered by pharmacies, approved by admin |
| Browse catalogue, search, categories | Yes | Live data; 9 categories kept |
| Product detail with price comparison across pharmacies | Yes | Real stock and prices per pharmacy |
| Cart and checkout | Yes | Saved to account; cash on delivery |
| Prescription upload | Yes (new) | Required before an Rx item is dispatched |
| Order tracking | Yes (new) | Status: placed → accepted → preparing → out for delivery → delivered / cancelled |
| Customer login | Yes | Oman mobile number + one-time code (SMS) |
| Pharmacy partner login and registration | Yes | Registration creates an unverified pharmacy; admin verifies licence |
| Pharmacy dashboard | Yes | Incoming orders, prescription review, stock and prices |
| Medication reminders | Yes | Local phone notifications; no health data leaves the phone |
| Contact us | Yes | |
| Arabic / English switch | Yes | Arabic default, right-to-left |
| Dosage calculator (24 medicines) | Yes (decided 4 Nov) | Only pharmacist-approved records shown; 3 data errors found (see §7) |
| Symptom helper (24 symptoms, body map) | Yes (decided 4 Nov) | Only approved records; red-flag advice always shown |
| BMI and WHO infant growth charts | Yes (decided 4 Nov) | Same clinical review rule |
| Chat assistant (rule-based) | Postpone to v2 | Duplicates dosage/symptom content; higher risk |

## 4. User stories (Must have)

Customer
1. Sign up and log in with my mobile number and a code, in Arabic or English.
2. Browse and search medicines by name and category, and see which pharmacies stock each item and at what price.
3. Add items to a cart that is still there when I reopen the app.
4. Save delivery addresses with a map pin.
5. For a prescription item, photograph or upload the prescription; I cannot complete checkout without it.
6. Place an order with cash on delivery and see a clear total including delivery fee.
7. See my order status update in real time and get a notification at each step.
8. See my past orders and reorder.
9. Delete my account and data.

Pharmacy staff
10. See new orders for my pharmacy instantly, with a sound alert.
11. View the prescription image, approve or reject it with a reason.
12. Accept, prepare, hand to driver and mark delivered; or cancel with a reason.
13. Update stock levels and prices for my pharmacy.

Driver
14. See orders assigned to me with address, map link and customer phone; mark picked up and delivered.

Admin
15. Verify a pharmacy's licence before it can sell.
16. Manage the master catalogue and categories.
17. Manage clinical content; a record is visible to customers only after a pharmacist approves it.
18. See all orders and basic daily figures (orders, revenue, cancellations).

## 5. Non-functional requirements

- **Security:** each user sees only their own data (enforced in the database, not just the app);
  prescription images in private storage, viewable only by the customer and the assigned pharmacy;
  all traffic encrypted; no secrets in code.
- **Privacy & compliance:** Oman Personal Data Protection Law; Ministry of Health pharmacy rules;
  production data location decided with legal advice before launch; privacy policy and consent screen.
- **Clinical safety:** every dosage/symptom record carries reviewer name and review date; every
  change is audit-logged; "consult your pharmacist or doctor" notice on every clinical screen.
- **Accessibility:** screen-reader labels, minimum contrast, supports large text, correct RTL layout.
- **Performance:** catalogue opens in under 2 seconds on a 4G connection.
- **Platforms:** iOS 16+, Android 10+, current Chrome/Safari for web and dashboard.

## 6. Out of scope for version 1

Card and wallet payments (planned right after pilot), insurance claims, doctor consultations,
multi-pharmacy split orders, loyalty points, chat assistant, integration with pharmacy POS systems.

## 7. Clinical data issues found in the prototype (live site)

| # | Item | Problem | Effect today |
|---|---|---|---|
| 1 | Honey for cough | Fixed 2.5–5 ml dose stored as "per kg" | 15 kg child is shown "38–75 mg" |
| 2 | Ibuprofen children's syrup | Daily maximum 30 means mg per kg per day, shown as "30 mg/day" | Misleading maximum |
| 3 | Ondansetron children | 0.15 mg/kg dose stored as a fixed dose | No calculation shown (safe, but inconsistent) |

None of the 24 dosage or 24 symptom records has a recorded pharmacist review. All are imported as
"pending review" and hidden from customers until approved.

## 8. Open questions for the owner

1. Dosage, symptom and growth tools in version 1, or postponed?
2. Pilot pharmacy and reviewing pharmacist.
3. Delivery: pharmacy's own drivers, or a delivery partner?
4. Delivery fee and minimum order.
5. Web addresses for the customer web app and the dashboard.
