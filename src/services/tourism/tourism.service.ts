import { resolveDataFilePaths } from '../../config/paths';
import fs from 'fs';
import path from 'path';
import { localStore, db } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser, broadcastToFleet, broadcastConfigUpdate } from '../../realtime/socket_server';
import { NotificationService } from '../notification/notification.service';
import { PricingEngineService, TouristPricingTier } from '../pricing/pricing_engine.service';
import { StorageService } from '../storage/storage.service';
import { ENV } from '../../config/env';

export type PublicationStatus = 'DRAFT' | 'PUBLISHED' | 'UNPUBLISHED' | 'ARCHIVED';

export interface ContentBlock {
  id: string;
  type: 'heading' | 'paragraph' | 'image' | 'video' | 'audio' | 'list' | 'quote' | 'link';
  order: number;
  text?: string;
  level?: 1 | 2 | 3;
  items?: string[];
  url?: string;
  r2Key?: string;
  mimeType?: string;
  sourceType?: 'CLOUDFLARE_R2' | 'EXTERNAL_URL';
  caption?: string;
  title?: string;
  author?: string;
}

export interface ItineraryDayItem {
  dayNumber: number;
  title: string;
  description: string;
  activities: string[];
  meals: string;
  accommodation: string;
  transport: string;
  mediaUrl?: string;
  mediaType?: 'IMAGE' | 'VIDEO' | 'AUDIO';
}

export interface CreateBookingRequest {
  customerId: string;
  destinationId?: string;
  packageId?: string;
  tourGuideId?: string;
  vehicleId?: string;
  quotationId?: string;
  travelDate: string;
  guestsCount: number;
  durationDays?: number;
  specialRequests?: string;
  selectedAdditionalChargeIds?: string[];
  totalUgx?: number;
  paymentMethod: string;
}

const PERSISTENT_DESTINATIONS_FILES = resolveDataFilePaths('persistent_destinations.json');
const PERSISTENT_PACKAGES_FILES = resolveDataFilePaths('persistent_packages.json');

export class TourismService {
  private static isInitialized = false;

  private static parseStringList(input: any, delimiter = ','): string[] {
    if (!input) return [];
    if (Array.isArray(input)) {
      return input.map((x) => String(x || '').trim()).filter(Boolean);
    }
    if (typeof input === 'string') {
      const splitChar = input.includes('\n') ? '\n' : delimiter;
      return input
        .split(splitChar)
        .map((s) => s.trim())
        .filter(Boolean);
    }
    return [];
  }

  private static normalizeContentBlocks(rawBlocks: any, fallbackDescription = ''): ContentBlock[] {
    let blocks: any[] = [];
    if (Array.isArray(rawBlocks)) {
      blocks = rawBlocks;
    } else if (typeof rawBlocks === 'string' && rawBlocks.trim().startsWith('[')) {
      try {
        blocks = JSON.parse(rawBlocks);
      } catch (_) {
        blocks = [];
      }
    }

    const sanitized: ContentBlock[] = blocks
      .filter((b) => b && typeof b === 'object' && b.type)
      .map((b, idx) => {
        const type = String(b.type).toLowerCase().trim() as ContentBlock['type'];
        const block: ContentBlock = {
          id: b.id || `blk_${idx + 1}_${uuidv4().slice(0, 6)}`,
          type: ['heading', 'paragraph', 'image', 'video', 'audio', 'list', 'quote', 'link'].includes(type)
            ? type
            : 'paragraph',
          order: typeof b.order === 'number' ? b.order : idx + 1,
          text: b.text ? String(b.text) : undefined,
          level: b.level === 1 || b.level === 2 || b.level === 3 ? b.level : 2,
          items: Array.isArray(b.items) ? b.items.map((i: any) => String(i).trim()).filter(Boolean) : undefined,
          url: b.url ? String(b.url).trim() : undefined,
          r2Key: b.r2Key ? String(b.r2Key).trim() : undefined,
          mimeType: b.mimeType ? String(b.mimeType).trim() : undefined,
          sourceType: b.sourceType === 'EXTERNAL_URL' ? 'EXTERNAL_URL' : 'CLOUDFLARE_R2',
          caption: b.caption ? String(b.caption) : undefined,
          title: b.title ? String(b.title) : undefined,
          author: b.author ? String(b.author) : undefined,
        };

        if (['image', 'video', 'audio', 'link'].includes(block.type) && block.url) {
          const expected =
            block.type === 'image'
              ? 'IMAGE'
              : block.type === 'video'
              ? 'VIDEO'
              : block.type === 'audio'
              ? 'AUDIO'
              : undefined;
          const check = StorageService.validateMediaUrl(block.url, expected);
          if (!check.valid) {
            throw new Error(`Invalid media URL in content block #${idx + 1} (${block.type}): ${check.reason}`);
          }
          block.mimeType = block.mimeType || check.mimeType;
          block.sourceType = check.provider === 'CLOUDFLARE_R2' ? 'CLOUDFLARE_R2' : 'EXTERNAL_URL';
        }

        return block;
      });

    sanitized.sort((a, b) => a.order - b.order);

    // If no blocks were provided but a description exists, synthesize an initial paragraph block
    if (sanitized.length === 0 && fallbackDescription && fallbackDescription.trim()) {
      sanitized.push({
        id: 'blk_overview_1',
        type: 'paragraph',
        order: 1,
        text: fallbackDescription.trim(),
      });
    }

    return sanitized;
  }

