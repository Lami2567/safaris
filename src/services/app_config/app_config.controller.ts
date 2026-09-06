import { Request, Response } from 'express';
import { AppConfigService } from './app_config.service';
import { sendSuccess, sendError } from '../../shared/response';

export class AppConfigController {
  public static getConfig(req: Request, res: Response) {
    try {
      const config = AppConfigService.getConfig();
      return sendSuccess(res, config);
    } catch (err: any) {
      return sendError(res, 'CONFIG_FETCH_FAILED', err.message, 500);
    }
  }

  public static updateConfig(req: Request, res: Response) {
    try {
      const { key, value } = req.body;
      const updated = AppConfigService.updateConfig(key, value);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'CONFIG_UPDATE_FAILED', err.message, 400);
    }
  }
}
