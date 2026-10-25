import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';
import os from 'os';

console.log('===================================================================');
console.log('🚀 SAFARIS MASTER TEST RUNNER — ALL PRODUCTION VERIFICATION SUITES');
console.log('===================================================================\n');

// Create isolated temporary directory for all test persistence files
const testDataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'safaris-test-data-'));
console.log(`🔒 Initialized isolated test data directory: ${testDataDir}`);

// Seed isolated blank data files in test directory so production/repo files are untouched
const seedFiles = [
  'persistent_drivers.json',
  'persistent_tour_guides.json',
  'persistent_config.json',
  'destinations.json',
  'packages.json',
  'categories.json',
];
for (const sf of seedFiles) {
  const initialContent = sf.endsWith('config.json') ? '{}' : '[]';
  fs.writeFileSync(path.join(testDataDir, sf), initialContent, 'utf-8');
}

// Pass an explicit test environment stripped of production credentials
const baseTestEnv: NodeJS.ProcessEnv = {
  ...process.env,
  NODE_ENV: 'test',
  SAFARIS_TEST_DATA_DIR: testDataDir,
  DISABLE_DATABASE: 'true',
  JWT_SECRET: process.env.JWT_SECRET || 'test_jwt_secret_safaris_super_secure_32chars_min',
  PORT: '0',
};

const testSuites = [
  {
    name: 'Security Audit & Hardening Regression Suite (19 Scenarios)',
    file: 'security_audit_hardening.test.ts',
  },
  {
    name: 'Dynamic CMS, Cloudflare R2 & Server Quotation Engine (24 Scenarios)',
    file: 'dynamic_cms_pricing_master.test.ts',
  },
  {
    name: 'Production Double-Entry Financial Engine & 10K Concurrency Suite (30 Scenarios)',
    file: 'financial_engine_master.test.ts',
  },
  {
    name: 'End-to-End System Integration Verification Suite',
    file: 'verify_all.ts',
  },
];

let totalPassed = 0;
let totalFailed = 0;
const startTime = Date.now();

try {
  for (const suite of testSuites) {
    console.log(`\n-------------------------------------------------------------------`);
    console.log(`▶ Running: ${suite.name}`);
    console.log(`  File   : src/__tests__/${suite.file}`);
    console.log(`-------------------------------------------------------------------`);

    const filePath = path.resolve(__dirname, suite.file);
    const result = spawnSync('npx', ['ts-node', '--transpile-only', filePath], {
      stdio: 'inherit',
      shell: true,
      env: baseTestEnv,
    });

    if (result.status === 0) {
      console.log(`\n✅ SUITE PASSED: ${suite.name}`);
      totalPassed++;
    } else {
      console.error(`\n❌ SUITE FAILED: ${suite.name} (Exit code: ${result.status})`);
      totalFailed++;
      process.exit(result.status || 1);
    }
  }

  const durationSec = ((Date.now() - startTime) / 1000).toFixed(2);
  console.log('\n===================================================================');
  console.log(`🎉 ALL ${totalPassed}/${testSuites.length} SUITES PASSED SUCCESSFULLY IN ${durationSec}s!`);
  console.log('===================================================================\n');
} finally {
  try {
    fs.rmSync(testDataDir, { recursive: true, force: true });
    console.log(`🧹 Cleaned up isolated test data directory: ${testDataDir}`);
  } catch (err) {
    console.warn(`Warning: Could not remove test data directory ${testDataDir}`, err);
  }
}
