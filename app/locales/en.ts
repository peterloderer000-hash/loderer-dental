const en = {
  // ── Profile screen ──────────────────────────────────────────────────────────
  profile: {
    role: '🦷  Patient',
    stats: {
      total:     'Appointments',
      completed: 'Completed',
      upcoming:  'Upcoming',
    },
    lastVisit: 'Last visit:',

    loyalty: {
      title:     'Loyalty points',
      points:    'points',
      bronze:    'Bronze',
      silver:    'Silver',
      gold:      'Gold',
      platinum:  'Platinum',
      toLevel:   'points to level',
      infoBronze: '100 points for every completed visit',
      infoSilver: '🥈 Silver — you get a 5 % discount on every visit',
      infoGold:   '🥇 Gold — you get a 10 % discount on every visit',
      infoPlatinum: '💎 Platinum — you get a 15 % discount on every visit!',
    },

    settings: {
      title:       'SETTINGS',
      darkMode:    'Dark mode',
      darkOn:      'Enabled',
      darkOff:     'Disabled',
      language:    'Language',
      languageSk:  'Slovak',
      languageEn:  'English',
    },

    personal: {
      title:       'PERSONAL DATA',
      fullName:    'FULL NAME',
      phone:       'PHONE',
      dob:         'DATE OF BIRTH',
      email:       'EMAIL',
      namePlaceholder: 'First and last name',
      phonePlaceholder: '+421 900 000 000',
      dobPlaceholder:   'DD.MM.YYYY',
      save:        'Save changes',
      savedTitle:  'Saved ✓',
      savedMsg:    'Profile updated successfully.',
      errorName:   'Please enter your name.',
      errorDob:    'Date of birth must be in DD.MM.YYYY format',
    },

    quickAccess: {
      title: 'QUICK ACCESS',
      passport:      'Health Questionnaire',
      passportSub:   'Completed ✓',
      passportSubNo: 'Not completed',
      score:         'Dental Score',
      scoreSub:      'My dental health',
      history:       'Appointment History',
      chat:          'AI Dental Assistant',
      chatSub:       'Questions about dental health',
      payments:      'Payment History',
      paymentsSub:   'Paid & outstanding',
      family:        'Family Profiles',
      familySub:     'Book for family members',
      consents:      'Informed Consents',
      consentsSub:   'Document signing',
      plan:          'Treatment Plan',
      planSub:       'My treatment plan',
    },

    logout: 'Sign out',

    permissions: {
      photoTitle: 'Permission',
      photoMsg:   'We need access to your photos.',
    },
    uploadError: 'Failed to upload photo.',
    chyba:       'Error',
  },
} as const;

export default en;
