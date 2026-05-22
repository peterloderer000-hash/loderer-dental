# Loderer Dental App — Changelog

## [1.1.0] — 2026-05-10

### Fáza 2 — Klinické nástroje

#### Dental Chart
- **ToothDetailModal** — klik na zub s aktívnym statusom otvorí detail modal s históriou zmien (posledných 5), editovateľnou poznámkou a tlačidlom "Pridať do liečebného plánu"
- **dental_records** tabuľka (migration v41) — automatické zaznamenávanie histórie každej zmeny stavu zuba
- Poznámka z detail modalu sa prenáša do EditModal pri zmene statusu

#### Liečebný plán
- **Rýchly výber zo služieb** — pri pridávaní výkonu sa zobrazí horizontal scroll s chipmi všetkých služieb; tap predvyplní názov a cenu
- **Dark mode item karty** — každý status má správnu tmavú farbu pozadia
- **prefilledTooth param** — navigácia z dental chart do liečebného plánu predvyplní číslo zuba v ItemModal
- Finančný súhrn (Celková cena / Dokončené / Zostatok) s dark mode

#### Recepty & Diagnózy
- **PDF export receptu** — tlačidlo share-outline na každej receptovej karte; generuje PDF s hlavičkou doktora, adresou ambulancie, predpisom a sekciou Pečiatka & Podpis
- **Pull-to-refresh** na scrollview
- **Haptics** pri uložení diagnózy aj receptu (ImpactFeedbackStyle.Medium)

---

### Fáza 3 — Pacientská skúsenosť

#### Booking Flow
- **Cena „od X €"** — chip pod názvom služby v krokoch 2 a 3 výberu dátumu/času
- **Potvrdzovacia obrazovka** — krok 4 má dva tlačidlá: "Upraviť" (späť na krok 3) a "Potvrdiť rezerváciu"
- **Success state** — po úspešnej rezervácii sa namiesto okamžitého presmerovania zobrazí animovaná success obrazovka (FadeInDown.springify) so zelenou fajkou, detailami termínu a tlačidlami navigácie

#### Pacientská domovská obrazovka (patient/index.tsx)
- **Countdown chip** v karte "Tvoj ďalší termín" — farebný pill: červený "DNES", oranžový "o 1–3 dni", zelený "o N dní"
- **Widget "Odporúčania"** — ak má pacient zuby so statusom cavity/watch/treatment_needed/fracture/periodontal/mobility, zobrazí sa žltý varovný banner s počtom a navigáciou na dentálne skóre

#### Pacientský profil (patient/profile.tsx)
- **Sekcia "Moje dokumenty"** — zobrazuje aktívne recepty a zdieľané liečebné plány (visible_to_patient = true) s navigáciou na príslušné obrazovky

---

### Fáza 4 — Recall & Komunikácia

#### Recall pacientov
- **Filtre s badge** — taby: Všetci / 6–12 mes. / 1–2 roky / 2+ roky; každý zobrazuje počet pacientov
- **Farebné indikátory urgentnosti** — zelená (6–12 mes.), oranžová (1–2 roky), červená (2+ roky) na ľavej lište karty
- **Rozšírená karta** — počet celkových návštev, presný dátum poslednej návštevy (nie len "X mes.")
- **Hromadné správy** — checkbox na každej karte + tlačidlo "Poslať všetkým vybraným (N)"; odošle in-app notifikáciu každému vybranému pacientovi a zaloguje do staff_messages pre štatistiky
- **Štatistický panel** — celkový počet recall pacientov, priemerná absencia, počet recall správ tento mesiac

---

### Fáza 5 — Správa kliniky

#### Cenník služieb (services.tsx)
- **Zoraďovanie šípkami ↑↓** — každá aktívna služba má tlačidlá na presun; okamžitý optimistický update + uloženie sort_order do DB
- **Archivácia namiesto mazania** — "Archivovať" toggle namiesto "Vymazať"; archivované služby viditeľné na konci zoznamu, zošednuté, s tlačidlom "Obnoviť"
- Pull-to-refresh, rozšírená emoji paleta (12 ikon)

#### Ordinačné hodiny (opening-hours.tsx)
- **Sekcia "Výnimky"** — konkrétne dátumy kedy je ambulancia zatvorená alebo má iné hodiny (sviatky, dovolenka); ukladá do tabuľky clinic_exceptions (migration v42)
- Formulár: dátum YYYY-MM-DD, toggle "Zatvorené celý deň", hodiny od/do, poznámka
- Farebné boxy v zozname výnimiek (červená = zatvorené, zelená = iné hodiny)

#### Admin panel (admin.tsx)
- **Sekcia "Štatistiky tímu"** v záložke Štatistiky — pre každého doktora/hygienistu: termíny tento mesiac, dokončené, zrušené, priemerné hodnotenie (4 farebné boxy)

---

### Fáza 6 — UI/UX Polish

#### Haptics
- `waitlist.tsx` — ImpactFeedbackStyle.Medium pri schválení, Light pri zamietnutí
- `prescriptions.tsx` — Medium pri uložení diagnózy aj receptu
- `staff-chat.tsx` — Light pri odoslaní správy

#### Pull-to-refresh
- `messages.tsx` — konverzačný zoznam s RefreshControl
- `prescriptions.tsx` — hlavný ScrollView s RefreshControl
- `staff-chat.tsx` — DM threads FlatList s RefreshControl

#### Čakacia listina (waitlist.tsx)
- **"čaká X dní" badge** — farebný badge na každej karte; modrý pre čerstvé žiadosti, červený pre 14+ dní
- **Automatické notifikácie** (migration v43) — DB trigger notifikuje prvých 3 pacientov na waitliste keď sa termín zruší

---

### Technická infraštruktúra

#### Supabase migrácie
- **v41** — `dental_records` tabuľka (história zmien stavu zubov, RLS pre staff + pacienta)
- **v42** — `clinic_exceptions` tabuľka (výnimky v ordinačných hodinách, UNIQUE doctor_id+date)
- **v43** — `trg_notify_waitlist_cancel` trigger (auto-notifikácie pri zrušení termínu)

#### KPI & Štatistiky
- `stats.tsx` — refaktor na `get_today_kpi()` RPC funkciu (paralelné načítanie s Promise.all)
- Oprava: `avg_wait_minutes` / `avg_treatment_minutes` správne názvy stĺpcov

#### Dark mode
- Dokomplentovaný dark mode v `billing.tsx`, `treatment-plan.tsx`, `recall.tsx`, `services.tsx`
- Pastelové farby nahradené tmavými ekvivalentmi podľa CLAUDE.md tabuľky

---

## [1.0.0] — 2026-05-02

### Prvé vydanie

- Doktorský modul: dashboard, kalendár, pacienti, termíny, billing, štatistiky
- Recepčný modul: check-in workflow (scheduled → arrived → in_chair → completed → paid)
- Pacientský modul: booking flow, zubná karta, health passport, recepty, platby
- KPI metriky: kresá, arrived_at/started_at/ended_at timestampy (migration v40)
- Dark mode: kompletná podpora pre všetky obrazovky
- Vernostný systém: Bronz/Striebro/Zlato/Platina podľa počtu návštev
- Export PDF: história pacienta, faktúra, liečebný plán, zdravotný pas, mesačné fakturácie
- Real-time chat: doktor ↔ pacient, staff broadcast
- Notifikačný systém: push + in-app notifikácie
- OTA updates cez EAS Update (preview branch)
