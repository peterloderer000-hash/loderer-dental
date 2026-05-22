# 🦷 DENTAL TWIN MODULE — Špecifikácia pre implementáciu

> **Pre Claude Code:** Toto je kompletná špecifikácia funkcionality "3D Dental Twin" pre pacientsku aplikáciu zubnej kliniky. Implementuj postupne podľa fáz. Pred písaním kódu vždy navrhni štruktúru a počkaj na schválenie (pravidlo jedného kroku).

---

## 1. PRODUCT VISION

**Čo to je:** Interaktívny 3D model chrupu pacienta s **časovou osou minulosť → súčasnosť → budúcnosť (až 10 rokov)**, ktorý vizualizuje:
- Reálnu históriu ošetrení (z dát kliniky)
- Aktuálny stav chrupu
- AI predikciu vývoja pri neliečbe (rok po roku)
- Cenové porovnanie "prevencia dnes vs. komplexné ošetrenie neskôr"

**Prečo:** Zvyšuje motiváciu pacienta chodiť na prehliadky, transparentne komunikuje hodnotu prevencie a vytvára emocionálnu väzbu s vlastným zdravím.

---

## 2. TECH STACK (odporúčaný)

```yaml
Frontend: React Native + Expo
3D Engine: react-three-fiber + drei + three.js
State: Zustand alebo Redux Toolkit
Backend: Supabase (PostgreSQL + Auth + Storage + Edge Functions)
3D Assets: Statické generické modely v GLB formáte (Supabase Storage / CDN)
AI/Prediction: Edge Function v Deno (rule-based v MVP)
Bezpečnosť: GDPR-compliant, end-to-end pre zdravotné dáta, RLS v Supabase
```

**Pozn.:** Ak používateľ preferuje Flutter, použiť `flutter_3d_controller` + `model_viewer_plus`. Logika ostáva rovnaká.

---

## 3. DATA MODEL (Supabase / PostgreSQL)

### 3.1 Tabuľka `patients`
```sql
- id (uuid, PK)
- user_id (uuid, FK to auth.users)
- first_name, last_name
- date_of_birth
- risk_factors (jsonb)  -- fajčenie, diabetes, bruxizmus, hygiena_score
- first_visit_date
- prediction_unlocked (boolean)  -- aktivuje sa po prvej prehliadke
- created_at, updated_at
```

### 3.2 Tabuľka `teeth_status`
```sql
- id (uuid, PK)
- patient_id (uuid, FK)
- tooth_fdi (int)  -- FDI číslovanie: 11-18, 21-28, 31-38, 41-48
- surface (enum: mesial, distal, occlusal, buccal, lingual, whole)
- status (enum: healthy, caries_initial, caries_deep, filling, 
          inlay, onlay, endo, crown, bridge, implant, extracted, missing)
- material (text, nullable)  -- kompozit, amalgám, zirkón...
- date_diagnosed (date)
- date_treated (date, nullable)
- treated_by (text)  -- meno lekára
- notes (text)
- snapshot_id (uuid, FK)  -- ku ktorej "snímke chrupu" patrí
- created_at, updated_at
```

### 3.3 Tabuľka `dental_snapshots` (kľúčové pre časovú os)
```sql
- id (uuid, PK)
- patient_id (uuid, FK)
- snapshot_date (date)  -- dátum tejto "verzie chrupu"
- snapshot_type (enum: real, predicted)
- prediction_year_offset (int, nullable)  -- 1, 2, 3...10 (len pri predicted)
- summary (jsonb)  -- agregované info: počet kazov, ošetrení, atď.
- estimated_cost (numeric, nullable)
- created_at
```

> **Logika:** Každá návšteva u zubára = nová `real` snapshot. Predikcia = generuje 10 `predicted` snapshotov (rok 1–10).

### 3.4 Tabuľka `procedures_catalog` (cenník)
```sql
- id (uuid, PK)
- procedure_code (text)  -- vlastné kódy
- name (text)
- category (enum: prevention, restoration, endo, prosthetics, surgery)
- base_price_eur (numeric)
- insurance_covered (boolean)
- patient_copay_eur (numeric)
```

### 3.5 Tabuľka `prediction_rules` (pre rule-based engine)
```sql
- id (uuid, PK)
- from_status (enum)
- to_status (enum)
- avg_months_to_progress (int)
- min_months, max_months (int)
- risk_modifier (jsonb)  -- {smoking: 0.7, good_hygiene: 1.5}
- next_procedure_code (text, FK to procedures_catalog)
```

---

## 4. ARCHITEKTÚRA APLIKÁCIE

