# Loderer Dental – Vývojový sprievodca

## Obsah
1. [Lokálny vývoj (Expo Go)](#1-lokálny-vývoj-expo-go)
2. [OTA aktualizácia](#2-ota-aktualizácia)
3. [Plný build (APK / IPA)](#3-plný-build-apk--ipa)
4. [Kedy čo použiť](#4-kedy-čo-použiť)

---

## 1. Lokálny vývoj (Expo Go)

Používaj počas aktívneho vývoja – zmeny sa zobrazujú okamžite bez čakania na build.

```bash
# Prejdi do adresára aplikácie
cd app

# Spusti vývojový server
npx expo start
```

Na telefóne otvor **Expo Go** a naskenuj QR kód z terminálu.

> **Podmienka:** Telefón a počítač musia byť na rovnakej Wi-Fi sieti.

**TypeScript kontrola** (spusti pred každým commitom):
```bash
npx tsc --noEmit
```

---

## 2. OTA aktualizácia

Použij, keď meníš len **JavaScript/TypeScript kód alebo assets** – bez zmeny natívnych závislostí (package.json, app.json pluginy, nové native moduly).

```bash
cd app
eas update --channel preview --message "Popis zmeny"
```

Aktualizácia sa nahrá do cloudu. Používateľ ju dostane automaticky pri **dvoch otvoreniach aplikácie** (Expo OTA mechanizmus).

> **Čas:** ~1–2 minúty

---

## 3. Plný build (APK / IPA)

Použij, keď:
- Pridáš alebo aktualizuješ natívny modul (`package.json` závislosti s natívnym kódom)
- Zmeníš `app.json` (ikony, splash, pluginy, permissions)
- Prvý build pre nové zariadenie / distribúciu

### Android (APK)

```bash
cd app
eas build --platform android --profile preview
```

Po dokončení buildu (15–20 min) sa v termináli zobrazí odkaz na stiahnutie APK. Stiahni ho a nainštaluj na zariadenie.

**Inštalácia APK na Android:**
1. Stiahni APK do telefónu
2. Otvor súbor – ak je zablokovaný, povol *Inštalácia z neznámych zdrojov* v nastaveniach
3. Nainštaluj a otvor

### iOS (IPA) – vyžaduje Apple Developer účet

```bash
eas build --platform ios --profile preview
```

---

## 4. Kedy čo použiť

| Situácia | Akcia |
|---|---|
| Oprava textu, štýlov, logiky | `eas update` |
| Nová obrazovka, zmena navigácie | `eas update` |
| Nový npm balík (čisto JS) | `eas update` |
| Nový natívny modul | Plný build |
| Zmena ikon alebo splash screenu | Plný build |
| Zmena `app.json` (pluginy, permissions) | Plný build |
| Testovanie počas vývoja | `npx expo start` + Expo Go |

---

*Projekt: Loderer Dental App | Stack: React Native + Expo SDK 54 + Supabase*
