/**
 * Mock expo-secure-store for unit testing.
 *
 * Uses an in-memory Map to simulate secure key-value storage.
 */

const store = new Map<string, string>()

export async function getItemAsync(key: string): Promise<string | null> {
  return store.get(key) ?? null
}

export async function setItemAsync(key: string, value: string): Promise<void> {
  store.set(key, value)
}

export async function deleteItemAsync(key: string): Promise<void> {
  store.delete(key)
}

/**
 * Test helper: clear the entire mock store between tests.
 */
export function __reset(): void {
  store.clear()
}