```
┌─────────────────────────────────────────────────┐
│  REACT NATIVE APP                                │
├─────────────────────────────────────────────────┤
│  Screens:                                        │
│   - DentalTwinScreen (hlavný 3D view)           │
│   - TimelineSlider (časová os 10y minulosť→budúcnosť)│
│   - ToothDetailModal (klik na zub)              │
│   - PredictionReportScreen (sumár + ceny)       │
├─────────────────────────────────────────────────┤
│  Stav (Zustand):                                 │
│   - currentSnapshotId                            │
│   - timelinePosition (-N years ... +10 years)   │
│   - selectedTooth                                │
│   - viewMode (history | present | prediction)   │
├─────────────────────────────────────────────────┤
│  3D Renderer:                                    │
│   - <Canvas> z @react-three/fiber               │
│   - <ToothModel fdi={11} status="caries" />     │
│   - OrbitControls, lighting, materiály          │
└─────────────────────────────────────────────────┘
                      ▲ ▼
┌─────────────────────────────────────────────────┐
│  SUPABASE BACKEND                                │
├─────────────────────────────────────────────────┤
│  - Auth (email + magic link)                    │
│  - PostgreSQL (data model vyššie)               │
│  - Row Level Security (pacient vidí len svoje)  │
│  - Storage (3D modely GLB, RTG snímky)          │
│  - Edge Function: `generate_prediction`         │
└─────────────────────────────────────────────────┘
```

---

## 5. PREDICTION ENGINE (Edge Function)

### Vstup:
```typescript
{
  patient_id: uuid,
  horizon_years: 10
}
```

### Logika (rule-based, MVP):
```
PRE každý zub pacienta:
  1. Načítaj aktuálny stav
  2. Načítaj rizikové faktory pacienta
  3. PRE roky 1 až 10:
       a. Aplikuj `prediction_rules` (pravdepodobnosť progresie)
       b. Modifikuj podľa risk_factors:
          - fajčiar: ×0.7 (rýchlejšia progresia)
          - dobrá hygiena (skóre >8/10): ×1.5 (pomalšia)
          - diabetes: ×0.8
          - bruxizmus: ×0.85 (rýchlejšie opotrebenie korún/plomb)
       c. Ak nastane progresia → zmeň status, vypočítaj cenu ošetrenia
       d. Ulož ako predicted snapshot s prediction_year_offset = N
```

### Pravidlá progresie (počiatočný set):
```
caries_initial → caries_deep:        12-24 mesiacov
caries_deep → endo:                   12-36 mesiacov
endo → extracted (ak neliečené):      24-60 mesiacov
extracted → bone_loss + migrácia:     ihneď po extrakcii
crown (staršia ako 10r) → fracture:   pravdepodobnosť 15% ročne
filling (staršia ako 8r) → secondary_caries: 20% ročne
```

### Výstup:
10 snapshotov (jeden pre každý rok) uložených v `dental_snapshots`.

### Cenové porovnanie:
```
Cena_prevencie_dnes = súčet cien ošetrení potrebných pre stavy v "year 0"
Cena_neskôr (rok N) = súčet cien pre kumulatívne stavy v "year N"
Zobrazenie: "Dnes 280 € vs. o 5 rokov 4 200 €"
```

---

## 6. UX FLOW — TIMELINE SLIDER

### Vizuálny návrh:
```
◀─────────────●───────────────────────────────────▶
 Minulosť    Dnes       +1y   +3y   +5y   +7y   +10y
 (reálne)              (predikcia, postupne tmavšia)
```

- **Slider** s diskrétnymi bodmi (každý rok = zarážka)
- Pri pohybe vpravo (budúcnosť): zuby sa **postupne prefarbujú** podľa predikcie
- Pri pohybe vľavo (minulosť): zobrazuje skutočné historické snapshoty z návštev
- **Pulzujúci efekt** na zuboch, ktoré sa v danom roku zhoršia
- **Side panel** s živým counterom:
  ```
  Rok +3:
    🔴 3 nové kazy (zuby: 16, 26, 37)
    🟡 1 endo (zub 36)
    💰 Odhad ošetrenia: 1 850 €
    💚 Cena prevencie dnes: 280 €
    📊 Úspora pri prevencii: 1 570 €
  ```

### Farby zubov (legenda):
```
⚪ Healthy          — biela/perleťová
🟢 Filling          — svetlozelená
🟡 Crown/Inlay      — zlatá/žltá
🔵 Implant          — modrá
🟠 Caries initial   — svetlooranžová (pulzuje pri predikcii)
🔴 Caries deep      — červená
🟣 Endo             — fialová
⚫ Extracted/Missing — čierna/priehľadná
```

---

## 7. UX FLOW — TOOTH DETAIL (klik na zub)

