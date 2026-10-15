import crypto from 'crypto';
import { ENV } from '../../config/env';
import { v4 as uuidv4 } from 'uuid';

export interface PresignedUploadRequest {
  fileName: string;
  fileType: string;
  folder?: string;
  expiresIn?: number; // In seconds (default: 3600 = 1 hour)
}

export interface PresignedUploadResponse {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  fileType: string;
}

export interface StorageStatus {
  configured: boolean;
  bucketName: string;
  accountIdSet: boolean;
  accessKeySet: boolean;
  publicUrlConfigured: boolean;
  publicBaseUrl: string;
}

export class StorageService {
  private static readonly ALLOWED_IMAGE_TYPES = new Set([
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'image/avif',
    'application/pdf',
  ]);

  /**
   * Check if Cloudflare R2 credentials are fully configured.
   */
  public static isConfigured(): boolean {
    const { CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, CLOUDFLARE_R2_BUCKET_NAME } = ENV;
    return !!(CLOUDFLARE_R2_ACCOUNT_ID && CLOUDFLARE_R2_ACCESS_KEY_ID && CLOUDFLARE_R2_SECRET_ACCESS_KEY && CLOUDFLARE_R2_BUCKET_NAME);
  }

  /**
   * Get current storage configuration status (safely obfuscated).
   */
  public static getStatus(): StorageStatus {
    const configured = this.isConfigured();
    return {
      configured,
      bucketName: ENV.CLOUDFLARE_R2_BUCKET_NAME || 'Not configured',
      accountIdSet: !!ENV.CLOUDFLARE_R2_ACCOUNT_ID,
      accessKeySet: !!(ENV.CLOUDFLARE_R2_ACCESS_KEY_ID && ENV.CLOUDFLARE_R2_SECRET_ACCESS_KEY),
      publicUrlConfigured: !!ENV.CLOUDFLARE_R2_PUBLIC_URL,
      publicBaseUrl: ENV.CLOUDFLARE_R2_PUBLIC_URL ? ENV.CLOUDFLARE_R2_PUBLIC_URL.replace(/\/$/, '') : '',
    };
  }

