/**
 * Cloudflare R2 Direct-to-Storage Client
 *
 * Uploads images and PDF documents to Cloudflare R2 via AWS SigV4 presigned URLs,
 * with automatic fallback to server-relayed Cloudflare R2 PUT if browser CORS blocks direct PUT.
 */

export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    return '/api/v1';
  }
  return process.env.INTERNAL_API_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';
};

export interface PresignedUploadTicket {
  uploadUrl: string;
  publicUrl: string;
  key: string;
  expiresIn: number;
  fileType: string;
  mediaCategory?: 'IMAGE' | 'VIDEO' | 'AUDIO' | 'DOCUMENT';
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
  supportedMediaCategories?: string[];
}

export type StorageFolder = 'banners' | 'tourism' | 'places' | 'fleet' | 'careers' | 'documents' | 'general';

/**
 * Validate an external or Cloudflare R2 media URL via the backend validator.
 */
export async function validateExternalMediaUrl(
  url: string,
  expectedCategory?: 'IMAGE' | 'VIDEO' | 'AUDIO'
): Promise<MediaUrlValidationResult> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/storage/validate-media-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url, expectedCategory }),
  });
  const json = await res.json();
  if (!res.ok || !json.success) {
    throw new Error(json.error || 'Invalid media URL');
  }
  return json.data;
}

/**
 * Upload any supported media file (Image, Video, Audio/Voice Recording, or PDF Document)
 * directly to Cloudflare R2 via presigned PUT URL (with server relay fallback).
 */
export async function uploadMediaToR2(
  file: File,
  folder: StorageFolder = 'tourism',
  onProgress?: (percent: number) => void
): Promise<string> {
  return uploadImageToR2(file, folder, onProgress);
}

/**
 * Check if Cloudflare R2 storage is configured on the backend.
 */
export async function getStorageStatus(): Promise<StorageStatus> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/storage/status`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) {
    throw new Error('Failed to retrieve storage status from backend');
  }
  const json = await res.json();
  return json.data;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(new Error('Failed to read file for upload'));
    reader.readAsDataURL(file);
  });
}

/**
 * Upload an image or document file to Cloudflare R2.
 * Attempts direct browser PUT via presigned URL first; if browser CORS blocks direct PUT,
 * automatically relays through POST /api/v1/storage/upload straight into Cloudflare R2.
 */
export async function uploadImageToR2(
  file: File,
  folder: StorageFolder = 'general',
  onProgress?: (percent: number) => void
): Promise<string> {
  const apiBase = getApiBase();
  const contentType = file.type || (file.name.toLowerCase().endsWith('.pdf') ? 'application/pdf' : 'image/jpeg');

  if (file.size > 20 * 1024 * 1024) throw new Error('Upload exceeds 20 MiB limit.');
  const token = localStorage.getItem('safaris_admin_token');
  if (!token) throw new Error('Please sign in before uploading.');
  onProgress?.(10);
  const base64Data = await fileToBase64(file);
  const response = await fetch(`${apiBase}/storage/upload`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ fileName: file.name, fileType: contentType, folder, base64Data }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'Upload failed.');
  onProgress?.(100);
  return result.data.publicUrl || result.data.key;
}
