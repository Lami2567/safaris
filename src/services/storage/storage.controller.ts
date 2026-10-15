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

      const result = StorageService.generatePresignedUploadUrl({
        fileName,
        fileType,
        folder,
        expiresIn: expiresIn ? Number(expiresIn) : undefined,
      });

      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err: any) {
      const statusCode = err.message?.includes('not fully configured') ? 503 : 400;
      res.status(statusCode).json({
        success: false,
        error: err.message || 'Failed to generate presigned upload URL.',
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
}
