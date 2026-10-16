import bcrypt from 'bcryptjs';
import { localStore, db } from '../config/database';
import { ENV } from '../config/env';

export async function seedUgandaData() {
  const defaultPasswordHash = await bcrypt.hash('password123', 10);

  // 1. ENSURE ADMIN ACCOUNT EXISTS (Do NOT seed fake customers, drivers, or tour guides)
  const adminUser = {
    id: 'usr_adm_001',
    full_name: 'Safaris Admin Director',
    phone: '+256 700 000001',
    email: 'admin@safaris.ug',
    password_hash: defaultPasswordHash,
    role: 'admin',
    avatar_url: '',
    rating: 5.0,
    total_trips: 0,
    wallet_balance_ugx: 0.0,
    is_verified: true,
    approval_status: 'APPROVED',
    created_at: new Date().toISOString(),
  };

  if (!localStore.users.has(adminUser.id)) {
    await db.persistUser(adminUser);
  }

  // 5. SEED DESTINATIONS
  const destinations = [
    {
      id: 'dest_bwindi',
      title: 'Bwindi Impenetrable Forest',
      subtitle: 'Home to nearly half of the world\'s mountain gorillas',
      region: 'Southwestern Uganda',
      lat: -0.9880,
      lng: 29.6150,
      description: 'A UNESCO World Heritage site featuring ancient, dense tropical rainforest. Renowned globally for mountain gorilla trekking expeditions and extraordinary bird biodiversity.',
      highlights: ['Mountain Gorilla Trekking', 'Batwa Pygmy Culture', 'Bird Watching (350+ species)', 'Buhoma Waterfalls'],
      best_time_to_visit: 'June to August, December to February',
      distance_hours_from_kampala: 9,
      hero_tag: 'GORILLA CAPITAL',
    },
    {
      id: 'dest_murchison',
      title: 'Murchison Falls National Park',
      subtitle: 'Uganda’s oldest and largest conservation area',
      region: 'Northwestern Uganda',
      lat: 2.2833,
      lng: 31.6833,
      description: 'Where the River Nile explodes through an 8-meter gorge before flowing into Lake Albert. World-class big game safaris featuring lions, elephants, giraffes, and hippos.',
      highlights: ['Top of the Falls Hike', 'Nile Delta Boat Cruise', 'Big Five Game Drives', 'Shoebill Stork Tracking'],
      best_time_to_visit: 'December to February, June to September',
      distance_hours_from_kampala: 5,
      hero_tag: 'BIG GAME SAFARI',
    },
    {
      id: 'dest_queen_elizabeth',
      title: 'Queen Elizabeth National Park',
      subtitle: 'Tree-climbing lions and the Kazinga Channel',
      region: 'Western Uganda',
      lat: -0.2000,
      lng: 30.0000,
      description: 'Set against the backdrop of the Rwenzori Mountains, boasting diverse ecosystems of savannah, humid forests, and crater lakes teeming with wildlife.',
      highlights: ['Ishasha Tree-Climbing Lions', 'Kazinga Channel Boat Safari', 'Kyambura Chimp Trekking', 'Crater Lake Drives'],
      best_time_to_visit: 'January to February, June to July',
      distance_hours_from_kampala: 6,
      hero_tag: 'SAVANNAH & CHIMPS',
    },
    {
      id: 'dest_jinja',
      title: 'Jinja & Source of the Nile',
      subtitle: 'The adventure capital of East Africa',
      region: 'Eastern Uganda',
      lat: 0.4244,
      lng: 33.1995,
      description: 'The historical origin of the River Nile offering adrenaline adventures including Grade 5 white-water rafting, bungee jumping, quad biking, and sunset river cruises.',
      highlights: ['White Water Rafting Grade 5', 'Source of the Nile Boat Trip', 'Kayaking & Tubing', 'Horseback Safaris'],
      best_time_to_visit: 'Year-round',
      distance_hours_from_kampala: 2,
      hero_tag: 'ADVENTURE CAPITAL',
    },
    {
      id: 'dest_entebbe',
      title: 'Entebbe International Airport (EBB)',
      subtitle: 'Uganda primary international flight gateway',
      region: 'Central Uganda',
      lat: 0.0424,
      lng: 32.4435,
      description: 'Located on the scenic Lake Victoria peninsula, offering fast express shuttles and VIP transfers directly connecting to Kampala CBD.',
      highlights: ['Airport Shuttle Express', 'Lake Victoria Beaches', 'Uganda Wildlife Education Centre'],
      best_time_to_visit: 'Year-round',
      distance_hours_from_kampala: 1,
      hero_tag: 'AIRPORT HUB',
    },
    {
      id: 'dest_munyonyo',
      title: 'Speke Resort Munyonyo',
      subtitle: 'Lakeside 5-Star Resort & Conference Centre',
      region: 'Kampala',
      lat: 0.2378,
      lng: 32.6167,
      description: 'World-class hospitality on the shores of Lake Victoria. Equestrian center, marina, olympic swimming pool and international summit facilities.',
      highlights: ['Lake Victoria Marina', 'Infinity Pool & Spa', 'Fine Dining by the Lake'],
      best_time_to_visit: 'Year-round',
      distance_hours_from_kampala: 1,
      hero_tag: 'LUXURY RETREAT',
    },
  ];

  if (localStore.destinations.size === 0) {
    for (const d of destinations) {
      localStore.destinations.set(d.id, d);
    }
  }

  // 6. SEED TOUR PACKAGES
  const packages = [
    {
      id: 'pkg_bwindi_3d',
      destination_id: 'dest_bwindi',
      title: '3-Day Bwindi Ultimate Gorilla Trekking',
      duration_days: 3,
      price_per_person_ugx: 2800000.0,
      group_type: 'Small Group (Max 6)',
      inclusions: [
        'UWA Mountain Gorilla Tracking Permit',
        'Safari 4x4 Land Cruiser with pop-up roof',
        'Certified English/French speaking Safari Guide',
        '2 Nights Luxury Eco-Lodge Full Board',
        'Bottled drinking water & park entry fees',
      ],
      itinerary_summary: [
        'Day 1: Kampala to Bwindi via Equator Monument & Mbarara',
        'Day 2: Gorilla Trekking in Buhoma Rainforest & Community Walk',
        'Day 3: Scenic return to Kampala or Entebbe Airport drop-off',
      ],
    },
    {
      id: 'pkg_murchison_2d',
      destination_id: 'dest_murchison',
      title: '2-Day Murchison Falls Safari & Nile Cruise',
      duration_days: 2,
      price_per_person_ugx: 1450000.0,
      group_type: 'Private / Couple',
      inclusions: [
        'Game drive with armed Uganda Wildlife Authority ranger',
        'River Nile Boat Cruise to bottom of the falls',
        'Top of the falls viewpoint permit',
        '1 Night Safari Lodge on River Nile banks',
        'Round-trip 4x4 Prado transport from Kampala',
      ],
      itinerary_summary: [
        'Day 1: Early departure from Kampala, Ziwa Rhino sanctuary stop, afternoon Nile cruise',
        'Day 2: Morning big-game savannah drive, Top of the Falls, return to Kampala',
      ],
    },
    {
      id: 'pkg_jinja_1d',
      destination_id: 'dest_jinja',
      title: '1-Day Jinja White Water Rafting & Nile Source',
      duration_days: 1,
      price_per_person_ugx: 420000.0,
      group_type: 'Daily Group',
      inclusions: [
        'Full day white-water rafting with professional river team',
        'Motorboat cruise to John Speke Source of the Nile monument',
        'Buffet lunch & drinks on the riverbank',
        'Comfort AC mini-coach from Kampala and back',
      ],
      itinerary_summary: [
        'Morning: Pickup at Kampala Road, transit through Mabira Forest',
        'Midday: Grade 5 white-water rafting and safety brief',
        'Afternoon: Source of the Nile boat exploration, evening return',
      ],
    },
  ];

  if (localStore.tour_packages.size === 0) {
    for (const p of packages) {
      localStore.tour_packages.set(p.id, p);
    }
  }

  // 7. SEED APP CONFIG
  const appConfig = {
    services: [
      { type: 'rides', id: 'rides', title: 'Ride Hailing', subtitle: 'Boda, Cars & Comfort in Kampala', isEnabled: true, displayOrder: 1 },
      { type: 'airportPickup', id: 'airport_pickup', title: 'Airport Shuttle', subtitle: 'Entebbe International transfers', isEnabled: true, displayOrder: 2 },
      { type: 'tourism', id: 'tourism', title: 'Uganda Safaris', subtitle: 'Gorillas, Murchison, Jinja & Parks', isEnabled: true, displayOrder: 3 },
      { type: 'tourGuides', id: 'tour_guides', title: 'Tour Guides', subtitle: 'Certified Ugandan guides on demand', isEnabled: true, displayOrder: 4 },
      { type: 'delivery', id: 'delivery', title: 'Express Delivery', subtitle: 'Packages, parcels & documents', isEnabled: true, displayOrder: 5 },
      { type: 'hotelBooking', id: 'hotel_booking', title: 'Safari Lodges', subtitle: 'Eco-lodges & hotels booking', isEnabled: false, isNew: true, displayOrder: 6 },
      { type: 'carRental', id: 'car_rental', title: '4x4 Self-Drive', subtitle: 'Land Cruisers with rooftop tents', isEnabled: false, isNew: true, displayOrder: 7 },
    ],
    banners: [
      { id: 'bwindi_promo', headline: 'Bwindi Gorilla Trekking', tag: 'SPECIAL SAFARI', discountText: 'Save 15% on Permits & Guides', destinationId: 'dest_bwindi' },
      { id: 'entebbe_express', headline: 'Entebbe Airport Express', tag: 'AIRPORT RIDE', discountText: 'Flat UGX 110,000 from Kampala', destinationId: 'dest_entebbe' },
      { id: 'murchison_safari', headline: 'Murchison Falls 3-Day Safari', tag: 'POPULAR TOUR', discountText: 'Exclusive 4x4 Prado with Ranger', destinationId: 'dest_murchison' },
    ],
    featureFlags: {
      instant_mobile_money_pay: true,
      boda_rides_enabled: true,
      night_rides_surcharge: false,
      custom_guide_selection: true,
      split_fare: false,
    },
    versionConfig: {
      minimumVersion: '1.0.0',
      latestVersion: '1.0.0',
      forceUpdate: false,
      recommendedUpdate: false,
      maintenanceMode: false,
      updateMessage: 'A new version of SAFARIS Uganda is ready on Play Store.',
    },
    supportedCities: ['Kampala', 'Entebbe', 'Jinja', 'Mbarara', 'Fort Portal', 'Gulu'],
  };

  // Preserve any existing Mapbox access token, services, and banners so seeding never wipes user-configured data
  const existingMaster = localStore.app_config.get('master_config') || {};
  const existingServices = existingMaster.services || localStore.app_config.get('services')?.value;
  const existingBanners = existingMaster.banners || localStore.app_config.get('banners')?.value;
  const existingToken = existingMaster.mapboxAccessToken ||
    localStore.app_config.get('mapboxAccessToken')?.value ||
    ENV.MAPBOX_ACCESS_TOKEN ||
    '';

  const mergedConfig = {
    ...appConfig,
    ...existingMaster,
    services: existingServices || appConfig.services,
    banners: existingBanners || appConfig.banners,
  };

  if (existingToken) {
    (mergedConfig as any).mapboxAccessToken = existingToken;
  }
  localStore.app_config.set('master_config', mergedConfig);

  console.log('🌱 [Seed] Uganda mobility & tourism database seeded successfully.');
}


