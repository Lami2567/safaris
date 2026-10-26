import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { localStore, db } from '../../config/database';
import { NotificationService } from '../notification/notification.service';
import { AuthService } from '../auth/auth.service';
import { EmailService } from '../email/email.service';
import { StorageService } from '../storage/storage.service';
import { normalizeUgandaPhone } from '../../shared/phone';
import { emitToUser, broadcastToFleet, broadcastDriverSnapshot } from '../../realtime/socket_server';

export interface CareerApplicationData {
  applicant_type: 'driver' | 'tour_guide';
  full_name: string;
  email: string;
  phone: string;
  national_id?: string;
  license_number?: string;
  experience_years?: number;
  vehicle_make?: string;
  vehicle_model?: string;
  vehicle_plate?: string;
  vehicle_tier?: string;
  languages?: string[];
  specialties?: string[];
  documents?: Record<string, string>;
}

export class CareerService {
  private static testStatusTokens = new Map<string, { applicationId: string; expiresAt: number }>();
  /**
   * Submit an application from careers.mumwesafarisuganda.com
   */
  public static async submitApplication(data: CareerApplicationData): Promise<any> {
    const applicantType = data.applicant_type;
    if (!applicantType || (applicantType !== 'driver' && applicantType !== 'tour_guide')) {
      throw new Error("Invalid applicant type. Must be 'driver' or 'tour_guide'.");
    }

    if (!data.full_name?.trim()) throw new Error('Full name is required.');
    if (!data.email?.trim()) throw new Error('Email address is required.');
    if (!data.phone?.trim()) throw new Error('Phone number is required.');

    const cleanEmail = data.email.trim().toLowerCase();
    const cleanPhone = normalizeUgandaPhone(data.phone.trim());
    if (db.isPostgresConnected) {
      const existing = await db.query('SELECT id FROM users WHERE LOWER(email) = $1 OR phone = $2', [cleanEmail, cleanPhone]);
      if (existing.rows.length) throw new Error('An account with this email or phone already exists. Please sign in or contact support.');
    }
    const applicationId = `app_${uuidv4().substring(0, 8)}`;

    // Normalize any base64 documents into Cloudflare R2 URLs if R2 is configured
    const normalizedDocs: Record<string, string> = {};
    if (JSON.stringify(data.documents || {}).length > 28 * 1024 * 1024) throw new Error('Recruitment attachments exceed 20 MiB combined limit.');
    if (data.documents && typeof data.documents === 'object') {
      for (const [docKey, docVal] of Object.entries(data.documents)) {
        if (typeof docVal === 'string' && docVal.startsWith('data:')) {
          try {
            const mimeMatch = docVal.match(/^data:([^;]+);base64,/);
            const fileType = mimeMatch ? mimeMatch[1] : 'application/pdf';
            const ext = fileType.includes('pdf') ? 'pdf' : fileType.includes('png') ? 'png' : 'jpg';
            const uploaded = await StorageService.uploadDirectToR2({
              fileName: `${applicationId}_${docKey}.${ext}`,
              fileType,
              folder: 'careers',
              base64Data: docVal,
            });
            normalizedDocs[docKey] = uploaded.key;
          } catch (err) {
            console.warn(`[CareerService] Fallback storing raw document for ${docKey}:`, err);
            throw new Error('Recruitment document upload failed. Please submit a valid supported file.');
          }
        } else if (docVal) {
          throw new Error('Submit document bytes, not an external URL or an existing object key.');
        }
      }
    }
    data.documents = normalizedDocs;

    // Check if an application already exists with this email or phone in pending status
    for (const existing of localStore.career_applications.values()) {
      if (
        existing.status === 'PENDING_APPROVAL' &&
        (existing.email?.toLowerCase() === cleanEmail || existing.phone === cleanPhone)
      ) {
        throw new Error('An active recruitment application is already under review for this email/phone.');
      }
    }

    // Resolve or create user account
    let userId = `usr_${applicantType === 'driver' ? 'drv' : 'gd'}_${uuidv4().substring(0, 8)}`;
    for (const u of localStore.users.values()) {
      if (u.email?.toLowerCase() === cleanEmail || u.phone === cleanPhone) {
        throw new Error('An account with this email or phone already exists. Please sign in or contact support.');
      }
    }

    const defaultPasswordHash = await bcrypt.hash(crypto.randomBytes(32).toString('hex'), 10);
    const user = {
      id: userId,
      full_name: data.full_name.trim(),
      phone: cleanPhone,
      email: cleanEmail,
      password_hash: defaultPasswordHash,
      role: applicantType,
      avatar_url: data.documents?.avatar || '',
      rating: 5.0,
      total_trips: 0,
      wallet_balance_ugx: 0,
      is_verified: false,
      approval_status: 'PENDING_APPROVAL',
      application_id: applicationId,
      password_changed_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    };
    await db.persistUser(user);

    // If driver: register driver profile and optional vehicle
    if (applicantType === 'driver') {
      let vehicleId: string | null = null;
      if (data.vehicle_plate?.trim()) {
        vehicleId = `veh_${uuidv4().substring(0, 6)}`;
        const vehicle = {
          id: vehicleId,
          driver_id: userId,
          tier: data.vehicle_tier || 'go',
          make: data.vehicle_make || 'Toyota',
          model: data.vehicle_model || 'Corolla',
          color: 'White',
          registration_plate: data.vehicle_plate.trim().toUpperCase(),
          capacity: 4,
          status: 'active',
          created_at: new Date().toISOString(),
        };
        await db.persistVehicle(vehicle);
      }

      const driverProfile = {
        id: userId,
        vehicle_id: vehicleId,
        is_online: false,
        is_available: false,
        is_approved: false,
        approval_status: 'PENDING_APPROVAL',
        current_lat: 0.3136,
        current_lng: 32.5811,
        heading: 0,
        speed: 0,
        license_number: data.license_number || 'UG-PENDING',
        national_id: data.national_id || '',
        driving_permit_number: data.license_number || '',
        years_of_experience: Number(data.experience_years || 0),
        acceptance_rate: 100.0,
        today_earnings_ugx: 0,
        application_date: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.persistDriver(driverProfile);
    }

    // If tour guide: register tour guide profile
    if (applicantType === 'tour_guide') {
      const guideProfile = {
        id: userId,
        title: 'Uganda Wildlife & Cultural Guide',
        bio: `Professional guide with ${data.experience_years || 2}+ years experience.`,
        languages: Array.isArray(data.languages) && data.languages.length > 0 ? data.languages : ['English', 'Luganda'],
        specialties: Array.isArray(data.specialties) && data.specialties.length > 0 ? data.specialties : ['Uganda Safaris', 'Gorilla Trekking'],
        daily_rate_ugx: 150000,
        is_uwa_certified: Boolean(data.license_number),
        is_available: false,
        is_approved: false,
        approval_status: 'PENDING_APPROVAL',
        application_id: applicationId,
        national_id: data.national_id || '',
        uwa_license_number: data.license_number || '',
        expeditions_count: 0,
        avatar_url: data.documents?.avatar || '',
        full_name: data.full_name.trim(),
        rating: 5.0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      await db.persistTourGuide(guideProfile);
    }

    // Record the career application
    const application = {
      id: applicationId,
      applicant_type: applicantType,
      user_id: userId,
      full_name: data.full_name.trim(),
      email: cleanEmail,
      phone: cleanPhone,
      national_id: data.national_id || '',
      license_number: data.license_number || '',
      experience_years: Number(data.experience_years || 0),
      vehicle_make: data.vehicle_make || '',
      vehicle_model: data.vehicle_model || '',
      vehicle_plate: data.vehicle_plate ? data.vehicle_plate.toUpperCase().trim() : '',
      vehicle_tier: data.vehicle_tier || '',
      languages: data.languages || ['English'],
      specialties: data.specialties || ['Uganda Safaris'],
      documents: data.documents || {},
      status: 'PENDING_APPROVAL',
      rejection_reason: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    await db.persistCareerApplication(application);
    await this.requestStatusLink(cleanEmail).catch(() => console.warn('[Careers] Status link delivery unavailable.'));

    return {
      success: true,
      applicationId,
      userId,
      status: 'PENDING_APPROVAL',
      message: 'Application successfully received. Mumwe Safaris recruitment team will verify your credentials shortly.',
    };
  }

  /**
   * Retrieve career applications for admin review
   */
  public static async getApplications(filter?: { status?: string; applicant_type?: string }): Promise<any[]> {
    let apps = Array.from(localStore.career_applications.values());

    if (filter?.status && filter.status !== 'all') {
      apps = apps.filter((a) => a.status === filter.status);
    }

    if (filter?.applicant_type && filter.applicant_type !== 'all') {
      apps = apps.filter((a) => a.applicant_type === filter.applicant_type);
    }

    // Enrich with user / driver / guide information
    const enriched = apps.map((app) => {
      const user = app.user_id ? localStore.users.get(app.user_id) : null;
      const driver = app.user_id ? localStore.drivers.get(app.user_id) : null;
      const guide = app.user_id ? localStore.tour_guides.get(app.user_id) : null;
      const vehicle = driver?.vehicle_id ? localStore.vehicles.get(driver.vehicle_id) : null;

      return {
        ...app,
        avatar_url: user?.avatar_url || '',
        user_rating: user?.rating || 5.0,
        vehicle_details: vehicle
          ? {
              make: vehicle.make,
              model: vehicle.model,
              plate: vehicle.registration_plate,
              tier: vehicle.tier,
            }
          : null,
        driver_details: driver
          ? {
              is_online: driver.is_online,
              is_available: driver.is_available,
              is_approved: driver.is_approved,
              approval_status: driver.approval_status,
              current_lat: driver.current_lat,
              current_lng: driver.current_lng,
            }
          : null,
        guide_details: guide
          ? {
              is_available: guide.is_available,
              is_approved: guide.is_approved,
              approval_status: guide.approval_status,
              specialties: guide.specialties,
            }
          : null,
      };
    });

    enriched.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    return enriched;
  }

  /**
   * Admin approves a driver or tour guide application
   */
  public static async approveApplication(applicationId: string, adminId: string, adminIp?: string): Promise<any> {
    const app = localStore.career_applications.get(applicationId);
    if (!app) throw new Error(`Application ${applicationId} not found.`);

    app.status = 'APPROVED';
    app.reviewed_by = adminId;
    app.reviewed_at = new Date().toISOString();
    app.updated_at = new Date().toISOString();
    await db.persistCareerApplication(app);

    const userId = app.user_id;
    let generatedOtp: string | null = null;
    if (userId) {
      // 1. Update user
      const user = localStore.users.get(userId);
      if (user) {
        user.approval_status = 'APPROVED';
        user.is_verified = true;
        await db.updateUserSecurity(user.id, { approval_status: user.approval_status, is_verified: user.is_verified });
      }

      // 2. Update driver if driver (or reconstruct if missing)
      if (app.applicant_type === 'driver') {
        let driver = localStore.drivers.get(userId);
        let vehicleId: string | null = driver?.vehicle_id || null;
        if (!vehicleId && app.vehicle_plate) {
          vehicleId = `veh_${userId.replace(/^usr_/, '')}`;
          const vehicle = {
            id: vehicleId,
            driver_id: userId,
            tier: app.vehicle_tier || 'go',
            make: app.vehicle_make || 'Toyota',
            model: app.vehicle_model || 'Corolla',
            color: 'White',
            registration_plate: String(app.vehicle_plate).trim().toUpperCase(),
            capacity: 4,
            status: 'active',
            created_at: app.created_at || new Date().toISOString(),
          };
          await db.persistVehicle(vehicle);
        }

        if (driver) {
          driver.vehicle_id = driver.vehicle_id || vehicleId;
          driver.is_approved = true;
          driver.approval_status = 'APPROVED';
          driver.approved_by = adminId;
          driver.approved_at = new Date().toISOString();
          driver.rejection_reason = null;
          driver.updated_at = new Date().toISOString();
          await db.persistDriver(driver);
        } else {
          driver = {
            id: userId,
            vehicle_id: vehicleId,
            is_online: false,
            is_available: false,
            is_approved: true,
            approval_status: 'APPROVED',
            approved_by: adminId,
            approved_at: new Date().toISOString(),
            rejection_reason: null,
            current_lat: 0.3136,
            current_lng: 32.5811,
            heading: 0,
            speed: 0,
            license_number: app.license_number || 'UG-APPROVED',
            national_id: app.national_id || '',
            driving_permit_number: app.license_number || '',
            years_of_experience: Number(app.experience_years || 0),
            acceptance_rate: 100.0,
            today_earnings_ugx: 0,
            application_date: app.created_at || new Date().toISOString(),
            updated_at: new Date().toISOString(),
          };
          await db.persistDriver(driver);
        }
      }

      // 3. Update tour guide if guide
      if (app.applicant_type === 'tour_guide') {
        const guide = localStore.tour_guides.get(userId);
        if (guide) {
          guide.is_approved = true;
          guide.approval_status = 'APPROVED';
          guide.approved_by = adminId;
          guide.approved_at = new Date().toISOString();
          guide.rejection_reason = null;
          await db.persistTourGuide(guide);
        }
      }

      // 4. Generate 6-digit One-Time Passcode (OTP) and register in AuthService
      const otpCode = crypto.randomInt(100000, 1000000).toString();
      generatedOtp = otpCode;
      AuthService.setLoginOtp(app.email, otpCode, 48 * 3600 * 1000, app.full_name);

      // 5. Send official approval email with OTP to the applicant
      try {
        await EmailService.sendDriverApprovalOtpEmail(app.email, app.full_name, app.applicant_type, otpCode);
      } catch (emailErr) {
        console.error('[CareerService.approveApplication Email Error]', emailErr);
      }

      // 6. Send official in-app / push notification to candidate
      NotificationService.createNotification({
        userId,
        title: 'Mumwe Safaris Application Approved! 🎉',
        message: `Congratulations ${app.full_name}, your credentials have been verified by Mumwe Safaris administrators. Use your activation code to log in and access your dashboard.`,
        type: 'ACCOUNT',
        metadata: { applicationId, applicantType: app.applicant_type, status: 'APPROVED', otpCode },
      }).catch((err) => console.error('[Notification Error]', err));

      emitToUser(userId, 'account:approval_updated', {
        userId,
        applicationId,
        applicantType: app.applicant_type,
        approvalStatus: 'APPROVED',
        isApproved: true,
      });
      if (app.applicant_type === 'driver') {
        broadcastDriverSnapshot(userId, 'fleet:status_update');
      }
    }

    // 7. Record Admin Audit Log
    const auditId = `aud_${uuidv4().substring(0, 8)}`;
    const auditRecord = {
      id: auditId,
      admin_id: adminId,
      action: 'APPROVE_CAREER_APPLICATION',
      resource_type: app.applicant_type === 'driver' ? 'DRIVER' : 'TOUR_GUIDE',
      resource_id: userId || applicationId,
      details: {
        applicationId,
        applicantName: app.full_name,
        applicantType: app.applicant_type,
        email: app.email,
        phone: app.phone,
        otpSent: Boolean(generatedOtp),
      },
      ip_address: adminIp || '127.0.0.1',
      created_at: new Date().toISOString(),
    };
    localStore.admin_audit_logs.set(auditId, auditRecord);
    if (db.isPostgresConnected) {
      try {
        await db.query(
          `INSERT INTO admin_audit_logs (id, admin_id, action, resource_type, resource_id, details, ip_address, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, CURRENT_TIMESTAMP)`,
          [auditRecord.id, auditRecord.admin_id, auditRecord.action, auditRecord.resource_type, auditRecord.resource_id, JSON.stringify(auditRecord.details), auditRecord.ip_address]
        );
      } catch (_) {}
    }

    return {
      success: true,
      applicationId,
      userId,
      status: 'APPROVED',
      otpCode: generatedOtp,
      message: `${app.full_name} (${app.applicant_type}) has been approved and activated for operations. An activation email with one-time login OTP has been dispatched to ${app.email}.`,
    };
  }

  /**
   * Admin rejects an application with a mandatory reason
   */
  public static async rejectApplication(applicationId: string, adminId: string, reason: string, adminIp?: string): Promise<any> {
    if (!reason?.trim()) throw new Error('A rejection reason is mandatory.');

    const app = localStore.career_applications.get(applicationId);
    if (!app) throw new Error(`Application ${applicationId} not found.`);

    app.status = 'REJECTED';
    app.rejection_reason = reason.trim();
    app.reviewed_by = adminId;
    app.reviewed_at = new Date().toISOString();
    app.updated_at = new Date().toISOString();
    await db.persistCareerApplication(app);

    const userId = app.user_id;
    if (userId) {
      const user = localStore.users.get(userId);
      if (user) {
        user.approval_status = 'REJECTED';
        await db.updateUserSecurity(user.id, { approval_status: user.approval_status, is_verified: user.is_verified });
      }

      if (app.applicant_type === 'driver') {
        const driver = localStore.drivers.get(userId);
        if (driver) {
          driver.is_approved = false;
          driver.is_online = false;
          driver.is_available = false;
          driver.approval_status = 'REJECTED';
          driver.rejection_reason = reason.trim();
          await db.persistDriver(driver);
        }
        broadcastToFleet({ driverId: userId, approvalStatus: 'REJECTED' }, 'fleet:driver_removed');
      }

      if (app.applicant_type === 'tour_guide') {
        const guide = localStore.tour_guides.get(userId);
        if (guide) {
          guide.is_approved = false;
          guide.is_available = false;
          guide.approval_status = 'REJECTED';
          guide.rejection_reason = reason.trim();
          await db.persistTourGuide(guide);
        }
      }

      emitToUser(userId, 'account:approval_updated', {
        userId,
        applicationId,
        applicantType: app.applicant_type,
        approvalStatus: 'REJECTED',
        isApproved: false,
        reason: reason.trim(),
      });

      NotificationService.createNotification({
        userId,
        title: 'Mumwe Safaris Application Update',
        message: `Hello ${app.full_name}, your Mumwe Safaris application was not approved at this time. Reason: ${reason.trim()}`,
        type: 'ACCOUNT',
        metadata: { applicationId, reason: reason.trim(), status: 'REJECTED' },
      }).catch((err) => console.error('[Notification Error]', err));
    }

    return {
      success: true,
      applicationId,
      status: 'REJECTED',
      rejectionReason: reason.trim(),
    };
  }

  /**
   * Admin suspends an approved driver or guide account
   */
  public static async suspendAccount(userId: string, adminId: string, reason: string, adminIp?: string): Promise<any> {
    const user = localStore.users.get(userId);
    if (!user) throw new Error(`User account ${userId} not found.`);

    const secured = await db.updateUserSecurity(userId, { approval_status: 'SUSPENDED' });
    Object.assign(user, secured);

    const driver = localStore.drivers.get(userId);
    if (driver) {
      driver.is_approved = false;
      driver.is_online = false;
      driver.is_available = false;
      driver.approval_status = 'SUSPENDED';
      driver.rejection_reason = reason;
      await db.persistDriver(driver);
      broadcastToFleet({ driverId: userId, approvalStatus: 'SUSPENDED' }, 'fleet:driver_removed');
    }

    const guide = localStore.tour_guides.get(userId);
    if (guide) {
      guide.is_approved = false;
      guide.is_available = false;
      guide.approval_status = 'SUSPENDED';
      guide.rejection_reason = reason;
      await db.persistTourGuide(guide);
    }

    // Also update career application if linked
    if (user.application_id) {
      const app = localStore.career_applications.get(user.application_id);
      if (app) {
        app.status = 'SUSPENDED';
        app.rejection_reason = reason;
        app.updated_at = new Date().toISOString();
        await db.persistCareerApplication(app);
      }
    }

    emitToUser(userId, 'account:approval_updated', {
      userId,
      approvalStatus: 'SUSPENDED',
      isApproved: false,
      reason,
    });

    return {
      success: true,
      userId,
      status: 'SUSPENDED',
      message: `Account ${user.full_name} has been suspended from platform operations.`,
    };
  }

  /**
   * Check status of an application by ID, email, or phone
   */
  public static async requestStatusLink(email: string): Promise<void> {
    const cleanEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    if (!cleanEmail || cleanEmail.length > 320) return;
    const app = db.isPostgresConnected
      ? (await db.query('SELECT id, email FROM career_applications WHERE LOWER(email) = $1 ORDER BY created_at DESC LIMIT 1', [cleanEmail])).rows[0]
      : (process.env.NODE_ENV === 'test' ? Array.from(localStore.career_applications.values()).find(a => a.email?.toLowerCase() === cleanEmail) : null);
    if (!app) return;
    const token = crypto.randomBytes(32).toString('hex');
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    const expiresAt = Date.now() + 24 * 60 * 60 * 1000;
    if (db.isPostgresConnected) {
      await db.query(`INSERT INTO career_status_tokens(application_id, token_hash, expires_at) VALUES ($1, $2, $3)
        ON CONFLICT (application_id) DO UPDATE SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`, [app.id, digest, new Date(expiresAt)]);
    } else if (process.env.NODE_ENV === 'test') {
      for (const [k, t] of this.testStatusTokens) if (t.applicationId === app.id || t.expiresAt <= Date.now()) this.testStatusTokens.delete(k);
      this.testStatusTokens.set(digest, { applicationId: app.id, expiresAt });
    } else throw new Error('Status storage unavailable.');
    // Fragment never reaches reverse-proxy access logs or HTTP referrers.
    await EmailService.sendApplicationStatusLink(app.email, `https://careers.mumwesafarisuganda.com/careers#application-status=${token}`);
  }

  public static async getApplicationStatus(token: string): Promise<any> {
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) throw new Error('Status link is invalid or expired.');
    const digest = crypto.createHash('sha256').update(token).digest('hex');
    let app: any;
    if (db.isPostgresConnected) {
      app = (await db.query(`SELECT a.id, a.applicant_type, a.status, a.created_at, a.reviewed_at, a.rejection_reason
        FROM career_applications a JOIN career_status_tokens t ON t.application_id = a.id
        WHERE t.token_hash = $1 AND t.expires_at > CURRENT_TIMESTAMP`, [digest])).rows[0];
    } else if (process.env.NODE_ENV === 'test') {
      const entry = this.testStatusTokens.get(digest);
      if (entry && entry.expiresAt > Date.now()) app = localStore.career_applications.get(entry.applicationId);
    } else throw new Error('Status storage unavailable.');
    if (!app) throw new Error('Status link is invalid or expired.');
    return { application_id: app.id, applicant_type: app.applicant_type, status: app.status,
      created_at: app.created_at, reviewed_at: app.reviewed_at,
      rejection_reason: app.status === 'REJECTED' ? app.rejection_reason : null };
  }
}
