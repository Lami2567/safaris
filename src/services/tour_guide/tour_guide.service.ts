import fs from 'fs';
import path from 'path';
import { localStore, db } from '../../config/database';
import { broadcastToFleet, emitToUser } from '../../realtime/socket_server';

const PERSISTENT_GUIDES_FILES = [
  path.resolve(__dirname, '../../database/persistent_tour_guides.json'),
  path.resolve(process.cwd(), 'src/database/persistent_tour_guides.json'),
  path.resolve(process.cwd(), 'backend/src/database/persistent_tour_guides.json'),
  path.resolve(process.cwd(), 'persistent_tour_guides.json'),
];

export class TourGuideService {
  private static isInitialized = false;

  /**
   * Initializes persistent tour guides from PostgreSQL (if connected)
   * or from the persistent JSON file on disk.
   */
  public static async init(): Promise<void> {
    if (this.isInitialized) return;

    if (db.isPostgresConnected) {
      try {
        localStore.tour_guides.clear();
        const res = await db.query(`
          SELECT tg.*, 
                 COALESCE(u.full_name, tg.full_name, 'Safari Guide') as full_name,
                 COALESCE(u.phone, '+256 700 000000') as phone,
                 COALESCE(tg.avatar_url, u.avatar_url, '') as avatar_url,
                 COALESCE(tg.rating, u.rating, 4.95) as rating
          FROM tour_guides tg
          LEFT JOIN users u ON tg.id = u.id
          ORDER BY tg.created_at ASC
        `);

        if (res && res.rows && res.rows.length > 0) {
          for (const row of res.rows) {
            const id = row.id;
            const fullName = row.full_name || 'Safari Guide';
            const avatarUrl = row.avatar_url || '';
            const rating = Number(row.rating || 4.95);

            localStore.tour_guides.set(id, {
              id,
              title: row.title || 'Uganda Wildlife Guide',
              bio: row.bio || '',
              languages: Array.isArray(row.languages) ? row.languages : ['English'],
              specialties: Array.isArray(row.specialties) ? row.specialties : ['Uganda Safaris'],
              daily_rate_ugx: Number(row.daily_rate_ugx || 150000),
              is_uwa_certified: row.is_uwa_certified !== false,
              is_available: row.is_available !== false,
              is_approved: row.is_approved === true,
              approval_status: row.approval_status || 'PENDING_APPROVAL',
              application_id: row.application_id || null,
              national_id: row.national_id || '',
              uwa_license_number: row.uwa_license_number || '',
              expeditions_count: Number(row.expeditions_count || 0),
              avatar_url: avatarUrl,
              full_name: fullName,
              rating,
              created_at: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
              updated_at: row.updated_at ? new Date(row.updated_at).toISOString() : new Date().toISOString(),
            });
          }
          console.log(`🧭 [TourGuideService] Loaded ${res.rows.length} tour guides from PostgreSQL.`);
        }
      } catch (err) {
        console.warn('[TourGuideService] Notice: PostgreSQL query error during init:', err);
      }
    } else {
      this.loadFromDisk();
    }

    this.saveToDisk();
    this.isInitialized = true;
  }

