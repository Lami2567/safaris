import { localStore } from '../../config/database';

export class AppConfigService {
  public static getConfig() {
    const master = localStore.app_config.get('master_config') || {};
    const configList = Array.from(localStore.app_config.values());
    const configMap: Record<string, any> = {};
    for (const item of configList) {
      if (item.key !== 'master_config') {
        configMap[item.key] = item.value;
      }
    }

    const defaultServices = [
      { type: 'rides', id: 'rides', title: 'Ride Hailing', subtitle: 'Boda, Cars & Comfort in Kampala', isEnabled: true, displayOrder: 1 },
      { type: 'airportPickup', id: 'airport_pickup', title: 'Airport Shuttle', subtitle: 'Entebbe International transfers', isEnabled: true, displayOrder: 2 },
      { type: 'tourism', id: 'tourism', title: 'Uganda Safaris', subtitle: 'Gorillas, Murchison, Jinja & Parks', isEnabled: true, displayOrder: 3 },
      { type: 'tourGuides', id: 'tour_guides', title: 'Tour Guides', subtitle: 'Certified Ugandan guides on demand', isEnabled: true, displayOrder: 4 },
      { type: 'delivery', id: 'delivery', title: 'Express Delivery', subtitle: 'Packages, parcels & documents', isEnabled: true, displayOrder: 5 },
      { type: 'hotelBooking', id: 'hotel_booking', title: 'Safari Lodges', subtitle: 'Eco-lodges & hotels booking', isEnabled: false, isNew: true, displayOrder: 6 },
      { type: 'carRental', id: 'car_rental', title: '4x4 Self-Drive', subtitle: 'Land Cruisers with rooftop tents', isEnabled: false, isNew: true, displayOrder: 7 },
    ];

    const defaultBanners = [
      { id: 'bwindi_promo', headline: 'Bwindi Gorilla Trekking', tag: 'SPECIAL SAFARI', discountText: 'Save 15% on Permits & Guides', destinationId: 'dest_bwindi', imagePlaceholder: '16:9 - Bwindi Mist' },
      { id: 'entebbe_express', headline: 'Entebbe Airport Express', tag: 'AIRPORT RIDE', discountText: 'Flat UGX 110,000 from Kampala', destinationId: 'dest_entebbe', imagePlaceholder: '16:9 - Airport Shuttle' },
      { id: 'murchison_safari', headline: 'Murchison Falls 3-Day Safari', tag: 'POPULAR TOUR', discountText: 'Exclusive 4x4 Prado with Ranger', destinationId: 'dest_murchison', imagePlaceholder: '16:9 - Murchison Falls' },
    ];

    const defaultFeatures = {
      instant_mobile_money_pay: true,
      boda_rides_enabled: true,
      night_rides_surcharge: false,
      custom_guide_selection: true,
      split_fare: false,
      ride_hailing: true,
      airport_pickup: true,
      tourism_expeditions: true,
      tour_guides: true,
      package_delivery: true,
      instant_driver_cashout: true,
      mtn_momo: true,
      airtel_money: true,
      in_app_chat: true,
    };

    const defaultVersion = {
      minimumVersion: '1.0.0',
      latestVersion: '1.0.1',
      forceUpdate: false,
      recommendedUpdate: false,
      maintenanceMode: false,
      updateMessage: 'A new version of SAFARIS Uganda is ready on Play Store.',
      maintenanceMessage: 'SAFARIS is undergoing scheduled system upgrades. We will be back online shortly.',
    };

    return {
      appName: 'SAFARIS',
      country: 'Uganda',
      currency: 'UGX',
      currencySymbol: 'USh',
      supportPhone: '+256 800 123 456',
      supportEmail: 'support@safaris.ug',
      emergencyNumber: '999 / 112',
      minDriverRatingThreshold: 4.5,
      services: master.services || configMap.services || defaultServices,
      banners: master.banners || configMap.banners || defaultBanners,
      features: { ...defaultFeatures, ...(master.featureFlags || {}), ...(configMap.features || {}) },
      featureFlags: { ...defaultFeatures, ...(master.featureFlags || {}), ...(configMap.featureFlags || {}) },
      versionConfig: master.versionConfig || configMap.versionConfig || defaultVersion,
      supportedCities: master.supportedCities || ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Fort Portal', 'Gulu'],
      ...configMap,
    };
  }

  public static updateConfig(key: string, value: any) {
    localStore.app_config.set(key, {
      key,
      value,
      updated_at: new Date().toISOString(),
    });

    // Also update master_config if key matches
    const master = localStore.app_config.get('master_config') || {};
    master[key] = value;
    localStore.app_config.set('master_config', master);

    return { key, value };
  }

  public static updateServices(services: any[]) {
    return this.updateConfig('services', services);
  }

  public static updateBanners(banners: any[]) {
    return this.updateConfig('banners', banners);
  }

  public static updateFeatures(features: Record<string, boolean>) {
    return this.updateConfig('featureFlags', features);
  }

  public static updateVersionConfig(versionConfig: any) {
    return this.updateConfig('versionConfig', versionConfig);
  }
}
