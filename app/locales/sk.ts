const sk = {
  // ── Profile screen ──────────────────────────────────────────────────────────
  profile: {
    role: '🦷  Pacient',
    stats: {
      total:     'Termínov',
      completed: 'Absolvovaných',
      upcoming:  'Plánovaných',
    },
    lastVisit: 'Posledná návšteva:',

    loyalty: {
      title:     'Vernostné body',
      points:    'bodov',
      bronze:    'Bronz',
      silver:    'Striebro',
      gold:      'Zlato',
      platinum:  'Platina',
      toLevel:   'bodov do úrovne',
      infoBronze: '100 bodov za každú absolvovanú návštevu',
      infoSilver: '🥈 Striebro — získavaš 5 % zľavu na každú návštevu',
      infoGold:   '🥇 Zlato — získavaš 10 % zľavu na každú návštevu',
      infoPlatinum: '💎 Platina — získavaš 15 % zľavu na každú návštevu!',
    },

    settings: {
      title:       'NASTAVENIA',
      darkMode:    'Tmavý režim',
      darkOn:      'Zapnutý',
      darkOff:     'Vypnutý',
      language:    'Jazyk',
      languageSk:  'Slovenčina',
      languageEn:  'Angličtina',
    },

    personal: {
      title:       'OSOBNÉ ÚDAJE',
      fullName:    'CELÉ MENO',
      phone:       'TELEFÓN',
      dob:         'DÁTUM NARODENIA',
      email:       'EMAIL',
      namePlaceholder: 'Meno a priezvisko',
      phonePlaceholder: '+421 900 000 000',
      dobPlaceholder:   'DD.MM.RRRR',
      save:        'Uložiť zmeny',
      savedTitle:  'Uložené ✓',
      savedMsg:    'Profil bol aktualizovaný.',
      errorName:   'Zadaj meno.',
      errorDob:    'Dátum narodenia musí byť vo formáte DD.MM.RRRR',
    },

    quickAccess: {
      title: 'RÝCHLY PRÍSTUP',
      passport:      'Zdravotný dotazník',
      passportSub:   'Vyplnený ✓',
      passportSubNo: 'Nevyplnený',
      score:         'Dentálne skóre',
      scoreSub:      'Môj stav chrupu',
      history:       'História termínov',
      chat:          'AI Dentálny asistent',
      chatSub:       'Otázky o zdraví zubov',
      payments:      'História platieb',
      paymentsSub:   'Zaplatené & dlžoby',
      family:        'Rodinné profily',
      familySub:     'Rezervuj za rodinných',
      consents:      'Informované súhlasy',
      consentsSub:   'Podpis dokumentov',
      plan:          'Liečebný plán',
      planSub:       'Môj plán ošetrenia',
    },

    logout: 'Odhlásiť sa',

    permissions: {
      photoTitle: 'Povolenie',
      photoMsg:   'Potrebujeme prístup k fotkám.',
    },
    uploadError: 'Nepodarilo sa nahrať fotku.',
    chyba:       'Chyba',
  },
} as const;

export default sk;
export type TranslationSchema = typeof sk;
