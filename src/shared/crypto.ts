import crypto from 'crypto';
import { ENV } from '../config/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const PREFIX = 'enc:v1:';

function getDerivedKey(): Buffer {
  const secret = ENV.CONFIG_ENCRYPTION_SECRET || ENV.JWT_SECRET || 'safaris_config_encryption_key_2026_uganda_32b';
  return crypto.createHash('sha256').update(String(secret)).digest();
}

/**
 * Encrypts a plaintext secret (such as Mapbox access token or API keys)
 * using authenticated AES-256-GCM encryption for permanent database storage.
 */
export function encryptSecret(plainText: string): string {
  if (!plainText || typeof plainText !== 'string') return '';
  const trimmed = plainText.trim();
  if (!trimmed) return '';
  // Avoid double encryption
  if (trimmed.startsWith(PREFIX)) return trimmed;

  try {
    const key = getDerivedKey();
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    let encrypted = cipher.update(trimmed, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');

    return `${PREFIX}${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('[Crypto] Encryption error:', err);
    throw new Error('Failed to encrypt secret');
  }
}

/**
 * Decrypts an encrypted payload produced by `encryptSecret`.
 * If the payload is not encrypted (e.g. legacy plain token), returns it safely.
 */
export function decryptSecret(payload: any): string {
  if (!payload) return '';

  let strPayload = '';
  if (typeof payload === 'object' && payload !== null) {
    strPayload = String(payload.encrypted || payload.value || payload.token || '');
  } else {
    strPayload = String(payload);
  }

  strPayload = strPayload.trim();
  if (!strPayload) return '';

  // If not encrypted, return as is (for backwards compatibility)
  if (!strPayload.startsWith(PREFIX)) {
    return strPayload;
  }

  try {
    const parts = strPayload.slice(PREFIX.length).split(':');
    if (parts.length !== 3) {
      console.warn('[Crypto] Invalid encrypted payload format');
      return '';
    }

    const [ivHex, authTagHex, encryptedHex] = parts;
    const key = getDerivedKey();
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    console.error('[Crypto] Decryption error:', err);
    return '';
  }
}

/**
 * Checks whether a given string or object is encrypted.
 */
export function isEncrypted(payload: any): boolean {
  if (!payload) return false;
  if (typeof payload === 'object') {
    return payload.is_encrypted === true || (typeof payload.encrypted === 'string' && payload.encrypted.startsWith(PREFIX));
  }
  return typeof payload === 'string' && payload.trim().startsWith(PREFIX);
}
