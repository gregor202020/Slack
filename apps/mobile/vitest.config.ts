import { defineConfig } from 'vitest/config'
import path from 'node:path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 10000,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      'react-native': path.resolve(__dirname, './tests/__mocks__/react-native.ts'),
      'expo-secure-store': path.resolve(__dirname, './tests/__mocks__/expo-secure-store.ts'),
      'expo-constants': path.resolve(__dirname, './tests/__mocks__/expo-constants.ts'),
      'expo-notifications': path.resolve(__dirname, './tests/__mocks__/expo-notifications.ts'),
      'expo-device': path.resolve(__dirname, './tests/__mocks__/expo-device.ts'),
      'socket.io-client': path.resolve(__dirname, './tests/__mocks__/socket.io-client.ts'),
    },
  },
})