  private static async syncOwnerMediaRecords(
    ownerType: 'DESTINATION' | 'PACKAGE',
    ownerId: string,
    record: any
  ): Promise<void> {
    const mediaItems: Array<{
      media_type: 'IMAGE' | 'VIDEO' | 'AUDIO';
      url: string;
      caption?: string;
      title?: string;
    }> = [];

    if (record.imageUrl) {
      mediaItems.push({ media_type: 'IMAGE', url: record.imageUrl, title: 'Cover Image' });
    }
    if (Array.isArray(record.gallery_images)) {
      for (const img of record.gallery_images) {
        const url = typeof img === 'string' ? img : img?.url;
        if (url) mediaItems.push({ media_type: 'IMAGE', url, caption: img?.caption || '' });
      }
    }
    if (Array.isArray(record.videos)) {
      for (const vid of record.videos) {
        const url = typeof vid === 'string' ? vid : vid?.url;
        if (url) mediaItems.push({ media_type: 'VIDEO', url, title: vid?.title || '', caption: vid?.caption || '' });
      }
    }
    if (Array.isArray(record.audio_clips)) {
      for (const aud of record.audio_clips) {
        const url = typeof aud === 'string' ? aud : aud?.url;
        if (url) mediaItems.push({ media_type: 'AUDIO', url, title: aud?.title || '', caption: aud?.caption || '' });
      }
    }
    if (Array.isArray(record.content_blocks)) {
      for (const blk of record.content_blocks) {
        if (blk && blk.url && ['image', 'video', 'audio'].includes(blk.type)) {
          mediaItems.push({
            media_type: blk.type.toUpperCase() as 'IMAGE' | 'VIDEO' | 'AUDIO',
            url: blk.url,
            title: blk.title || '',
            caption: blk.caption || '',
          });
        }
      }
    }

    let order = 1;
    for (const item of mediaItems) {
      const check = StorageService.validateMediaUrl(item.url);
      if (check.valid) {
        const mediaId = `med_${ownerId}_${order}`;
        await db.persistDestinationMedia({
          id: mediaId,
          owner_type: ownerType,
          owner_id: ownerId,
          media_type: item.media_type,
          source_type: check.provider === 'CLOUDFLARE_R2' ? 'CLOUDFLARE_R2' : 'EXTERNAL_URL',
          url: item.url,
          r2_key: check.provider === 'CLOUDFLARE_R2' ? item.url.split('.r2.dev/')[1] || null : null,
          mime_type: check.mimeType,
          title: item.title || '',
          caption: item.caption || '',
          display_order: order++,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  private static normalizeDestinationRecord(raw: any): any {
    const id = raw.id || `dest_${uuidv4().substring(0, 8)}`;
    const name = String(raw.name || raw.title || 'Uganda Destination').trim();
    const img = String(raw.imageUrl || raw.image_url || raw.image_placeholder || '').trim();
    const description = String(raw.description || '').trim();
    const shortDescription = String(
      raw.short_description || raw.shortDescription || description.slice(0, 180)
    ).trim();

    const rawPubStatus = String(
      raw.publication_status || raw.publicationStatus || (raw.is_active === false ? 'UNPUBLISHED' : 'PUBLISHED')
    )
      .toUpperCase()
      .trim();
    const publicationStatus: PublicationStatus = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'].includes(
      rawPubStatus
    )
      ? (rawPubStatus as PublicationStatus)
      : 'PUBLISHED';

    const tiers: TouristPricingTier[] = Array.isArray(raw.tourist_pricing_tiers || raw.touristPricingTiers)
      ? PricingEngineService.validateTouristPricingTiers(raw.tourist_pricing_tiers || raw.touristPricingTiers)
      : [];

    const contentBlocks = this.normalizeContentBlocks(raw.content_blocks || raw.contentBlocks, description);

    const galleryImages = Array.isArray(raw.gallery_images || raw.galleryImages)
      ? raw.gallery_images || raw.galleryImages
      : [];
    const videos = Array.isArray(raw.videos) ? raw.videos : [];
    const audioClips = Array.isArray(raw.audio_clips || raw.audioClips) ? raw.audio_clips || raw.audioClips : [];

    const highlights = this.parseStringList(raw.highlights);
    const activities = this.parseStringList(raw.activities);
    const inclusions = this.parseStringList(raw.inclusions);
    const exclusions = this.parseStringList(raw.exclusions);

    const assignedVehicleIds = Array.isArray(raw.assigned_vehicle_ids || raw.assignedVehicleIds)
      ? (raw.assigned_vehicle_ids || raw.assignedVehicleIds).map(String)
      : ['veh_safari_4x4', 'veh_tour_van'];

    const assignedGuideIds = Array.isArray(raw.assigned_guide_ids || raw.assignedGuideIds)
      ? (raw.assigned_guide_ids || raw.assignedGuideIds).map(String)
      : [];

    const itinerary: ItineraryDayItem[] = Array.isArray(raw.itinerary) ? raw.itinerary : [];
    const additionalCharges = Array.isArray(raw.additional_charges || raw.additionalCharges)
      ? raw.additional_charges || raw.additionalCharges
      : [];

    const hours = Number(raw.distance_hours_from_kampala || raw.distanceHoursFromKampala || 5);
    const basePriceUgx = Math.round(
      Number(
        raw.base_price_ugx ??
          raw.basePriceUgx ??
          (tiers.length > 0 ? tiers[0].priceUgx : 450000)
      )
    );

    return {
      id,
      name,
      title: name,
      subtitle: String(raw.subtitle || raw.category || 'Uganda Safari Expedition').trim(),
      country: String(raw.country || 'Uganda').trim(),
      region: String(raw.region || 'Western Uganda').trim(),
      district: String(raw.district || '').trim(),
      location_address: String(raw.location_address || raw.locationAddress || '').trim(),
      category: String(raw.category || 'national_park').trim(),
      short_description: shortDescription,
      shortDescription,
      description,
      content_blocks: contentBlocks,
      contentBlocks,
      imageUrl: img,
      image_url: img,
      image_placeholder: img,
      gallery_images: galleryImages,
      galleryImages,
      videos,
      audio_clips: audioClips,
      audioClips,
      highlights,
      activities,
      inclusions,
      exclusions,
      recommended_duration: String(raw.recommended_duration || raw.recommendedDuration || '3 Days / 2 Nights').trim(),
      recommendedDuration: String(raw.recommended_duration || raw.recommendedDuration || '3 Days / 2 Nights').trim(),
      best_time_to_visit: String(raw.best_time_to_visit || raw.bestTimeToVisit || 'Year-round').trim(),
      bestTimeToVisit: String(raw.best_time_to_visit || raw.bestTimeToVisit || 'Year-round').trim(),
      distance_hours_from_kampala: hours,
      distanceHoursFromKampala: hours,
      distanceFromKampala: String(raw.distanceFromKampala || raw.distance_from_kampala || `${hours * 60} km`),
      travelDuration: String(raw.travelDuration || raw.travel_duration || `${hours} hours`),
      hero_tag: String(raw.hero_tag || raw.heroTag || 'SAFARI').trim(),
      latitude: Number(raw.latitude ?? raw.lat ?? 0.3136),
      longitude: Number(raw.longitude ?? raw.lng ?? 32.5811),
      rating: Number(raw.rating || 4.9),
      isPopular: raw.isPopular !== false && raw.is_popular !== false,
      is_popular: raw.isPopular !== false && raw.is_popular !== false,
      base_price_ugx: basePriceUgx,
      basePriceUgx,
      tourist_pricing_tiers: tiers,
      touristPricingTiers: tiers,
      assigned_vehicle_ids: assignedVehicleIds,
      assignedVehicleIds,
      assigned_guide_ids: assignedGuideIds,
      assignedGuideIds,
      itinerary,
      additional_charges: additionalCharges,
      additionalCharges,
      booking_available: raw.booking_available !== false && raw.bookingAvailable !== false,
      bookingAvailable: raw.booking_available !== false && raw.bookingAvailable !== false,
      publication_status: publicationStatus,
      publicationStatus,
      is_active: publicationStatus === 'PUBLISHED',
      display_order: Number(raw.display_order ?? raw.displayOrder ?? 0),
      displayOrder: Number(raw.display_order ?? raw.displayOrder ?? 0),
      content_version: Number(raw.content_version ?? raw.contentVersion ?? 1),
      contentVersion: Number(raw.content_version ?? raw.contentVersion ?? 1),
      created_at: raw.created_at ? new Date(raw.created_at).toISOString() : new Date().toISOString(),
      updated_at: raw.updated_at ? new Date(raw.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  private static normalizePackageRecord(raw: any): any {
    const id = raw.id || `pkg_${uuidv4().substring(0, 8)}`;
    const img = String(raw.imageUrl || raw.image_url || raw.image_placeholder || '').trim();
    const description = String(raw.description || '').trim();
    const shortDescription = String(raw.short_description || raw.shortDescription || description.slice(0, 180)).trim();

    const rawPubStatus = String(
      raw.publication_status || raw.publicationStatus || (raw.is_active === false ? 'UNPUBLISHED' : 'PUBLISHED')
    )
      .toUpperCase()
      .trim();
    const publicationStatus: PublicationStatus = ['DRAFT', 'PUBLISHED', 'UNPUBLISHED', 'ARCHIVED'].includes(
      rawPubStatus
    )
      ? (rawPubStatus as PublicationStatus)
      : 'PUBLISHED';

    const tiers: TouristPricingTier[] = Array.isArray(raw.tourist_pricing_tiers || raw.touristPricingTiers)
      ? PricingEngineService.validateTouristPricingTiers(raw.tourist_pricing_tiers || raw.touristPricingTiers)
      : [];

    const pricePerPersonUgx = Math.round(
      Number(
        raw.price_per_person_ugx ??
          raw.pricePerPersonUgx ??
          raw.priceUgx ??
          (tiers.length > 0 ? tiers[0].priceUgx : 450000)
      )
    );

    const durationDays = Math.max(1, Number(raw.duration_days || raw.durationDays || 1));
    const inclusions = this.parseStringList(raw.inclusions, '\n');
    const exclusions = this.parseStringList(raw.exclusions, '\n');
    const itinerarySummary = this.parseStringList(raw.itinerary_summary || raw.itinerarySummary, '\n');
    const itinerary: ItineraryDayItem[] = Array.isArray(raw.itinerary) ? raw.itinerary : [];
    const contentBlocks = this.normalizeContentBlocks(raw.content_blocks || raw.contentBlocks, description);

    return {
      id,
      destination_id: String(raw.destination_id || raw.destinationId || '').trim(),
      destinationId: String(raw.destination_id || raw.destinationId || '').trim(),
      title: String(raw.title || 'Safari Package').trim(),
      short_description: shortDescription,
      shortDescription,
      description,
      content_blocks: contentBlocks,
      contentBlocks,
      duration_days: durationDays,
      durationDays,
      price_per_person_ugx: pricePerPersonUgx,
      priceUgx: pricePerPersonUgx,
      group_type: String(raw.group_type || raw.groupType || 'Small Group (Max 6)').trim(),
      groupType: String(raw.group_type || raw.groupType || 'Small Group (Max 6)').trim(),
      inclusions,
      exclusions,
      itinerary_summary: itinerarySummary,
      itinerarySummary,
      itinerary,
      imageUrl: img,
      image_url: img,
      image_placeholder: img,
      gallery_images: Array.isArray(raw.gallery_images || raw.galleryImages)
        ? raw.gallery_images || raw.galleryImages
        : [],
      videos: Array.isArray(raw.videos) ? raw.videos : [],
      audio_clips: Array.isArray(raw.audio_clips || raw.audioClips) ? raw.audio_clips || raw.audioClips : [],
      tourist_pricing_tiers: tiers,
      touristPricingTiers: tiers,
      assigned_vehicle_ids: Array.isArray(raw.assigned_vehicle_ids || raw.assignedVehicleIds)
        ? (raw.assigned_vehicle_ids || raw.assignedVehicleIds).map(String)
        : ['veh_safari_4x4', 'veh_tour_van'],
      assigned_guide_ids: Array.isArray(raw.assigned_guide_ids || raw.assignedGuideIds)
        ? (raw.assigned_guide_ids || raw.assignedGuideIds).map(String)
        : [],
      additional_charges: Array.isArray(raw.additional_charges || raw.additionalCharges)
        ? raw.additional_charges || raw.additionalCharges
        : [],
      isFeatured: raw.isFeatured !== false && raw.is_featured !== false,
      is_featured: raw.isFeatured !== false && raw.is_featured !== false,
      booking_available: raw.booking_available !== false && raw.bookingAvailable !== false,
      bookingAvailable: raw.booking_available !== false && raw.bookingAvailable !== false,
      publication_status: publicationStatus,
      publicationStatus,
      is_active: publicationStatus === 'PUBLISHED',
      display_order: Number(raw.display_order ?? raw.displayOrder ?? 0),
      displayOrder: Number(raw.display_order ?? raw.displayOrder ?? 0),
      content_version: Number(raw.content_version ?? raw.contentVersion ?? 1),
      contentVersion: Number(raw.content_version ?? raw.contentVersion ?? 1),
      created_at: raw.created_at ? new Date(raw.created_at).toISOString() : new Date().toISOString(),
      updated_at: raw.updated_at ? new Date(raw.updated_at).toISOString() : new Date().toISOString(),
    };
  }

  public static async init(): Promise<void> {
    if (this.isInitialized) return;

    await PricingEngineService.init();

    // 1. Try loading from persistent disk files first
    this.loadFromDisk();

    // 2. If PostgreSQL is connected, load latest from database tables
    if (db.isPostgresConnected) {
      try {
        const destRes = await db.query('SELECT * FROM destinations ORDER BY display_order ASC, created_at ASC');
        if (destRes && destRes.rows && destRes.rows.length > 0) {
          for (const row of destRes.rows) {
            const norm = this.normalizeDestinationRecord(row);
            localStore.destinations.set(norm.id, norm);
          }
          console.log(`🏞️ [TourismService] Loaded ${destRes.rows.length} destinations from PostgreSQL.`);
        }

        const pkgRes = await db.query('SELECT * FROM tour_packages ORDER BY display_order ASC, created_at ASC');
        if (pkgRes && pkgRes.rows && pkgRes.rows.length > 0) {
          for (const row of pkgRes.rows) {
            const norm = this.normalizePackageRecord(row);
            localStore.tour_packages.set(norm.id, norm);
          }
          console.log(`🎒 [TourismService] Loaded ${pkgRes.rows.length} packages from PostgreSQL.`);
        }
      } catch (err) {
        console.warn('[TourismService] Notice: PostgreSQL query error during init:', err);
      }
    }

    this.saveToDisk();
    this.isInitialized = true;
  }

  private static loadFromDisk(): void {
    for (const f of PERSISTENT_DESTINATIONS_FILES) {
      try {
        if (fs.existsSync(f)) {
          const raw = fs.readFileSync(f, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const d of parsed) {
              if (d && d.id && !localStore.destinations.has(d.id)) {
                localStore.destinations.set(d.id, this.normalizeDestinationRecord(d));
              }
            }
            break;
          }
        }
      } catch (_) {}
    }

    for (const f of PERSISTENT_PACKAGES_FILES) {
      try {
        if (fs.existsSync(f)) {
          const raw = fs.readFileSync(f, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const p of parsed) {
              if (p && p.id && !localStore.tour_packages.has(p.id)) {
                localStore.tour_packages.set(p.id, this.normalizePackageRecord(p));
              }
            }
            break;
          }
        }
      } catch (_) {}
    }
  }

  public static saveToDisk(): void {
    try {
      const destList = Array.from(localStore.destinations.values());
      for (const f of PERSISTENT_DESTINATIONS_FILES) {
        try {
          const dir = path.dirname(f);
          if (fs.existsSync(dir)) {
            fs.writeFileSync(f, JSON.stringify(destList, null, 2), 'utf-8');
          }
        } catch (_) {}
      }

      const pkgList = Array.from(localStore.tour_packages.values());
      for (const f of PERSISTENT_PACKAGES_FILES) {
        try {
          const dir = path.dirname(f);
          if (fs.existsSync(dir)) {
            fs.writeFileSync(f, JSON.stringify(pkgList, null, 2), 'utf-8');
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  private static async persistDestinationToDb(destination: any): Promise<void> {
    if (!db.isPostgresConnected) return;
    try {
      await db.query(
        `INSERT INTO destinations (
           id, name, title, subtitle, country, region, district, location_address,
           description, short_description, content_blocks, highlights, activities,
           inclusions, exclusions, gallery_images, videos, audio_clips,
           best_time_to_visit, recommended_duration, travel_duration, distance_from_kampala,
           distance_hours_from_kampala, hero_tag, image_url, image_placeholder,
           category, latitude, longitude, rating, is_popular, is_active,
           base_price_ugx, tourist_pricing_tiers, assigned_vehicle_ids, assigned_guide_ids,
           itinerary, additional_charges, booking_available, publication_status,
           display_order, content_version, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6, $7, $8,
           $9, $10, $11, $12, $13,
           $14, $15, $16, $17, $18,
           $19, $20, $21, $22,
           $23, $24, $25, $26,
           $27, $28, $29, $30, $31, $32,
           $33, $34, $35, $36,
           $37, $38, $39, $40,
           $41, $42, CURRENT_TIMESTAMP
         ) ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name,
           title = EXCLUDED.title,
           subtitle = EXCLUDED.subtitle,
           country = EXCLUDED.country,
           region = EXCLUDED.region,
           district = EXCLUDED.district,
           location_address = EXCLUDED.location_address,
           description = EXCLUDED.description,
           short_description = EXCLUDED.short_description,
           content_blocks = EXCLUDED.content_blocks,
           highlights = EXCLUDED.highlights,
           activities = EXCLUDED.activities,
           inclusions = EXCLUDED.inclusions,
           exclusions = EXCLUDED.exclusions,
           gallery_images = EXCLUDED.gallery_images,
           videos = EXCLUDED.videos,
           audio_clips = EXCLUDED.audio_clips,
           best_time_to_visit = EXCLUDED.best_time_to_visit,
           recommended_duration = EXCLUDED.recommended_duration,
           travel_duration = EXCLUDED.travel_duration,
           distance_from_kampala = EXCLUDED.distance_from_kampala,
           distance_hours_from_kampala = EXCLUDED.distance_hours_from_kampala,
           hero_tag = EXCLUDED.hero_tag,
           image_url = EXCLUDED.image_url,
           image_placeholder = EXCLUDED.image_placeholder,
           category = EXCLUDED.category,
           latitude = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           rating = EXCLUDED.rating,
           is_popular = EXCLUDED.is_popular,
           is_active = EXCLUDED.is_active,
           base_price_ugx = EXCLUDED.base_price_ugx,
           tourist_pricing_tiers = EXCLUDED.tourist_pricing_tiers,
           assigned_vehicle_ids = EXCLUDED.assigned_vehicle_ids,
           assigned_guide_ids = EXCLUDED.assigned_guide_ids,
           itinerary = EXCLUDED.itinerary,
           additional_charges = EXCLUDED.additional_charges,
           booking_available = EXCLUDED.booking_available,
           publication_status = EXCLUDED.publication_status,
           display_order = EXCLUDED.display_order,
           content_version = EXCLUDED.content_version,
           updated_at = CURRENT_TIMESTAMP`,
        [
          destination.id,
          destination.name,
          destination.title,
          destination.subtitle,
          destination.country,
          destination.region,
          destination.district,
          destination.location_address,
          destination.description,
          destination.short_description,
          JSON.stringify(destination.content_blocks || []),
          destination.highlights || [],
          JSON.stringify(destination.activities || []),
          JSON.stringify(destination.inclusions || []),
          JSON.stringify(destination.exclusions || []),
          JSON.stringify(destination.gallery_images || []),
          JSON.stringify(destination.videos || []),
          JSON.stringify(destination.audio_clips || []),
          destination.best_time_to_visit,
          destination.recommended_duration,
          destination.travelDuration,
          destination.distanceFromKampala,
          destination.distance_hours_from_kampala,
          destination.hero_tag,
          destination.imageUrl,
          destination.image_placeholder,
          destination.category,
          destination.latitude,
          destination.longitude,
          destination.rating,
          destination.isPopular,
          destination.is_active,
          destination.base_price_ugx,
          JSON.stringify(destination.tourist_pricing_tiers || []),
          JSON.stringify(destination.assigned_vehicle_ids || []),
          JSON.stringify(destination.assigned_guide_ids || []),
          JSON.stringify(destination.itinerary || []),
          JSON.stringify(destination.additional_charges || []),
          destination.booking_available,
          destination.publication_status,
          destination.display_order,
          destination.content_version,
        ]
      );
    } catch (err) {
      console.error('[TourismService] PostgreSQL destination persist error:', err);
    }
  }

  private static async persistPackageToDb(pkg: any): Promise<void> {
    if (!db.isPostgresConnected) return;
    try {
      await db.query(
        `INSERT INTO tour_packages (
           id, destination_id, title, short_description, description, content_blocks,
           duration_days, price_per_person_ugx, group_type, inclusions, exclusions,
           itinerary_summary, itinerary, image_url, image_placeholder,
           gallery_images, videos, audio_clips, tourist_pricing_tiers,
           assigned_vehicle_ids, assigned_guide_ids, additional_charges,
           is_featured, booking_available, publication_status, is_active,
           display_order, content_version, updated_at
         ) VALUES (
           $1, $2, $3, $4, $5, $6,
           $7, $8, $9, $10, $11,
           $12, $13, $14, $15,
           $16, $17, $18, $19,
           $20, $21, $22,
           $23, $24, $25, $26,
           $27, $28, CURRENT_TIMESTAMP
         ) ON CONFLICT (id) DO UPDATE SET
           destination_id = EXCLUDED.destination_id,
           title = EXCLUDED.title,
           short_description = EXCLUDED.short_description,
           description = EXCLUDED.description,
           content_blocks = EXCLUDED.content_blocks,
           duration_days = EXCLUDED.duration_days,
           price_per_person_ugx = EXCLUDED.price_per_person_ugx,
           group_type = EXCLUDED.group_type,
           inclusions = EXCLUDED.inclusions,
           exclusions = EXCLUDED.exclusions,
           itinerary_summary = EXCLUDED.itinerary_summary,
           itinerary = EXCLUDED.itinerary,
           image_url = EXCLUDED.image_url,
           image_placeholder = EXCLUDED.image_placeholder,
           gallery_images = EXCLUDED.gallery_images,
           videos = EXCLUDED.videos,
           audio_clips = EXCLUDED.audio_clips,
           tourist_pricing_tiers = EXCLUDED.tourist_pricing_tiers,
           assigned_vehicle_ids = EXCLUDED.assigned_vehicle_ids,
           assigned_guide_ids = EXCLUDED.assigned_guide_ids,
           additional_charges = EXCLUDED.additional_charges,
           is_featured = EXCLUDED.is_featured,
           booking_available = EXCLUDED.booking_available,
           publication_status = EXCLUDED.publication_status,
           is_active = EXCLUDED.is_active,
           display_order = EXCLUDED.display_order,
           content_version = EXCLUDED.content_version,
           updated_at = CURRENT_TIMESTAMP`,
        [
          pkg.id,
          pkg.destination_id,
          pkg.title,
          pkg.short_description,
          pkg.description,
          JSON.stringify(pkg.content_blocks || []),
          pkg.duration_days,
          pkg.price_per_person_ugx,
          pkg.group_type,
          pkg.inclusions || [],
          JSON.stringify(pkg.exclusions || []),
          pkg.itinerary_summary || [],
          JSON.stringify(pkg.itinerary || []),
          pkg.imageUrl,
          pkg.image_placeholder,
          JSON.stringify(pkg.gallery_images || []),
          JSON.stringify(pkg.videos || []),
          JSON.stringify(pkg.audio_clips || []),
          JSON.stringify(pkg.tourist_pricing_tiers || []),
          JSON.stringify(pkg.assigned_vehicle_ids || []),
          JSON.stringify(pkg.assigned_guide_ids || []),
          JSON.stringify(pkg.additional_charges || []),
          pkg.isFeatured,
          pkg.booking_available,
          pkg.publication_status,
          pkg.is_active,
          pkg.display_order,
          pkg.content_version,
        ]
      );
    } catch (err) {
      console.error('[TourismService] PostgreSQL package persist error:', err);
    }
  }

  public static getAllDestinations(options?: { includeDrafts?: boolean; category?: string }) {
    let list = Array.from(localStore.destinations.values()).map((d) => this.normalizeDestinationRecord(d));
    if (!options?.includeDrafts) {
      list = list.filter((d) => d.publication_status === 'PUBLISHED');
    }
    if (options?.category) {
      const cat = options.category.toLowerCase().trim();
      list = list.filter((d) => String(d.category || '').toLowerCase() === cat);
    }
    list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return list;
  }

  public static getDestinationById(id: string) {
    const dest = localStore.destinations.get(id);
    if (!dest) throw new Error('Destination not found.');
    return this.normalizeDestinationRecord(dest);
  }

  public static getPackagesByDestination(destinationId: string, options?: { includeDrafts?: boolean }) {
    let packages = Array.from(localStore.tour_packages.values())
      .map((p) => this.normalizePackageRecord(p))
      .filter((p) => p.destination_id === destinationId);
    if (!options?.includeDrafts) {
      packages = packages.filter((p) => p.publication_status === 'PUBLISHED');
    }
    packages.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return packages;
  }

  public static getAllPackages(options?: { includeDrafts?: boolean }) {
    let list = Array.from(localStore.tour_packages.values()).map((p) => this.normalizePackageRecord(p));
    if (!options?.includeDrafts) {
      list = list.filter((p) => p.publication_status === 'PUBLISHED');
    }
    list.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
    return list;
  }

  public static getPackageById(id: string) {
    const pkg = localStore.tour_packages.get(id);
    if (!pkg) throw new Error('Tour package not found.');
    return this.normalizePackageRecord(pkg);
  }

  public static async createBooking(data: CreateBookingRequest) {
    if (data.tourGuideId) {
      const guide = localStore.tour_guides.get(data.tourGuideId);
      if (!guide || !guide.is_approved || guide.approval_status !== 'APPROVED') {
        throw new Error('Selected tour guide is not approved for active expeditions.');
      }
    }

    const pkg = data.packageId ? localStore.tour_packages.get(data.packageId) : null;
    const destId = data.destinationId || pkg?.destination_id || '';
    const dest = destId ? localStore.destinations.get(destId) : null;

    if (dest && dest.publication_status && dest.publication_status !== 'PUBLISHED') {
      throw new Error(`Destination '${dest.title || dest.name}' is not currently published for booking.`);
    }
    if (pkg && pkg.publication_status && pkg.publication_status !== 'PUBLISHED') {
      throw new Error(`Tour package '${pkg.title}' is not currently published for booking.`);
    }

    let quote: any = null;
    if (data.quotationId) {
      try {
        quote = await PricingEngineService.validateAndConsumeQuotation({
          quotationId: data.quotationId,
          expectedServiceType: 'TOUR',
          customerId: data.customerId,
          referenceId: destId || undefined,
        });
      } catch (err: any) {
        if (ENV.isProduction) throw err;
      }
    }

    if (!dest && !pkg && !quote) {
      if (ENV.isProduction) {
        throw new Error('A valid destination or tour package is required to create a booking.');
      }
      const fallbackPrice = Number(data.totalUgx || 1000000);
      quote = {
        quotationId: `quo_tour_${uuidv4().slice(0, 8)}`,
        serviceType: 'TOUR',
        totalPriceUgx: fallbackPrice,
        total_price_ugx: fallbackPrice,
        pricingVersion: 1,
        breakdown: [{ code: 'TOUR_FALLBACK', label: 'Standard Safari Tour Package', amountUgx: fallbackPrice }],
      };
    }

    if (!quote && (dest || pkg)) {
      quote = await PricingEngineService.calculateQuote({
        serviceType: 'TOUR',
        packageId: data.packageId,
        destinationId: destId || undefined,
        guideId: data.tourGuideId,
        vehicleId: data.vehicleId,
        guestCount: Math.max(1, Number(data.guestsCount || 1)),
        durationDays: data.durationDays || pkg?.duration_days || 1,
        selectedAdditionalChargeIds: data.selectedAdditionalChargeIds,
      });
    }

    const authoritativeTotalUgx = Math.round(Number(quote?.totalPriceUgx ?? quote?.total_price_ugx ?? 0));
    if (!Number.isFinite(authoritativeTotalUgx) || authoritativeTotalUgx <= 0) {
      throw new Error('Could not calculate a valid authoritative quotation for this tour booking.');
    }

    const bookingId = `tb_${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();
    const initialStatus = data.tourGuideId ? 'CONFIRMED' : 'PENDING_PAYMENT';
    const newBooking: any = {
      id: bookingId,
      customer_id: data.customerId,
      destination_id: destId || null,
      package_id: data.packageId || null,
      tour_guide_id: data.tourGuideId || null,
      guide_id: data.tourGuideId || null,
      vehicle_id: data.vehicleId || quote.vehicleId || quote.vehicle_id || null,
      quotation_id: quote.quotationId || quote.id,
      pricing_version: Number(quote.pricingVersion || quote.pricing_version || 1),
      quotation_snapshot: quote,
      booking_status: initialStatus,
      status: initialStatus,
      travel_date: data.travelDate || nowIso.slice(0, 10),
      start_date: data.travelDate || nowIso.slice(0, 10),
      guests_count: Number(data.guestsCount || 1),
      travelers_count: Number(data.guestsCount || 1),
      total_ugx: authoritativeTotalUgx,
      special_requests: data.specialRequests || '',
      payment_method: data.paymentMethod || 'MTN Mobile Money',
      payment_status: 'PENDING',
      created_at: nowIso,
      updated_at: nowIso,
    };

    localStore.tour_bookings.set(bookingId, newBooking);
    db.persistTourBooking(newBooking).catch((err) =>
      console.error('[TourismService.createBooking persist error]', err)
    );

    const enriched = this.getBookingById(bookingId);
    broadcastToFleet(enriched, 'tour:booking_created');

    if (data.tourGuideId) {
      emitToUser(data.tourGuideId, 'tour:booking_assigned', {
        bookingId,
        booking: enriched,
      });
      NotificationService.createNotification({
        userId: data.tourGuideId,
        title: 'New Safari Tour Assigned',
        message: `You have been assigned to lead "${enriched.package_title || enriched.destination_title}" on ${newBooking.travel_date} for ${newBooking.guests_count} guest(s).`,
        type: 'SYSTEM',
        metadata: { bookingId, travelDate: newBooking.travel_date },
      }).catch(() => {});
    }

    if (data.customerId) {
      emitToUser(data.customerId, 'tour:booking_updated', {
        bookingId,
        booking: enriched,
      });
    }

    return enriched;
  }

  public static getUserBookings(customerId: string) {
    return Array.from(localStore.tour_bookings.values())
      .filter((b: any) => b.customer_id === customerId || b.tour_guide_id === customerId || b.guide_id === customerId)
      .map((b: any) => this.getBookingById(b.id))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static getBookingById(bookingId: string) {
    const booking = localStore.tour_bookings.get(bookingId);
    if (!booking) throw new Error('Tour booking not found.');

    const guideId = booking.tour_guide_id || booking.guide_id || null;
    const pkg = booking.package_id ? localStore.tour_packages.get(booking.package_id) : null;
    const destId = booking.destination_id || pkg?.destination_id || null;
    const dest = destId ? localStore.destinations.get(destId) : null;
    const guide = guideId ? localStore.tour_guides.get(guideId) : null;
    const guideUser = guideId ? localStore.users.get(guideId) : null;
    const customer = booking.customer_id ? localStore.users.get(booking.customer_id) : null;
    const status = booking.booking_status || booking.status || 'CONFIRMED';

    return {
      ...booking,
      total_ugx: Number(booking.total_ugx || 0),
      totalPriceUgx: Number(booking.total_ugx || 0),
      totalUgx: Number(booking.total_ugx || 0),
      tour_guide_id: guideId,
      guide_id: guideId,
      booking_status: status,
      bookingStatus: status,
      status,
      destination_title: dest?.title || dest?.name || 'Uganda Safari',
      package_title: pkg?.title || 'Custom Guided Safari',
      guide_name: guideUser?.full_name || guide?.full_name || (guideId ? 'Assigned Guide' : 'Unassigned'),
      guide_phone: guideUser?.phone || guide?.phone || '',
      customer_name: customer?.full_name || 'Guest Explorer',
      customer_phone: customer?.phone || '',
      customer_email: customer?.email || '',
      destination: dest,
      package: pkg,
      guide: guide
        ? {
            ...guide,
            full_name: guideUser?.full_name || guide.full_name || 'Safari Guide',
            phone: guideUser?.phone || guide.phone || '',
            email: guideUser?.email || '',
          }
        : null,
    };
  }

  // -----------------------------------------------------------
  // Admin CRUD for Destinations (Fully Permanent + Rich Content)
  // -----------------------------------------------------------
  public static async createDestination(data: any) {
    const id = data.id || `dest_${uuidv4().substring(0, 8)}`;
    const destination = this.normalizeDestinationRecord({
      ...data,
      id,
      display_order: data.display_order ?? data.displayOrder ?? localStore.destinations.size + 1,
      content_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localStore.destinations.set(id, destination);
    await this.persistDestinationToDb(destination);
    await this.syncOwnerMediaRecords('DESTINATION', id, destination);
    this.saveToDisk();
    broadcastConfigUpdate({ type: 'DESTINATIONS_UPDATED', destinationId: id, contentVersion: destination.content_version });
    return destination;
  }

  public static async updateDestination(id: string, data: any) {
    const existing = localStore.destinations.get(id);
    if (!existing) throw new Error('Destination not found.');

    const cleanData = { ...data };
    if (cleanData.shortDescription !== undefined) cleanData.short_description = cleanData.shortDescription;
    if (cleanData.short_description !== undefined) cleanData.shortDescription = cleanData.short_description;
    if (cleanData.basePriceUgx !== undefined) cleanData.base_price_ugx = cleanData.basePriceUgx;
    if (cleanData.base_price_ugx !== undefined) cleanData.basePriceUgx = cleanData.base_price_ugx;
    if (cleanData.publicationStatus !== undefined) cleanData.publication_status = cleanData.publicationStatus;
    if (cleanData.publication_status !== undefined) cleanData.publicationStatus = cleanData.publication_status;
    if (cleanData.contentBlocks !== undefined) cleanData.content_blocks = cleanData.contentBlocks;
    if (cleanData.content_blocks !== undefined) cleanData.contentBlocks = cleanData.content_blocks;
    if (cleanData.touristPricingTiers !== undefined) cleanData.tourist_pricing_tiers = cleanData.touristPricingTiers;
    if (cleanData.tourist_pricing_tiers !== undefined) cleanData.touristPricingTiers = cleanData.tourist_pricing_tiers;
    if (cleanData.imageUrl !== undefined) cleanData.image_url = cleanData.imageUrl;
    if (cleanData.image_url !== undefined) cleanData.imageUrl = cleanData.image_url;
    if (cleanData.galleryImages !== undefined) cleanData.gallery_images = cleanData.galleryImages;
    if (cleanData.gallery_images !== undefined) cleanData.galleryImages = cleanData.gallery_images;
    if (cleanData.assignedVehicleIds !== undefined) cleanData.assigned_vehicle_ids = cleanData.assignedVehicleIds;
    if (cleanData.assigned_vehicle_ids !== undefined) cleanData.assignedVehicleIds = cleanData.assigned_vehicle_ids;
    if (cleanData.assignedGuideIds !== undefined) cleanData.assigned_guide_ids = cleanData.assignedGuideIds;
    if (cleanData.assigned_guide_ids !== undefined) cleanData.assignedGuideIds = cleanData.assigned_guide_ids;

    const updated = this.normalizeDestinationRecord({
      ...existing,
      ...cleanData,
      id,
      content_version: Number(existing.content_version || 1) + 1,
      updated_at: new Date().toISOString(),
    });

    localStore.destinations.set(id, updated);
    await this.persistDestinationToDb(updated);
    await this.syncOwnerMediaRecords('DESTINATION', id, updated);
    this.saveToDisk();
    broadcastConfigUpdate({ type: 'DESTINATIONS_UPDATED', destinationId: id, contentVersion: updated.content_version });
    return updated;
  }

  public static async duplicateDestination(id: string) {
    const existing = localStore.destinations.get(id);
    if (!existing) throw new Error('Destination not found to duplicate.');

    const newId = `dest_${uuidv4().substring(0, 8)}`;
    const copy = this.normalizeDestinationRecord({
      ...existing,
      id: newId,
      name: `${existing.name || existing.title} (Copy)`,
      title: `${existing.title || existing.name} (Copy)`,
      publication_status: 'DRAFT',
      display_order: localStore.destinations.size + 1,
      content_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localStore.destinations.set(newId, copy);
    await this.persistDestinationToDb(copy);
    this.saveToDisk();
    return copy;
  }

  public static async deleteDestination(id: string) {
    if (!localStore.destinations.has(id)) throw new Error('Destination not found.');
    localStore.destinations.delete(id);

    for (const [pkgId, pkg] of localStore.tour_packages.entries()) {
      if (pkg.destination_id === id) {
        localStore.tour_packages.delete(pkgId);
      }
    }

    if (db.isPostgresConnected) {
      try {
        await db.query('DELETE FROM destinations WHERE id = $1', [id]);
      } catch (err) {
        console.error('[TourismService] PostgreSQL delete error:', err);
      }
    }

    this.saveToDisk();
    broadcastConfigUpdate({ type: 'DESTINATIONS_DELETED', destinationId: id });
    return { success: true, id };
  }

  // -----------------------------------------------------------
  // Admin CRUD for Tour Packages (Fully Permanent + Rich Content)
  // -----------------------------------------------------------
  public static async createPackage(data: any) {
    const id = data.id || `pkg_${uuidv4().substring(0, 8)}`;
    const pkg = this.normalizePackageRecord({
      ...data,
      id,
      display_order: data.display_order ?? data.displayOrder ?? localStore.tour_packages.size + 1,
      content_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localStore.tour_packages.set(id, pkg);
    await this.persistPackageToDb(pkg);
    await this.syncOwnerMediaRecords('PACKAGE', id, pkg);
    this.saveToDisk();
    broadcastConfigUpdate({ type: 'PACKAGES_UPDATED', packageId: id, contentVersion: pkg.content_version });
    return pkg;
  }

  public static async updatePackage(id: string, data: any) {
    const existing = localStore.tour_packages.get(id);
    if (!existing) throw new Error('Tour package not found.');

    const cleanData = { ...data };
    if (cleanData.shortDescription !== undefined) cleanData.short_description = cleanData.shortDescription;
    if (cleanData.short_description !== undefined) cleanData.shortDescription = cleanData.short_description;
    if (cleanData.pricePerPersonUgx !== undefined) cleanData.price_per_person_ugx = cleanData.pricePerPersonUgx;
    if (cleanData.price_per_person_ugx !== undefined) cleanData.pricePerPersonUgx = cleanData.price_per_person_ugx;
    if (cleanData.publicationStatus !== undefined) cleanData.publication_status = cleanData.publicationStatus;
    if (cleanData.publication_status !== undefined) cleanData.publicationStatus = cleanData.publication_status;
    if (cleanData.contentBlocks !== undefined) cleanData.content_blocks = cleanData.contentBlocks;
    if (cleanData.content_blocks !== undefined) cleanData.contentBlocks = cleanData.content_blocks;
    if (cleanData.touristPricingTiers !== undefined) cleanData.tourist_pricing_tiers = cleanData.touristPricingTiers;
    if (cleanData.tourist_pricing_tiers !== undefined) cleanData.touristPricingTiers = cleanData.tourist_pricing_tiers;
    if (cleanData.imageUrl !== undefined) cleanData.image_url = cleanData.imageUrl;
    if (cleanData.image_url !== undefined) cleanData.imageUrl = cleanData.image_url;
    if (cleanData.assignedVehicleIds !== undefined) cleanData.assigned_vehicle_ids = cleanData.assignedVehicleIds;
    if (cleanData.assigned_vehicle_ids !== undefined) cleanData.assignedVehicleIds = cleanData.assigned_vehicle_ids;
    if (cleanData.assignedGuideIds !== undefined) cleanData.assigned_guide_ids = cleanData.assignedGuideIds;
    if (cleanData.assigned_guide_ids !== undefined) cleanData.assignedGuideIds = cleanData.assigned_guide_ids;

    const updated = this.normalizePackageRecord({
      ...existing,
      ...cleanData,
      id,
      content_version: Number(existing.content_version || 1) + 1,
      updated_at: new Date().toISOString(),
    });

    localStore.tour_packages.set(id, updated);
    await this.persistPackageToDb(updated);
    await this.syncOwnerMediaRecords('PACKAGE', id, updated);
    this.saveToDisk();
    broadcastConfigUpdate({ type: 'PACKAGES_UPDATED', packageId: id, contentVersion: updated.content_version });
    return updated;
  }

  public static async duplicatePackage(id: string) {
    const existing = localStore.tour_packages.get(id);
    if (!existing) throw new Error('Tour package not found to duplicate.');

    const newId = `pkg_${uuidv4().substring(0, 8)}`;
    const copy = this.normalizePackageRecord({
      ...existing,
      id: newId,
      title: `${existing.title} (Copy)`,
      publication_status: 'DRAFT',
      display_order: localStore.tour_packages.size + 1,
      content_version: 1,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    localStore.tour_packages.set(newId, copy);
    await this.persistPackageToDb(copy);
    this.saveToDisk();
    return copy;
  }

  public static async deletePackage(id: string) {
    if (!localStore.tour_packages.has(id)) throw new Error('Tour package not found.');
    localStore.tour_packages.delete(id);

    if (db.isPostgresConnected) {
      try {
        await db.query('DELETE FROM tour_packages WHERE id = $1', [id]);
      } catch (err) {
        console.error('[TourismService] PostgreSQL package delete error:', err);
      }
    }

    this.saveToDisk();
    broadcastConfigUpdate({ type: 'PACKAGES_DELETED', packageId: id });
    return { success: true, id };
  }

  // -----------------------------------------------------------
  // Admin & Partner Bookings Management
  // -----------------------------------------------------------
  public static getAllBookings() {
    return Array.from(localStore.tour_bookings.values())
      .map((b: any) => this.getBookingById(b.id))
      .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }

  public static assignGuideToBooking(bookingId: string, guideId: string) {
    const booking = localStore.tour_bookings.get(bookingId);
    if (!booking) throw new Error('Tour booking not found.');

    const guide = localStore.tour_guides.get(guideId);
    if (!guide) throw new Error('Tour guide not found.');
    if (!guide.is_approved || guide.approval_status !== 'APPROVED') {
      throw new Error('Only approved tour guides can be assigned to customer bookings.');
    }

    booking.tour_guide_id = guideId;
    booking.guide_id = guideId;
    if (!booking.booking_status || booking.booking_status === 'PENDING_PAYMENT' || booking.booking_status === 'PENDING') {
      booking.booking_status = 'CONFIRMED';
      booking.status = 'CONFIRMED';
    }
    booking.updated_at = new Date().toISOString();

    db.persistTourBooking(booking).catch((err) =>
      console.error('[TourismService.assignGuideToBooking persist error]', err)
    );

    const enriched = this.getBookingById(bookingId);
    const payload = {
      bookingId,
      guideId,
      booking: enriched,
      status: enriched.booking_status,
    };

    emitToUser(guideId, 'tour:booking_assigned', payload);
    emitToUser(guideId, 'tour:booking_updated', payload);
    if (booking.customer_id) {
      emitToUser(booking.customer_id, 'tour:booking_assigned', payload);
      emitToUser(booking.customer_id, 'tour:booking_updated', payload);
    }
    broadcastToFleet(payload, 'tour:booking_updated');

    NotificationService.createNotification({
      userId: guideId,
      title: 'Safari Booking Assigned to You',
      message: `You have been assigned to "${enriched.package_title}" (${enriched.destination_title}) on ${enriched.travel_date} for ${enriched.guests_count} guest(s).`,
      type: 'SYSTEM',
      metadata: { bookingId, guideId, travelDate: enriched.travel_date },
    }).catch(() => {});

    if (booking.customer_id) {
      NotificationService.createNotification({
        userId: booking.customer_id,
        title: 'Tour Guide Assigned',
        message: `${enriched.guide_name} has been assigned as your certified guide for "${enriched.package_title}".`,
        type: 'SYSTEM',
        metadata: { bookingId, guideId, guideName: enriched.guide_name },
      }).catch(() => {});
    }

    return enriched;
  }

  public static updateBookingStatus(
    bookingId: string,
    status: string,
    actorId?: string,
    actorRole?: string
  ) {
    const booking = localStore.tour_bookings.get(bookingId);
    if (!booking) throw new Error('Tour booking not found.');

    const assignedGuideId = booking.tour_guide_id || booking.guide_id || null;

    if (actorId && actorRole !== 'admin') {
      const isAssignedGuide = assignedGuideId === actorId;
      const isBookingCustomer = booking.customer_id === actorId;
      if (!isAssignedGuide && !(isBookingCustomer && status === 'CANCELLED')) {
        throw new Error('You are not authorized to update this tour booking.');
      }
    }

    const prevStatus = booking.booking_status || booking.status;
    booking.booking_status = status;
    booking.status = status;
    booking.updated_at = new Date().toISOString();

    if (status === 'COMPLETED' && prevStatus !== 'COMPLETED' && assignedGuideId) {
      const guide = localStore.tour_guides.get(assignedGuideId);
      if (guide) {
        guide.expeditions_count = Number(guide.expeditions_count || 0) + 1;
        guide.updated_at = new Date().toISOString();
        db.persistTourGuide(guide).catch(() => {});
      }
    }

    db.persistTourBooking(booking).catch((err) =>
      console.error('[TourismService.updateBookingStatus persist error]', err)
    );

    const enriched = this.getBookingById(bookingId);
    const payload = {
      bookingId,
      status,
      booking: enriched,
    };

    if (assignedGuideId) {
      emitToUser(assignedGuideId, 'tour:booking_updated', payload);
    }
    if (booking.customer_id) {
      emitToUser(booking.customer_id, 'tour:booking_updated', payload);

      let title = 'Tour Booking Updated';
      let msg = `Your booking for "${enriched.package_title}" is now ${status.replace('_', ' ')}.`;
      if (status === 'CONFIRMED') {
        title = 'Safari Booking Confirmed';
        msg = `Your safari booking for "${enriched.package_title}" on ${enriched.travel_date} has been confirmed by ${enriched.guide_name}.`;
      } else if (status === 'IN_PROGRESS') {
        title = 'Safari Expedition Started';
        msg = `Your safari expedition "${enriched.package_title}" with ${enriched.guide_name} is now in progress!`;
      } else if (status === 'COMPLETED') {
        title = 'Safari Expedition Completed';
        msg = `Thank you for exploring Uganda with Mumwe Safaris! Your "${enriched.package_title}" expedition is complete.`;
      } else if (status === 'CANCELLED') {
        title = 'Safari Booking Cancelled';
        msg = `Your booking for "${enriched.package_title}" has been cancelled.`;
      }

      NotificationService.createNotification({
        userId: booking.customer_id,
        title,
        message: msg,
        type: 'SYSTEM',
        metadata: { bookingId, status },
      }).catch(() => {});
    }
    broadcastToFleet(payload, 'tour:booking_updated');

    return enriched;
  }
}
