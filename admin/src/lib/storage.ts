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
}

export interface StorageStatus {
  configured: boolean;
  bucketName: string;
  accountIdSet: boolean;
  accessKeySet: boolean;
  publicUrlConfigured: boolean;
  publicBaseUrl: string;
}

export type StorageFolder = 'banners' | 'tourism' | 'places' | 'fleet' | 'careers' | 'documents' | 'general';

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

  // 1. Request presigned upload ticket from backend
  const ticketRes = await fetch(`${apiBase}/storage/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileType: contentType,
      folder,
    }),
  });

  if (!ticketRes.ok) {
    const errorJson = await ticketRes.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to obtain upload authorization ticket from server');
  }

  const { data }: { data: PresignedUploadTicket } = await ticketRes.json();
  const { uploadUrl, publicUrl } = data;

  // 2. Try direct browser upload to Cloudflare R2 first
  try {
    const directUrl = await new Promise<string>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', uploadUrl, true);
      xhr.setRequestHeader('Content-Type', contentType);

      if (xhr.upload && onProgress) {
        xhr.upload.onprogress = (event) => {
          if (event.lengthComputable) {
            const percent = Math.round((event.loaded / event.total) * 100);
            onProgress(percent);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          if (onProgress) onProgress(100);
          resolve(publicUrl);
        } else {
          reject(new Error(`R2 direct status ${xhr.status}`));
        }
      };

      xhr.onerror = () => {
        reject(new Error('CORS or network block on direct R2 PUT'));
      };

      xhr.send(file);
    });
    return directUrl;
  } catch (_) {
    // 3. Fallback: Relay through backend POST /api/v1/storage/upload -> Cloudflare R2
    if (onProgress) onProgress(40);
    const base64Data = await fileToBase64(file);
    if (onProgress) onProgress(75);

    const relayRes = await fetch(`${apiBase}/storage/upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fileName: file.name,
        fileType: contentType,
        folder,
        base64Data,
      }),
    });

    if (!relayRes.ok) {
      const errJson = await relayRes.json().catch(() => ({}));
      throw new Error(errJson.error || 'Cloudflare R2 upload failed');
    }

    const relayData = await relayRes.json();
    if (onProgress) onProgress(100);
    return relayData.data.publicUrl;
  }
}
