import { localStore } from '../../config/database';

export class AppConfigService {
  public static getConfig() {
    const configList = Array.from(localStore.app_config.values());
    const configMap: Record<string, any> = {};
    for (const item of configList) {
      configMap[item.key] = item.value;
    }

    return {
      appName: 'SAFARIS',
      country: 'Uganda',
      currency: 'UGX',
      currencySymbol: 'USh',
      supportPhone: '+256 800 123 456',
      supportEmail: 'support@safaris.ug',
      emergencyNumber: '999 / 112',
      minDriverRatingThreshold: 4.5,
      features: {
        ride_hailing: true,
        airport_pickup: true,
        tourism_expeditions: true,
        tour_guides: true,
        package_delivery: true,
        instant_driver_cashout: true,
        mtn_momo: true,
        airtel_money: true,
        in_app_chat: true,
      },
      ...configMap,
    };
  }

  public static updateConfig(key: string, value: any) {
    localStore.app_config.set(key, {
      key,
      value,
      updated_at: new Date().toISOString(),
    });
    return { key, value };
  }
}
