import { db, localStore } from '../../config/database';
import { Request, Response } from 'express';
import { StorageService } from './storage.service';

export class StorageController {
  /**
   * POST /api/v1/storage/upload-url
   * Request body: { fileName: string, fileType: string, folder?: string, expiresIn?: number }
   * Returns: { uploadUrl: string, publicUrl: string, key: string, expiresIn: number }
   */
  public static async getPresignedUploadUrl(req: Request, res: Response): Promise<void> {
    try {
      const { fileName, fileType, folder, expiresIn } = req.body;

      if (!fileName || typeof fileName !== 'string') {
        res.status(400).json({
          success: false,
          error: 'fileName is required and must be a string.',
        });
        return;
      }

      if (!fileType || typeof fileType !== 'string') {
        res.status(400).json({
          success: false,
          error: 'fileType (MIME type, e.g. image/jpeg, image/png) is required.',
        });
        return;
      }

      // Public PUT tickets bypass file validation. Clients must use the bounded relay endpoint.
      res.status(410).json({ success: false, error: 'Use /storage/upload for validated uploads.' });

    } catch (err: any) {
      const statusCode = err.message?.includes('not fully configured') ? 503 : 400;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to generate presigned upload URL.',
      });
    }
  }

  /**
   * POST /api/v1/storage/upload
   * Request body: { fileName: string, fileType: string, folder?: string, base64Data: string }
   * Uploads directly to Cloudflare R2 from the server (bypassing any browser CORS limitations) and returns the public R2 URL.
   */
  public static async uploadDirect(req: Request, res: Response): Promise<void> {
    try {
      const { fileName, fileType, folder, base64Data } = req.body;
      const user = (req as any).user;
      if (user?.role !== 'admin') { res.status(403).json({ success: false, error: 'Public media upload requires admin permission. Recruitment attachments are submitted through careers/apply.' }); return; }

      if (!fileName || typeof fileName !== 'string') {
        res.status(400).json({ success: false, error: 'fileName is required.' });
        return;
      }
      if (!base64Data || typeof base64Data !== 'string') {
        res.status(400).json({ success: false, error: 'base64Data is required.' });
        return;
      }

      const result = await StorageService.uploadDirectToR2({
        fileName,
        fileType: fileType || 'application/octet-stream',
        folder: folder || 'careers',
        base64Data,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('not fully configured') ? 503 : 400;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to upload document to Cloudflare R2.',
      });
    }
  }

  /**
   * GET /api/v1/storage/status
   * Returns storage setup status for Admin Dashboard.
   */
  public static async getStatus(req: Request, res: Response): Promise<void> {
    try {
      const status = StorageService.getStatus();
      res.status(200).json({
        success: true,
        data: status,
      });
    } catch (err: any) {
      res.status(500).json({
        success: false,
        error: err.message || 'Failed to check storage status.',
      });
    }
  }

  /**
   * POST /api/v1/storage/validate-media-url
   * Request body: { url: string, expectedCategory?: 'IMAGE' | 'VIDEO' | 'AUDIO' }
   * Validates external or Cloudflare R2 media URLs for Rich-Text & Inline Multimedia Content blocks.
   */
  public static async validateMediaUrl(req: Request, res: Response): Promise<void> {
    try {
      const { url, expectedCategory } = req.body;
      const validation = StorageService.validateMediaUrl(url, expectedCategory);
      if (!validation.valid) {
        res.status(400).json({
          success: false,
          error: validation.reason || 'Invalid media URL.',
          data: validation,
        });
        return;
      }
      res.status(200).json({
        success: true,
        data: validation,
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to validate media URL.',
      });
    }
  }
  /**
   * GET /api/v1/storage/private-url
   * Query params: { key: string, expiresIn?: number }
   * Returns: { downloadUrl: string, key: string, expiresIn: number }
   */
  public static async getPresignedDownloadUrl(req: Request, res: Response): Promise<void> {
    try {
      const key = typeof req.query.key === 'string' ? req.query.key : undefined;
      const expiresIn = req.query.expiresIn ? Number(req.query.expiresIn) : 900;

      if (!key) {
        res.status(400).json({
          success: false,
          error: 'key query parameter is required.',
        });
        return;
      }

      const user = (req as any).user;
      if (!user?.userId || !/^private\/recruitment\/[A-Za-z0-9_./-]+$/.test(key) || key.split('/').includes('..')) {
        res.status(403).json({ success: false, error: 'Document access denied.' }); return;
      }
      if (user.role !== 'admin') {
        const applications = db.isPostgresConnected
          ? (await db.query('SELECT documents FROM career_applications WHERE user_id = $1', [user.userId])).rows
          : (process.env.NODE_ENV === 'test' ? Array.from(localStore.career_applications.values()).filter(a => a.user_id === user.userId) : []);
        if (!applications.some((a: any) => Object.values(a.documents || {}).some(value => value === key))) {
          res.status(403).json({ success: false, error: 'Document access denied.' }); return;
        }
      }
      const downloadUrl = StorageService.generatePresignedDownloadUrl(key, expiresIn);
      res.status(200).json({
        success: true,
        data: {
          downloadUrl,
          key,
          expiresIn,
        },
      });
    } catch (err: any) {
      res.status(400).json({
        success: false,
        error: err.message || 'Failed to generate presigned download URL.',
      });
    }
  }
}
