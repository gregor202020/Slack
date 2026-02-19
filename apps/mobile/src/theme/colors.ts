/**
 * Brand color palette for The Smoker mobile app.
 *
 * Primary: Third Wave BBQ blue
 * Accent: Smoky orange
 * Smoke: Neutral gray scale
 */

export const colors = {
  brand: {
    50: '#E6F2FA',
    100: '#B3D9F0',
    200: '#80C0E6',
    300: '#4DA7DC',
    400: '#268ED2',
    500: '#0170B9',
    600: '#015A94',
    700: '#01436F',
    800: '#002D4A',
    900: '#001625',
  },

  accent: {
    50: '#FEF0EB',
    100: '#FBD1C2',
    200: '#F8B299',
    300: '#F59370',
    400: '#F07A51',
    500: '#E8652B',
    600: '#C85523',
    700: '#A8451B',
    800: '#883614',
    900: '#68260D',
  },

  smoke: {
    50: '#F8F8F8',
    100: '#F0F0F0',
    200: '#E4E4E4',
    300: '#D1D1D1',
    400: '#B4B4B4',
    500: '#9A9A9A',
    600: '#6E6E6E',
    700: '#4A4A4A',
    800: '#2D2D2D',
    900: '#1A1A1A',
  },

  white: '#FFFFFF',
  black: '#000000',

  success: '#22C55E',
  warning: '#F59E0B',
  error: '#EF4444',
  info: '#3B82F6',

  /** Convenience aliases */
  primary: '#0170B9',
  background: '#F8F8F8',
  surface: '#FFFFFF',
  textPrimary: '#1A1A1A',
  textSecondary: '#6E6E6E',
  textMuted: '#9A9A9A',
  border: '#E4E4E4',
  divider: '#F0F0F0',
} as const

export type Colors = typeof colors
