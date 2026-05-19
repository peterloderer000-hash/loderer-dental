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
- Theme + colors: `app/styles/theme.ts`
- Theme context: `app/context/ThemeContext.tsx`
- Components: `app/components/`
- Utils: `app/utils/`
- Hooks: `app/hooks/`

## Brand Colors (NEVER change)
```
espresso:  #2C1F14   (COLORS.esp)
walnut:    #6B4F3A   (COLORS.wal)
sand:      #C4A882   (COLORS.sand)
cream:     #FAF6F0   (COLORS.cream)
gold:      #C9A84C   (COLORS.gold)
```

## Dark Mode — CRITICAL RULES
Dark mode is implemented via `useAppTheme()` from `context/ThemeContext.tsx`.

```tsx
const { colors, dark } = useAppTheme();
```

### Theme colors (use these, never hardcode):
```
colors.esp          #2C1F14  /  #2C1F14   (same in both modes)
colors.cardBg       #fff     /  #4E3C2E
colors.bg2          #F5F0EA  /  #3D2E22
colors.bg3          #E8E0D5  /  #6B5242
colors.textPrimary  #2C1F14  /  #F5EFE6
colors.textSecondary #6B4F3A /  #C4A882
colors.inputBg      #fff     /  #4E3C2E
```

### Dark mode pattern — ALWAYS follow:
```tsx
// ✅ SPRÁVNE — inline override StyleSheet hodnôt:
<View style={[styles.card, { backgroundColor: colors.cardBg, borderColor: colors.bg3 }]}>

// ✅ Podmienečné pastelové farby:
<View style={[styles.kpiBox, { backgroundColor: dark ? '#0D2233' : '#EBF5FB' }]}>

// ✅ Akčné tlačidlá (helper):
const db = (lightBg: string, accent: string) =>
  dark ? { backgroundColor: accent + '22', borderColor: accent + '44' }
       : { backgroundColor: lightBg };

// ❌ ZLÉ — nikdy nechávaj '#fff' bez inline overridu:
<View style={styles.card}>  // styles.card má backgroundColor: '#fff'
```

### Pastelové farby → dark ekvivalenty:
| Svetlá         | Tmavá           | Použitie         |
|----------------|-----------------|------------------|
| `#EAFAF1`      | `#0D3B1F`       | zelená (success) |
| `#EBF5FB`      | `#0D2233`       | modrá (info)     |
| `#FEF9E7`      | `#2D2200`       | žltá (warning)   |
| `#F5EEF8`      | `#1E0D33`       | fialová          |
| `#FDEDEC`      | `#4A1010`       | červená (error)  |
| `#E8F8F5`      | `#0D3B1F`       | teal             |
| `#FEFCE8`      | `#2D2200`       | žltá light       |

### Sub-komponenty — každá function component musí mať vlastné useAppTheme():
```tsx
function MyCard({ ... }) {
  const { colors, dark } = useAppTheme(); // ← POVINNÉ
  ...
}
```

## Supabase Tables
- `profiles` (id, role, full_name, email, phone_number, avatar_url, date_of_birth, insurance_company, insurance_number, patient_note, clinic_name, clinic_address, clinic_ico, clinic_dic)
- `appointments` (id, patient_id, doctor_id, appointment_date, custom_duration_minutes, status, notes, doctor_notes, service_id, clinic_status, arrived_at, started_at, ended_at, chair_id, is_urgent, payment_status, family_member_name, patient_rating, patient_review, created_at)
- `patient_notes` (id, patient_id, doctor_id, content, updated_at) — UNIQUE(patient_id) — doktorove poznámky k pacientovi
- `chairs` (id, name, color, is_active, sort_order)
- `patients` (id, profile_id, date_of_birth, insurance_number, address)
- `services` (id, name, duration_minutes, price_min, emoji, color, category, description)
- `payments` (id, appointment_id, patient_id, amount_cents, currency, method, status, paid_at, receipt_url, notes)
- `staff_messages` (id, sender_id, content, created_at, read_by)
- `treatment_plans` (id, patient_id, doctor_id, title, notes, status, visible_to_patient, created_at, updated_at)
- `treatment_plan_items` (id, plan_id, title, description, estimated_cost, tooth_number, status, sort_order)
- `prescriptions` (id, patient_id, doctor_id, medication, dosage, instructions, valid_until, is_active, appointment_id, created_at)
- `diagnoses` (id, patient_id, doctor_id, icd_code, description, severity, appointment_id, created_at)
- `invitations` (id, email, role, token, created_by, used, created_at)
- `clinics` (id, name, address, phone, email, owner_id)
- `clinic_members` (clinic_id, profile_id, role)
- `opening_hours` (id, doctor_id, day_of_week, open_time, close_time, is_closed, note) — day_of_week: 1=Po … 7=Ne
- `dental_charts` (id, patient_id, doctor_id, tooth_number, status, notes, photo_url, updated_at) — UNIQUE(patient_id, tooth_number)
- `dental_records` (id, patient_id, doctor_id, tooth_number, status, notes, created_at) — história zmien
- `notifications` (id, user_id, title, body, type, appointment_id, read_at, created_at)
- `waiting_list` (id, patient_id, service_id, preferred_date, notes, status, created_at)
- `health_passports` (id, patient_id, blood_type, insurance_provider, insurance_number, emergency_name, emergency_phone, is_pregnant, last_dental_visit, medical_history[], allergies, medications, visit_reasons[], dental_freq, fear_level, comfort, aesthetics[], lifestyle[], investment, open_q, updated_at)
- `time_blocks` (id, doctor_id, title, block_type, start_time, end_time, note, created_at) — block_type: lunch|meeting|vacation|personal|other

