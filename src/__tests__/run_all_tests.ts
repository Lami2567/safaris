import { spawnSync } from 'child_process';
import path from 'path';
import fs from 'fs';

function cleanEphemeralDriverFiles() {
  const candidates = [
    path.resolve(process.cwd(), 'persistent_drivers.json'),
    path.resolve(process.cwd(), 'persistent_tour_guides.json'),
    path.resolve(process.cwd(), 'src/database/persistent_drivers.json'),
    path.resolve(process.cwd(), 'src/database/persistent_tour_guides.json'),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      try { fs.writeFileSync(c, '[]', 'utf-8'); } catch (_) {}
    }
  }
}

console.log('===================================================================');
console.log('🚀 SAFARIS MASTER TEST RUNNER — ALL PRODUCTION VERIFICATION SUITES');
console.log('===================================================================\n');

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

for (const suite of testSuites) {
  if (suite.file === 'verify_all.ts') {
    cleanEphemeralDriverFiles();
  }
  console.log(`\n-------------------------------------------------------------------`);
  console.log(`▶ Running: ${suite.name}`);
  console.log(`  File   : src/__tests__/${suite.file}`);
  console.log(`-------------------------------------------------------------------`);

  const filePath = path.resolve(__dirname, suite.file);
  const result = spawnSync('npx', ['ts-node', filePath], {
    stdio: 'inherit',
    shell: true,
    env: { ...process.env, NODE_ENV: 'test' },
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
cleanEphemeralDriverFiles();
console.log('\n===================================================================');
console.log(`🎉 ALL ${totalPassed}/${testSuites.length} SUITES PASSED SUCCESSFULLY IN ${durationSec}s!`);
console.log('===================================================================\n');
