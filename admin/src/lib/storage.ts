/**
 * Cloudflare R2 Direct-to-Storage Client
 * 
 * Bypasses the Node.js API server completely for binary transfers.
 * The browser uploads directly to Cloudflare R2 using AWS SigV4 presigned URLs.
 */

export const getApiBase = () => {
  if (typeof window !== 'undefined') {
    // In browser, always use relative path '/api/v1' to match current protocol and origin
    // This completely prevents HTTPS/HTTP Mixed Content errors.
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

/**
 * Upload an image file directly to Cloudflare R2 via presigned PUT URL.
 * 
 * @param file The browser File object (PNG, JPEG, WEBP, etc.)
 * @param folder Destination category folder ('banners', 'tourism', 'places', 'fleet', etc.)
 * @param onProgress Optional callback receiving 0-100 upload progress percentage
 * @returns The public URL of the uploaded image
 */
export async function uploadImageToR2(
  file: File,
  folder: 'banners' | 'tourism' | 'places' | 'fleet' | 'general' = 'general',
  onProgress?: (percent: number) => void
): Promise<string> {
  const apiBase = getApiBase();
  // 1. Request presigned upload ticket from backend
  const ticketRes = await fetch(`${apiBase}/storage/upload-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      fileType: file.type || 'image/jpeg',
      folder,
    }),
  });

  if (!ticketRes.ok) {
    const errorJson = await ticketRes.json().catch(() => ({}));
    throw new Error(errorJson.error || 'Failed to obtain upload authorization ticket from server');
  }

  const { data }: { data: PresignedUploadTicket } = await ticketRes.json();
  const { uploadUrl, publicUrl } = data;

  // 2. Direct browser upload to Cloudflare R2 using XMLHttpRequest for accurate progress tracking
  return new Promise<string>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'image/jpeg');

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
        reject(
          new Error(
            `Cloudflare R2 direct upload failed with status ${xhr.status}. Please check bucket CORS configuration.`
          )
        );
      }
    };

    xhr.onerror = () => {
      reject(
        new Error(
          'Network error during direct upload to Cloudflare R2. Ensure CORS is enabled on your Cloudflare R2 bucket.'
        )
      );
    };

    xhr.send(file);
  });
}
