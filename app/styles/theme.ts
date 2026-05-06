export const COLORS = {
  // Brand
  esp:       '#2C1F14',
  wal:       '#6B4F3A',
  sand:      '#C4A882',
  cream:     '#FAF6F0',
  ivory:     '#FAF6F0',  // alias for cream
  bg2:       '#F4EDE4',
  bg3:       '#EDE4D8',
  gold:      '#C9A84C',
  goldLight: '#E8D5A3',
  goldDark:  '#A8873A',

  // Functional
  success:   '#2E7D5E',
  successBg: '#EDF7F3',
  warning:   '#B87333',
  warningBg: '#FDF3E7',
  error:     '#C0392B',
  errorBg:   '#FDEDEC',
  info:      '#1A5276',
  infoBg:    '#EBF5FB',

  // Dark mode palette
  dark: {
    bg:     '#2C1F14',
    card:   '#3A2A1E',
    card2:  '#4A3528',
    border: '#5A4535',
    text:   '#FAF6F0',
    textSub:'#C4A882',
  },
};

export const SIZES = {
  radius:  12,
  padding: 16,
};

export const FONTS = {
  heading:       'PlayfairDisplay_700Bold',
  headingItalic: 'PlayfairDisplay_700Bold_Italic',
  body:          'DMSans_400Regular',
  bodyMedium:    'DMSans_500Medium',
};

export const SHADOWS = {
  sm:   { shadowColor: '#8B6914', shadowOffset: { width: 0, height: 2  }, shadowOpacity: 0.08, shadowRadius: 8,  elevation: 2 },
  md:   { shadowColor: '#8B6914', shadowOffset: { width: 0, height: 4  }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 4 },
  lg:   { shadowColor: '#8B6914', shadowOffset: { width: 0, height: 8  }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 8 },
  xl:   { shadowColor: '#8B6914', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.16, shadowRadius: 40, elevation: 16 },
  gold: { shadowColor: '#C9A84C', shadowOffset: { width: 0, height: 6  }, shadowOpacity: 0.30, shadowRadius: 20, elevation: 8 },
  card: { shadowColor: '#6B4F3A', shadowOffset: { width: 0, height: 3  }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
};

export const RADII = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, full: 9999, pill: 9999 };

export const GRADIENTS = {
  hero:     ['#3D2010', '#2C1F14', '#1A110A'] as string[],
  cream:    ['#FAF6F0', '#F4ECE4', '#EFE4D6'] as string[],
  gold:     ['#D4B85E', '#C9A84C', '#B8973A'] as string[],
  goldSoft: ['#FDF6E3', '#F5E6B8', '#EDD889'] as string[],
  success:  ['#52C896', '#1FA774'] as string[],
  warning:  ['#F4C95D', '#E5B043'] as string[],
  danger:   ['#E88379', '#D55A4D'] as string[],
  glass:    ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.4)'] as string[],
  cardCream:['#FFFFFF', '#FAF6F0'] as string[],
  night:    ['#1A110A', '#2C1F14'] as string[],
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const TYPO = {
  // Playfair — editorial headings
  hero:       { fontFamily: 'PlayfairDisplay_700Bold',        fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  heroItalic: { fontFamily: 'PlayfairDisplay_700Bold_Italic', fontSize: 28, lineHeight: 36, letterSpacing: -0.3 },
  h1:         { fontFamily: 'PlayfairDisplay_700Bold',        fontSize: 24, lineHeight: 30 },
  h1Dark:     { fontFamily: 'PlayfairDisplay_700Bold',        fontSize: 24, lineHeight: 30 },
  h2:         { fontFamily: 'PlayfairDisplay_700Bold',        fontSize: 20, lineHeight: 26 },

  // DM Sans — UI text
  label:    { fontFamily: 'DMSans_500Medium', fontSize: 11, lineHeight: 14, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  bodyLg:   { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24 },
  body:     { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 21 },
  bodySm:   { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
  bodyMed:      { fontFamily: 'DMSans_500Medium',  fontSize: 14, lineHeight: 21 },
  bodyMedium:   { fontFamily: 'DMSans_500Medium',  fontSize: 14, lineHeight: 20 },
  btnText:  { fontFamily: 'DMSans_500Medium',  fontSize: 15, lineHeight: 20, letterSpacing: 0.3 },
  caption:  { fontFamily: 'DMSans_500Medium',  fontSize: 11, lineHeight: 14, letterSpacing: 0.5 },
  overline: { fontFamily: 'DMSans_500Medium',  fontSize: 10, lineHeight: 12, letterSpacing: 1.5, textTransform: 'uppercase' as const },
};