  private static loadFromDisk(): void {
    for (const f of PERSISTENT_GUIDES_FILES) {
      try {
        if (fs.existsSync(f)) {
          const raw = fs.readFileSync(f, 'utf-8');
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            for (const g of parsed) {
              if (g && g.id) {
                const id = g.id;
                const fullName = g.full_name || 'Safari Guide';
                const avatarUrl = g.avatar_url || '';
                const rating = Number(g.rating || 4.95);

                localStore.tour_guides.set(id, {
                  id,
                  title: g.title || 'Uganda Wildlife Guide',
                  bio: g.bio || '',
                  languages: Array.isArray(g.languages) ? g.languages : ['English'],
                  specialties: Array.isArray(g.specialties) ? g.specialties : ['Uganda Safaris'],
                  daily_rate_ugx: Number(g.daily_rate_ugx || 150000),
                  is_uwa_certified: g.is_uwa_certified !== false,
                  is_available: g.is_available !== false,
                  is_approved: g.is_approved === true,
                  approval_status: g.approval_status || 'PENDING_APPROVAL',
                  expeditions_count: Number(g.expeditions_count || 0),
                  avatar_url: avatarUrl,
                  full_name: fullName,
                  rating,
                  created_at: g.created_at || new Date().toISOString(),
                  updated_at: g.updated_at || new Date().toISOString(),
                });
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
      const guideList = Array.from(localStore.tour_guides.values());
      for (const f of PERSISTENT_GUIDES_FILES) {
        try {
          const dir = path.dirname(f);
          if (fs.existsSync(dir)) {
            fs.writeFileSync(f, JSON.stringify(guideList, null, 2), 'utf-8');
          }
        } catch (_) {}
      }
    } catch (_) {}
  }

  public static getAllGuides(specialization?: string) {
    const guides = Array.from(localStore.tour_guides.values()).filter(
      (g: any) => g.is_approved === true && g.approval_status === 'APPROVED'
    );
    const enriched = guides.map((guide: any) => {
      const user = localStore.users.get(guide.id);
      return {
        ...guide,
        full_name: user?.full_name || guide.full_name || 'Safari Guide',
        phone: user?.phone || guide.phone || '+256 772 000000',
        email: user?.email || guide.email || '',
        avatar_url: guide.avatar_url || user?.avatar_url || '',
        avatarUrl: guide.avatar_url || user?.avatar_url || '',
        rating: Number(user?.rating || guide.rating || 4.98),
      };
    });

    if (specialization && typeof specialization === 'string') {
      return enriched.filter((g: any) =>
        g.specialties?.some((s: string) => s && typeof s === 'string' && s.toLowerCase().includes(specialization.toLowerCase()))
      );
    }

    return enriched;
  }

  public static getGuideById(guideId: string) {
    const guide = localStore.tour_guides.get(guideId);
    if (!guide) throw new Error('Tour guide not found.');

    const user = localStore.users.get(guideId);
    return {
      ...guide,
      full_name: user?.full_name || guide.full_name || 'Safari Guide',
      phone: user?.phone || guide.phone || '+256 772 000000',
      email: user?.email || guide.email || '',
      avatar_url: guide.avatar_url || user?.avatar_url || '',
      avatarUrl: guide.avatar_url || user?.avatar_url || '',
      rating: Number(user?.rating || guide.rating || 4.98),
    };
  }

  public static toggleAvailability(guideId: string, isAvailable: boolean) {
    const guide = localStore.tour_guides.get(guideId);
    if (!guide) throw new Error('Tour guide profile not found.');

    if (!guide.is_approved || guide.approval_status !== 'APPROVED') {
      throw new Error(
        `Tour guide account is not approved for active operations (status: ${guide.approval_status || 'PENDING_APPROVAL'}).`
      );
    }

    guide.is_available = Boolean(isAvailable);
    guide.updated_at = new Date().toISOString();

    db.persistTourGuide(guide).catch((err) =>
      console.error('[TourGuideService.toggleAvailability persist error]', err)
    );

    const payload = {
      guideId,
      isAvailable: guide.is_available,
      approvalStatus: guide.approval_status,
      updatedAt: guide.updated_at,
    };
    emitToUser(guideId, 'guide:availability_updated', payload);
    broadcastToFleet(payload, 'guide:availability_updated');

    return guide;
  }

  public static getGuideDashboard(guideId: string) {
    const user = localStore.users.get(guideId);
    const guide = localStore.tour_guides.get(guideId);

    const isApproved = Boolean(guide?.is_approved && guide?.approval_status === 'APPROVED');
    const approvalStatus = guide?.approval_status || user?.approval_status || 'PENDING_APPROVAL';

    const assignedBookings: any[] = [];
    const completedBookings: any[] = [];
    let activeBooking: any = null;
    let totalEarningsUGX = 0;

    for (const b of localStore.tour_bookings.values()) {
      const assignedGuideId = b.tour_guide_id || b.guide_id || null;
      if (assignedGuideId !== guideId) continue;

      const dest = b.destination_id ? localStore.destinations.get(b.destination_id) : null;
      const pkg = b.package_id ? localStore.tour_packages.get(b.package_id) : null;
      const pkgDest = !dest && pkg?.destination_id ? localStore.destinations.get(pkg.destination_id) : dest;
      const customer = b.customer_id ? localStore.users.get(b.customer_id) : null;
      const status = b.booking_status || b.status || 'CONFIRMED';

      const enriched = {
        ...b,
        booking_status: status,
        status,
        travel_date: b.travel_date || b.start_date || new Date().toISOString().slice(0, 10),
        guests_count: Number(b.guests_count ?? b.travelers_count ?? 1),
        total_ugx: Number(b.total_ugx ?? 0),
        destination_title: pkgDest?.title || pkgDest?.name || 'Uganda Safari Expedition',
        destination_region: pkgDest?.region || 'Uganda',
        destination_lat: Number(pkgDest?.latitude ?? 0.3136),
        destination_lng: Number(pkgDest?.longitude ?? 32.5811),
        package_title: pkg?.title || 'Custom Guided Expedition',
        duration_days: Number(pkg?.duration_days ?? 1),
        inclusions: Array.isArray(pkg?.inclusions) ? pkg.inclusions : [],
        itinerary_summary: Array.isArray(pkg?.itinerary_summary) ? pkg.itinerary_summary : [],
        customer_name: customer?.full_name || 'Guest Explorer',
        customer_phone: customer?.phone || '',
        customer_email: customer?.email || '',
      };

      if (['COMPLETED', 'CANCELLED'].includes(status)) {
        completedBookings.push(enriched);
        if (status === 'COMPLETED') {
          totalEarningsUGX += Number(enriched.total_ugx || 0);
        }
      } else {
        assignedBookings.push(enriched);
        if (!activeBooking || status === 'IN_PROGRESS') {
          activeBooking = enriched;
        }
      }
    }

    assignedBookings.sort(
      (a, b) => new Date(a.travel_date || a.created_at).getTime() - new Date(b.travel_date || b.created_at).getTime()
    );
    completedBookings.sort(
      (a, b) => new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime()
    );

    const completedCount = completedBookings.filter((b) => b.booking_status === 'COMPLETED').length;

    return {
      guideId,
      name: user?.full_name || guide?.full_name || 'Tour Guide',
      email: user?.email || '',
      phone: user?.phone || '',
      title: guide?.title || 'Uganda Wildlife Guide',
      bio: guide?.bio || '',
      languages: Array.isArray(guide?.languages) ? guide.languages : ['English'],
      specialties: Array.isArray(guide?.specialties) ? guide.specialties : ['Uganda Safaris'],
      dailyRateUGX: Number(guide?.daily_rate_ugx ?? 150000),
      isUwaCertified: guide ? Boolean(guide.is_uwa_certified) : false,
      isAvailable: guide ? Boolean(guide.is_available && isApproved) : false,
      isApproved,
      approvalStatus,
      rating: Number(user?.rating ?? guide?.rating ?? 5.0),
      expeditionsCount: Math.max(Number(guide?.expeditions_count ?? 0), completedCount),
      completedToursCount: completedCount,
      totalEarningsUGX,
      walletBalanceUGX: Number(user?.wallet_balance_ugx ?? 0),
      activeBooking,
      assignedBookings,
      completedBookings,
    };
  }

  public static async createGuide(data: any) {
    const id = data.id || `usr_gd_${Date.now().toString().slice(-6)}`;
    const avatarUrl = data.avatar_url || data.avatarUrl || '';
    const fullName = data.full_name || data.fullName || 'Safari Specialist';
    const rating = Number(data.rating || 4.95);
    const phone = data.phone || '+256 700 000000';

    const user = {
      id,
      full_name: fullName,
      phone,
      email: data.email || `${id}@safaris.ug`,
      role: 'tour_guide',
      avatar_url: avatarUrl,
      rating,
      total_trips: Number(data.total_trips || data.expeditions_count || 0),
      is_verified: data.is_uwa_certified !== false,
      created_at: new Date().toISOString(),
    };
    localStore.users.set(id, user);

    const guideProfile = {
      id,
      title: data.title || 'Uganda Wildlife Guide',
      bio: data.bio || '',
      languages: Array.isArray(data.languages) ? data.languages : (data.languages ? data.languages.split(',').map((l: string) => l.trim()) : ['English']),
      specialties: Array.isArray(data.specialties) ? data.specialties : (data.specialties ? data.specialties.split(',').map((s: string) => s.trim()) : ['Uganda Safaris']),
      daily_rate_ugx: Number(data.daily_rate_ugx || data.dailyRateUgx || 150000),
      is_uwa_certified: data.is_uwa_certified !== false,
      is_available: data.is_available !== false,
      expeditions_count: Number(data.expeditions_count || data.expeditionsCount || 0),
      avatar_url: avatarUrl,
      full_name: fullName,
      rating,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localStore.tour_guides.set(id, guideProfile);

    if (db.isPostgresConnected) {
      try {
        await db.query(`
          INSERT INTO users (id, full_name, phone, email, password_hash, role, avatar_url, rating, total_trips, is_verified)
          VALUES ($1, $2, $3, $4, '$2a$10$wVb7P3m6a0c0o.NnB0xWd.Xk/t2/b61R578kZ1sHqN1R31q123456', 'tour_guide', $5, $6, $7, $8)
          ON CONFLICT (id) DO UPDATE SET
            full_name = EXCLUDED.full_name,
            phone = EXCLUDED.phone,
            avatar_url = EXCLUDED.avatar_url,
            rating = EXCLUDED.rating
        `, [id, fullName, phone, user.email, avatarUrl, rating, user.total_trips, user.is_verified]);

        await db.query(`
          INSERT INTO tour_guides (
            id, title, bio, languages, specialties, daily_rate_ugx, is_uwa_certified, is_available, expeditions_count, avatar_url, full_name, rating, updated_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, CURRENT_TIMESTAMP)
          ON CONFLICT (id) DO UPDATE SET
            title = EXCLUDED.title,
            bio = EXCLUDED.bio,
            languages = EXCLUDED.languages,
            specialties = EXCLUDED.specialties,
            daily_rate_ugx = EXCLUDED.daily_rate_ugx,
            is_uwa_certified = EXCLUDED.is_uwa_certified,
            is_available = EXCLUDED.is_available,
            expeditions_count = EXCLUDED.expeditions_count,
            avatar_url = EXCLUDED.avatar_url,
            full_name = EXCLUDED.full_name,
            rating = EXCLUDED.rating,
            updated_at = CURRENT_TIMESTAMP
        `, [
          id,
          guideProfile.title,
          guideProfile.bio,
          guideProfile.languages,
          guideProfile.specialties,
          guideProfile.daily_rate_ugx,
          guideProfile.is_uwa_certified,
          guideProfile.is_available,
          guideProfile.expeditions_count,
          avatarUrl,
          fullName,
          rating,
        ]);
      } catch (err) {
        console.error('[TourGuideService] PostgreSQL createGuide error:', err);
      }
    }

    this.saveToDisk();

    return {
      ...guideProfile,
      full_name: user.full_name,
      phone: user.phone,
      avatar_url: avatarUrl,
      avatarUrl,
      rating: user.rating,
    };
  }

  public static async updateGuide(id: string, data: any) {
    const guide = localStore.tour_guides.get(id);
    if (!guide) throw new Error('Tour guide not found.');

    const user = localStore.users.get(id) || { id, full_name: 'Safari Guide', phone: '+256 700 000000', email: `${id}@safaris.ug`, is_verified: true, rating: 4.95, avatar_url: '' };
    if (data.full_name) user.full_name = data.full_name;
    if (data.fullName) user.full_name = data.fullName;
    if (data.phone) user.phone = data.phone;
    if (data.avatar_url !== undefined) user.avatar_url = data.avatar_url;
    if (data.avatarUrl !== undefined) user.avatar_url = data.avatarUrl;
    if (data.rating !== undefined) user.rating = Number(data.rating);
    localStore.users.set(id, user);

    const updatedGuide = {
      ...guide,
      title: data.title !== undefined ? data.title : guide.title,
      bio: data.bio !== undefined ? data.bio : guide.bio,
      languages: data.languages !== undefined
        ? (Array.isArray(data.languages) ? data.languages : data.languages.split(',').map((l: string) => l.trim()))
        : guide.languages,
      specialties: data.specialties !== undefined
        ? (Array.isArray(data.specialties) ? data.specialties : data.specialties.split(',').map((s: string) => s.trim()))
        : guide.specialties,
      daily_rate_ugx: data.daily_rate_ugx !== undefined ? Number(data.daily_rate_ugx) : (data.dailyRateUgx !== undefined ? Number(data.dailyRateUgx) : guide.daily_rate_ugx),
      is_uwa_certified: data.is_uwa_certified !== undefined ? Boolean(data.is_uwa_certified) : guide.is_uwa_certified,
      is_available: data.is_available !== undefined ? Boolean(data.is_available) : guide.is_available,
      expeditions_count: data.expeditions_count !== undefined ? Number(data.expeditions_count) : guide.expeditions_count,
      avatar_url: user.avatar_url || guide.avatar_url || '',
      full_name: user.full_name || guide.full_name || '',
      rating: user.rating || guide.rating || 4.95,
      updated_at: new Date().toISOString(),
    };
    localStore.tour_guides.set(id, updatedGuide);

    if (db.isPostgresConnected) {
      try {
        await db.query(`
          UPDATE users 
          SET full_name = $1, phone = $2, avatar_url = $3, rating = $4
          WHERE id = $5
        `, [user.full_name, user.phone, user.avatar_url, user.rating, id]);

        await db.query(`
          UPDATE tour_guides
          SET title = $1, bio = $2, languages = $3, specialties = $4, daily_rate_ugx = $5,
              is_uwa_certified = $6, is_available = $7, expeditions_count = $8, avatar_url = $9,
              full_name = $10, rating = $11, updated_at = CURRENT_TIMESTAMP
          WHERE id = $12
        `, [
          updatedGuide.title,
          updatedGuide.bio,
          updatedGuide.languages,
          updatedGuide.specialties,
          updatedGuide.daily_rate_ugx,
          updatedGuide.is_uwa_certified,
          updatedGuide.is_available,
          updatedGuide.expeditions_count,
          updatedGuide.avatar_url,
          updatedGuide.full_name,
          updatedGuide.rating,
          id,
        ]);
      } catch (err) {
        console.error('[TourGuideService] PostgreSQL updateGuide error:', err);
      }
    }

    this.saveToDisk();

    return {
      ...updatedGuide,
      full_name: user?.full_name || 'Safari Guide',
      phone: user?.phone || '+256 700 000000',
      avatar_url: user?.avatar_url || '',
      avatarUrl: user?.avatar_url || '',
      rating: user?.rating || 4.98,
    };
  }

  public static async deleteGuide(id: string) {
    if (!localStore.tour_guides.has(id)) throw new Error('Tour guide not found.');
    localStore.tour_guides.delete(id);

    if (db.isPostgresConnected) {
      try {
        await db.query('DELETE FROM tour_guides WHERE id = $1', [id]);
      } catch (err) {
        console.error('[TourGuideService] PostgreSQL deleteGuide error:', err);
      }
    }

    this.saveToDisk();
    return { success: true, id };
  }
}
