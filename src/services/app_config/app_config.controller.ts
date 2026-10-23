import { Request, Response } from 'express';
import { AppConfigService } from './app_config.service';
import { sendSuccess, sendError } from '../../shared/response';

export class AppConfigController {
  public static async getConfig(req: Request, res: Response) {
    try {
      const config = await AppConfigService.getConfig();
      return sendSuccess(res, config);
    } catch (err: any) {
      return sendError(res, 'FETCH_CONFIG_FAILED', err.message, 500);
    }
  }

  public static async updateConfig(req: Request, res: Response) {
    try {
      const { key, value } = req.body;
      if (!key) {
        // If whole object passed, iterate keys
        for (const [k, v] of Object.entries(req.body)) {
          await AppConfigService.updateConfig(k, v);
        }
        return sendSuccess(res, await AppConfigService.getConfig());
      }
      const updated = await AppConfigService.updateConfig(key, value);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_CONFIG_FAILED', err.message, 400);
    }
  }

  public static async updateServices(req: Request, res: Response) {
    try {
      const services = Array.isArray(req.body) ? req.body : req.body.services;
      const updated = await AppConfigService.updateServices(services);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_SERVICES_FAILED', err.message, 400);
    }
  }

  public static async updateBanners(req: Request, res: Response) {
    try {
      const banners = Array.isArray(req.body) ? req.body : req.body.banners;
      const updated = await AppConfigService.updateBanners(banners);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_BANNERS_FAILED', err.message, 400);
    }
  }

  public static async updateFeatures(req: Request, res: Response) {
    try {
      const features = req.body.features || req.body.featureFlags || req.body;
      const updated = await AppConfigService.updateFeatures(features);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_FEATURES_FAILED', err.message, 400);
    }
  }

  public static async updateVersionConfig(req: Request, res: Response) {
    try {
      const versionConfig = req.body.versionConfig || req.body;
      const updated = await AppConfigService.updateVersionConfig(versionConfig);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_VERSION_CONFIG_FAILED', err.message, 400);
    }
  }

  public static async updatePaymentMethods(req: Request, res: Response) {
    try {
      const paymentMethods = Array.isArray(req.body) ? req.body : req.body.paymentMethods;
      if (!paymentMethods) {
        return sendError(res, 'INVALID_PAYMENT_METHODS', 'Array of payment methods is required', 400);
      }
      const updated = await AppConfigService.updatePaymentMethods(paymentMethods);
      return sendSuccess(res, updated);
    } catch (err: any) {
      return sendError(res, 'UPDATE_PAYMENT_METHODS_FAILED', err.message, 400);
    }
  }
}
