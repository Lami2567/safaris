import fs from 'fs';
import path from 'path';
import { localStore, db } from '../../config/database';
import { v4 as uuidv4 } from 'uuid';
import { emitToUser, broadcastToFleet } from '../../realtime/socket_server';
import { NotificationService } from '../notification/notification.service';

export interface CreateBookingRequest {
  customerId: string;
  destinationId?: string;
  packageId?: string;
  tourGuideId?: string;
  travelDate: string;
  guestsCount: number;
  specialRequests?: string;
  totalUgx: number;
  paymentMethod: string;
}

const PERSISTENT_DESTINATIONS_FILES = [
  path.resolve(__dirname, '../../database/persistent_destinations.json'),
  path.resolve(process.cwd(), 'src/database/persistent_destinations.json'),
  path.resolve(process.cwd(), 'backend/src/database/persistent_destinations.json'),
  path.resolve(process.cwd(), 'persistent_destinations.json'),
];

const PERSISTENT_PACKAGES_FILES = [
  path.resolve(__dirname, '../../database/persistent_packages.json'),
  path.resolve(process.cwd(), 'src/database/persistent_packages.json'),
  path.resolve(process.cwd(), 'backend/src/database/persistent_packages.json'),
  path.resolve(process.cwd(), 'persistent_packages.json'),
];

export class TourismService {
  private static isInitialized = false;

