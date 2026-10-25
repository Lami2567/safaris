import fs from 'fs';
import path from 'path';
import { localStore, db } from '../../config/database';
import { ENV } from '../../config/env';
import { AdminService } from '../admin/admin.service';
import { PricingEngineService } from '../pricing/pricing_engine.service';
import { encryptSecret, decryptSecret } from '../../shared/crypto';
import { resolveDataFilePaths } from '../../config/paths';

// Persistent fallback paths on disk for offline/development resilience
const PERSISTENT_CONFIG_CANDIDATES = resolveDataFilePaths('persistent_config.json');

export class AppConfigService {
  private static isInitialized = false;

  /**
   * Initializes persistent configuration from PostgreSQL (if connected)
   * or from the persistent JSON file on disk. Decrypts sensitive tokens
   * into secure in-memory cache for fast runtime access.
   */
  public static async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Try loading from persistent disk files first
    for (const cfgFile of PERSISTENT_CONFIG_CANDIDATES) {
      try {
        if (fs.existsSync(cfgFile)) {
          const raw = fs.readFileSync(cfgFile, 'utf-8');
          const parsed = JSON.parse(raw);
          if (parsed && typeof parsed === 'object') {
            for (const [k, v] of Object.entries(parsed)) {
              localStore.app_config.set(k, { key: k, value: v, updated_at: new Date().toISOString() });
            }
            if (parsed.master_config) {
              const masterCopy = { ...parsed.master_config };
              if (masterCopy.mapboxAccessToken) {
                masterCopy.mapboxAccessToken = decryptSecret(masterCopy.mapboxAccessToken);
              }
              localStore.app_config.set('master_config', masterCopy);
            }
            if (parsed.mapboxAccessToken) {
              const decrypted = decryptSecret(parsed.mapboxAccessToken);
              if (decrypted) {
                ENV.MAPBOX_ACCESS_TOKEN = decrypted;
                localStore.app_config.set('mapboxAccessToken', {
                  key: 'mapboxAccessToken',
                  value: decrypted,
                  updated_at: new Date().toISOString(),
                });
              }
            }
            break;
          }
        }
      } catch (e) {
        console.warn(`[AppConfigService] Notice: Could not read ${cfgFile}`, e);
      }
    }

    // 2. If PostgreSQL is connected, load latest from app_config table
    if (db.isPostgresConnected) {
      try {
        const res = await db.query('SELECT key, value FROM app_config');
        if (res && res.rows && res.rows.length > 0) {
          for (const row of res.rows) {
            let val = row.value;
            if (typeof val === 'string') {
              try { val = JSON.parse(val); } catch (_) {}
            }

            // If this is the Mapbox token, decrypt it from database storage
            if (row.key === 'mapboxAccessToken') {
              const decrypted = decryptSecret(val);
              if (decrypted) {
                ENV.MAPBOX_ACCESS_TOKEN = decrypted;
                val = decrypted;
              }
            }

            if (row.key === 'master_config' && typeof val === 'object' && val !== null) {
              const masterCopy = { ...val };
              if (masterCopy.mapboxAccessToken) {
                masterCopy.mapboxAccessToken = decryptSecret(masterCopy.mapboxAccessToken);
              }
              val = masterCopy;
              localStore.app_config.set('master_config', masterCopy);
            }

            localStore.app_config.set(row.key, { key: row.key, value: val, updated_at: new Date().toISOString() });
          }
        }
      } catch (err) {
        console.warn('[AppConfigService] Notice: PostgreSQL app_config table query skipped:', err);
      }
    }

    // 3. Fallback to ENV.MAPBOX_ACCESS_TOKEN if not yet in store
    const master = localStore.app_config.get('master_config') || {};
    if (!master.mapboxAccessToken && ENV.MAPBOX_ACCESS_TOKEN) {
      const cleanEnvToken = decryptSecret(ENV.MAPBOX_ACCESS_TOKEN);
      master.mapboxAccessToken = cleanEnvToken;
      localStore.app_config.set('master_config', master);
      localStore.app_config.set('mapboxAccessToken', {
        key: 'mapboxAccessToken',
        value: cleanEnvToken,
        updated_at: new Date().toISOString(),
      });
    }