Po kliknutí na zub v 3D modeli sa otvorí modal:

```
┌──────────────────────────────────┐
│  Zub 36 (prvý dolný molár vľavo) │
├──────────────────────────────────┤
│  📅 História:                     │
│   • 2021-03-15: Plomba (kompozit)│
│   • 2024-08-02: Kontrola — OK    │
│                                  │
│  📍 Súčasný stav: Plomba (3r)    │
│                                  │
│  🔮 Predikcia (ak nič neurobíš): │
│   • +2y: Sekundárny kaz (40%)    │
│   • +4y: Endo potrebné (65%)     │
│   • +7y: Riziko extrakcie (30%)  │
│                                  │
│  💰 Náklady:                      │
│   • Dnes (kontrola): 0 €         │
│   • +4y (endo + korunka): 850 €  │
│                                  │
│  [📅 Objednať prehliadku]        │
└──────────────────────────────────┘
```

---

## 8. PRÁVNE / ETICKÉ DISCLAIMERY (povinné)

Pri každej predikcii zobraziť:
> ⚠️ *Predikcia je orientačná, založená na klinických štatistikách a tvojich rizikových faktoroch. Skutočný vývoj závisí od individuálnych okolností a kvality starostlivosti o ústnu hygienu. Nenahrádza odbornú diagnostiku.*

Predikcia sa **aktivuje až po prvej prehliadke** v klinike (`patients.prediction_unlocked = true`).

---

## 9. IMPLEMENTAČNÉ FÁZY

### 🚀 FÁZA 1 — MVP (4-6 týždňov)
- [ ] Setup React Native + Expo + Supabase
- [ ] Data model (tabuľky vyššie)
- [ ] Generický 3D model chrupu (32 zubov, GLB súbor)
- [ ] DentalTwinScreen — zobrazenie aktuálneho stavu
- [ ] Admin rozhranie pre zubára (zadávanie `teeth_status`)
- [ ] Tooth detail modal
- [ ] Auth + RLS

### 🔮 FÁZA 2 — Časová os + predikcia (4-6 týždňov)
- [ ] Timeline slider komponent
- [ ] `dental_snapshots` mechanika
- [ ] Edge Function `generate_prediction` (rule-based)
- [ ] Cenové porovnanie
- [ ] Side panel s counterom
- [ ] Disclaimery + súhlas pacienta

### 🎨 FÁZA 3 — Polish & UX (2-3 týždne)
- [ ] Animácie prechodov medzi rokmi
- [ ] Pulzovanie problémových zubov
- [ ] Onboarding flow ("toto je tvoj digitálny dvojník chrupu")
- [ ] Notifikácie pri zmenách
- [ ] Export PDF reportu predikcie

### 🤖 FÁZA 4 — AI rozšírenia (long-term)
- [ ] Personalizovaný model na základe ML (potrebuje 200+ pacientov)
- [ ] Integrácia s RTG (AI detekcia kazov)
- [ ] Hygiena scoring z fotky úsmevu
- [ ] Smart notifikácie ("nezabudni na prehliadku, predikcia sa zhoršuje")

---

## 10. PRAVIDLÁ PRE CLAUDE CODE PRI IMPLEMENTÁCII

1. **Pravidlo jedného kroku:** Vždy navrhni štruktúru → počkaj na schválenie → potom kód.
2. **Bez veľkých blokov kódu vopred:** Píš po komponentoch/funkciách, nie po celých obrazovkách.
3. **Pýtaj sa pri rozhodnutiach:** Pri každom kroku ponúkni 2-3 možnosti.
4. **Bezpečnosť na prvom mieste:** RLS, validácia vstupov, žiadne PII v logoch.
5. **Mobile-first UX:** Optimalizuj pre 380px viewport, gestá, haptiku.
6. **Performance:** 3D model lazy-load, snapshoty cache lokálne, nie všetkých 10 rokov naraz.
7. **Testovateľnosť:** Každú prediction rule daj cez unit test.
8. **i18n od začiatku:** SK/EN/CZ preklady.

---

## 11. OTVORENÉ OTÁZKY (vyriešiť pred FÁZOU 1)

- [ ] Finálny tech stack (React Native vs Flutter) — **TVOJE ROZHODNUTIE**
- [ ] Zdroj 3D modelu — kúpiť licencovaný generický alebo dať vytvoriť?
- [ ] Cenník — použijeme cenník DentiClinic alebo priemerné slovenské ceny?
- [ ] Integrácia s existujúcim klinickým softvérom (Stomis/PRAKTIK/iný)?
- [ ] Hosting Supabase — EU región (Frankfurt) kvôli GDPR.

---

**END OF SPEC — Pripravené na implementáciu cez Claude Code.**
