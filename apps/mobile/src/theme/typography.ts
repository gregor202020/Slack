/**
 * Typography scale for The Smoker mobile app.
 *
 * Uses system fonts (San Francisco on iOS, Roboto on Android).
 */

import { Platform } from 'react-native'

const fontFamily = Platform.select({
  ios: 'System',
  android: 'Roboto',
  default: 'System',
})

export const fontSize = {
  xs: 11,
  sm: 13,
  base: 15,
  md: 17,
  lg: 20,
  xl: 24,
  '2xl': 30,
  '3xl': 36,
} as const

export const fontWeight = {
  regular: '400' as const,
  medium: '500' as const,
  semibold: '600' as const,
  bold: '700' as const,
}

export const lineHeight = {
  xs: 16,
  sm: 18,
  base: 22,
  md: 24,
  lg: 28,
  xl: 32,
  '2xl': 38,
  '3xl': 44,
} as const

export const typography = {
  fontFamily,

  h1: {
    fontFamily,
    fontSize: fontSize['2xl'],
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight['2xl'],
  },
  h2: {
    fontFamily,
    fontSize: fontSize.xl,
    fontWeight: fontWeight.bold,
    lineHeight: lineHeight.xl,
  },
  h3: {
    fontFamily,
    fontSize: fontSize.lg,
    fontWeight: fontWeight.semibold,
    lineHeight: lineHeight.lg,
  },
  body: {
    fontFamily,
    fontSize: fontSize.base,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.base,
  },
  bodyMedium: {
    fontFamily,
    fontSize: fontSize.base,
    fontWeight: fontWeight.medium,
    lineHeight: lineHeight.base,
  },
  caption: {
    fontFamily,
    fontSize: fontSize.sm,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.sm,
  },
  small: {
    fontFamily,
    fontSize: fontSize.xs,
    fontWeight: fontWeight.regular,
    lineHeight: lineHeight.xs,
  },
} as const

export type Typography = typeof typography
