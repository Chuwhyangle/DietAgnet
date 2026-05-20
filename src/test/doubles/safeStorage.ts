/**
 * Reusable `safeStorage` mock for main-process tests (task 2.2).
 *
 * Wired in via:
 *
 *     vi.mock('electron', async () => {
 *       const { createSafeStorageMock } = await import(
 *         '@/test/doubles/safeStorage'
 *       )
 *       return { safeStorage: createSafeStorageMock(), ... }
 *     })
 *
 * The stub satisfies Requirement 5.6: every Main_Process_Test that
 * touches `safeStorage` gets a deterministic, in-memory replacement so
 * the host's encrypted credential store is never read or written.
 *
 * Design notes (per design.md "Mocking strategy" row for `safeStorage`):
 *
 * - The backing store is an in-memory `Map<string, Buffer>` where the
 *   key is the hex representation of the encrypted buffer and the
 *   value is the plaintext bytes. Using the buffer's hex as the map
 *   key makes `encryptString` ↔ `decryptString` a true round-trip:
 *
 *       decryptString(encryptString(s)) === s    // for any utf-8 string s
 *
 *   even when the same plaintext is encrypted multiple times (each
 *   call returns a distinct, unique buffer).
 *
 * - `isEncryptionAvailable` returns `true` so production code paths
 *   that gate on encryption availability take the "happy" branch
 *   under test. Tests that need the negative branch can override the
 *   `vi.fn()` directly.
 *
 * - The encrypted buffer is opaque to callers. We tag it with a
 *   monotonically increasing counter so two `encryptString(s)` calls
 *   for the same `s` return distinct, lookupable buffers. Production
 *   code that mishandles the buffer (e.g. tries to read the plaintext
 *   bytes directly) will fail fast in `decryptString` with a clear
 *   error rather than silently returning garbled output.
 */

import { vi, type Mock } from 'vitest'

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface SafeStorageMock {
  isEncryptionAvailable: Mock<[], boolean>
  encryptString: Mock<[string], Buffer>
  decryptString: Mock<[Buffer], string>
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Build a fresh, isolated `safeStorage` stub.
 *
 * Each call returns an independent object with its own backing `Map`,
 * so individual test files (and the IPC handlers they register) do not
 * leak credential state across cases.
 */
export function createSafeStorageMock(): SafeStorageMock {
  // Backing store: hex(encryptedBuffer) -> plaintext bytes. We hold the
  // plaintext as a Buffer (not a string) to mirror what real Electron
  // does — `decryptString` returns a UTF-8 decode of internal bytes.
  const store = new Map<string, Buffer>()
  let counter = 0

  const isEncryptionAvailable: Mock<[], boolean> = vi.fn<[], boolean>(
    () => true,
  )

  const encryptString: Mock<[string], Buffer> = vi.fn<[string], Buffer>(
    (value) => {
      // Unique tag so two encryptions of the same plaintext yield
      // distinct buffers but both decrypt back to the original string.
      counter += 1
      const tag = Buffer.from(`safe:${counter}`, 'utf8')
      store.set(tag.toString('hex'), Buffer.from(value, 'utf8'))
      return tag
    },
  )

  const decryptString: Mock<[Buffer], string> = vi.fn<[Buffer], string>(
    (buffer) => {
      if (!Buffer.isBuffer(buffer)) {
        throw new Error('safeStorage stub: decryptString requires a Buffer')
      }
      const plaintext = store.get(buffer.toString('hex'))
      if (plaintext === undefined) {
        throw new Error(
          'safeStorage stub: payload was not produced by encryptString',
        )
      }
      return plaintext.toString('utf8')
    },
  )

  return { isEncryptionAvailable, encryptString, decryptString }
}
