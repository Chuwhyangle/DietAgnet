#!/usr/bin/env node
/**
 * Wall-clock budget assertion for the test suite.
 * Runs `npx vitest --run` and fails if it exceeds 90 seconds.
 *
 * Usage: node scripts/test-budget.js
 * Exit codes:
 *   0 - tests passed within budget
 *   1 - tests passed but exceeded the 90s wall-clock budget
 *   * - propagated from vitest on test failure
 */

const { spawnSync } = require('child_process');

const BUDGET_SECONDS = 90;

const start = Date.now();

const result = spawnSync('npx', ['vitest', '--run'], {
  stdio: 'inherit',
  shell: process.platform === 'win32'
});

const elapsed = (Date.now() - start) / 1000;

console.log(`\n⏱  Test suite completed in ${elapsed.toFixed(1)}s (budget: ${BUDGET_SECONDS}s)`);

// If vitest itself failed, propagate its exit code
if (result.status !== 0) {
  console.error(`\n✗ Tests failed with exit code ${result.status}`);
  process.exit(result.status);
}

// Check wall-clock budget
if (elapsed > BUDGET_SECONDS) {
  console.error(`\n✗ BUDGET EXCEEDED: ${elapsed.toFixed(1)}s > ${BUDGET_SECONDS}s`);
  process.exit(1);
}

console.log('✓ Tests passed within wall-clock budget.');
process.exit(0);
