export const COLORS = {
  // Brand — DentiClinic cool palette
  esp:       '#121417',
  wal:       '#3A4256',
  sand:      '#B8ACA0',
  cream:     '#F5F6F8',
  ivory:     '#F5F6F8',  // alias for cream
  bg2:       '#EAECEE',
  bg3:       '#D0D4DC',
  gold:      '#3A4256',
  goldLight: '#D0D4DC',
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
    bg:     '#121417',
    card:   '#1A1D24',
    card2:  '#252830',
    border: '#3A4256',
    text:   '#F5F6F8',
    textSub:'#B8ACA0',
  },
};

export const SIZES = {
  radius:  4,
  padding: 16,
};

export const FONTS = {
  heading:       'PlayfairDisplay_700Bold',
  headingItalic: 'PlayfairDisplay_700Bold_Italic',
  body:          'DMSans_400Regular',
  bodyMedium:    'DMSans_500Medium',
};

export const SHADOWS = {
  sm:   { shadowColor: '#121417', shadowOffset: { width: 0, height: 1  }, shadowOpacity: 0.04, shadowRadius: 4,  elevation: 1 },
  md:   { shadowColor: '#121417', shadowOffset: { width: 0, height: 2  }, shadowOpacity: 0.06, shadowRadius: 8,  elevation: 2 },
  lg:   { shadowColor: '#121417', shadowOffset: { width: 0, height: 4  }, shadowOpacity: 0.08, shadowRadius: 12, elevation: 4 },
  xl:   { shadowColor: '#121417', shadowOffset: { width: 0, height: 8  }, shadowOpacity: 0.10, shadowRadius: 20, elevation: 6 },
  gold: { shadowColor: '#3A4256', shadowOffset: { width: 0, height: 3  }, shadowOpacity: 0.12, shadowRadius: 10, elevation: 4 },
  card: { shadowColor: '#252830', shadowOffset: { width: 0, height: 1  }, shadowOpacity: 0.04, shadowRadius: 6,  elevation: 1 },
};

export const RADII = { xs: 2, sm: 4, md: 6, lg: 8, xl: 10, full: 9999, pill: 9999 };

export const GRADIENTS = {
  hero:     ['#1A1D24', '#121417', '#0A0C10'] as string[],
  cream:    ['#F5F6F8', '#EAECEE', '#D0D4DC'] as string[],
  gold:     ['#4A5568', '#3A4256', '#2D3544'] as string[],
  goldSoft: ['#E4E6EA', '#D0D4DC', '#B8ACA0'] as string[],
  success:  ['#52C896', '#1FA774'] as string[],
  warning:  ['#F4C95D', '#E5B043'] as string[],
  danger:   ['#E88379', '#D55A4D'] as string[],
  glass:    ['rgba(255,255,255,0.8)', 'rgba(255,255,255,0.4)'] as string[],
  cardCream:['#FFFFFF', '#F5F6F8'] as string[],
  night:    ['#0A0C10', '#121417'] as string[],
};

export const SPACING = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 };

export const TYPO = {
  // Playfair — editorial italic headings (DentiClinic style)
  hero:       { fontFamily: 'PlayfairDisplay_700Bold_Italic',  fontSize: 32, lineHeight: 40, letterSpacing: -0.5 },
  heroItalic: { fontFamily: 'PlayfairDisplay_700Bold_Italic',  fontSize: 28, lineHeight: 36, letterSpacing: -0.3 },
  h1:         { fontFamily: 'PlayfairDisplay_700Bold_Italic',  fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  h1Dark:     { fontFamily: 'PlayfairDisplay_700Bold_Italic',  fontSize: 24, lineHeight: 30, letterSpacing: -0.3 },
  h2:         { fontFamily: 'PlayfairDisplay_700Bold_Italic',  fontSize: 20, lineHeight: 26, letterSpacing: -0.2 },

  // DM Sans — UI text with editorial tracking
  label:    { fontFamily: 'DMSans_500Medium', fontSize: 10, lineHeight: 13, letterSpacing: 2.5, textTransform: 'uppercase' as const },
  bodyLg:   { fontFamily: 'DMSans_400Regular', fontSize: 16, lineHeight: 24 },
  body:     { fontFamily: 'DMSans_400Regular', fontSize: 14, lineHeight: 21 },
  bodySm:   { fontFamily: 'DMSans_400Regular', fontSize: 12, lineHeight: 18 },
  bodyMed:      { fontFamily: 'DMSans_500Medium',  fontSize: 14, lineHeight: 21 },
  bodyMedium:   { fontFamily: 'DMSans_500Medium',  fontSize: 14, lineHeight: 20 },
  btnText:  { fontFamily: 'DMSans_500Medium',  fontSize: 13, lineHeight: 18, letterSpacing: 1.5, textTransform: 'uppercase' as const },
  caption:  { fontFamily: 'DMSans_500Medium',  fontSize: 10, lineHeight: 13, letterSpacing: 1.8, textTransform: 'uppercase' as const },
  overline: { fontFamily: 'DMSans_500Medium',  fontSize: 9,  lineHeight: 12, letterSpacing: 2.5, textTransform: 'uppercase' as const },
};
