export const COLORS = {
  // Brand — Modern Minimal palette
  esp:       '#111827',
  wal:       '#3A4256',
  sand:      '#BBACA0',
  cream:     '#F8F6F2',
  ivory:     '#F8F6F2',  // alias for cream
  bg2:       '#E2DDD6',
  bg3:       '#D5CEC6',
  gold:      '#3A4256',
  goldLight: '#D5CEC6',
  goldDark:  '#2D3544',

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
    bg:     '#111827',
    card:   '#1E2535',
    card2:  '#2A3347',
    border: '#3A4256',
    text:   '#F8F6F2',
    textSub:'#BBACA0',
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
  sm:   { shadowColor: '#1A2030', shadowOffset: { width: 0, height: 2  }, shadowOpacity: 0.08, shadowRadius: 8,  elevation: 2 },
  md:   { shadowColor: '#1A2030', shadowOffset: { width: 0, height: 4  }, shadowOpacity: 0.10, shadowRadius: 16, elevation: 4 },
  lg:   { shadowColor: '#1A2030', shadowOffset: { width: 0, height: 8  }, shadowOpacity: 0.14, shadowRadius: 24, elevation: 8 },
  xl:   { shadowColor: '#1A2030', shadowOffset: { width: 0, height: 16 }, shadowOpacity: 0.16, shadowRadius: 40, elevation: 16 },
  gold: { shadowColor: '#3A4256', shadowOffset: { width: 0, height: 6  }, shadowOpacity: 0.30, shadowRadius: 20, elevation: 8 },
  card: { shadowColor: '#2A3347', shadowOffset: { width: 0, height: 3  }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 3 },
};

export const RADII = { xs: 6, sm: 10, md: 14, lg: 20, xl: 28, full: 9999, pill: 9999 };

export const GRADIENTS = {
  hero:     ['#1E2535', '#111827', '#0A0F1A'] as string[],
  cream:    ['#F8F6F2', '#E2DDD6', '#D5CEC6'] as string[],
  gold:     ['#4A5568', '#3A4256', '#2D3544'] as string[],
  goldSoft: ['#E8E5E0', '#D5CEC6', '#BBACA0'] as string[],
  success:  ['#52C896', '#1FA774'] as string[],
  warning:  ['#F4C95D', '#E5B043'] as string[],
  danger:   ['#E88379', '#D55A4D'] as string[],
  glass:    ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.4)'] as string[],
  cardCream:['#FFFFFF', '#F8F6F2'] as string[],
  night:    ['#0A0F1A', '#111827'] as string[],
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
  overline: { fontFamily: 'DMSans_500Medium',  fontSize: 10, lineHeight: 12, letterSpacing: 1.5, textTransform: 