    this.isInitialized = true;
  }

  public static async getConfig() {
    await this.init();

    const master = localStore.app_config.get('master_config') || {};
    const configList = Array.from(localStore.app_config.values());
    const configMap: Record<string, any> = {};
    const PRIVATE_KEYS = new Set(['admin_auth_config', 'master_config', 'dpo_config', 'auth_secrets', 'credentials']);
    for (const item of configList) {
      if (item && item.key && !PRIVATE_KEYS.has(item.key) && !item.key.includes('secret') && !item.key.includes('password') && !item.key.includes('hash')) {
        configMap[item.key] = item.value;
      }
    }

    const defaultServices = [
      { type: 'rides', id: 'rides', title: 'Ride Hailing', subtitle: 'Boda, Cars & Comfort in Kampala', isEnabled: true, enabled: true, displayOrder: 1 },
      { type: 'airportPickup', id: 'airport_pickup', title: 'Airport Shuttle', subtitle: 'Entebbe International transfers', isEnabled: true, enabled: true, displayOrder: 2 },
      { type: 'tourism', id: 'tourism', title: 'Uganda Safaris', subtitle: 'Gorillas, Murchison, Jinja & Parks', isEnabled: true, enabled: true, displayOrder: 3 },
      { type: 'tourGuides', id: 'tour_guides', title: 'Tour Guides', subtitle: 'Certified Ugandan guides on demand', isEnabled: true, enabled: true, displayOrder: 4 },
      { type: 'delivery', id: 'delivery', title: 'Express Delivery', subtitle: 'Packages, parcels & documents', isEnabled: true, enabled: true, displayOrder: 5 },
      { type: 'hotelBooking', id: 'hotel_booking', title: 'Safari Lodges', subtitle: 'Eco-lodges & hotels booking', isEnabled: false, enabled: false, isNew: true, displayOrder: 6 },
      { type: 'carRental', id: 'car_rental', title: '4x4 Self-Drive', subtitle: 'Land Cruisers with rooftop tents', isEnabled: false, enabled: false, isNew: true, displayOrder: 7 },
    ];

    const defaultBanners = [
      { id: 'bwindi_promo', headline: 'Bwindi Gorilla Trekking', tag: 'SPECIAL SAFARI', discountText: 'Save 15% on Permits & Guides', destinationId: 'dest_bwindi', imagePlaceholder: '16:9 - Bwindi Mist' },
      { id: 'entebbe_express', headline: 'Entebbe Airport Express', tag: 'AIRPORT RIDE', discountText: 'Flat UGX 110,000 from Kampala', destinationId: 'dest_entebbe', imagePlaceholder: '16:9 - Airport Shuttle' },
      { id: 'murchison_safari', headline: 'Murchison Falls 3-Day Safari', tag: 'POPULAR TOUR', discountText: 'Exclusive 4x4 Prado with Ranger', destinationId: 'dest_murchison', imagePlaceholder: '16:9 - Murchison Falls' },
    ];

    const defaultQuickPlaces = [
      { id: 'dest_entebbe', title: 'Entebbe Airport', subtitle: 'Airport Corridor', latitude: 0.0444, longitude: 32.4469, city: 'Entebbe' },
      { id: 'dest_jinja', title: 'Jinja Nile Source', subtitle: 'Adventure Hub', latitude: 0.4356, longitude: 33.2032, city: 'Jinja' },
      { id: 'dest_bwindi', title: 'Bwindi Gorillas', subtitle: 'National Park', latitude: -1.0478, longitude: 29.7028, city: 'Bwindi' },
      { id: 'dest_murchison', title: 'Murchison Falls', subtitle: 'Safari & Wildlife', latitude: 2.2856, longitude: 31.6845, city: 'Murchison' },
      { id: 'dest_queen_elizabeth', title: 'Queen Elizabeth', subtitle: 'Tree Climbing Lions', latitude: -0.2289, longitude: 29.9741, city: 'Kasese' },
      { id: 'dest_lake_mburo', title: 'Lake Mburo', subtitle: 'Zebra Sanctuary', latitude: -0.6358, longitude: 30.9328, city: 'Kiruhura' },
    ];

    const defaultPaymentMethods = [
      {
        id: 'MTN_MOMO',
        name: 'MTN Mobile Money',
        description: 'Instant MoMo push prompt (*165#)',
        enabled: true,
        isOnline: true,
      },
      {
        id: 'AIRTEL_MONEY',
        name: 'Airtel Money',
        description: 'Instant Airtel Money push prompt (*185#)',
        enabled: true,
        isOnline: true,
      },
      {
        id: 'CARD',
        name: 'Credit / Debit Card',
        description: 'Visa, MasterCard, American Express via DPO Gateway',
        enabled: true,
        isOnline: true,
        supportsCardInput: true,
      },
      {
        id: 'WALLET',
        name: 'SAFARIS Wallet',
        description: 'Pay instantly with your verified SAFARIS balance',
        enabled: true,
        isOnline: true,
      },
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

    const effectiveToken = master.mapboxAccessToken ||
      configMap.mapboxAccessToken ||
      localStore.app_config.get('mapboxAccessToken')?.value ||
      ENV.MAPBOX_ACCESS_TOKEN ||
      '';

    // Ensure we return the decrypted, ready-to-use token to authorized clients
    const cleanDecryptedToken = decryptSecret(effectiveToken);

    const rawPaymentMethods = master.paymentMethods || configMap.paymentMethods || defaultPaymentMethods;
    const sanitizedPaymentMethods = (Array.isArray(rawPaymentMethods) ? rawPaymentMethods : defaultPaymentMethods)
      .filter((m: any) => String(m?.id || '').toUpperCase().trim() !== 'CASH');

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
      paymentMethods: sanitizedPaymentMethods.length > 0 ? sanitizedPaymentMethods : defaultPaymentMethods,
      features: { ...defaultFeatures, ...(master.featureFlags || {}), ...(configMap.features || {}) },
      featureFlags: { ...defaultFeatures, ...(master.featureFlags || {}), ...(configMap.featureFlags || {}) },
      versionConfig: master.versionConfig || configMap.versionConfig || defaultVersion,
      supportedCities: master.supportedCities || ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Fort Portal', 'Gulu'],
      mapboxAccessToken: cleanDecryptedToken,
      pricing: AdminService.getPricing(),
      pricingMatrix: AdminService.getPricing(),
      catalogueVehicles: PricingEngineService.getAllCatalogueVehicles(),
      servicePricingRules: PricingEngineService.getAllServicePricingRules(),
      contentVersion:
        Array.from(localStore.destinations.values()).reduce((acc, d: any) => acc + Number(d.content_version || 1), 0) +
        Array.from(localStore.catalogue_vehicles.values()).reduce((acc, v: any) => acc + Number(v.pricing_version || 1), 0),
      quickPlaces: master.quickPlaces || configMap.quickPlaces || defaultQuickPlaces,
    };
  }

  public static async updateConfig(key: string, value: any) {
    const updatedAt = new Date().toISOString();

    // 1. Special Handling for Mapbox Access Token (Encrypt before DB persistence)
    if (key === 'mapboxAccessToken' || key === 'mapboxToken' || key === 'MAPBOX_ACCESS_TOKEN') {
      const cleanToken = decryptSecret(String(value || '').trim());
      const encryptedPayload = cleanToken ? encryptSecret(cleanToken) : '';

      // A. In-Memory Store (Decrypted for fast runtime delivery)
      localStore.app_config.set('mapboxAccessToken', {
        key: 'mapboxAccessToken',
        value: cleanToken,
        updated_at: updatedAt,
      });

      const master = localStore.app_config.get('master_config') || {};
      master.mapboxAccessToken = cleanToken;
      localStore.app_config.set('master_config', master);
      ENV.MAPBOX_ACCESS_TOKEN = cleanToken;

      // B. PostgreSQL Persistence (Encrypted in database)
      if (db.isPostgresConnected) {
        try {
          const dbValue = JSON.stringify({
            encrypted: encryptedPayload,
            is_encrypted: !!encryptedPayload,
            updated_at: updatedAt,
          });
          await db.query(
            `INSERT INTO app_config (key, value, updated_at) 
             VALUES ($1, $2, CURRENT_TIMESTAMP) 
             ON CONFLICT (key) 
             DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            ['mapboxAccessToken', dbValue]
          );

          // Also persist in master_config table with encrypted token
          const masterForDb = { ...master, mapboxAccessToken: encryptedPayload };
          await db.query(
            `INSERT INTO app_config (key, value, updated_at) 
             VALUES ($1, $2, CURRENT_TIMESTAMP) 
             ON CONFLICT (key) 
             DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
            ['master_config', JSON.stringify(masterForDb)]
          );
        } catch (err) {
          console.error('[AppConfigService] PostgreSQL encryption sync error:', err);
        }
      }

      // C. Persistent Disk File (Encrypted for offline durability)
      try {
        const dump: Record<string, any> = {
          master_config: { ...master, mapboxAccessToken: encryptedPayload },
          mapboxAccessToken: {
            encrypted: encryptedPayload,
            is_encrypted: !!encryptedPayload,
            updated_at: updatedAt,
          },
        };
        for (const [k, v] of localStore.app_config.entries()) {
          if (k !== 'master_config' && k !== 'mapboxAccessToken') {
            dump[k] = v.value !== undefined ? v.value : v;
          }
        }
        for (const cfgFile of PERSISTENT_CONFIG_CANDIDATES) {
          try {
            const dir = path.dirname(cfgFile);
            if (fs.existsSync(dir)) {
              fs.writeFileSync(cfgFile, JSON.stringify(dump, null, 2), 'utf-8');
            }
          } catch (_) {}
        }
      } catch (e) {
        console.warn('[AppConfigService] Notice: Could not write persistent encrypted config', e);
      }

      this.persistTokenToEnvFile(cleanToken);

      return { key: 'mapboxAccessToken', value: cleanToken };
    }

    // 2. Standard Configuration Keys
    localStore.app_config.set(key, {
      key,
      value,
      updated_at: updatedAt,
    });

    const master = localStore.app_config.get('master_config') || {};
    master[key] = value;
    localStore.app_config.set('master_config', master);

    // Persist to PostgreSQL if connected
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO app_config (key, value, updated_at) 
           VALUES ($1, $2, CURRENT_TIMESTAMP) 
           ON CONFLICT (key) 
           DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          [key, JSON.stringify(value)]
        );
        await db.query(
          `INSERT INTO app_config (key, value, updated_at) 
           VALUES ($1, $2, CURRENT_TIMESTAMP) 
           ON CONFLICT (key) 
           DO UPDATE SET value = EXCLUDED.value, updated_at = CURRENT_TIMESTAMP`,
          ['master_config', JSON.stringify(master)]
        );
      } catch (err) {
        console.error('[AppConfigService] PostgreSQL sync error:', err);
      }
    }

    // Persist to disk JSON file for offline/restart durability
    try {
      const dump: Record<string, any> = { master_config: master };
      for (const [k, v] of localStore.app_config.entries()) {
        dump[k] = v.value !== undefined ? v.value : v;
      }
      for (const cfgFile of PERSISTENT_CONFIG_CANDIDATES) {
        try {
          const dir = path.dirname(cfgFile);
          if (fs.existsSync(dir)) {
            fs.writeFileSync(cfgFile, JSON.stringify(dump, null, 2), 'utf-8');
          }
        } catch (_) {}
      }
    } catch (e) {
      console.warn('[AppConfigService] Notice: Could not write persistent config', e);
    }

    return { key, value };
  }

  private static persistTokenToEnvFile(token: string) {
    if (!token) return;
    try {
      const candidatePaths = [
        path.resolve(process.cwd(), '.env.development'),
        path.resolve(process.cwd(), '.env'),
        path.resolve(process.cwd(), '.env.production'),
        path.resolve(process.cwd(), 'backend/.env.development'),
        path.resolve(process.cwd(), 'backend/.env'),
        path.resolve(process.cwd(), 'backend/.env.production'),
        path.resolve(__dirname, '../../../.env.development'),
        path.resolve(__dirname, '../../../.env'),
        path.resolve(__dirname, '../../../.env.production'),
        path.resolve(__dirname, '../../../../.env.development'),
        path.resolve(__dirname, '../../../../.env'),
      ];

      for (const envPath of candidatePaths) {
        if (fs.existsSync(envPath)) {
          let content = fs.readFileSync(envPath, 'utf-8');
          if (content.includes('MAPBOX_ACCESS_TOKEN=')) {
            content = content.replace(/MAPBOX_ACCESS_TOKEN=.*/g, `MAPBOX_ACCESS_TOKEN=${token}`);
          } else {
            content += `\nMAPBOX_ACCESS_TOKEN=${token}\n`;
          }
          fs.writeFileSync(envPath, content, 'utf-8');
        }
      }
    } catch (e) {
      console.warn('[AppConfigService] Notice: Could not update .env with MAPBOX_ACCESS_TOKEN', e);
    }
  }

  public static async updateServices(services: any[]) {
    const normalized = (services || []).map((s: any) => {
      const isEnabled = s.enabled !== undefined 
        ? Boolean(s.enabled) 
        : (s.isEnabled !== undefined ? Boolean(s.isEnabled) : false);
      return {
        ...s,
        enabled: isEnabled,
        isEnabled: isEnabled,
      };
    });
    return this.updateConfig('services', normalized);
  }

  public static async updateBanners(banners: any[]) {
    const normalized = (banners || []).map((b, idx) => ({
      id: b.id || `banner_${Date.now()}_${idx}`,
      title: b.title || b.headline || '',
      headline: b.title || b.headline || '',
      subtitle: b.subtitle || b.discountText || '',
      discountText: b.subtitle || b.discountText || '',
      imageUrl: b.imageUrl || b.image || '',
      imagePlaceholder: b.imageUrl || b.image || 'safari',
      actionType: b.actionType || 'screen',
      actionValue: b.actionValue || b.destinationId || 'tourism',
      destinationId: b.actionValue || b.destinationId || 'tourism',
      active: b.active !== false,
      tag: b.tag || 'SPECIAL SAFARI',
    }));
    return this.updateConfig('banners', normalized);
  }

  public static async updateFeatures(features: Record<string, boolean>) {
    return this.updateConfig('featureFlags', features);
  }

  public static async updateVersionConfig(versionConfig: any) {
    return this.updateConfig('versionConfig', versionConfig);
  }

  public static async updateMapboxToken(token: string) {
    return this.updateConfig('mapboxAccessToken', token);
  }

  public static async updatePaymentMethods(methods: any[]) {
    const normalized = (methods || [])
      .filter((m: any) => String(m?.id || '').toUpperCase().trim() !== 'CASH')
      .map((m: any) => ({
        id: String(m.id || '').toUpperCase().trim(),
        name: String(m.name || m.title || m.id || ''),
        description: m.description ? String(m.description) : '',
        enabled: m.enabled !== undefined ? Boolean(m.enabled) : (m.isEnabled !== undefined ? Boolean(m.isEnabled) : true),
        isOnline: m.isOnline !== undefined ? Boolean(m.isOnline) : true,
        supportsCardInput: String(m.id || '').toUpperCase().trim() === 'CARD' || Boolean(m.supportsCardInput),
        minAmountUGX: m.minAmountUGX ? Number(m.minAmountUGX) : 500,
        maxAmountUGX: m.maxAmountUGX ? Number(m.maxAmountUGX) : 10000000,
      }));
    return this.updateConfig('paymentMethods', normalized);
  }
}
