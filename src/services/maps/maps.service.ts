import { ENV } from '../../config/env';

export class MapsError extends Error {
  statusCode: number;
  code: string;
  constructor(message: string, statusCode = 400, code = 'MAPS_ERROR') {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }
}

function calculateProximityDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

async function fetchJsonWithTimeout(
  url: string,
  options: { headers?: Record<string, string>; timeoutMs?: number } = {}
): Promise<any> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  try {
    const res = await fetch(url, {
      headers: options.headers,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export interface UgandaPlaceResult {
  id: string;
  title: string;
  subtitle: string;
  latitude: number;
  longitude: number;
  district?: string;
  region?: string;
  subCounty?: string;
  category: string;
  placeType: string;
  source: 'mapbox' | 'nominatim' | 'uganda_gazetteer' | 'tourism_db';
  isVerified: boolean;
  relevanceScore?: number;
}

export interface RouteManeuverStep {
  instruction: string;
  distanceMeters: number;
  durationSeconds: number;
  type: string;
  modifier: string;
  roadName: string;
  location: {
    latitude: number;
    longitude: number;
  };
}

export interface VerifiedRoadRouteResult {
  requestId: string;
  origin: { latitude: number; longitude: number };
  destination: { latitude: number; longitude: number };
  coordinates: Array<{ latitude: number; longitude: number }>;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  durationMinutes: number;
  summary: string;
  provider: 'mapbox' | 'osrm' | 'cache';
  isFromCache: boolean;
  cachedAt: string;
  maneuvers: RouteManeuverStep[];
}

interface GazetteerEntry {
  id: string;
  title: string;
  aliases?: string[];
  subtitle: string;
  district: string;
  region: 'Central' | 'Western' | 'Eastern' | 'Northern';
  subCounty?: string;
  category: string;
  placeType: 'city' | 'municipality' | 'district' | 'town' | 'trading_centre' | 'village' | 'sub_county' | 'parish' | 'road' | 'hotel' | 'airport' | 'hospital' | 'landmark' | 'safari_park' | 'neighborhood';
  latitude: number;
  longitude: number;
}

/**
 * Geographic bounds of the Republic of Uganda:
 * Latitude: -1.55 (South-West Kisoro/Kabale border) to +4.30 (North Kidepo/Moyo border)
 * Longitude: 29.50 (West Semuliki/Bwindi border) to 35.10 (East Karamoja/Bukwo border)
 */
export const UGANDA_GEO_BOUNDS = {
  minLat: -1.55,
  maxLat: 4.30,
  minLng: 29.50,
  maxLng: 35.10,
};

/**
 * Comprehensive, verified Uganda-wide Gazetteer covering districts, cities, municipalities,
 * towns, trading centres, sub-counties, parishes, neighbourhoods, airports, hospitals,
 * hotels, roads, and safari destinations across Central, Western, Eastern, and Northern Uganda.
 * All coordinates are verified WGS84 [latitude, longitude].
 */
export const UGANDA_VERIFIED_GAZETTEER: GazetteerEntry[] = [
  // ==================== CENTRAL REGION ====================
  {
    id: 'ug_kampala_city',
    title: 'Kampala',
    aliases: ['Kampala City', 'Kampala Central', 'CBD Kampala'],
    subtitle: 'Kampala Capital City, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Central Division',
    category: 'city',
    placeType: 'city',
    latitude: 0.3136,
    longitude: 32.5811,
  },
  {
    id: 'ug_entebbe_airport',
    title: 'Entebbe International Airport',
    aliases: ['EBB', 'Entebbe Airport'],
    subtitle: 'Entebbe, Wakiso District, Central Region, Uganda',
    district: 'Wakiso',
    region: 'Central',
    subCounty: 'Entebbe Municipality',
    category: 'airport',
    placeType: 'airport',
    latitude: 0.0424,
    longitude: 32.4435,
  },
  {
    id: 'ug_entebbe_town',
    title: 'Entebbe',
    aliases: ['Entebbe Municipality', 'Entebbe Town', 'Kitoro Entebbe'],
    subtitle: 'Entebbe Municipality, Wakiso District, Central Region, Uganda',
    district: 'Wakiso',
    region: 'Central',
    subCounty: 'Entebbe Municipality',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.0512,
    longitude: 32.4637,
  },
  {
    id: 'ug_kololo_kampala',
    title: 'Kololo',
    aliases: ['Kololo Airstrip', 'Kololo Hill', 'Acacia Mall Kisementi'],
    subtitle: 'Central Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Central Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: 0.3330,
    longitude: 32.5930,
  },
  {
    id: 'ug_nakasero_kampala',
    title: 'Nakasero',
    aliases: ['Nakasero Hill', 'Nakasero Market', 'Kampala Serena Hotel'],
    subtitle: 'Central Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Central Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: 0.3220,
    longitude: 32.5786,
  },
  {
    id: 'ug_ntinda_kampala',
    title: 'Ntinda (Kampala)',
    aliases: ['Ntinda Trading Centre', 'Ntinda Complex Kampala'],
    subtitle: 'Nakawa Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Nakawa Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: 0.3533,
    longitude: 32.6161,
  },
  {
    id: 'ug_bugolobi_kampala',
    title: 'Bugolobi',
    aliases: ['Village Mall Bugolobi', 'Bugolobi Flats'],
    subtitle: 'Nakawa Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Nakawa Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: 0.3125,
    longitude: 32.6189,
  },
  {
    id: 'ug_muyenga_kampala',
    title: 'Muyenga',
    aliases: ['Muyenga Tank Hill', 'Kabalagala Muyenga'],
    subtitle: 'Makindye Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Makindye Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: 0.2921,
    longitude: 32.6122,
  },
  {
    id: 'ug_munyonyo_kampala',
    title: 'Munyonyo',
    aliases: ['Speke Resort Munyonyo', 'Munyonyo Commonwealth Resort'],
    subtitle: 'Makindye Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Makindye Division',
    category: 'hotel',
    placeType: 'hotel',
    latitude: 0.2389,
    longitude: 32.6214,
  },
  {
    id: 'ug_rubaga_kampala',
    title: 'Rubaga (Kampala)',
    aliases: ['Rubaga Division', 'Rubaga Cathedral Kampala', 'Rubaga Hospital'],
    subtitle: 'Rubaga Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Rubaga Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: 0.3029,
    longitude: 32.5530,
  },
  {
    id: 'ug_mulago_hospital',
    title: 'Mulago National Referral Hospital',
    aliases: ['Mulago Hospital', 'Mulago Hill'],
    subtitle: 'Kawempe Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Kawempe Division',
    category: 'hospital',
    placeType: 'hospital',
    latitude: 0.3382,
    longitude: 32.5762,
  },
  {
    id: 'ug_makerere_university',
    title: 'Makerere University',
    aliases: ['Makerere Hill', 'Wandegeya Makerere'],
    subtitle: 'Kawempe Division, Kampala District, Central Region, Uganda',
    district: 'Kampala',
    region: 'Central',
    subCounty: 'Kawempe Division',
    category: 'landmark',
    placeType: 'landmark',
    latitude: 0.3349,
    longitude: 32.5675,
  },
  {
    id: 'ug_wakiso_town',
    title: 'Wakiso',
    aliases: ['Wakiso Town', 'Wakiso District Headquarters'],
    subtitle: 'Wakiso District, Central Region, Uganda',
    district: 'Wakiso',
    region: 'Central',
    subCounty: 'Wakiso Town Council',
    category: 'district',
    placeType: 'district',
    latitude: 0.3975,
    longitude: 32.4783,
  },
  {
    id: 'ug_kira_municipality',
    title: 'Kira',
    aliases: ['Kira Municipality', 'Namugongo Martyrs Shrine', 'Kireka', 'Bweyogerere'],
    subtitle: 'Kira Municipality, Wakiso District, Central Region, Uganda',
    district: 'Wakiso',
    region: 'Central',
    subCounty: 'Kira Municipality',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.3961,
    longitude: 32.6389,
  },
  {
    id: 'ug_mukono_municipality',
    title: 'Mukono',
    aliases: ['Mukono Municipality', 'Mukono Town', 'Seeta Mukono', 'UCU Mukono'],
    subtitle: 'Mukono Municipality, Mukono District, Central Region, Uganda',
    district: 'Mukono',
    region: 'Central',
    subCounty: 'Mukono Central Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.3533,
    longitude: 32.7553,
  },
  {
    id: 'ug_kajjansi',
    title: 'Kajjansi',
    aliases: ['Kajjansi Trading Centre', 'Kajjansi Airfield', 'Entebbe Road Kajjansi'],
    subtitle: 'Kajjansi Town Council, Wakiso District, Central Region, Uganda',
    district: 'Wakiso',
    region: 'Central',
    subCounty: 'Kajjansi Town Council',
    category: 'trading_centre',
    placeType: 'trading_centre',
    latitude: 0.2153,
    longitude: 32.5517,
  },
  {
    id: 'ug_mpigi_town',
    title: 'Mpigi',
    aliases: ['Mpigi Town', 'Mpigi District', 'Kayabwe Equator Crossing'],
    subtitle: 'Mpigi Town Council, Mpigi District, Central Region, Uganda',
    district: 'Mpigi',
    region: 'Central',
    subCounty: 'Mpigi Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 0.2250,
    longitude: 32.3247,
  },
  {
    id: 'ug_masaka_city',
    title: 'Masaka',
    aliases: ['Masaka City', 'Nyendo Masaka', 'Masaka Municipality'],
    subtitle: 'Masaka City, Masaka District, Central Region, Uganda',
    district: 'Masaka',
    region: 'Central',
    subCounty: 'Katwe-Butego Division',
    category: 'city',
    placeType: 'city',
    latitude: -0.3338,
    longitude: 31.7341,
  },
  {
    id: 'ug_lukaya_trading_centre',
    title: 'Lukaya Trading Centre',
    aliases: ['Lukaya', 'Lukaya Town Council'],
    subtitle: 'Kalungu District, Central Region, Uganda',
    district: 'Kalungu',
    region: 'Central',
    subCounty: 'Lukaya Town Council',
    category: 'trading_centre',
    placeType: 'trading_centre',
    latitude: -0.1514,
    longitude: 31.8736,
  },
  {
    id: 'ug_lyantonde_town',
    title: 'Lyantonde',
    aliases: ['Lyantonde Town', 'Lyantonde District'],
    subtitle: 'Lyantonde Town Council, Lyantonde District, Central Region, Uganda',
    district: 'Lyantonde',
    region: 'Central',
    subCounty: 'Lyantonde Town Council',
    category: 'town',
    placeType: 'town',
    latitude: -0.4031,
    longitude: 31.1572,
  },
  {
    id: 'ug_mityana_municipality',
    title: 'Mityana',
    aliases: ['Mityana Municipality', 'Mityana Town'],
    subtitle: 'Mityana Municipality, Mityana District, Central Region, Uganda',
    district: 'Mityana',
    region: 'Central',
    subCounty: 'Mityana Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.4175,
    longitude: 32.0228,
  },
  {
    id: 'ug_mubende_municipality',
    title: 'Mubende',
    aliases: ['Mubende Municipality', 'Mubende Town', 'Nakayima Tree Mubende'],
    subtitle: 'Mubende Municipality, Mubende District, Central Region, Uganda',
    district: 'Mubende',
    region: 'Central',
    subCounty: 'Mubende Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.5585,
    longitude: 31.3949,
  },
  {
    id: 'ug_luwero_town',
    title: 'Luwero',
    aliases: ['Luwero Town', 'Luweero', 'Wobulenzi'],
    subtitle: 'Luwero Town Council, Luwero District, Central Region, Uganda',
    district: 'Luwero',
    region: 'Central',
    subCounty: 'Luwero Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 0.8492,
    longitude: 32.4731,
  },
  {
    id: 'ug_ziwa_rhino_sanctuary',
    title: 'Ziwa Rhino Sanctuary',
    aliases: ['Ziwa Rhinos', 'Nakasongola Rhino Sanctuary', 'Nakitooma'],
    subtitle: 'Nakitooma, Nakasongola District, Central Region, Uganda',
    district: 'Nakasongola',
    region: 'Central',
    subCounty: 'Nakitooma Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: 1.4714,
    longitude: 32.0897,
  },
  {
    id: 'ug_kalangala_ssese',
    title: 'Kalangala (Ssese Islands)',
    aliases: ['Ssese Islands', 'Bugala Island', 'Lutoboka Kalangala'],
    subtitle: 'Kalangala Town Council, Kalangala District, Central Region, Uganda',
    district: 'Kalangala',
    region: 'Central',
    subCounty: 'Kalangala Town Council',
    category: 'safari_park',
    placeType: 'town',
    latitude: -0.3208,
    longitude: 32.2933,
  },
  {
    id: 'ug_lugazi_municipality',
    title: 'Lugazi',
    aliases: ['Lugazi Municipality', 'Mabira Forest', 'Najjembe Mabira'],
    subtitle: 'Lugazi Municipality, Buikwe District, Central Region, Uganda',
    district: 'Buikwe',
    region: 'Central',
    subCounty: 'Lugazi Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.3772,
    longitude: 32.9378,
  },

  // ==================== WESTERN & SOUTH-WESTERN REGION ====================
  {
    id: 'ug_mbarara_city',
    title: 'Mbarara',
    aliases: ['Mbarara City', 'Mbarara Municipality', 'Kamukuzi Mbarara', 'Kakoba Mbarara'],
    subtitle: 'Mbarara City, Mbarara District, Western Region, Uganda',
    district: 'Mbarara',
    region: 'Western',
    subCounty: 'Mbarara City North / South',
    category: 'city',
    placeType: 'city',
    latitude: -0.6072,
    longitude: 30.6545,
  },
  {
    id: 'ug_mbarara_hospital',
    title: 'Mbarara Regional Referral Hospital',
    aliases: ['MUST Mbarara', 'Mbarara University of Science and Technology'],
    subtitle: 'Kamukuzi Division, Mbarara City, Western Region, Uganda',
    district: 'Mbarara',
    region: 'Western',
    subCounty: 'Kamukuzi Division',
    category: 'hospital',
    placeType: 'hospital',
    latitude: -0.6167,
    longitude: 30.6565,
  },
  {
    id: 'ug_rubaga_mbarara',
    title: 'Rubaga (Mbarara)',
    aliases: ['Nyamitanga Rubaga Mbarara'],
    subtitle: 'Nyamitanga Division, Mbarara City, Western Region, Uganda',
    district: 'Mbarara',
    region: 'Western',
    subCounty: 'Nyamitanga Division',
    category: 'neighborhood',
    placeType: 'neighborhood',
    latitude: -0.6254,
    longitude: 30.6428,
  },
  {
    id: 'ug_biharwe_mbarara',
    title: 'Biharwe Trading Centre',
    aliases: ['Biharwe', 'Igongo Cultural Centre Biharwe'],
    subtitle: 'Biharwe Division, Mbarara City, Western Region, Uganda',
    district: 'Mbarara',
    region: 'Western',
    subCounty: 'Biharwe Division',
    category: 'trading_centre',
    placeType: 'trading_centre',
    latitude: -0.5256,
    longitude: 30.7444,
  },
  {
    id: 'ug_kabale_municipality',
    title: 'Kabale',
    aliases: ['Kabale Municipality', 'Kabale Town', 'Kigongi Kabale', 'Makanga Hill Kabale'],
    subtitle: 'Kabale Municipality, Kabale District, Western Region, Uganda',
    district: 'Kabale',
    region: 'Western',
    subCounty: 'Kabale Central Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -1.2486,
    longitude: 29.9899,
  },
  {
    id: 'ug_lake_bunyonyi',
    title: 'Lake Bunyonyi',
    aliases: ['Bunyonyi Overland Resort', 'Bufuka Village Lake Bunyonyi', 'Arcadia Cottages Bunyonyi'],
    subtitle: 'Kitumba Sub-County, Kabale District, Western Region, Uganda',
    district: 'Kabale',
    region: 'Western',
    subCounty: 'Kitumba Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: -1.2886,
    longitude: 29.9144,
  },
  {
    id: 'ug_katuna_border',
    title: 'Katuna Border Post',
    aliases: ['Gatuna Border', 'Katuna Town Council'],
    subtitle: 'Katuna Town Council, Kabale District, Western Region, Uganda',
    district: 'Kabale',
    region: 'Western',
    subCounty: 'Katuna Town Council',
    category: 'town',
    placeType: 'town',
    latitude: -1.4253,
    longitude: 30.0094,
  },
  {
    id: 'ug_rukungiri_municipality',
    title: 'Rukungiri',
    aliases: ['Rukungiri Municipality', 'Rukungiri Town', 'Rukungiri District'],
    subtitle: 'Rukungiri Municipality, Rukungiri District, Western Region, Uganda',
    district: 'Rukungiri',
    region: 'Western',
    subCounty: 'Eastern / Western / Southern Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -0.7867,
    longitude: 29.9272,
  },
  {
    id: 'ug_nyakibale_rukungiri',
    title: 'Nyakibale (Rukungiri)',
    aliases: ['Karoli Lwanga Hospital Nyakibale', 'Nyakibale Parish Rukungiri'],
    subtitle: 'Southern Division, Rukungiri Municipality, Rukungiri District, Western Region, Uganda',
    district: 'Rukungiri',
    region: 'Western',
    subCounty: 'Southern Division',
    category: 'hospital',
    placeType: 'parish',
    latitude: -0.8058,
    longitude: 29.9286,
  },
  {
    id: 'ug_kebisoni_rukungiri',
    title: 'Kebisoni Trading Centre',
    aliases: ['Kebisoni', 'Kebisoni Town Council', 'Buyanja Rukungiri'],
    subtitle: 'Kebisoni Town Council, Rukungiri District, Western Region, Uganda',
    district: 'Rukungiri',
    region: 'Western',
    subCounty: 'Kebisoni Sub-County',
    category: 'trading_centre',
    placeType: 'trading_centre',
    latitude: -0.8586,
    longitude: 30.0219,
  },
  {
    id: 'ug_kisoro_municipality',
    title: 'Kisoro',
    aliases: ['Kisoro Municipality', 'Kisoro Town', 'Kisoro Airstrip', 'Cyanika Border'],
    subtitle: 'Kisoro Municipality, Kisoro District, Western Region, Uganda',
    district: 'Kisoro',
    region: 'Western',
    subCounty: 'Kisoro Central Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -1.2854,
    longitude: 29.6850,
  },
  {
    id: 'ug_mgahinga_gorilla_park',
    title: 'Mgahinga Gorilla National Park',
    aliases: ['Mgahinga Park', 'Ntebeko Visitor Centre', 'Mount Muhabura Kisoro'],
    subtitle: 'Nyundo / Muramba Sub-County, Kisoro District, Western Region, Uganda',
    district: 'Kisoro',
    region: 'Western',
    subCounty: 'Muramba Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: -1.3650,
    longitude: 29.6317,
  },
  {
    id: 'ug_rushaga_nkuringo_bwindi',
    title: 'Rushaga & Nkuringo Gorilla Sectors (Bwindi South)',
    aliases: ['Rushaga Village', 'Nkuringo Bwindi Gorilla Lodge', 'Rubuguri Town Council'],
    subtitle: 'Kirundo Sub-County, Kisoro District, Western Region, Uganda',
    district: 'Kisoro',
    region: 'Western',
    subCounty: 'Kirundo Sub-County',
    category: 'safari_park',
    placeType: 'village',
    latitude: -1.1233,
    longitude: 29.6908,
  },
  {
    id: 'ug_bwindi_impenetrable_park',
    title: 'Bwindi Impenetrable National Park (Buhoma)',
    aliases: ['Bwindi Park', 'Buhoma Sector', 'Buhoma Village', 'Bwindi Gorilla Trekking'],
    subtitle: 'Buhoma Town Council, Kanungu District, Western Region, Uganda',
    district: 'Kanungu',
    region: 'Western',
    subCounty: 'Kayonza / Buhoma',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: -0.9904,
    longitude: 29.6192,
  },
  {
    id: 'ug_kanungu_town',
    title: 'Kanungu',
    aliases: ['Kanungu Town Council', 'Kihihi Airstrip', 'Kihihi Town Council', 'Ishasha Sector'],
    subtitle: 'Kanungu Town Council, Kanungu District, Western Region, Uganda',
    district: 'Kanungu',
    region: 'Western',
    subCounty: 'Kanungu Town Council',
    category: 'town',
    placeType: 'town',
    latitude: -0.8972,
    longitude: 29.7764,
  },
  {
    id: 'ug_kihihi_kanungu',
    title: 'Kihihi',
    aliases: ['Kihihi Town Council', 'Kihihi Savannah Airstrip', 'Ishasha River Camp'],
    subtitle: 'Kihihi Town Council, Kanungu District, Western Region, Uganda',
    district: 'Kanungu',
    region: 'Western',
    subCounty: 'Kihihi Town Council',
    category: 'town',
    placeType: 'town',
    latitude: -0.7500,
    longitude: 29.7014,
  },
  {
    id: 'ug_ntungamo_municipality',
    title: 'Ntungamo',
    aliases: ['Ntungamo Municipality', 'Ntungamo Town', 'Rubaare Trading Centre', 'Rwashamaire'],
    subtitle: 'Ntungamo Municipality, Ntungamo District, Western Region, Uganda',
    district: 'Ntungamo',
    region: 'Western',
    subCounty: 'Ntungamo Central Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -0.8794,
    longitude: 30.2642,
  },
  {
    id: 'ug_bushenyi_ishaka',
    title: 'Bushenyi-Ishaka',
    aliases: ['Bushenyi', 'Ishaka Municipality', 'KIU Ishaka Hospital', 'Igara Bushenyi'],
    subtitle: 'Bushenyi-Ishaka Municipality, Bushenyi District, Western Region, Uganda',
    district: 'Bushenyi',
    region: 'Western',
    subCounty: 'Ishaka Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -0.5419,
    longitude: 30.1847,
  },
  {
    id: 'ug_kabwohe_sheema',
    title: 'Kabwohe',
    aliases: ['Kabwohe-Itendero', 'Sheema Municipality', 'Kibingo Sheema'],
    subtitle: 'Sheema Municipality, Sheema District, Western Region, Uganda',
    district: 'Sheema',
    region: 'Western',
    subCounty: 'Kabwohe Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -0.5761,
    longitude: 30.3769,
  },
  {
    id: 'ug_ibanda_municipality',
    title: 'Ibanda',
    aliases: ['Ibanda Municipality', 'Ibanda Town', 'Igorora Trading Centre'],
    subtitle: 'Ibanda Municipality, Ibanda District, Western Region, Uganda',
    district: 'Ibanda',
    region: 'Western',
    subCounty: 'Bufunda / Kagongo Division',
    category: 'municipality',
    placeType: 'municipality',
    latitude: -0.1339,
    longitude: 30.4961,
  },
  {
    id: 'ug_lake_mburo_park',
    title: 'Lake Mburo National Park',
    aliases: ['Sanga Gate Lake Mburo', 'Nshara Gate', 'Mihingo Lodge Lake Mburo', 'Kiruhura'],
    subtitle: 'Sanga Sub-County, Kiruhura District, Western Region, Uganda',
    district: 'Kiruhura',
    region: 'Western',
    subCounty: 'Sanga Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: -0.6042,
    longitude: 30.9575,
  },
  {
    id: 'ug_rubirizi_kyambura',
    title: 'Rubirizi & Kyambura Gorge',
    aliases: ['Rubirizi Town', 'Kyambura Gorge Chimpanzee Tracking', 'Katunguru Trading Centre'],
    subtitle: 'Rubirizi Town Council, Rubirizi District, Western Region, Uganda',
    district: 'Rubirizi',
    region: 'Western',
    subCounty: 'Rubirizi Town Council',
    category: 'safari_park',
    placeType: 'town',
    latitude: -0.2647,
    longitude: 30.1058,
  },
  {
    id: 'ug_queen_elizabeth_park',
    title: 'Queen Elizabeth National Park (Mweya)',
    aliases: ['QENP', 'Mweya Safari Lodge', 'Kazinga Channel', 'Kasenyi Plains'],
    subtitle: 'Katwe-Kabatoro, Kasese District, Western Region, Uganda',
    district: 'Kasese',
    region: 'Western',
    subCounty: 'Katwe-Kabatoro Town Council',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: -0.1919,
    longitude: 29.8986,
  },
  {
    id: 'ug_kasese_municipality',
    title: 'Kasese',
    aliases: ['Kasese Municipality', 'Kasese Airstrip', 'Kilembe Mines', 'Rwenzori Mountains'],
    subtitle: 'Kasese Municipality, Kasese District, Western Region, Uganda',
    district: 'Kasese',
    region: 'Western',
    subCounty: 'Central Division Kasese',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.1833,
    longitude: 30.0833,
  },
  {
    id: 'ug_fort_portal_city',
    title: 'Fort Portal',
    aliases: ['Fort Portal Tourism City', 'Kabarole', 'Tooro Palace', 'Crater Lakes Fort Portal'],
    subtitle: 'Fort Portal Tourism City, Kabarole District, Western Region, Uganda',
    district: 'Kabarole',
    region: 'Western',
    subCounty: 'Central Division Fort Portal',
    category: 'city',
    placeType: 'city',
    latitude: 0.6617,
    longitude: 30.2748,
  },
  {
    id: 'ug_kibale_national_park',
    title: 'Kibale National Park (Kanyanchu)',
    aliases: ['Kibale Forest Chimpanzee Tracking', 'Kanyanchu Visitor Centre', 'Bigodi Wetland Sanctuary'],
    subtitle: 'Busiriba Sub-County, Kamwenge / Kabarole District, Western Region, Uganda',
    district: 'Kamwenge',
    region: 'Western',
    subCounty: 'Busiriba Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: 0.4856,
    longitude: 30.3889,
  },
  {
    id: 'ug_semuliki_national_park',
    title: 'Semuliki National Park & Sempaya Hot Springs',
    aliases: ['Semuliki Park', 'Sempaya Hot Springs', 'Bundibugyo Town'],
    subtitle: 'Bwamba County, Bundibugyo District, Western Region, Uganda',
    district: 'Bundibugyo',
    region: 'Western',
    subCounty: 'Bubandi Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: 0.8364,
    longitude: 30.1636,
  },
  {
    id: 'ug_kyenjojo_town',
    title: 'Kyenjojo',
    aliases: ['Kyenjojo Town Council', 'Kyenjojo District'],
    subtitle: 'Kyenjojo Town Council, Kyenjojo District, Western Region, Uganda',
    district: 'Kyenjojo',
    region: 'Western',
    subCounty: 'Kyenjojo Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 0.6092,
    longitude: 30.6403,
  },
  {
    id: 'ug_kagadi_town',
    title: 'Kagadi',
    aliases: ['Kagadi Town Council', 'Kagadi Hospital', 'Muhorro Kagadi'],
    subtitle: 'Kagadi Town Council, Kagadi District, Western Region, Uganda',
    district: 'Kagadi',
    region: 'Western',
    subCounty: 'Kagadi Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 0.9411,
    longitude: 30.8108,
  },
  {
    id: 'ug_hoima_city',
    title: 'Hoima',
    aliases: ['Hoima City', 'Hoima Oil City', 'Kabaale International Airport Hoima', 'Buseruka Hoima'],
    subtitle: 'Hoima City, Hoima District, Western Region, Uganda',
    district: 'Hoima',
    region: 'Western',
    subCounty: 'Hoima East / West Division',
    category: 'city',
    placeType: 'city',
    latitude: 1.4331,
    longitude: 31.3524,
  },
  {
    id: 'ug_kigorobya_hoima',
    title: 'Kigorobya Trading Centre',
    aliases: ['Kigorobya', 'Kigorobya Town Council Hoima'],
    subtitle: 'Kigorobya Sub-County, Hoima District, Western Region, Uganda',
    district: 'Hoima',
    region: 'Western',
    subCounty: 'Kigorobya Sub-County',
    category: 'trading_centre',
    placeType: 'trading_centre',
    latitude: 1.6156,
    longitude: 31.3106,
  },
  {
    id: 'ug_masindi_municipality',
    title: 'Masindi',
    aliases: ['Masindi Municipality', 'Masindi Town', 'Budongo Forest', 'Kichumbanyobo Gate'],
    subtitle: 'Masindi Municipality, Masindi District, Western Region, Uganda',
    district: 'Masindi',
    region: 'Western',
    subCounty: 'Central Division Masindi',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 1.6836,
    longitude: 31.7150,
  },
  {
    id: 'ug_murchison_falls_park',
    title: 'Murchison Falls National Park (Paraa)',
    aliases: ['Murchison Falls', 'Paraa Safari Lodge', 'Top of the Falls Murchison', 'Buliisa'],
    subtitle: 'Paraa / Buliisa & Nwoya Districts, Western / Northern Region, Uganda',
    district: 'Buliisa',
    region: 'Western',
    subCounty: 'Ngwedo Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: 2.2775,
    longitude: 31.6853,
  },
  {
    id: 'ug_karuma_bweyale',
    title: 'Karuma & Bweyale',
    aliases: ['Karuma Falls', 'Karuma Bridge', 'Bweyale Town Council Kiryandongo'],
    subtitle: 'Kiryandongo District, Western Region, Uganda',
    district: 'Kiryandongo',
    region: 'Western',
    subCounty: 'Karuma Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 2.2442,
    longitude: 32.2444,
  },

  // ==================== EASTERN REGION ====================
  {
    id: 'ug_jinja_city',
    title: 'Jinja',
    aliases: ['Jinja City', 'Source of the Nile Jinja', 'Bujagali Falls', 'Jinja Nile Bridge'],
    subtitle: 'Jinja City, Jinja District, Eastern Region, Uganda',
    district: 'Jinja',
    region: 'Eastern',
    subCounty: 'Jinja Central Division',
    category: 'city',
    placeType: 'city',
    latitude: 0.4390,
    longitude: 33.2032,
  },
  {
    id: 'ug_iganga_municipality',
    title: 'Iganga',
    aliases: ['Iganga Municipality', 'Iganga Town'],
    subtitle: 'Iganga Municipality, Iganga District, Eastern Region, Uganda',
    district: 'Iganga',
    region: 'Eastern',
    subCounty: 'Central Division Iganga',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.6092,
    longitude: 33.4686,
  },
  {
    id: 'ug_kamuli_municipality',
    title: 'Kamuli',
    aliases: ['Kamuli Municipality', 'Kamuli Town'],
    subtitle: 'Kamuli Municipality, Kamuli District, Eastern Region, Uganda',
    district: 'Kamuli',
    region: 'Eastern',
    subCounty: 'Kamuli Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.9472,
    longitude: 33.1197,
  },
  {
    id: 'ug_bugiri_municipality',
    title: 'Bugiri',
    aliases: ['Bugiri Municipality', 'Bugiri Town'],
    subtitle: 'Bugiri Municipality, Bugiri District, Eastern Region, Uganda',
    district: 'Bugiri',
    region: 'Eastern',
    subCounty: 'Bugiri Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.5714,
    longitude: 33.7417,
  },
  {
    id: 'ug_busia_municipality',
    title: 'Busia',
    aliases: ['Busia Border Post', 'Busia Municipality'],
    subtitle: 'Busia Municipality, Busia District, Eastern Region, Uganda',
    district: 'Busia',
    region: 'Eastern',
    subCounty: 'Busia Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.4669,
    longitude: 34.0900,
  },
  {
    id: 'ug_tororo_municipality',
    title: 'Tororo',
    aliases: ['Tororo Municipality', 'Tororo Rock', 'Malaba Border Post'],
    subtitle: 'Tororo Municipality, Tororo District, Eastern Region, Uganda',
    district: 'Tororo',
    region: 'Eastern',
    subCounty: 'Western / Eastern Division Tororo',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 0.6928,
    longitude: 34.1808,
  },
  {
    id: 'ug_mbale_city',
    title: 'Mbale',
    aliases: ['Mbale City', 'Mount Elgon National Park', 'Wanale Ridge Mbale'],
    subtitle: 'Mbale City, Mbale District, Eastern Region, Uganda',
    district: 'Mbale',
    region: 'Eastern',
    subCounty: 'Industrial / Northern Division Mbale',
    category: 'city',
    placeType: 'city',
    latitude: 1.0784,
    longitude: 34.1750,
  },
  {
    id: 'ug_sipi_falls_kapchorwa',
    title: 'Sipi Falls & Kapchorwa',
    aliases: ['Sipi Falls Resort', 'Kapchorwa Municipality', 'Mount Elgon Sipi'],
    subtitle: 'Sipi Town Council, Kapchorwa District, Eastern Region, Uganda',
    district: 'Kapchorwa',
    region: 'Eastern',
    subCounty: 'Sipi Sub-County',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: 1.3372,
    longitude: 34.3797,
  },
  {
    id: 'ug_soroti_city',
    title: 'Soroti',
    aliases: ['Soroti City', 'Soroti Rock', 'Soroti Flying School'],
    subtitle: 'Soroti City, Soroti District, Eastern Region, Uganda',
    district: 'Soroti',
    region: 'Eastern',
    subCounty: 'Soroti East / West Division',
    category: 'city',
    placeType: 'city',
    latitude: 1.7146,
    longitude: 33.6111,
  },
  {
    id: 'ug_kumi_nyero',
    title: 'Kumi & Nyero Rock Paintings',
    aliases: ['Kumi Municipality', 'Nyero Rock Paintings Kumi'],
    subtitle: 'Kumi Municipality, Kumi District, Eastern Region, Uganda',
    district: 'Kumi',
    region: 'Eastern',
    subCounty: 'Nyero Sub-County',
    category: 'landmark',
    placeType: 'municipality',
    latitude: 1.4608,
    longitude: 33.9361,
  },
  {
    id: 'ug_pallisa_town',
    title: 'Pallisa',
    aliases: ['Pallisa Town Council', 'Pallisa District'],
    subtitle: 'Pallisa Town Council, Pallisa District, Eastern Region, Uganda',
    district: 'Pallisa',
    region: 'Eastern',
    subCounty: 'Pallisa Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 1.1450,
    longitude: 33.7094,
  },

  // ==================== NORTHERN & WEST NILE REGION ====================
  {
    id: 'ug_gulu_city',
    title: 'Gulu',
    aliases: ['Gulu City', 'Gulu Municipality', 'Lacor Hospital Gulu', 'Bardege-Layibi Gulu', 'Pece-Laroo Gulu'],
    subtitle: 'Gulu City, Gulu District, Northern Region, Uganda',
    district: 'Gulu',
    region: 'Northern',
    subCounty: 'Bardege-Layibi / Pece-Laroo Division',
    category: 'city',
    placeType: 'city',
    latitude: 2.7724,
    longitude: 32.2881,
  },
  {
    id: 'ug_lira_city',
    title: 'Lira',
    aliases: ['Lira City', 'Lira Municipality', 'Adyel Lira'],
    subtitle: 'Lira City, Lira District, Northern Region, Uganda',
    district: 'Lira',
    region: 'Northern',
    subCounty: 'Lira City East / West Division',
    category: 'city',
    placeType: 'city',
    latitude: 2.2499,
    longitude: 32.8998,
  },
  {
    id: 'ug_kitgum_municipality',
    title: 'Kitgum',
    aliases: ['Kitgum Municipality', 'Kitgum Town'],
    subtitle: 'Kitgum Municipality, Kitgum District, Northern Region, Uganda',
    district: 'Kitgum',
    region: 'Northern',
    subCounty: 'Central Division Kitgum',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 3.2819,
    longitude: 32.8867,
  },
  {
    id: 'ug_arua_city',
    title: 'Arua',
    aliases: ['Arua City', 'Arua Airfield', 'Ayivu Division Arua', 'Ediofe Arua'],
    subtitle: 'Arua City, Arua District, West Nile, Northern Region, Uganda',
    district: 'Arua',
    region: 'Northern',
    subCounty: 'Arua Central / Ayivu Division',
    category: 'city',
    placeType: 'city',
    latitude: 3.0201,
    longitude: 30.9111,
  },
  {
    id: 'ug_pakwach_town',
    title: 'Pakwach',
    aliases: ['Pakwach Town Council', 'Pakwach Bridge', 'Albert Nile Pakwach'],
    subtitle: 'Pakwach Town Council, Pakwach District, Northern Region, Uganda',
    district: 'Pakwach',
    region: 'Northern',
    subCounty: 'Pakwach Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 2.4619,
    longitude: 31.4983,
  },
  {
    id: 'ug_nebbi_municipality',
    title: 'Nebbi',
    aliases: ['Nebbi Municipality', 'Nebbi Town', 'Paidha Zombo'],
    subtitle: 'Nebbi Municipality, Nebbi District, Northern Region, Uganda',
    district: 'Nebbi',
    region: 'Northern',
    subCounty: 'Nebbi Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 2.4783,
    longitude: 31.0889,
  },
  {
    id: 'ug_koboko_municipality',
    title: 'Koboko',
    aliases: ['Koboko Municipality', 'Oraba Border Koboko'],
    subtitle: 'Koboko Municipality, Koboko District, Northern Region, Uganda',
    district: 'Koboko',
    region: 'Northern',
    subCounty: 'Koboko Central',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 3.4136,
    longitude: 30.9597,
  },
  {
    id: 'ug_adjumani_moyo',
    title: 'Adjumani',
    aliases: ['Adjumani Town Council', 'Moyo Town', 'Laropi Ferry'],
    subtitle: 'Adjumani Town Council, Adjumani District, Northern Region, Uganda',
    district: 'Adjumani',
    region: 'Northern',
    subCounty: 'Adjumani Town Council',
    category: 'town',
    placeType: 'town',
    latitude: 3.3778,
    longitude: 31.7908,
  },
  {
    id: 'ug_moroto_municipality',
    title: 'Moroto',
    aliases: ['Moroto Municipality', 'Mount Moroto', 'Karamoja Moroto'],
    subtitle: 'Moroto Municipality, Moroto District, Karamoja, Northern Region, Uganda',
    district: 'Moroto',
    region: 'Northern',
    subCounty: 'South / North Division Moroto',
    category: 'municipality',
    placeType: 'municipality',
    latitude: 2.5345,
    longitude: 34.6666,
  },
  {
    id: 'ug_kidepo_valley_park',
    title: 'Kidepo Valley National Park (Apoka)',
    aliases: ['Kidepo Park', 'Apoka Safari Lodge', 'Narus Valley Kidepo', 'Kaabong'],
    subtitle: 'Karenga / Kaabong District, Karamoja, Northern Region, Uganda',
    district: 'Karenga',
    region: 'Northern',
    subCounty: 'Kapedo / Karenga',
    category: 'safari_park',
    placeType: 'safari_park',
    latitude: 3.7192,
    longitude: 33.8069,
  },
];

interface CachedRouteEntry {
  route: VerifiedRoadRouteResult;
  expiresAt: number;
}

const ROUTE_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const verifiedRouteCache = new Map<string, CachedRouteEntry>();

export class MapsService {
  /**
   * Validates that coordinates are finite numbers within valid WGS84 bounds and not (0, 0).
   */
  static isValidCoordinate(lat: unknown, lng: unknown): boolean {
    const nLat = Number(lat);
    const nLng = Number(lng);
    if (!Number.isFinite(nLat) || !Number.isFinite(nLng)) return false;
    if (nLat === 0 && nLng === 0) return false;
    return nLat >= -90 && nLat <= 90 && nLng >= -180 && nLng <= 180;
  }

  /**
   * Validates that coordinates lie inside Uganda's geographic bounding box.
   */
  static isWithinUganda(lat: unknown, lng: unknown): boolean {
    if (!this.isValidCoordinate(lat, lng)) return false;
    const nLat = Number(lat);
    const nLng = Number(lng);
    return (
      nLat >= UGANDA_GEO_BOUNDS.minLat &&
      nLat <= UGANDA_GEO_BOUNDS.maxLat &&
      nLng >= UGANDA_GEO_BOUNDS.minLng &&
      nLng <= UGANDA_GEO_BOUNDS.maxLng
    );
  }

  /**
   * Safeguard against GeoJSON [longitude, latitude] reversal.
   * In Uganda, latitude is in [-1.55, 4.30] and longitude is in [29.50, 35.10].
   */
  static normalizeUgandaCoordOrder(first: number, second: number): { latitude: number; longitude: number } | null {
    if (this.isWithinUganda(first, second)) {
      return { latitude: first, longitude: second };
    }
    if (this.isWithinUganda(second, first)) {
      return { latitude: second, longitude: first };
    }
    return null;
  }

  static isLikelyReversedUgandaCoordinate(lat: number, lng: number): boolean {
    return (
      lat >= UGANDA_GEO_BOUNDS.minLng &&
      lat <= UGANDA_GEO_BOUNDS.maxLng &&
      lng >= UGANDA_GEO_BOUNDS.minLat &&
      lng <= UGANDA_GEO_BOUNDS.maxLat
    );
  }

  static isDefaultKampalaCoordinate(lat: number, lng: number): boolean {
    const legacyMatch = Math.abs(lat - 0.3136) < 0.0008 && Math.abs(lng - 32.5811) < 0.0008;
    const centralMatch = Math.abs(lat - 0.3476) < 0.0008 && Math.abs(lng - 32.5825) < 0.0008;
    return legacyMatch || centralMatch;
  }

  static fromGeoJsonCoord(coord: unknown): { lat: number; lng: number } | null {
    if (!Array.isArray(coord) || coord.length < 2) return null;
    const norm = this.normalizeUgandaCoordOrder(Number(coord[1]), Number(coord[0]));
    if (!norm) return null;
    return { lat: norm.latitude, lng: norm.longitude };
  }

  /**
   * Builds a deterministic route cache key rounded to 5 decimal places (~1.1m precision).
   */
  static buildRouteCacheKey(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number
  ): string {
    return `${originLat.toFixed(5)},${originLng.toFixed(5)}->${destLat.toFixed(5)},${destLng.toFixed(5)}`;
  }

  /**
   * Clears route cache (used for testing or manual invalidation).
   */
  static clearRouteCache(): void {
    verifiedRouteCache.clear();
  }

  /**
   * Seeds a verified road route into cache (used for deterministic offline verification tests).
   */
  static seedVerifiedRouteForTest(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    distanceKm: number,
    durationMinutes: number
  ): void {
    const key = this.buildRouteCacheKey(originLat, originLng, destLat, destLng);
    verifiedRouteCache.set(key, {
      route: {
        requestId: 'req_test_seed',
        provider: 'mapbox_directions',
        origin: { latitude: originLat, longitude: originLng },
        destination: { latitude: destLat, longitude: destLng },
        distanceMeters: Math.round(distanceKm * 1000),
        distanceKm: Number(distanceKm.toFixed(2)),
        durationSeconds: Math.round(durationMinutes * 60),
        durationMinutes: Math.max(1, Math.round(durationMinutes)),
        summary: 'Verified Uganda Highway Route',
        coordinates: [
          { latitude: originLat, longitude: originLng },
          { latitude: destLat, longitude: destLng },
        ],
        maneuvers: [],
        isFromCache: true,
        computedAt: new Date().toISOString(),
      },
      expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
    });
  }

  /**
   * Multi-source Uganda destination search.
   * Combines verified Uganda Gazetteer, Mapbox Geocoding API (when token configured),
   * and OpenStreetMap Nominatim Uganda API, with proximity-aware ranking and deduplication.
   */
  static async searchUgandaPlaces(params: {
    query: string;
    proximityLat?: number;
    proximityLng?: number;
    limit?: number;
  }): Promise<UgandaPlaceResult[]> {
    const rawQuery = (params.query || '').trim();
    if (!rawQuery) return [];

    const limit = Math.min(Math.max(Number(params.limit) || 10, 1), 25);
    const hasValidProximity = this.isWithinUganda(params.proximityLat, params.proximityLng);
    const proxLat = hasValidProximity ? Number(params.proximityLat) : undefined;
    const proxLng = hasValidProximity ? Number(params.proximityLng) : undefined;

    // 1. Search local verified Uganda Gazetteer immediately
    const gazetteerMatches = this.searchGazetteer(rawQuery, proxLat, proxLng);

    // 2. Query external providers in parallel (Mapbox + OSM Nominatim Uganda)
    const [mapboxMatches, nominatimMatches] = await Promise.all([
      this.queryMapboxGeocoding(rawQuery, proxLat, proxLng, limit),
      this.queryNominatimUganda(rawQuery, limit),
    ]);

    // 3. Merge, validate Uganda bounds, deduplicate while preserving distinct districts, and rank
    const combined = [...gazetteerMatches, ...mapboxMatches, ...nominatimMatches];
    const deduplicated: UgandaPlaceResult[] = [];

    for (const candidate of combined) {
      if (!this.isWithinUganda(candidate.latitude, candidate.longitude)) {
        continue;
      }

      const normCandidateTitle = candidate.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
      const existingIdx = deduplicated.findIndex((existing) => {
        const distKm = calculateProximityDistanceKm(
          existing.latitude,
          existing.longitude,
          candidate.latitude,
          candidate.longitude
        );
        const normExistingTitle = existing.title.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        // Only merge if same/similar name AND physically within 2.5 km (preserves same-named places in different districts!)
        return distKm < 2.5 && (normExistingTitle === normCandidateTitle || normExistingTitle.includes(normCandidateTitle) || normCandidateTitle.includes(normExistingTitle));
      });

      const score = this.scoreSearchResult(candidate, rawQuery, proxLat, proxLng);
      const scoredCandidate: UgandaPlaceResult = { ...candidate, relevanceScore: score };

      if (existingIdx === -1) {
        deduplicated.push(scoredCandidate);
      } else if ((scoredCandidate.relevanceScore || 0) > (deduplicated[existingIdx].relevanceScore || 0)) {
        deduplicated[existingIdx] = scoredCandidate;
      }
    }

    deduplicated.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    return deduplicated.slice(0, limit);
  }

  /**
   * Searches the built-in verified Uganda Gazetteer across titles, aliases, districts, sub-counties, and regions.
   */
  static searchGazetteer(
    query: string,
    proximityLatOrOpts?: number | { proximityLat?: number; proximityLng?: number; limit?: number },
    proximityLngArg?: number
  ): UgandaPlaceResult[] {
    let proximityLat: number | undefined;
    let proximityLng: number | undefined;
    let limit = 25;

    if (typeof proximityLatOrOpts === 'object' && proximityLatOrOpts !== null) {
      proximityLat = proximityLatOrOpts.proximityLat;
      proximityLng = proximityLatOrOpts.proximityLng;
      if (proximityLatOrOpts.limit) limit = proximityLatOrOpts.limit;
    } else {
      proximityLat = proximityLatOrOpts;
      proximityLng = proximityLngArg;
    }

    const q = query.toLowerCase().trim();
    const tokens = q.split(/\s+/).filter(Boolean);

    const results: UgandaPlaceResult[] = [];
    for (const entry of UGANDA_VERIFIED_GAZETTEER) {
      const titleLower = entry.title.toLowerCase();
      const subtitleLower = entry.subtitle.toLowerCase();
      const districtLower = entry.district.toLowerCase();
      const regionLower = entry.region.toLowerCase();
      const subCountyLower = (entry.subCounty || '').toLowerCase();
      const aliasesLower = (entry.aliases || []).map((a) => a.toLowerCase());

      const searchableText = [
        titleLower,
        subtitleLower,
        districtLower,
        regionLower,
        subCountyLower,
        ...aliasesLower,
      ].join(' ');

      const matchesAllTokens = tokens.every((tok) => searchableText.includes(tok));
      if (!matchesAllTokens) continue;

      const item: UgandaPlaceResult = {
        id: entry.id,
        title: entry.title,
        subtitle: entry.subtitle,
        latitude: entry.latitude,
        longitude: entry.longitude,
        district: entry.district,
        region: entry.region,
        subCounty: entry.subCounty,
        category: entry.category,
        placeType: entry.placeType,
        source: 'uganda_gazetteer',
        isVerified: true,
      };
      item.relevanceScore = this.scoreSearchResult(item, query, proximityLat, proximityLng);
      results.push(item);
    }

    results.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
    return results.slice(0, limit);
  }

  private static scoreSearchResult(
    item: UgandaPlaceResult,
    rawQuery: string,
    proximityLat?: number,
    proximityLng?: number
  ): number {
    const q = rawQuery.toLowerCase().trim();
    const titleLower = item.title.toLowerCase();
    const subtitleLower = item.subtitle.toLowerCase();
    let score = 50;

    // Exact match or exact prefix match
    if (titleLower === q || titleLower === `${q} city` || titleLower === `${q} municipality`) {
      score += 120;
    } else if (titleLower.startsWith(q)) {
      score += 85;
    } else if (titleLower.split(/[\s,()-]+/).some((word) => word.startsWith(q))) {
      score += 65;
    } else if (subtitleLower.includes(q)) {
      score += 35;
    }

    // Administrative / landmark hierarchy bonus
    const typeWeights: Record<string, number> = {
      city: 25,
      municipality: 22,
      district: 20,
      safari_park: 22,
      airport: 22,
      hospital: 18,
      town: 18,
      trading_centre: 15,
      sub_county: 14,
      parish: 12,
      village: 12,
      hotel: 14,
      neighborhood: 15,
      landmark: 15,
    };
    score += typeWeights[item.placeType] || 10;

    // Verified Gazetteer bonus for curated precision
    if (item.source === 'uganda_gazetteer') {
      score += 15;
    }

    // Dynamic proximity bonus ONLY when user/pickup coordinates are provided (never permanent Kampala bias)
    if (proximityLat !== undefined && proximityLng !== undefined) {
      const distKm = calculateProximityDistanceKm(
        proximityLat,
        proximityLng,
        item.latitude,
        item.longitude
      );
      if (distKm <= 10) score += 20;
      else if (distKm <= 35) score += 12;
      else if (distKm <= 100) score += 5;
    }

    return score;
  }

  private static async queryMapboxGeocoding(
    query: string,
    proximityLat?: number,
    proximityLng?: number,
    limit = 10
  ): Promise<UgandaPlaceResult[]> {
    const token = (ENV.MAPBOX_ACCESS_TOKEN || '').trim();
    if (!token || token.includes('placeholder') || token.startsWith('YOUR_')) {
      return [];
    }

    try {
      const encoded = encodeURIComponent(query);
      let url =
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json` +
        `?access_token=${token}` +
        `&country=ug` +
        `&limit=${Math.min(limit, 10)}` +
        `&types=region,district,locality,place,neighborhood,address,poi`;

      if (proximityLat !== undefined && proximityLng !== undefined) {
        url += `&proximity=${proximityLng},${proximityLat}`;
      }

      const data = await fetchJsonWithTimeout(url, { timeoutMs: 4500 });
      const features = Array.isArray(data?.features) ? data.features : [];

      const results: UgandaPlaceResult[] = [];
      for (const feat of features) {
        const center = feat.center;
        if (!Array.isArray(center) || center.length < 2) continue;
        // Mapbox GeoJSON returns [longitude, latitude]
        const lng = Number(center[0]);
        const lat = Number(center[1]);
        if (!this.isWithinUganda(lat, lng)) continue;

        const contextList = Array.isArray(feat.context) ? feat.context : [];
        const districtCtx = contextList.find((c: any) => String(c.id || '').startsWith('district.'));
        const regionCtx = contextList.find((c: any) => String(c.id || '').startsWith('region.'));
        const placeType = Array.isArray(feat.place_type) && feat.place_type.length > 0
          ? String(feat.place_type[0])
          : 'place';

        results.push({
          id: String(feat.id || `mbx_${lat}_${lng}`),
          title: String(feat.text || feat.place_name || '').trim(),
          subtitle: String(feat.place_name || `${feat.text}, Uganda`).trim(),
          latitude: lat,
          longitude: lng,
          district: districtCtx?.text || regionCtx?.text,
          region: regionCtx?.text,
          category: String(feat.properties?.category || placeType),
          placeType,
          source: 'mapbox',
          isVerified: true,
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  private static async queryNominatimUganda(
    query: string,
    limit = 10
  ): Promise<UgandaPlaceResult[]> {
    if (process.env.NODE_ENV === 'test' && process.env.ENABLE_LIVE_NOMINATIM_IN_TESTS !== 'true') {
      return [];
    }

    try {
      const qs = new URLSearchParams({
        q: query,
        countrycodes: 'ug',
        format: 'jsonv2',
        addressdetails: '1',
        limit: String(Math.min(limit, 10)),
        viewbox: `${UGANDA_GEO_BOUNDS.minLng},${UGANDA_GEO_BOUNDS.maxLat},${UGANDA_GEO_BOUNDS.maxLng},${UGANDA_GEO_BOUNDS.minLat}`,
        bounded: '1',
      });
      const url = `https://nominatim.openstreetmap.org/search?${qs.toString()}`;
      const data = await fetchJsonWithTimeout(url, {
        headers: {
          'User-Agent': 'MumweSafarisUganda/1.0 (support@mumwesafarisuganda.com)',
          Accept: 'application/json',
        },
        timeoutMs: 4500,
      });

      const items = Array.isArray(data) ? data : [];
      const results: UgandaPlaceResult[] = [];

      for (const item of items) {
        const lat = Number(item.lat);
        const lng = Number(item.lon);
        if (!this.isWithinUganda(lat, lng)) continue;

        const addr = item.address || {};
        const district = addr.county || addr.state_district || addr.city || addr.town;
        const region = addr.state || addr.region;
        const subCounty = addr.suburb || addr.municipality || addr.village;
        const title = String(
          item.name ||
          addr.village ||
          addr.town ||
          addr.city ||
          addr.suburb ||
          String(item.display_name || '').split(',')[0]
        ).trim();

        if (!title) continue;

        results.push({
          id: `osm_${item.place_id || `${lat}_${lng}`}`,
          title,
          subtitle: String(item.display_name || `${title}, Uganda`),
          latitude: lat,
          longitude: lng,
          district: district ? String(district) : undefined,
          region: region ? String(region) : undefined,
          subCounty: subCounty ? String(subCounty) : undefined,
          category: String(item.category || item.type || 'place'),
          placeType: String(item.type || item.addresstype || 'place'),
          source: 'nominatim',
          isVerified: true,
        });
      }
      return results;
    } catch {
      return [];
    }
  }

  /**
   * Computes a verified road route between origin and destination using Mapbox Directions API v5
   * or OSRM Driving Routing API.
   *
   * NEVER uses Haversine * 1.35 or fake Bezier curved lines as a road route.
   * Throws 503 ROUTE_UNAVAILABLE if no road route can be verified.
   */
  static async getVerifiedRoadRoute(params: {
    originLat: number;
    originLng: number;
    destLat: number;
    destLng: number;
    requestId?: string;
    bypassCache?: boolean;
  }): Promise<VerifiedRoadRouteResult> {
    const originLat = Number(params.originLat);
    const originLng = Number(params.originLng);
    const destLat = Number(params.destLat);
    const destLng = Number(params.destLng);
    const requestId = params.requestId || `req_${Date.now()}`;

    if (!this.isWithinUganda(originLat, originLng)) {
      throw new MapsError(
        'Invalid or out-of-bounds pickup coordinates. Coordinates must be valid locations within Uganda.',
        400,
        'INVALID_PICKUP_COORDINATES'
      );
    }
    if (!this.isWithinUganda(destLat, destLng)) {
      throw new MapsError(
        'Invalid or out-of-bounds destination coordinates. Coordinates must be valid locations within Uganda.',
        400,
        'INVALID_DESTINATION_COORDINATES'
      );
    }

    const cacheKey = this.buildRouteCacheKey(originLat, originLng, destLat, destLng);
    if (!params.bypassCache) {
      const cached = verifiedRouteCache.get(cacheKey);
      if (cached && cached.expiresAt > Date.now()) {
        return {
          ...cached.route,
          requestId,
          provider: 'cache',
          isFromCache: true,
        };
      }
    }

    // 1. Try Mapbox Directions API v5 if token is configured
    const mapboxResult = await this.fetchMapboxRoadRoute(originLat, originLng, destLat, destLng, requestId);
    if (mapboxResult) {
      verifiedRouteCache.set(cacheKey, {
        route: mapboxResult,
        expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
      });
      return mapboxResult;
    }

    // 2. Try OSRM Road Routing Engine (real OpenStreetMap Uganda road network)
    const osrmResult = await this.fetchOsrmRoadRoute(originLat, originLng, destLat, destLng, requestId);
    if (osrmResult) {
      verifiedRouteCache.set(cacheKey, {
        route: osrmResult,
        expiresAt: Date.now() + ROUTE_CACHE_TTL_MS,
      });
      return osrmResult;
    }

    throw new MapsError(
      'Road route is temporarily unavailable from routing providers. Please verify network connectivity and try again.',
      503,
      'ROUTE_UNAVAILABLE'
    );
  }

  private static async fetchMapboxRoadRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    requestId: string
  ): Promise<VerifiedRoadRouteResult | null> {
    const token = (ENV.MAPBOX_ACCESS_TOKEN || '').trim();
    if (!token || token.includes('placeholder') || token.startsWith('YOUR_')) {
      return null;
    }

    try {
      const url =
        `https://api.mapbox.com/directions/v5/mapbox/driving/${originLng},${originLat};${destLng},${destLat}` +
        `?access_token=${token}&geometries=geojson&overview=full&steps=true`;

      const data = await fetchJsonWithTimeout(url, { timeoutMs: 7000 });
      const routes = data?.routes;
      if (!Array.isArray(routes) || routes.length === 0) return null;

      return this.parseGeoJsonRouteObject(
        routes[0],
        originLat,
        originLng,
        destLat,
        destLng,
        requestId,
        'mapbox'
      );
    } catch {
      return null;
    }
  }

  private static async fetchOsrmRoadRoute(
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    requestId: string
  ): Promise<VerifiedRoadRouteResult | null> {
    const urls = [
      `https://router.project-osrm.org/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&overview=full&steps=true`,
      `https://routing.openstreetmap.de/routed-car/route/v1/driving/${originLng},${originLat};${destLng},${destLat}?geometries=geojson&overview=full&steps=true`,
    ];

    for (const url of urls) {
      try {
        const data = await fetchJsonWithTimeout(url, {
          timeoutMs: 7000,
          headers: {
            'User-Agent': 'MumweSafarisUganda/1.0',
          },
        });
        const routes = data?.routes;
        if (Array.isArray(routes) && routes.length > 0) {
          const parsed = this.parseGeoJsonRouteObject(
            routes[0],
            originLat,
            originLng,
            destLat,
            destLng,
            requestId,
            'osrm'
          );
          if (parsed) return parsed;
        }
      } catch {
        // Try next routing endpoint
      }
    }
    return null;
  }

  private static parseGeoJsonRouteObject(
    routeObj: any,
    originLat: number,
    originLng: number,
    destLat: number,
    destLng: number,
    requestId: string,
    provider: 'mapbox' | 'osrm'
  ): VerifiedRoadRouteResult | null {
    const rawCoords = routeObj?.geometry?.coordinates;
    if (!Array.isArray(rawCoords) || rawCoords.length < 2) {
      return null;
    }

    const coordinates: Array<{ latitude: number; longitude: number }> = [];
    for (const pt of rawCoords) {
      if (!Array.isArray(pt) || pt.length < 2) continue;
      // GeoJSON coordinates are [longitude, latitude]
      const lng = Number(pt[0]);
      const lat = Number(pt[1]);
      if (this.isValidCoordinate(lat, lng)) {
        coordinates.push({ latitude: lat, longitude: lng });
      }
    }

    if (coordinates.length < 2) return null;

    const distanceMeters = Number(routeObj.distance || 0);
    const durationSeconds = Number(routeObj.duration || 0);
    if (!Number.isFinite(distanceMeters) || distanceMeters <= 0) {
      return null;
    }

    const maneuvers: RouteManeuverStep[] = [];
    const legs = Array.isArray(routeObj.legs) ? routeObj.legs : [];
    for (const leg of legs) {
      const steps = Array.isArray(leg?.steps) ? leg.steps : [];
      for (const step of steps) {
        const mn = step?.maneuver || {};
        const loc = Array.isArray(mn.location) && mn.location.length >= 2
          ? { latitude: Number(mn.location[1]), longitude: Number(mn.location[0]) }
          : coordinates[0];

        const roadName = String(step?.name || step?.ref || '').trim();
        const type = String(mn.type || 'turn');
        const modifier = String(mn.modifier || 'straight');
        const instruction = String(
          mn.instruction ||
          this.buildHumanManeuverInstruction(type, modifier, roadName)
        ).trim();

        maneuvers.push({
          instruction,
          distanceMeters: Number(step?.distance || 0),
          durationSeconds: Number(step?.duration || 0),
          type,
          modifier,
          roadName,
          location: loc,
        });
      }
    }

    const distanceKm = Number((distanceMeters / 1000).toFixed(2));
    const durationMinutes = Math.max(1, Math.round(durationSeconds / 60));

    return {
      requestId,
      origin: { latitude: originLat, longitude: originLng },
      destination: { latitude: destLat, longitude: destLng },
      coordinates,
      distanceMeters: Math.round(distanceMeters),
      distanceKm,
      durationSeconds: Math.round(durationSeconds),
      durationMinutes,
      summary: String(legs[0]?.summary || routeObj.weight_name || 'Verified Uganda Road Route'),
      provider,
      isFromCache: false,
      cachedAt: new Date().toISOString(),
      maneuvers,
    };
  }

  private static buildHumanManeuverInstruction(
    type: string,
    modifier: string,
    roadName: string
  ): string {
    const onto = roadName ? ` onto ${roadName}` : '';
    switch (type) {
      case 'depart':
        return `Head ${modifier || 'forward'}${onto}`;
      case 'arrive':
        return 'Arrive at your destination';
      case 'roundabout':
      case 'rotary':
        return `At the roundabout, take the exit${onto}`;
      case 'merge':
        return `Merge ${modifier}${onto}`;
      case 'fork':
        return `Keep ${modifier} at the fork${onto}`;
      case 'end of road':
        return `At the end of the road, turn ${modifier}${onto}`;
      default:
        if (modifier && modifier !== 'straight') {
          return `Turn ${modifier}${onto}`;
        }
        return `Continue straight${onto}`;
    }
  }
}
