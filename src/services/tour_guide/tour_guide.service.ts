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
}
