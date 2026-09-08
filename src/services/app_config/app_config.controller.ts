import { Request, Response } from 'express';
import { AppConfigService } from './app_config.service';
import { sendSuccess, sendError } from '../../shared/response';

export class AppConfigController {
  public static getConfig(req: Request, res: Response) {
    try {
      const config = AppConfigService.getConfig();
      return sendSuccess(res, config);
    } catch (err: any) {
      return sendError(res, 'FETCH_CONFIG_FAILED', err.message, 500);
    }
  }

  public static updateConfig(req: Request, res: Response) {
    try {
      const { key, value } = req.body;
      if (!key) {
        // If whole object passed, iterate keys
        for (const [k, v] of Object.entries(req.body)) {
          AppConfigService.updateConfig(k, v);
        }
        return sendSuccess(res, AppConfigService.getConfig());
      }
      const updated = AppConfigService.updateConfig(key, value);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_CONFIG_FAILED', err.message, 400);
    }
  }

  public static updateServices(req: Request, res: Response) {
    try {
      const services = Array.isArray(req.body) ? req.body : req.body.services;
      const updated = AppConfigService.updateServices(services);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_SERVICES_FAILED', err.message, 400);
    }
  }

  public static updateBanners(req: Request, res: Response) {
    try {
      const banners = Array.isArray(req.body) ? req.body : req.body.banners;
      const updated = AppConfigService.updateBanners(banners);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_BANNERS_FAILED', err.message, 400);
    }
  }

  public static updateFeatures(req: Request, res: Response) {
    try {
      const features = req.body.features || req.body.featureFlags || req.body;
      const updated = AppConfigService.updateFeatures(features);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_FEATURES_FAILED', err.message, 400);
    }
  }

  public static updateVersionConfig(req: Request, res: Response) {
    try {
      const versionConfig = req.body.versionConfig || req.body;
      const updated = AppConfigService.updateVersionConfig(versionConfig);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_VERSION_CONFIG_FAILED', err.message, 400);
    }
  }
}
