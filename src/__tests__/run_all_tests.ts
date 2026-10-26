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
  PATH: process.env.PATH,
  HOME: process.env.HOME,
  TMPDIR: process.env.TMPDIR,
  NODE_ENV: 'test',
  SAFARIS_TEST_DATA_DIR: testDataDir,
  DISABLE_DATABASE: 'true',
  JWT_SECRET: 'test_jwt_secret_safaris_super_secure_32chars_min',
  REFRESH_TOKEN_SECRET: 'test_refresh_token_secret_safaris_32ch',
  CONFIG_ENCRYPTION_SECRET: 'safaris_config_encryption_key_2026_uganda_32b',
  DPO_ENVIRONMENT: 'sandbox',
  DPO_SANDBOX_COMPANY_TOKEN: 'B3F59BE7-0756-420E-BB88-1D98E7A6B040',
  DPO_SANDBOX_SERVICE_TYPE_ID: '54841',
  PORT: '0',
  CLOUDFLARE_R2_PRIVATE_BUCKET_NAME: 'safaris-private-test',
};

const testSuites = [
  { name: 'Remaining authentication, privacy and proxy regressions', file: 'remaining_security.test.ts' },
  { name: 'HTTP, WebSocket, SSE and transaction security boundaries', file: 'security_boundaries.test.ts' },
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
  const tsNodeBin = path.resolve(__dirname, '../../node_modules/ts-node/dist/bin.js');

  for (const suite of testSuites) {
    console.log(`\n-------------------------------------------------------------------`);
    console.log(`▶ Running: ${suite.name}`);
    console.log(`  File   : src/__tests__/${suite.file}`);
    console.log(`-------------------------------------------------------------------`);

    const filePath = path.resolve(__dirname, suite.file);
    const result = spawnSync(process.execPath, [tsNodeBin, '--transpile-only', filePath], {
      stdio: 'inherit',
      shell: false,
      env: baseTestEnv,
    });

    if (result.status === 0) {
      console.log(`\n✅ SUITE PASSED: ${suite.name}`);
      totalPassed++;
    } else {
      console.error(`\n❌ SUITE FAILED: ${suite.name} (Exit code: ${result.status})`);
      if (result.error) {
        console.error('Child spawn error:', result.error);
      }
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
