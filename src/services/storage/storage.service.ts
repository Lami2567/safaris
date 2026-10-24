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
  mediaCategory: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
}

export interface MediaUrlValidationResult {
  valid: boolean;
  url: string;
  mediaCategory: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'EXTERNAL_STREAM';
  provider: 'CLOUDFLARE_R2' | 'YOUTUBE' | 'VIMEO' | 'DIRECT_CDN';
  mimeType: string;
  reason?: string;
}

export interface StorageStatus {
  configured: boolean;
  bucketName: string;
  accountIdSet: boolean;
  accessKeySet: boolean;
  publicUrlConfigured: boolean;
  publicBaseUrl: string;
  supportedMediaCategories: string[];
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
    'image/heic',
    'image/heif',
  ]);

  private static readonly ALLOWED_VIDEO_TYPES = new Set([
    'video/mp4',
    'video/webm',
    'video/quicktime',
    'video/x-m4v',
    'video/ogg',
  ]);

  private static readonly ALLOWED_AUDIO_TYPES = new Set([
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/x-wav',
    'audio/wave',
    'audio/ogg',
    'audio/aac',
    'audio/mp4',
    'audio/x-m4a',
    'audio/m4a',
    'audio/webm',
  ]);

  private static readonly ALLOWED_DOCUMENT_TYPES = new Set([
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ]);

  public static classifyMimeType(mimeType: string, fileName = ''): 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT' | null {
    const norm = (mimeType || '').toLowerCase().trim();
    const ext = (fileName.split('.').pop() || '').toLowerCase().trim();

    if (this.ALLOWED_IMAGE_TYPES.has(norm) || norm.startsWith('image/') || ['jpg', 'jpeg', 'png', 'webp', 'gif', 'svg', 'avif'].includes(ext)) {
      return 'IMAGE';
    }
    if (this.ALLOWED_VIDEO_TYPES.has(norm) || norm.startsWith('video/') || ['mp4', 'webm', 'mov', 'm4v'].includes(ext)) {
      return 'VIDEO';
    }
    if (this.ALLOWED_AUDIO_TYPES.has(norm) || norm.startsWith('audio/') || ['mp3', 'wav', 'ogg', 'aac', 'm4a'].includes(ext)) {
      return 'AUDIO';
    }
    if (this.ALLOWED_DOCUMENT_TYPES.has(norm) || ['pdf', 'doc', 'docx'].includes(ext)) {
      return 'DOCUMENT';
    }
    return null;
  }

  /**
   * Validates an external or Cloudflare R2 media URL (Method 2 of Phase 3).
   * Prevents XSS/unsafe protocols and classifies media category.
   */
  public static validateMediaUrl(rawUrl: string, expectedCategory?: 'IMAGE' | 'VIDEO' | 'AUDIO'): MediaUrlValidationResult {
    const trimmed = String(rawUrl || '').trim();
    if (!trimmed) {
      return { valid: false, url: '', mediaCategory: 'IMAGE', provider: 'DIRECT_CDN', mimeType: '', reason: 'Media URL cannot be empty.' };
    }

    let parsed: URL;
    try {
      parsed = new URL(trimmed);
    } catch (_) {
      return { valid: false, url: trimmed, mediaCategory: 'IMAGE', provider: 'DIRECT_CDN', mimeType: '', reason: 'Invalid URL format. Must be a valid HTTP/HTTPS URL.' };
    }

    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { valid: false, url: trimmed, mediaCategory: 'IMAGE', provider: 'DIRECT_CDN', mimeType: '', reason: 'Only HTTPS and HTTP protocols are permitted for media URLs.' };
    }

    const host = parsed.hostname.toLowerCase();
    const pathLower = parsed.pathname.toLowerCase();

    const isR2 = host.includes('r2.dev') || host.includes('r2.cloudflarestorage.com') || (ENV.CLOUDFLARE_R2_PUBLIC_URL && trimmed.startsWith(ENV.CLOUDFLARE_R2_PUBLIC_URL));
    const isYouTube = host.includes('youtube.com') || host.includes('youtu.be');
    const isVimeo = host.includes('vimeo.com');

    let category: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'EXTERNAL_STREAM' = expectedCategory || 'IMAGE';
    let mimeType = 'application/octet-stream';

    if (isYouTube || isVimeo) {
      category = 'VIDEO';
      mimeType = 'video/external-stream';
    } else if (/\.(mp4|webm|mov|m4v)$/i.test(pathLower) || pathLower.includes('/videos/')) {
      category = 'VIDEO';
      mimeType = pathLower.endsWith('.webm') ? 'video/webm' : 'video/mp4';
    } else if (/\.(mp3|wav|ogg|aac|m4a)$/i.test(pathLower) || pathLower.includes('/audio/')) {
      category = 'AUDIO';
      mimeType = pathLower.endsWith('.wav') ? 'audio/wav' : pathLower.endsWith('.ogg') ? 'audio/ogg' : 'audio/mpeg';
    } else if (/\.(jpg|jpeg|png|webp|gif|svg|avif)$/i.test(pathLower) || pathLower.includes('/images/')) {
      category = 'IMAGE';
      mimeType = pathLower.endsWith('.png') ? 'image/png' : pathLower.endsWith('.webp') ? 'image/webp' : 'image/jpeg';
    } else if (expectedCategory) {
      category = expectedCategory;
      mimeType = expectedCategory === 'VIDEO' ? 'video/mp4' : expectedCategory === 'AUDIO' ? 'audio/mpeg' : 'image/jpeg';
    }

    if (expectedCategory && category !== expectedCategory && !(expectedCategory === 'VIDEO' && (isYouTube || isVimeo))) {
      return {
        valid: false,
        url: trimmed,
        mediaCategory: category,
        provider: isR2 ? 'CLOUDFLARE_R2' : isYouTube ? 'YOUTUBE' : isVimeo ? 'VIMEO' : 'DIRECT_CDN',
        mimeType,
        reason: `URL appears to be ${category} rather than expected ${expectedCategory}.`,
      };
    }

    return {
      valid: true,
      url: trimmed,
      mediaCategory: category,
      provider: isR2 ? 'CLOUDFLARE_R2' : isYouTube ? 'YOUTUBE' : isVimeo ? 'VIMEO' : 'DIRECT_CDN',
      mimeType,
    };
  }

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
      supportedMediaCategories: ['IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT'],
    };
  }

  /**
   * Generates a direct-to-Cloudflare-R2 presigned PUT URL using AWS SigV4.
   * Browser uploads directly to Cloudflare without routing bytes through the server.
   * Supports images, videos (MP4/WebM/MOV), audio recordings (MP3/WAV/OGG/AAC/M4A), and PDFs.
   */
  public static generatePresignedUploadUrl(request: PresignedUploadRequest): PresignedUploadResponse {
    if (!this.isConfigured()) {
      throw new Error(
        'Cloudflare R2 is not fully configured. Please provide CLOUDFLARE_R2_ACCOUNT_ID, CLOUDFLARE_R2_ACCESS_KEY_ID, CLOUDFLARE_R2_SECRET_ACCESS_KEY, and CLOUDFLARE_R2_BUCKET_NAME in environment.'
      );
    }

    const { fileName, fileType, folder = 'general', expiresIn = 3600 } = request;
    const normalizedType = (fileType || 'application/octet-stream').toLowerCase().trim();
    const mediaCategory = this.classifyMimeType(normalizedType, fileName);

    if (!mediaCategory) {
      throw new Error(
        `Unsupported media file type '${fileType}'. Allowed types: Images (JPEG, PNG, WEBP, GIF, SVG), Videos (MP4, WEBM, MOV), Audio (MP3, WAV, OGG, AAC, M4A), and Documents (PDF).`
      );
    }

    // Sanitize folder and filename
    const cleanFolder = folder.replace(/[^a-zA-Z0-9_-]/g, '').toLowerCase() || 'general';
    const extension = (fileName.split('.').pop() || 'bin').toLowerCase().replace(/[^a-zA-Z0-9]/g, '');
    const cleanBaseName = fileName
      .replace(/\.[^/.]+$/, '')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .slice(0, 40);

    const prefixDir =
      mediaCategory === 'VIDEO'
        ? 'videos'
        : mediaCategory === 'AUDIO'
        ? 'audio'
        : mediaCategory === 'DOCUMENT'
        ? 'documents'
        : 'images';

    // Unique key: {prefixDir}/{folder}/{timestamp}-{short-uuid}-{name}.{ext}
    const key = `${prefixDir}/${cleanFolder}/${Date.now()}-${uuidv4().slice(0, 8)}-${cleanBaseName}.${extension}`;

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
      publicUrl = `https://${bucketName}.${accountId}.r2.cloudflarestorage.com/${key}`;
    }

    return {
      uploadUrl,
      publicUrl,
      key,
      expiresIn,
      fileType: normalizedType,
      mediaCategory,
    };
  }

  /**
   * Server-side upload to Cloudflare R2 (bypasses browser CORS issues while still storing in Cloudflare R2).
   */
  public static async uploadDirectToR2(params: {
    fileName: string;
    fileType: string;
    folder?: string;
    base64Data: string;
  }): Promise<PresignedUploadResponse> {
    const ticket = this.generatePresignedUploadUrl({
      fileName: params.fileName,
      fileType: params.fileType,
      folder: params.folder || 'careers',
    });

    // Strip data URL prefix if present (e.g. "data:application/pdf;base64,...")
    const cleanBase64 = params.base64Data.includes(',')
      ? params.base64Data.split(',')[1]
      : params.base64Data;
    const buffer = Buffer.from(cleanBase64, 'base64');

    const putRes = await fetch(ticket.uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': ticket.fileType,
        'Content-Length': buffer.length.toString(),
      },
      body: buffer,
    });

    if (!putRes.ok) {
      const errText = await putRes.text().catch(() => '');
      throw new Error(`Cloudflare R2 PUT failed with status ${putRes.status}: ${errText.slice(0, 200)}`);
    }

    return ticket;
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
