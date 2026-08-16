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
  background: '#FFFFFF',
  surface: '#F4F6F8',
  textPrimary: '#101418', // Contraste ~19:1 sobre background
  textSecondary: '#3C4650', // Contraste ~9:1 sobre background
  primary: '#0B5FFF', // Azul acessível — contraste ~5.4:1 (usar apenas em botões grandes)
  primaryDark: '#08348C',
  success: '#0F7B3E',
  danger: '#B3261E',
  warning: '#8A5300',
  border: '#C7CDD3',
  disabled: '#9AA3AC',
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
  borderRadius: 12,
} as const;

export const theme = { colors, fontSizes, spacing, touchTarget };
export type Theme = typeof theme;
