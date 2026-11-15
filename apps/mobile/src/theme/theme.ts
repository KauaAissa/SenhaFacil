export const colors = {
  background: '#FAF7F2',
  surface: '#FFFFFF',
  surfaceMuted: '#F1F0EB',
  textPrimary: '#233D36',
  textSecondary: '#56665F',
  primary: '#176354',
  primaryDark: '#123F36',
  primarySoft: '#E7F3EC',
  accent: '#3E5198',
  accentSoft: '#EBEEFA',
  coral: '#A43F30',
  coralSoft: '#FCECE5',
  success: '#246341',
  successSoft: '#E8F4EA',
  danger: '#AA3545',
  dangerSoft: '#FCEBED',
  warning: '#80500C',
  warningSoft: '#FFF0D2',
  border: '#D9E1DA',
  inputBorder: '#7C8B81',
  disabled: '#626E67',
  inverse: '#FFFFFF',
  heroDecoration: '#205D4F',
} as const;

export type ThemeColors = { [Key in keyof typeof colors]: string };
export const contrastColors: ThemeColors = {
  ...colors,
  background: '#FFFFFF', surface: '#FFFFFF', surfaceMuted: '#FFFFFF',
  textPrimary: '#000000', textSecondary: '#000000', primary: '#000000', primaryDark: '#000000',
  primarySoft: '#FFFFFF', accent: '#000000', accentSoft: '#FFFFFF', coral: '#000000', coralSoft: '#FFFFFF',
  success: '#000000', successSoft: '#FFFFFF', danger: '#000000', dangerSoft: '#FFFFFF',
  warning: '#000000', warningSoft: '#FFFFFF', border: '#000000', inputBorder: '#000000',
  disabled: '#595959', heroDecoration: '#000000',
};

export type Tone = 'primary' | 'accent' | 'coral' | 'success' | 'warning' | 'danger' | 'neutral';
export function toneColors(palette: ThemeColors, tone: Tone) {
  if (tone === 'neutral') return { foreground: palette.textSecondary, background: palette.surfaceMuted };
  return { foreground: palette[tone], background: palette[`${tone}Soft`] };
}

export const fontSizes = {
  body: 18,
  bodyLarge: 20,
  title: 26,
  titleLarge: 34,
  caption: 16,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 40,
} as const;

export const radii = { sm: 12, md: 18, lg: 28, pill: 999 } as const;
export const touchTarget = {
  minHeight: 56,
  minWidth: 56,
  borderRadius: radii.md,
} as const;

export const theme = { colors, fontSizes, spacing, radii, touchTarget };
export const fonts = { regular: 'AtkinsonHyperlegible_400Regular', bold: 'AtkinsonHyperlegible_700Bold' } as const;
export type Theme = typeof theme;
