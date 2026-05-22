# Loderer Dental App — Project Status

## Stack
- React Native / Expo SDK 54 + Expo Router
- Supabase (auth + RLS + realtime) PostgreSQL backend
- TypeScript throughout
- Slovak UI language

## Completed Features

### Batch 1 (High Priority)
| Feature | File(s) | Status |
|---------|---------|--------|
| A) Invoice PDF | `utils/exportPDF.ts`, `(doctor)/patient-detail.tsx` | ✅ Done |
| B) Calendar time blocking | `supabase_migration_v12.sql`, `(doctor)/calendar.tsx` | ✅ Done |
| C) Message templates | `(doctor)/messages.tsx` | ✅ Done |

### Batch 2 (High Priority)
| Feature | File(s) | Status |
|---------|---------|--------|
| A) Birthday tracking | `supabase_migration_v13.sql`, `hooks/usePatients.ts`, `(patient)/profile.tsx`, `(doctor)/index.tsx` | ✅ Done |
| B) Sort patients | `(doctor)/patients.tsx` | ✅ Done |
| C) Treatment plan | `supabase_migration_v13.sql`, `(doctor)/treatment-plan.tsx`, `(doctor)/patient-detail.tsx` | ✅ Done |

### Batch 3 (Medium Priority)
| Feature | File(s) | Status |
|---------|---------|--------|
| D) Pending approvals on home screen | `(doctor)/index.tsx` | ✅ Already implemented |
| E) Monthly invoice export | `(doctor)/stats.tsx`, `utils/exportPDF.ts` | ✅ Done |
| F) Clinic profile | `supabase_migration_v14.sql`, `(doctor)/profile.tsx`, `utils/exportPDF.ts` | ✅ Done |

### Batch 4 (Low Priority)
| Feature | File(s) | Status |
|---------|---------|--------|
| G) Push notifikácie | `supabase_migration_v15.sql`, `hooks/usePushNotifications.ts`, `app/_layout.tsx` | ✅ Done* |
| H) Opakujúce sa termíny | `(doctor)/add-appointment.tsx` | ✅ Done |
| I) Tmavý režim | `context/ThemeContext.tsx`, `app/_layout.tsx`, `(doctor)/_layout.tsx`, `(doctor)/profile.tsx` | ✅ Done |

*G) vyžaduje: `npx expo install expo-notifications` + spusti `supabase_migration_v15.sql`

## SQL Migrations to Run
Run these in Supabase SQL Editor (in order):

1. **`supabase_migration_v12.sql`** — `time_blocks` table + RLS policies
2. **`supabase_migration_v13.sql`** — `date_of_birth` + `treatment_plans` + `treatment_steps` tables + RLS
3. **`supabase_migration_v14.sql`** — `clinic_name`, `clinic_address`, `clinic_ico`, `clinic_dic` on `profiles`
4. **`supabase_migration_v15.sql`** — `push_token` column on `profiles`

## Feature Details

### Dark Mode (Feature I)
- `context/ThemeContext.tsx` — ThemeProvider + useAppTheme() hook + LIGHT/DARK palettes
- `app/_layout.tsx` — wrapped with ThemeProvider + dynamic StatusBar
- `(doctor)/_layout.tsx` — dynamic tab bar (bg, active/inactive tints, icon colors)
- `(doctor)/profile.tsx` — dark mode Switch toggle in "NASTAVENIA" card + full screen theming
- Persists via AsyncStorage key `@loderer_theme`
- Falls back to system color scheme when no override set
- Other screens use hardcoded COLORS (backward compat), can be themed incrementally

### Recurring Appointments (Feature H)
- `(doctor)/add-appointment.tsx` — "OPAKOVANIE" section below notes
- Repeat types: Žiadne | Týždenné (7d) | 2-týždenné (14d) | Mesačné (setMonth+1)
- Repeat count picker: 2–12 occurrences
- Preview label: "Celkom N termínov · posledný: DD. mesiac YYYY"
- Bulk Supabase insert: `supabase.from('appointments').insert([...rows])`
- Collision check only on first appointment
- Summary card shows 🔁 repeat info

### Push Notifications (Feature G)
- `hooks/usePushNotifications.ts` — register token, foreground/tap listeners
- `scheduleAppointmentReminder(date, patient, service)` — local reminder 1h before
- `cancelAppointmentReminder(id)` — cancel on appointment cancellation
- Token saved to `profiles.push_token` via Supabase
- Android notification channel: 'Dental App', MAX importance
- Integrated in `app/_layout.tsx` via `usePushNotifications()` inside InnerLayout
- **REQUIRES:** `npx expo install expo-notifications` before building

### Monthly Invoice Export (Feature E)
- "Mesačné fakturácie" card in stats screen
- Month picker (← Apríl 2026 →), can't go past current month
- Lists completed appointments for month: patient, service, price
- "Exportovať PDF" → `exportMonthlyInvoices()`

### Clinic Profile (Feature F)
- "PROFIL AMBULANCIE" card in doctor profile
- Fields: Názov ambulancie, Adresa, IČO, DIČ
- Used in invoice PDF headers

## Navigation Map (Doctor)
```
(doctor)/index         → Home dashboard + birthdays strip + pending approvals
(doctor)/patients      → Patient list (sortable/filterable)
(doctor)/patient-detail → Patient profile + actions
  ├─ (doctor)/dental-chart      → Zubná karta
  ├─ (doctor)/patient-passport  → Anamnéza
  ├─ (doctor)/add-appointment   → Rezervovať (+ opakovanie)
  ├─ (doctor)/messages          → Správa / message templates
  └─ (doctor)/treatment-plan    → Plán liečby
(doctor)/calendar      → Appointments + time blocking
(doctor)/messages      → Chat with patients
(doctor)/stats         → Statistics + monthly invoices
(doctor)/profile       → Doctor profile + dark mode toggle + clinic info
```

## Last Updated
2026-04-18
