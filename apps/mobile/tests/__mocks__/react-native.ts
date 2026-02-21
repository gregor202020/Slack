/**
 * Minimal React Native mock for unit testing in Node.js.
 */

export const AppState = {
  addEventListener: () => ({ remove: () => {} }),
  currentState: 'active' as const,
}

export type AppStateStatus = 'active' | 'background' | 'inactive'

export const Platform = {
  OS: 'ios' as const,
  select: (obj: Record<string, unknown>) => obj.ios ?? obj.default,
}

export const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
}

export const Alert = {
  alert: () => {},
}
