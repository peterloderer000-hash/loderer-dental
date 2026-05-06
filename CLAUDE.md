# Loderer Dental App — Project Context

## Stack
- React Native + Expo SDK 54 + Expo Router (file-based)
- Supabase (PostgreSQL + RLS + Realtime)
- EAS Build (full APK) + EAS Update (OTA)
- TypeScript

## Directory
- App code: `app/app/`
- Doctor screens: `app/app/(doctor)/`
- Patient screens: `app/app/(patient)/`
- Reception screens: `app/app/(reception)/`
- Supabase client: `app/supabase.ts`
- Assets: `app/assets/images/`

## Colors (NEVER change)
```
espresso:  #2C1F14
walnut:    #6B4F3A
sand:      #C4A882
cream:     #FAF6F0
gold:      #C9A84C
```

## Roles
- `patient` — default, set automatically on signup
- `doctor` — assigned via invitation
- `reception` — assigned via invitation
- `hygienist` — assigned via invitation
- `owner` — assigned via invitation

## Supabase Tables (existing)
- `profiles` (id, role, full_name, email, phone, avatar_url)
- `appointments` (id, patient_id, doctor_id, appointment_date, duration_minutes, status, notes, service_id, created_at)
- `patients` (id, profile_id, date_of_birth, insurance_number, address)
- `services` (id, name, duration_minutes, price, color)
- `payments` (id, appointment_id, patient_id, amount, method, status, paid_at)
- `staff_messages` (id, sender_id, content, created_at, read_by)
- `treatment_plans` (id, patient_id, doctor_id, title, status, total_price, created_at)
- `treatment_plan_items` (id, plan_id, description, price, status, order_index)
- `prescriptions` (id, patient_id, doctor_id, medication, dosage, instructions, created_at)
- `invitations` (id, email, role, token, created_by, used, created_at)
- `clinics` (id, name, address, phone, email, owner_id)
- `clinic_members` (clinic_id, profile_id, role)

## KPI Columns (TO ADD — Phase 1)
- `appointments.arrived_at` — when patient arrives (reception check-in)
- `appointments.started_at` — when doctor starts treatment
- `appointments.ended_at` — when treatment ends
- `appointments.chair_id` — which chair (FK to chairs)
- `chairs` table — id, name (Kreslo A/B/C), color, is_active

## Rules
- NEVER use AnimatedTabBar or BlurView (crashes Android)
- NEVER use DMSans_700Bold (not loaded) — use DMSans_500Medium
- ALWAYS use optional chaining (?.) for Supabase data access
- Tab bar height: 64, paddingBottom: 8, paddingTop: 6
- All visible text in Slovak language
- OTA updates: only JS changes. Native changes need full EAS build

## EAS Commands
```bash
# Full build (native changes):
cd C:\Users\peter\Desktop\Loderer_Dental_App\app
eas build --platform android --profile preview

# OTA update (JS only):
eas update --branch preview --message "description"
```

## Current App Version
- v1.0.0 / Build: 2026-05-02
- EAS project configured, Android APK working

## Pending: ULTIMATNY UPGRADE Phases
1. KPI & Analytika (SQL + dashboardy) ← NEXT
2. Recepčný workflow (check-in → started_at → ended_at)
3. Klinické nástroje (dental chart, treatment plan, recepty)
4. Pacientská skúsenosť (score, AI chat, booking)
5. Komunikácia & Tím (staff chat, broadcast, recall)
6. Správa kliniky (admin, opening hours, services, waitlist)
7. UI/UX Polish (onboarding, empty states, skeletons, haptics)
--- PAID LATER ---
8. Firebase Push Notifications
9. Stripe online payments
10. SMS (smsapi.sk)
11. iOS build
12. Email automatizácia
