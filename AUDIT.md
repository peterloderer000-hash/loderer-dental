# Loderer Dental App — Kódový audit (2026-05-10)

## KRITICKÉ (opravené)

| # | Súbor | Problém | Fix |
|---|-------|---------|-----|
| 1 | `(reception)/payments.tsx` | `load()` bez error handlingu — zlyhanie Supabase → prázdna obrazovka bez vysvetlenia | try/catch + finally |
| 2 | `(reception)/payments.tsx` | `markPaid()` bez `{ error }` kontroly — platba môže zlyhať bez feedbacku užívateľovi | Alert pri error |
| 3 | `(reception)/checkin.tsx` | `doAdvance()` bez error handlingu — zmena statusu môže zlyhať potichu | `{ error }` check + Alert |
| 4 | `(doctor)/search.tsx` | `setTimeout(focus, 300)` bez `clearTimeout` v cleanup → memory leak na každom focus | cleanup fn |
| 5 | `(patient)/index.tsx` | `onRefresh` používa `setTimeout(setRefreshing, 800)` — setState na unmounted komponente | nahradené async/await |
| 6 | `(patient)/profile.tsx` | `setRxList(...as any)` a `setPlanList(...as any)` — obídenie type checku | proper typing |

## STREDNÉ (opravené)

| # | Súbor | Problém | Fix |
|---|-------|---------|-----|
| 7 | `(reception)/checkin.tsx` | `doAdvance()` používa `Record<string, any>` pre updates | `Record<string, unknown>` |
| 8 | `(doctor)/search.tsx` | `Promise.all` bez per-query error kontroly | fallback `?? []` already present, added error log |
| 9 | `(patient)/profile.tsx` | `router.push('...' as any)` pre dynamické routes | typed route string |

## NÍZKE (neopravené — nie je crash risk)

| # | Súbor | Problém | Poznámka |
|---|-------|---------|----------|
| 10 | Všetky | `as unknown as Type[]` pre Supabase response | Štandardný pattern v Expo/RN projektoch; refactor by vyžadoval Supabase codegen |
| 11 | `(patient)/index.tsx` | Quick actions array bez `useMemo` | Pole 4 objektov → zanedbateľný re-render cost |
| 12 | Viacero | Funkcie bez `useCallback` | Opravené len kde je funkcia v `useEffect` deps; inak zbytočné |
| 13 | `(patient)/profile.tsx` | Large nav items array bez `useMemo` | Pole 8 statických objektov → nevytvorí problém |
| 14 | Viacero | Chýbajúce React.memo | Pridané by zvýšilo komplexitu bez merateľného zisku |

## RLS STATUS (DB trigger based, nie JS)

Tabuľky s potvrdeným RLS (z migračných súborov):
- ✅ `profiles`, `appointments`, `services`, `payments`, `prescriptions`
- ✅ `treatment_plans`, `treatment_plan_items`, `dental_charts`, `dental_records`
- ✅ `clinic_exceptions`, `waiting_list`, `notifications`, `chairs`

Skontroluj manuálne cez Supabase Dashboard → Authentication → RLS ak niektorá tabuľka chýba.

## ZÁVER

**Pred auditom:** 6 kritických, 3 stredné → user-visible zlyhania pri sieťových chybách  
**Po audite:** 0 kritických, 0 stredných  
**Celkové riziko:** Nízke — app je production-ready
