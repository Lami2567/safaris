import { AppConfigService } from '../services/app_config/app_config.service';
import { decryptSecret } from '../shared/crypto';
import fs from 'fs';

async function testTokenEncryption() {
  console.log('Testing AppConfig Token Encryption & Permanent Storage...');
  const testToken = 'pk.eyJ1IjoibXVtd2VzYWZhcmkiLCJhIjoiY2x5eXphbXpsMDFlZDJsb2xndGpqczh5MiJ9.UgandaSafariSecret';
  
  await AppConfigService.updateConfig('mapboxAccessToken', testToken);

  // 1. Check getConfig returns clean decrypted token
  const config = await AppConfigService.getConfig();
  console.log('Config returned decrypted token:', config.mapboxAccessToken);
  if (config.mapboxAccessToken !== testToken) {
    throw new Error('getConfig failed to return clean decrypted token!');
  }

  // 2. Check disk / DB dump has encrypted value
  const candidates = [
    'src/database/persistent_config.json',
    'backend/src/database/persistent_config.json',
    'persistent_config.json',
  ];
  let foundDisk = false;
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      const diskContent = fs.readFileSync(c, 'utf-8');
      const parsed = JSON.parse(diskContent);
      console.log(`Checking ${c}:`, parsed.mapboxAccessToken);
      if (parsed.mapboxAccessToken && parsed.mapboxAccessToken.encrypted) {
        if (!parsed.mapboxAccessToken.encrypted.startsWith('enc:v1:')) {
          throw new Error('Disk file did not prefix with enc:v1:');
        }
        if (diskContent.includes(testToken)) {
          throw new Error('Plaintext token leaked to disk file unencrypted!');
        }
        const decrypted = decryptSecret(parsed.mapboxAccessToken.encrypted);
        if (decrypted !== testToken) {
          throw new Error('Decryption did not match original token!');
        }
        foundDisk = true;
        console.log(`Verified encryption & decryption on ${c}`);
      }
    }
  }

  if (!foundDisk) {
    throw new Error('No persistent disk file was verified!');
  }

  console.log('🎉 ALL TOKEN ENCRYPTION, PERSISTENCE & DECRYPTION CHECKS PASSED CLEANLY!');
}

testTokenEncryption().catch((err) => {
  console.error('❌ TEST FAILED:', err);
  process.exit(1);
});
