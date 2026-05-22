# Predprodukčná kontrola — Loderer Dental App
**Dátum:** 2026-05-18  
**Verzia:** v1.0.0 / Runtime 1.1.0

---

## 1. KÓD

### console.log / console.warn
✅ Žiadne `console.log()` v produkcii  
✅ `console.warn()` len v error handleri doctor/index.tsx — akceptovateľné

### TODO / FIXME
✅ Žiadne TODO ani FIXME komentáre

### Hardcoded test dáta
✅ Žiadne hardcoded UUIDs, emaily ani testovacé dáta

### Error handling — Supabase queries
⚠️ `app/(doctor)/index.tsx:719` — `loadBirthdays()` profiles query bez `.error` kontroly → **OPRAVENÉ**  
⚠️ `app/(reception)/checkin.tsx:71` — `load()` appointments query bez error kontroly → **OPRAVENÉ**  
⚠️ `app/(patient)/messages.tsx:73` — `messages.update()` bez error kontroly → **OPRAVENÉ**  
⚠️ `app/(doctor)/add-appointment.tsx:91` — opening_hours query bez error handling → **OPRAVENÉ**  
⚠️ `app/(doctor)/add-appointment.tsx:105` — profiles query bez error handling → **OPRAVENÉ**  

### Memory leaks
✅ Všetky `supabase.channel()` subscriptions majú cleanup (`removeChannel` v `return () => {}`)  
✅ Všetky `useEffect` s async operáciami majú `cancelled` flag alebo cleanup

### Queries bez limitu
⚠️ `app/(doctor)/index.tsx:719` — profiles query (narodeniny) bez `.limit()` → **OPRAVENÉ** (limit 500)  
✅ Ostatné queries filtrujú podľa dátumu/ID (reálny limit implicitný)

---

## 2. UI

### Hardcoded farby bez dark mode
🔴 `app/(doctor)/index.tsx — cmStyles.templateChip` — `backgroundColor: '#fff'` bez inline override → **OPRAVENÉ**  
✅ Všetky ostatné `#fff`/`#FFFDF9` v StyleSheet majú inline `{ backgroundColor: colors.cardBg }` override v JSX

### Dark mode coverage
✅ Všetky obrazovky volajú `useAppTheme()` v každom subkomponente

### Slovenčina
✅ Všetky UI texty sú v slovenčine  
✅ Error messages sú v slovenčine

---

## 3. NAVIGÁCIA

✅ Všetky `router.push()` vedú na existujúce súbory  
✅ Back buttony fungujú (`router.back()`)  
✅ Tab navigácia funguje správne

---

## 4. SUPABASE

### Bezpečnosť
✅ Žiadne `service_role` kľúče v kóde  
✅ Žiadne hardcoded JWT tokeny (eyJ...)  
✅ Supabase anon key je len cez `EXPO_PUBLIC_SUPABASE_ANON_KEY` env  
✅ `supabaseAdmin` sa nepoužíva na strane klienta

### N+1 queries
✅ Žiadne N+1 problémy — všetky queries sú batch alebo single

### Chýbajúce stĺpce
✅ Všetky `.select()` volania referencujú existujúce stĺpce podľa schémy

---

## 5. SÚHRN

| Kategória | Kritické 🔴 | Varovania ⚠️ | OK ✅ |
|-----------|------------|-------------|------|
| Kód — error handling | 0 | 5 → opravené | ✓ |
| Kód — memory leaks | 0 | 0 | ✓ |
| UI — dark mode | 1 → opravené | 0 | ✓ |
| Queries — limit | 0 | 1 → opravené | ✓ |
| Bezpečnosť | 0 | 0 | ✓ |
| Navigácia | 0 | 0 | ✓ |

**Výsledok po opravách: PRIPRAVENÉ NA PRODUKCIU ✅**