### DB views (vytvorené v migration v40):
- `kpi_daily` — denný prehľad (completed, cancelled, avg_wait, avg_treatment, daily_revenue)
- `appointment_kpi` — per-day-per-chair štatistiky pre stats.tsx
- `get_today_kpi()` — funkcia pre dnešné KPI

### Payments: amount je v centoch!
```ts
// amount_cents / 100 = €
```

## Roles
- `patient` — default, set automatically on signup
- `doctor` — assigned via invitation
- `reception` — assigned via invitation
- `hygienist` — assigned via invitation
- `owner` — assigned via invitation

## Clinic workflow (reception checkin)
```
scheduled → arrived (arrived_at) → waiting → in_chair (started_at + chair_id) → treatment_done (ended_at) → checkout → paid
```
Implementované v: `app/app/(reception)/checkin.tsx`

## Hard Rules
- NEVER use AnimatedTabBar or BlurView (crashes Android)
- NEVER use DMSans_700Bold (not loaded) — use DMSans_500Medium
- ALWAYS use optional chaining (?.) for Supabase data access
- Tab bar height: 64, paddingBottom: 8, paddingTop: 6
- All visible text in Slovak language
- OTA updates: only JS changes. Native changes need full EAS build
- NEVER hardcode '#fff' or '#FFFDF9' as backgroundColor without dark mode override
- NEVER hardcode COLORS.bg2 / COLORS.cream in StyleSheet for card backgrounds

## EAS Commands
```bash
# OTA update (JS only — najčastejšie):
cd C:\Users\peter\Desktop\Loderer_Dental_App\app
eas update --branch preview --message "popis zmeny"

# Full build (len pri natívnych zmenách):
eas build --platform android --profile preview
```

## Current State
- v1.0.0 / Build: 2026-05-02
- Dark mode: KOMPLETNÝ vo všetkých obrazovkách ✅
- KPI migrácia v40: SPUSTENÁ ✅ (chairs, arrived_at, started_at, ended_at, chair_id)
- Reception check-in workflow: HOTOVÝ ✅
- Booking day_of_week fix: HOTOVÝ ✅ (jsDayToDb v utils/timeSlots.ts)
- Migration v32: PRIPRAVENÁ (spustiť v Supabase Dashboard → SQL Editor)
- Migration dental_twin: PRIPRAVENÁ (spustiť po v32 v Supabase Dashboard)
- Fáza 2 klinické nástroje: HOTOVÁ ✅ (dental-chart, treatment-plan, prescriptions)
- Dental Twin: HOTOVÝ ✅ (SVG arch mapa, 5-ročná predikcia, časová os, cenové porovnanie)
- Pre-appointment dotazník: HOTOVÝ ✅ (pre-questionnaire.tsx — ukladá do appointment.notes)

## Pending Deployment
- OTA update: `eas update --branch preview --message "feat: dental twin + pre-questionnaire + dark mode fixes"`
- Migration v32 + dental_twin: spustiť v Supabase Dashboard → SQL Editor (v tomto poradí)

## Pending Phases
3. Pacientská skúsenosť — AI chat vylepšenia (booking ✅)
4. Komunikácia & Tím — staff chat, broadcast, recall
5. Správa kliniky — admin, opening hours, services, waitlist
6. UI/UX Polish — empty states, skeletons, haptics
--- PAID LATER ---
7. Firebase Push Notifications
8. Stripe online payments
9. SMS (smsapi.sk)
10. iOS build
11. Email automatizácia