  /**
   * Generates a direct-to-Cloudflare-R2 presigned PUT URL using AWS SigV4.
   * Browser uploads directly to Cloudflare without routing bytes through the server.
   */
  public static generatePresignedUploadUrl(request: PresignedUploadRequest): PresignedUploadResponse {
    if (!this.isConfigured()) {
      throw new Error(
        'Cloudflare R2 is not fully configured. Please provide CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, and CLOUDFLARE_R2_BUCKET_NAME in environment.'
      );
    }

    const { fileName, fileType, folder = 'general', expiresIn = 3600 } = request;

    // Validate MIME type to ensure only valid images are uploaded
    if (!this.ALLOWED_IMAGE_TYPES.has(fileType.toLowerCase())) {
      throw new Error(`Unsupported image type '${fileType}'. Allowed types: JPEG, PNG, WEBP, GIF, SVG, AVIF.`);
    }

    // Sanitize folder and filename
    const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'general';
    const extension = (fileName.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    const cleanBaseName = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);
    
    // Unique key: images/{folder}/{timestamp}-{short-uuid}-{name}.{ext}
    const key = `images/${cleanFolder}/${Date.now()}-${uuidv4().slice(0, 8)}-${cleanBaseName}.${extension}`;

    const accountId = ENV.CLOUDFLARE_R2_ACCOUNT_ID.trim();
    const accessKeyId = ENV.CLOUDFLARE_R2_ACCESS_KEY_ID.trim();
    const secretAccessKey = ENV.CLOUDFLARE_R2_SECRET_ACCESS_KEY.trim();
    const bucketName = ENV.CLOUDFLARE_R2_BUCKET_NAME.trim();
    const region = (ENV.CLOUDFLARE_R2_REGION || 'auto').trim();

    // R2 S3-compatible host
    const host = `${accountId}.r2.cloudflarestorage.com`;
    const canonicalUri = `/${encodeURIComponent(bucketName)}/${key.split('/').map(encodeURIComponent).join('/')}`;

    // Timestamps for AWS SigV4
    const date = new Date();
    const amzDate = date.toISOString().replace(/[:-]|\.\d{3}/g, ''); // YYYYMMDDTHHMMSSZ
    const dateStamp = amzDate.slice(0, 8); // YYYYMMDD
    const credentialScope = `${dateStamp}/${region}/s3/aws4_request`;

    // Query parameters must be alphabetical for SigV4
    const queryParams: Record<string, string> = {
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Credential': `${accessKeyId}/${credentialScope}`,
      'X-Amz-Date': amzDate,
      'X-Amz-Expires': expiresIn.toString(),
      'X-Amz-SignedHeaders': 'host',
    };

    const canonicalQueryString = Object.keys(queryParams)
      .sort()
      .map(k => `${encodeURIComponent(k)}=${encodeURIComponent(queryParams[k])}`)
      .join('&');

    // Canonical request: HTTP Method, Canonical URI, Query string, Headers, Signed headers, Payload hash
    const canonicalHeaders = `host:${host}\n`;
    const signedHeaders = 'host';
    const payloadHash = 'UNSIGNED-PAYLOAD';

    const canonicalRequest = [
      'PUT',
      canonicalUri,
      canonicalQueryString,
      canonicalHeaders,
      signedHeaders,
      payloadHash,
    ].join('\n');

    // String to Sign
    const canonicalRequestHash = crypto.createHash('sha256').update(canonicalRequest, 'utf8').digest('hex');
    const stringToSign = [
      'AWS4-HMAC-SHA256',
      amzDate,
      credentialScope,
      canonicalRequestHash,
    ].join('\n');

    // SigV4 Signing Key
    const kDate = crypto.createHmac('sha256', 'AWS4' + secretAccessKey).update(dateStamp, 'utf8').digest();
    const kRegion = crypto.createHmac('sha256', kDate).update(region, 'utf8').digest();
    const kService = crypto.createHmac('sha256', kRegion).update('s3', 'utf8').digest();
    const kSigning = crypto.createHmac('sha256', kService).update('aws4_request', 'utf8').digest();

    const signature = crypto.createHmac('sha256', kSigning).update(stringToSign, 'utf8').digest('hex');

    // Construct full presigned upload URL
    const uploadUrl = `https://${host}${canonicalUri}?${canonicalQueryString}&X-Amz-Signature=${signature}`;

    // Construct public view URL (using public CDN domain or r2.dev URL)
    let publicUrl: string;
    if (ENV.CLOUDFLARE_R2_PUBLIC_URL && ENV.CLOUDFLARE_R2_PUBLIC_URL.trim()) {
      const publicBase = ENV.CLOUDFLARE_R2_PUBLIC_URL.trim().replace(/\/$/, '');
      publicUrl = `${publicBase}/${key}`;
    } else {
      // Fallback if public domain isn't set yet
      publicUrl = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;
    }

    return {
      uploadUrl,
      publicUrl,
      key,
      expiresIn,
      fileType,
    };
  }

  /**
   * Given an object key, returns the public CDN URL.
   */
  public static getPublicUrl(key: string): string {
    if (ENV.CLOUDFLARE_R2_PUBLIC_URL && ENV.CLOUDFLARE_R2_PUBLIC_URL.trim()) {
      const publicBase = ENV.CLOUDFLARE_R2_PUBLIC_URL.trim().replace(/\/$/, '');
      return `${publicBase}/${key.replace(/^\//, '')}`;
    }
    const bucket = ENV.CLOUDFLARE_R2_BUCKET_NAME || 'bucket';
    const account = ENV.CLOUDFLARE_R2_ACCOUNT_ID || 'account';
    return `https://${bucket}.${account}.r2.cloudflarestorage.com/${key.replace(/^\//, '')}`;
  }
}
