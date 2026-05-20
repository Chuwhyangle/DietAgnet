/**
 * Property-test run configuration helper (task 2.7, Requirement 1.7).
 *
 * Property-based tests across this repo share one knob — `numRuns` —
 * so CI can opt into denser exploration without editing every test
 * file. The single source of truth is `process.env.VITEST_PBT_RUNS`;
 * if absent or non-numeric, the default of 100 matches the existing
 * `*.property.test.ts` convention.
 *
 *     // Inside a property test:
 *     import * as fc from 'fast-check'
 *     import { defaultRunConfig } from '@/test/arbitraries/runConfig'
 *
 *     await fc.assert(prop, defaultRunConfig())
 *
 *     # Locally bump iterations:
 *     VITEST_PBT_RUNS=500 npm test
 *
 * The shape is structural (compatible with fast-check's
 * `fc.Parameters`) so callers can spread a per-test override on top:
 *
 *     fc.assert(prop, { ...defaultRunConfig(), seed: 42 })
 */

/**
 * Configuration passed to `fc.assert(...)` by property-based tests.
 *
 * Fields mirror `fc.Parameters` so the helper output drops in
 * directly. Only the knobs the design guarantees are typed here;
 * tests that need additional fast-check options can spread them.
 */
export interface PropertyTestConfig {
  /** Number of iterations per property; default 100. */
  numRuns: number
  /** Stop and shrink on the first failure (we always shrink). */
  endOnFailure?: boolean
  /** Verbose output (kept off by default to keep CI logs quiet). */
  verbose?: boolean
  /** Optional seed for deterministic reproductions. */
  seed?: number
}

/**
 * Build the default `PropertyTestConfig`.
 *
 * `numRuns` reads `process.env.VITEST_PBT_RUNS` and falls back to 100
 * when the variable is missing or non-numeric. `endOnFailure` is true
 * so failures shrink to a minimal counterexample; `verbose` is false
 * so passing runs stay quiet.
 */
export function defaultRunConfig(): PropertyTestConfig {
  const raw = Number(process.env.VITEST_PBT_RUNS)
  const numRuns = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 100
  return {
    numRuns,
    endOnFailure: true,
    verbose: false,
  }
}
