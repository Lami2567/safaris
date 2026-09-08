import { localStore } from '../../config/database';

export class TourGuideService {
  public static getAllGuides(specialization?: string) {
    const guides = Array.from(localStore.tour_guides.values());
    const enriched = guides.map((guide: any) => {
      const user = localStore.users.get(guide.id);
      return {
        ...guide,
        full_name: user?.full_name || 'Safari Guide',
        phone: user?.phone || '+256 772 000000',
        avatar_url: user?.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
        rating: user?.rating || 4.98,
      };
    });

    if (specialization) {
      return enriched.filter((g: any) =>
        g.specializations?.some((s: string) => s.toLowerCase().includes(specialization.toLowerCase()))
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
      full_name: user?.full_name || 'Safari Guide',
      phone: user?.phone || '+256 772 000000',
      avatar_url: user?.avatar_url || 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400&q=80',
      rating: user?.rating || 4.98,
    };
  }

  public static toggleAvailability(guideId: string, isAvailable: boolean) {
    const guide = localStore.tour_guides.get(guideId);
    if (!guide) throw new Error('Tour guide not found.');

    guide.is_available = isAvailable;
    return guide;
  }

  public static createGuide(data: any) {
    const id = data.id || `usr_gd_${Date.now().toString().slice(-6)}`;
    const user = {
      id,
      full_name: data.full_name || data.fullName || 'Safari Specialist',
      phone: data.phone || '+256 700 000000',
      email: data.email || `${id}@safaris.ug`,
      role: 'tour_guide',
      avatar_url: data.avatar_url || data.avatarUrl || '',
      rating: Number(data.rating || 4.95),
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
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    localStore.tour_guides.set(id, guideProfile);

    return {
      ...guideProfile,
      full_name: user.full_name,
      phone: user.phone,
      avatar_url: user.avatar_url,
      rating: user.rating,
    };
  }

  public static updateGuide(id: string, data: any) {
    const guide = localStore.tour_guides.get(id);
    if (!guide) throw new Error('Tour guide not found.');

    const user = localStore.users.get(id);
    if (user) {
      if (data.full_name) user.full_name = data.full_name;
      if (data.phone) user.phone = data.phone;
      if (data.avatar_url !== undefined) user.avatar_url = data.avatar_url;
      if (data.rating !== undefined) user.rating = Number(data.rating);
      localStore.users.set(id, user);
    }

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
      daily_rate_ugx: data.daily_rate_ugx !== undefined ? Number(data.daily_rate_ugx) : guide.daily_rate_ugx,
      is_uwa_certified: data.is_uwa_certified !== undefined ? Boolean(data.is_uwa_certified) : guide.is_uwa_certified,
      is_available: data.is_available !== undefined ? Boolean(data.is_available) : guide.is_available,
      expeditions_count: data.expeditions_count !== undefined ? Number(data.expeditions_count) : guide.expeditions_count,
      updated_at: new Date().toISOString(),
    };
    localStore.tour_guides.set(id, updatedGuide);

    return {
      ...updatedGuide,
      full_name: user?.full_name || 'Safari Guide',
      phone: user?.phone || '+256 700 000000',
      avatar_url: user?.avatar_url || '',
      rating: user?.rating || 4.98,
    };
  }

  public static deleteGuide(id: string) {
    if (!localStore.tour_guides.has(id)) throw new Error('Tour guide not found.');
    localStore.tour_guides.delete(id);
    return { success: true, id };
  }
}