  /**
   * Initializes persistent destinations and packages from PostgreSQL (if connected)
   * or from the persistent JSON files on disk.
   */
  public static async init(): Promise<void> {
    if (this.isInitialized) return;

    // 1. Try loading from persistent disk files first
    this.loadFromDisk();

    // 2. If PostgreSQL is connected, load latest from database tables
    if (db.isPostgresConnected) {
      try {
        const destRes = await db.query('SELECT * FROM destinations ORDER BY created_at ASC');
        if (destRes && destRes.rows && destRes.rows.length > 0) {
          for (const row of destRes.rows) {
            const id = row.id;
            const name = row.name || row.title || 'Uganda Destination';
            const img = row.image_url || row.image_placeholder || '';
            localStore.destinations.set(id, {
              id,
              name,
              title: name,
              subtitle: row.subtitle || '',
              category: row.category || 'national_park',
              region: row.region || 'Uganda',
              description: row.description || '',
              highlights: Array.isArray(row.highlights) ? row.highlights : [],
              activities: Array.isArray(row.activities) ? row.activities : [],
              best_time_to_visit: row.best_time_to_visit || 'Year-round',
              distance_hours_from_kampala: Number(row.distance_hours_from_kampala || 4),
              distanceFromKampala: `${row.distance_hours_from_kampala || 4} hours`,
              hero_tag: row.hero_tag || 'SAFARI',
              imageUrl: img,
              image_placeholder: img,
              latitude: Number(row.latitude ?? row.lat ?? 0.3136),
              longitude: Number(row.longitude ?? row.lng ?? 32.5811),
              rating: Number(row.rating || 4.8),
              isPopular: row.is_popular !== false,
              is_active: row.is_active !== false,
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
          }
          console.log(`🏞️ [TourismService] Loaded ${destRes.rows.length} destinations from PostgreSQL.`);
        }

        const pkgRes = await db.query('SELECT * FROM tour_packages ORDER BY created_at ASC');
        if (pkgRes && pkgRes.rows && pkgRes.rows.length > 0) {
          for (const row of pkgRes.rows) {
            const id = row.id;
            const img = row.image_url || row.image_placeholder || '';
            localStore.tour_packages.set(id, {
              id,
              destination_id: row.destination_id || '',
              title: row.title || 'Tour Package',
              duration_days: Number(row.duration_days || 1),
              price_per_person_ugx: Number(row.price_per_person_ugx || 100000),
              group_type: row.group_type || 'Daily Group',
              inclusions: Array.isArray(row.inclusions) ? row.inclusions : [],
              itinerary_summary: Array.isArray(row.itinerary_summary) ? row.itinerary_summary : [],
              imageUrl: img,
              image_placeholder: img,
              is_active: row.is_active !== false,
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
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
                localStore.destinations.set(d.id, d);
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
                localStore.tour_packages.set(p.id, p);
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

  public static getAllDestinations() {
    return Array.from(localStore.destinations.values());
  }

  public static getDestinationById(id: string) {
    const dest = localStore.destinations.get(id);
    if (!dest) throw new Error('Destination not found.');
    return dest;
  }

  public static getPackagesByDestination(destinationId: string) {
    const packages = Array.from(localStore.tour_packages.values()).filter(
      (p: any) => p.destination_id === destinationId
    );
    return packages;
  }

  public static getAllPackages() {
    return Array.from(localStore.tour_packages.values());
  }

  public static getPackageById(id: string) {
    const pkg = localStore.tour_packages.get(id);
    if (!pkg) throw new Error('Tour package not found.');
    return pkg;
  }

  public static createBooking(data: CreateBookingRequest) {
    if (data.tourGuideId) {
      const guide = localStore.tour_guides.get(data.tourGuideId);
      if (!guide || !guide.is_approved || guide.approval_status !== 'APPROVED') {
        throw new Error('Selected tour guide is not approved for active expeditions.');
      }
    }

    const bookingId = `tb_${uuidv4().substring(0, 8)}`;
    const nowIso = new Date().toISOString();
    const initialStatus = data.tourGuideId ? 'CONFIRMED' : 'PENDING_PAYMENT';
    const newBooking: any = {
      id: bookingId,
      customer_id: data.customerId,
      destination_id: data.destinationId || null,
      package_id: data.packageId || null,
      tour_guide_id: data.tourGuideId || null,
      guide_id: data.tourGuideId || null,
      booking_status: initialStatus,
      status: initialStatus,
      travel_date: data.travelDate || nowIso.slice(0, 10),
      start_date: data.travelDate || nowIso.slice(0, 10),
      guests_count: Number(data.guestsCount || 1),
      travelers_count: Number(data.guestsCount || 1),
      total_ugx: Number(data.totalUgx || 0),
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
  // Admin CRUD for Destinations (Fully Permanent)
  // -----------------------------------------------------------
  public static async createDestination(data: any) {
    const id = data.id || `dest_${uuidv4().substring(0, 8)}`;
    const name = data.name || data.title || 'New Destination';
    const img = data.imageUrl || data.image_placeholder || '';
    const lat = data.latitude !== undefined ? Number(data.latitude) : (data.lat !== undefined ? Number(data.lat) : 0.3136);
    const lng = data.longitude !== undefined ? Number(data.longitude) : (data.lng !== undefined ? Number(data.lng) : 32.5811);
    const destination = {
      id,
      name,
      title: name,
      subtitle: data.subtitle || data.category || '',
      category: data.category || 'national_park',
      region: data.region || 'Uganda',
      description: data.description || '',
      highlights: Array.isArray(data.highlights) ? data.highlights : (data.highlights ? data.highlights.split(',').map((h: string) => h.trim()) : []),
      activities: Array.isArray(data.activities) ? data.activities : (data.activities ? data.activities.split(',').map((a: string) => a.trim()) : []),
      best_time_to_visit: data.best_time_to_visit || data.bestTimeToVisit || 'Year-round',
      distance_hours_from_kampala: Number(data.distance_hours_from_kampala || data.distanceHoursFromKampala || 4),
      distanceFromKampala: data.distanceFromKampala || `${data.distance_hours_from_kampala || 4} hours`,
      hero_tag: data.hero_tag || data.heroTag || 'EXPEDITION',
      image_placeholder: img,
      imageUrl: img,
      latitude: lat,
      longitude: lng,
      rating: Number(data.rating || 4.8),
      isPopular: data.isPopular !== false,
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.destinations.set(id, destination);

    // Persist to PostgreSQL
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO destinations (
             id, name, title, subtitle, region, description, highlights, best_time_to_visit,
             distance_hours_from_kampala, hero_tag, image_url, image_placeholder, category, rating, is_popular, is_active, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             title = EXCLUDED.title,
             subtitle = EXCLUDED.subtitle,
             region = EXCLUDED.region,
             description = EXCLUDED.description,
             highlights = EXCLUDED.highlights,
             best_time_to_visit = EXCLUDED.best_time_to_visit,
             distance_hours_from_kampala = EXCLUDED.distance_hours_from_kampala,
             hero_tag = EXCLUDED.hero_tag,
             image_url = EXCLUDED.image_url,
             image_placeholder = EXCLUDED.image_placeholder,
             category = EXCLUDED.category,
             rating = EXCLUDED.rating,
             is_popular = EXCLUDED.is_popular,
             is_active = EXCLUDED.is_active,
             updated_at = CURRENT_TIMESTAMP`,
          [
            destination.id,
            destination.name,
            destination.title,
            destination.subtitle,
            destination.region,
            destination.description,
            destination.highlights,
            destination.best_time_to_visit,
            destination.distance_hours_from_kampala,
            destination.hero_tag,
            destination.imageUrl,
            destination.image_placeholder,
            destination.category,
            destination.rating,
            destination.isPopular,
            destination.is_active,
          ]
        );
      } catch (err) {
        console.error('[TourismService] PostgreSQL insert error:', err);
      }
    }

    this.saveToDisk();
    return destination;
  }

  public static async updateDestination(id: string, data: any) {
    const existing = localStore.destinations.get(id);
    if (!existing) throw new Error('Destination not found.');

    const name = data.name || data.title || existing.name || existing.title;
    const img = data.imageUrl !== undefined ? data.imageUrl : (data.image_placeholder !== undefined ? data.image_placeholder : existing.imageUrl);
    const lat = data.latitude !== undefined ? Number(data.latitude) : (data.lat !== undefined ? Number(data.lat) : (existing.latitude ?? 0.3136));
    const lng = data.longitude !== undefined ? Number(data.longitude) : (data.lng !== undefined ? Number(data.lng) : (existing.longitude ?? 32.5811));

    const updated = {
      ...existing,
      ...data,
      name,
      title: name,
      imageUrl: img,
      image_placeholder: img,
      latitude: lat,
      longitude: lng,
      highlights: data.highlights !== undefined
        ? (Array.isArray(data.highlights) ? data.highlights : data.highlights.split(',').map((h: string) => h.trim()))
        : (existing.highlights || []),
      activities: data.activities !== undefined
        ? (Array.isArray(data.activities) ? data.activities : data.activities.split(',').map((a: string) => a.trim()))
        : (existing.activities || []),
      best_time_to_visit: data.best_time_to_visit || data.bestTimeToVisit || existing.best_time_to_visit || 'Year-round',
      updated_at: new Date().toISOString(),
    };

    localStore.destinations.set(id, updated);

    // Persist to PostgreSQL
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO destinations (
             id, name, title, subtitle, region, description, highlights, best_time_to_visit,
             distance_hours_from_kampala, hero_tag, image_url, image_placeholder, category, rating, is_popular, is_active, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             title = EXCLUDED.title,
             subtitle = EXCLUDED.subtitle,
             region = EXCLUDED.region,
             description = EXCLUDED.description,
             highlights = EXCLUDED.highlights,
             best_time_to_visit = EXCLUDED.best_time_to_visit,
             distance_hours_from_kampala = EXCLUDED.distance_hours_from_kampala,
             hero_tag = EXCLUDED.hero_tag,
             image_url = EXCLUDED.image_url,
             image_placeholder = EXCLUDED.image_placeholder,
             category = EXCLUDED.category,
             rating = EXCLUDED.rating,
             is_popular = EXCLUDED.is_popular,
             is_active = EXCLUDED.is_active,
             updated_at = CURRENT_TIMESTAMP`,
          [
            updated.id,
            updated.name,
            updated.title,
            updated.subtitle || '',
            updated.region || 'Uganda',
            updated.description || '',
            updated.highlights || [],
            updated.best_time_to_visit || 'Year-round',
            Number(updated.distance_hours_from_kampala || 4),
            updated.hero_tag || 'EXPEDITION',
            updated.imageUrl || '',
            updated.image_placeholder || '',
            updated.category || 'national_park',
            Number(updated.rating || 4.8),
            updated.isPopular !== false,
            updated.is_active !== false,
          ]
        );
      } catch (err) {
        console.error('[TourismService] PostgreSQL update error:', err);
      }
    }

    this.saveToDisk();
    return updated;
  }

  public static async deleteDestination(id: string) {
    if (!localStore.destinations.has(id)) throw new Error('Destination not found.');
    localStore.destinations.delete(id);

    // Also remove associated packages
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
    return { success: true, id };
  }

  // -----------------------------------------------------------
  // Admin CRUD for Tour Packages (Fully Permanent)
  // -----------------------------------------------------------
  public static async createPackage(data: any) {
    const id = data.id || `pkg_${uuidv4().substring(0, 8)}`;
    const img = data.imageUrl || data.image_placeholder || '';
    const pkg = {
      id,
      destination_id: data.destination_id || data.destinationId || '',
      title: data.title || 'New Tour Package',
      duration_days: Number(data.duration_days || data.durationDays || 1),
      price_per_person_ugx: Number(data.price_per_person_ugx || data.pricePerPersonUgx || 100000),
      group_type: data.group_type || data.groupType || 'Daily Group',
      inclusions: Array.isArray(data.inclusions) ? data.inclusions : (data.inclusions ? data.inclusions.split(',').map((i: string) => i.trim()) : []),
      itinerary_summary: Array.isArray(data.itinerary_summary) ? data.itinerary_summary : (data.itinerary_summary ? data.itinerary_summary.split('\n').map((s: string) => s.trim()) : []),
      image_placeholder: img,
      imageUrl: img,
      is_active: data.is_active !== false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    localStore.tour_packages.set(id, pkg);

    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO tour_packages (
             id, destination_id, title, duration_days, price_per_person_ugx, group_type,
             inclusions, itinerary_summary, image_url, image_placeholder, is_active, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             destination_id = EXCLUDED.destination_id,
             title = EXCLUDED.title,
             duration_days = EXCLUDED.duration_days,
             price_per_person_ugx = EXCLUDED.price_per_person_ugx,
             group_type = EXCLUDED.group_type,
             inclusions = EXCLUDED.inclusions,
             itinerary_summary = EXCLUDED.itinerary_summary,
             image_url = EXCLUDED.image_url,
             image_placeholder = EXCLUDED.image_placeholder,
             is_active = EXCLUDED.is_active,
             updated_at = CURRENT_TIMESTAMP`,
          [
            pkg.id,
            pkg.destination_id,
            pkg.title,
            pkg.duration_days,
            pkg.price_per_person_ugx,
            pkg.group_type,
            pkg.inclusions,
            pkg.itinerary_summary,
            pkg.imageUrl,
            pkg.image_placeholder,
            pkg.is_active,
          ]
        );
      } catch (err) {
        console.error('[TourismService] PostgreSQL package insert error:', err);
      }
    }

    this.saveToDisk();
    return pkg;
  }

  public static async updatePackage(id: string, data: any) {
    const existing = localStore.tour_packages.get(id);
    if (!existing) throw new Error('Tour package not found.');

    const img = data.imageUrl !== undefined ? data.imageUrl : (data.image_placeholder !== undefined ? data.image_placeholder : existing.imageUrl);
    const rawPrice = data.price_per_person_ugx !== undefined ? data.price_per_person_ugx : (data.priceUgx !== undefined ? data.priceUgx : existing.price_per_person_ugx);
    const rawDuration = data.duration_days !== undefined ? data.duration_days : (data.durationDays !== undefined ? data.durationDays : existing.duration_days);

    const updated = {
      ...existing,
      ...data,
      imageUrl: img,
      image_placeholder: img,
      price_per_person_ugx: Number(rawPrice),
      duration_days: Number(rawDuration),
      inclusions: data.inclusions !== undefined
        ? (Array.isArray(data.inclusions) ? data.inclusions : data.inclusions.split('\n').map((i: string) => i.trim()).filter(Boolean))
        : existing.inclusions,
      itinerary_summary: data.itinerary_summary !== undefined
        ? (Array.isArray(data.itinerary_summary) ? data.itinerary_summary : data.itinerary_summary.split('\n').map((s: string) => s.trim()).filter(Boolean))
        : (data.itinerarySummary !== undefined
          ? (Array.isArray(data.itinerarySummary) ? data.itinerarySummary : data.itinerarySummary.split('\n').map((s: string) => s.trim()).filter(Boolean))
          : existing.itinerary_summary),
      updated_at: new Date().toISOString(),
    };

    localStore.tour_packages.set(id, updated);

    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO tour_packages (
             id, destination_id, title, duration_days, price_per_person_ugx, group_type,
             inclusions, itinerary_summary, image_url, image_placeholder, is_active, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, CURRENT_TIMESTAMP)
           ON CONFLICT (id) DO UPDATE SET
             destination_id = EXCLUDED.destination_id,
             title = EXCLUDED.title,
             duration_days = EXCLUDED.duration_days,
             price_per_person_ugx = EXCLUDED.price_per_person_ugx,
             group_type = EXCLUDED.group_type,
             inclusions = EXCLUDED.inclusions,
             itinerary_summary = EXCLUDED.itinerary_summary,
             image_url = EXCLUDED.image_url,
             image_placeholder = EXCLUDED.image_placeholder,
             is_active = EXCLUDED.is_active,
             updated_at = CURRENT_TIMESTAMP`,
          [
            updated.id,
            updated.destination_id,
            updated.title,
            updated.duration_days,
            updated.price_per_person_ugx,
            updated.group_type,
            updated.inclusions,
            updated.itinerary_summary,
            updated.imageUrl,
            updated.image_placeholder,
            updated.is_active,
          ]
        );
      } catch (err) {
        console.error('[TourismService] PostgreSQL package update error:', err);
      }
    }

    this.saveToDisk();
    return updated;
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

    // Persist notifications for both guide and customer
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

    // Authorization check for non-admin callers
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
