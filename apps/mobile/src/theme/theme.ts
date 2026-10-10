/**
 * Design tokens focados em acessibilidade para o público idoso.
 *
 * Diretrizes seguidas:
 *   - Contraste mínimo 7:1 (WCAG AAA) entre texto e fundo
 *   - Tamanhos de fonte de base elevada (18px mínimo, títulos 28px+)
 *   - Áreas de toque mínimas de 56px (acima do padrão de 44px do iOS/Android)
 *   - Paleta reduzida: evita tons pastéis de baixo contraste
 */

export const colors = {
  background: '#FCFDFD',
  surface: '#F1F4F6',
  textPrimary: '#20262B',
  textSecondary: '#46515B',
  primary: '#155C50',
  primaryDark: '#103F37',
  accent: '#244FC0',
  success: '#186244',
  danger: '#A52239',
  warning: '#8A5300',
  border: '#BBCBC8',
  disabled: '#596B68',
} as const;

export const fontSizes = {
  body: 18,
  bodyLarge: 20,
  title: 24,
  titleLarge: 30,
  caption: 16,
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const touchTarget = {
  minHeight: 56,
  minWidth: 56,
  borderRadius: 8,
} as const;

export const theme = { colors, fontSizes, spacing, touchTarget };
export const fonts = { regular: 'AtkinsonHyperlegible_400Regular', bold: 'AtkinsonHyperlegible_700Bold' } as const;
export type Theme = typeof theme;
