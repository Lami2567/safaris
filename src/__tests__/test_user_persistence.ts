import { AuthService } from '../services/auth/auth.service';
import { db, localStore } from '../config/database';
import { seedUgandaData } from '../database/seed';

async function testUserPersistenceAcrossReboots() {
  console.log('🧪 Testing User Registration, Persistence, and Multi-Format Login Across Restarts...');

  const testEmail = `durability_${Date.now()}@safaris.ug`;
  const rawPhone = '0782 998877';
  const password = 'Password@123';

  // 1. Register a new user
  console.log(`1. Registering user with email: ${testEmail}, phone: ${rawPhone}`);
  const regResult = await AuthService.register({
    fullName: 'Grace Nakimera',
    phone: rawPhone,
    email: testEmail,
    password: password,
  });

  if (!regResult.requiresVerification) {
    throw new Error('Registration should require verification!');
  }
  console.log('✅ Registration succeeded.');

  // 2. Verify with OTP '123456' (dev fallback)
  console.log('2. Verifying account with OTP...');
  const verifyRes = await AuthService.verifyEmailOtp(testEmail, '123456');
  if (!verifyRes.user.is_verified) {
    throw new Error('User should be verified after OTP confirmation!');
  }
  console.log(`✅ User verified: ${verifyRes.user.full_name} (${verifyRes.user.id})`);

  // 3. SIMULATE HARD SERVER RESTART
  console.log('\n🔄 3. Simulating Full Server Process Restart / Reboot...');
  localStore.users.clear(); // wipe in-memory RAM
  if (localStore.users.size !== 0) {
    throw new Error('localStore.users was not cleared!');
  }
  console.log('   In-memory RAM cleared. Reloading from permanent storage...');

  // Re-initialize database & seed (simulating index.ts boot sequence)
  await db.init();
  await seedUgandaData();

  console.log(`   After reboot, loaded ${localStore.users.size} users.`);
  if (!localStore.users.has(verifyRes.user.id)) {
    throw new Error(`CRITICAL FAILURE: User ${verifyRes.user.id} disappeared after restart!`);
  }
  console.log('✅ User survived hard reboot cleanly!');

  // 4. Test login using different Ugandan phone number formats
  console.log('\n4. Testing flexible phone format logins:');

  // Variant A: Login with +256 782 998877
  const loginA: any = await AuthService.login('+256 782 998877', password);
  if (!loginA.user || loginA.user.id !== verifyRes.user.id) {
    throw new Error('Login variant A (+256 782 998877) failed to return correct user!');
  }
  console.log('   ✅ Login with "+256 782 998877" succeeded!');

  // Variant B: Login with +256782998877
  const loginB: any = await AuthService.login('+256782998877', password);
  if (!loginB.user || loginB.user.id !== verifyRes.user.id) {
    throw new Error('Login variant B (+256782998877) failed to return correct user!');
  }
  console.log('   ✅ Login with "+256782998877" succeeded!');

  // Variant C: Login with 0782998877
  const loginC: any = await AuthService.login('0782998877', password);
  if (!loginC.user || loginC.user.id !== verifyRes.user.id) {
    throw new Error('Login variant C (0782998877) failed to return correct user!');
  }
  console.log('   ✅ Login with "0782998877" succeeded!');

  // Variant D: Login with email
  const loginD: any = await AuthService.login(testEmail, password);
  if (!loginD.user || loginD.user.id !== verifyRes.user.id) {
    throw new Error('Login variant D (email) failed to return correct user!');
  }
  console.log('   ✅ Login with email succeeded!');

  console.log('\n🎉 ALL USER PERSISTENCE & MULTI-FORMAT LOGIN TESTS PASSED CLEANLY!\n');
}

testUserPersistenceAcrossReboots().catch((err) => {
  console.error('❌ PERSISTENCE TEST FAILED:', err);
  process.exit(1);
});
