import { localStore } from '../../config/database';
import { broadcast, broadcastToFleet } from '../../realtime/socket_server';

export interface SimulatedDriver {
  id: string;
  full_name: string;
  phone: string;
  role: 'driver' | 'tour_guide';
  rating: number;
  is_online: boolean;
  is_available: boolean;
  current_lat: number;
  current_lng: number;
  heading: number;
  speed: number;
  accuracy: number;
  battery_level: number;
  make: string;
  model: string;
  registration_plate: string;
  tier: 'boda' | 'economy' | 'comfort' | 'safari4x4' | 'tour_van';
  active_trip_id: string;
  active_trip_pickup: string;
  active_trip_dest: string;
  active_trip_status: 'AVAILABLE' | 'TRIP_STARTED' | 'DRIVER_ARRIVED' | 'OFFLINE';
  safari_leg: string;
  last_ping: string;
  waypoints: Array<[number, number]>; // [lat, lng]
  currentWaypointIndex: number;
  stepProgress: number; // 0.0 to 1.0 between current and next waypoint
}

export class FleetMovementEngine {
  private static instance: FleetMovementEngine | null = null;
  private timer: NodeJS.Timeout | null = null;
  private drivers: Map<string, SimulatedDriver> = new Map();

  private constructor() {
    this.initDrivers();
  }

  public static getInstance(): FleetMovementEngine {
    if (!FleetMovementEngine.instance) {
      FleetMovementEngine.instance = new FleetMovementEngine();
    }
    return FleetMovementEngine.instance;
  }

  private initDrivers() {
    // 1. IN TRANSIT: David Mukasa (Safari 4x4) moving along Kampala-Entebbe Expressway
    const drv1: SimulatedDriver = {
      id: 'drv_ug_901',
      full_name: 'David Mukasa',
      phone: '+256 701 445 890',
      role: 'driver',
      rating: 4.95,
      is_online: true,
      is_available: false,
      current_lat: 0.3136,
      current_lng: 32.5811,
      heading: 185.0,
      speed: 48.0,
      accuracy: 4.2,
      battery_level: 82,
      make: 'Toyota',
      model: 'Land Cruiser Safari 4x4',
      registration_plate: 'UBM 714K',
      tier: 'safari4x4',
      active_trip_id: 'trip_safari_01',
      active_trip_pickup: 'Kampala Serena Hotel',
      active_trip_dest: 'Entebbe International Airport',
      active_trip_status: 'TRIP_STARTED',
      safari_leg: 'Kampala Serena → Entebbe Airport',
      last_ping: new Date().toISOString(),
      waypoints: [
        [0.3180, 32.5830], // Kampala Serena
        [0.3015, 32.5710], // Clock Tower
        [0.2750, 32.5620], // Kibuye Roundabout
        [0.2450, 32.5530], // Busega / Expressway Entry
        [0.1980, 32.5410], // Kajjansi Interchange
        [0.1420, 32.5180], // Mpala Toll Plaza
        [0.0520, 32.4580], // Abayita Ababiri
        [0.0425, 32.4435], // Entebbe Airport
      ],
      currentWaypointIndex: 0,
      stepProgress: 0.0,
    };

    // 2. IN TRANSIT: Grace Namubiru (Tour Van) along Mbarara-Kabale corridor
    const drv2: SimulatedDriver = {
      id: 'drv_ug_902',
      full_name: 'Grace Namubiru',
      phone: '+256 782 110 334',
      role: 'tour_guide',
      rating: 4.98,
      is_online: true,
      is_available: false,
      current_lat: -0.6120,
      current_lng: 30.6550,
      heading: 220.0,
      speed: 42.0,
      accuracy: 5.0,
      battery_level: 74,
      make: 'Toyota',
      model: 'Super Custom Tour Van',
      registration_plate: 'UBH 892M',
      tier: 'tour_van',
      active_trip_id: 'tour_bwindi_02',
      active_trip_pickup: 'Mbarara Town',
      active_trip_dest: 'Bwindi Impenetrable NP (Ruhija)',
      active_trip_status: 'TRIP_STARTED',
      safari_leg: 'Mbarara → Kabale → Bwindi Gorilla Sector',
      last_ping: new Date().toISOString(),
      waypoints: [
        [-0.6050, 30.6580], // Mbarara
        [-0.7500, 30.5000], // Ntungamo
        [-1.0000, 30.1500], // Muhanga
        [-1.2500, 29.9800], // Kabale
        [-1.0300, 29.6800], // Ruhija, Bwindi
      ],
      currentWaypointIndex: 0,
      stepProgress: 0.0,
    };

    // 3. AVAILABLE (FREE): Ivan Okello (Prado TX Comfort) around Entebbe town & Airport
    const drv3: SimulatedDriver = {
      id: 'drv_ug_903',
      full_name: 'Ivan Okello',
      phone: '+256 774 220 901',
      role: 'driver',
      rating: 4.88,
      is_online: true,
      is_available: true,
      current_lat: 0.0480,
      current_lng: 32.4500,
      heading: 90.0,
      speed: 28.0,
      accuracy: 3.8,
      battery_level: 95,
      make: 'Toyota',
      model: 'Prado TX (Luxury)',
      registration_plate: 'UBL 312P',
      tier: 'comfort',
      active_trip_id: '',
      active_trip_pickup: '',
      active_trip_dest: '',
      active_trip_status: 'AVAILABLE',
      safari_leg: '',
      last_ping: new Date().toISOString(),
      waypoints: [
        [0.0520, 32.4580], // Abayita Ababiri
        [0.0450, 32.4530], // Victoria Mall Entebbe
        [0.0410, 32.4480], // Botanical Gardens
        [0.0380, 32.4410], // Airport Road
        [0.0450, 32.4530],
      ],
      currentWaypointIndex: 0,
      stepProgress: 0.0,
    };

    // 4. AVAILABLE (FREE): Samuel Katongole (Bajaj Boda) in Kampala Central & Nakasero
    const drv4: SimulatedDriver = {
      id: 'drv_ug_904',
      full_name: 'Samuel Katongole',
      phone: '+256 703 556 120',
      role: 'driver',
      rating: 4.91,
      is_online: true,
      is_available: true,
      current_lat: 0.3250,
      current_lng: 32.5820,
      heading: 45.0,
      speed: 24.0,
      accuracy: 4.5,
      battery_level: 88,
      make: 'Bajaj',
      model: 'Boxer BM150 Express',
      registration_plate: 'UFB 204R',
      tier: 'boda',
      active_trip_id: '',
      active_trip_pickup: '',
      active_trip_dest: '',
      active_trip_status: 'AVAILABLE',
      safari_leg: '',
      last_ping: new Date().toISOString(),
      waypoints: [
        [0.3150, 32.5810], // Kampala Post Office / Central
        [0.3210, 32.5780], // Nakasero Hill
        [0.3280, 32.5850], // Wandegeya
        [0.3340, 32.5870], // Acacia Mall / Kololo
        [0.3290, 32.5930], // Kololo Airstrip
        [0.3200, 32.5900], // Jinja Road Roundabout
        [0.3150, 32.5810],
      ],
      currentWaypointIndex: 0,
      stepProgress: 0.0,
    };

    // 5. AVAILABLE (FREE): Moses Kigozi (Toyota Premio Sedan) in Kololo, Ntinda & Naguru
    const drv5: SimulatedDriver = {
      id: 'drv_ug_906',
      full_name: 'Moses Kigozi',
      phone: '+256 750 312 990',
      role: 'driver',
      rating: 4.94,
      is_online: true,
      is_available: true,
      current_lat: 0.3360,
      current_lng: 32.5970,
      heading: 110.0,
      speed: 32.0,
      accuracy: 3.5,
      battery_level: 91,
      make: 'Toyota',
      model: 'Premio Executive',
      registration_plate: 'UBG 551D',
      tier: 'comfort',
      active_trip_id: '',
      active_trip_pickup: '',
      active_trip_dest: '',
      active_trip_status: 'AVAILABLE',
      safari_leg: '',
      last_ping: new Date().toISOString(),
      waypoints: [
        [0.3360, 32.5970], // Naguru Hill
        [0.3450, 32.6050], // Ntinda Centre
        [0.3520, 32.6120], // Kiwatule
        [0.3420, 32.6000], // Bukoto
        [0.3350, 32.5890], // Kamwokya
        [0.3360, 32.5970],
      ],
      currentWaypointIndex: 0,
      stepProgress: 0.0,
    };

    // 6. AVAILABLE (FREE): Aisha Nabatanzi (Safari Cruiser) in Bugolobi & Munyonyo
    const drv6: SimulatedDriver = {
      id: 'drv_ug_907',
      full_name: 'Aisha Nabatanzi',
      phone: '+256 708 914 200',
      role: 'tour_guide',
      rating: 4.97,
      is_online: true,
      is_available: true,
      current_lat: 0.3120,
      current_lng: 32.6100,
      heading: 160.0,
      speed: 36.0,
      accuracy: 4.0,
      battery_level: 79,
      make: 'Toyota',
      model: 'Land Cruiser Prado (Safari Pop-top)',
      registration_plate: 'UBD 809L',
      tier: 'safari4x4',
      active_trip_id: '',
      active_trip_pickup: '',
      active_trip_dest: '',
      active_trip_status: 'AVAILABLE',
      safari_leg: '',
      last_ping: new Date().toISOString(),
      waypoints: [
        [0.3120, 32.6100], // Bugolobi Village Mall
        [0.2980, 32.6180], // Port Bell Road
        [0.2810, 32.6250], // Ggaba Lake Shore
        [0.2620, 32.6150], // Munyonyo Speke Resort
        [0.2850, 32.6050], // Kansanga
        [0.3120, 32.6100],
      ],
      currentWaypointIndex: 0,
      stepProgress: 0.0,
    };

    this.drivers.set(drv1.id, drv1);
    this.drivers.set(drv2.id, drv2);
    this.drivers.set(drv3.id, drv3);
    this.drivers.set(drv4.id, drv4);
    this.drivers.set(drv5.id, drv5);
    this.drivers.set(drv6.id, drv6);

    // Synchronize to localStore
    this.syncToLocalStore();
  }

  public start() {
    if (this.timer) return;
    console.log('🚀 [FleetMovementEngine] Live Fleet Movement Engine started (2.5s telemetry interval).');

    this.timer = setInterval(() => {
      this.tick();
    }, 2500);
  }

  public stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      console.log('⏹️ [FleetMovementEngine] Live Fleet Movement Engine stopped.');
    }
  }

  private tick() {
    for (const driver of this.drivers.values()) {
      if (!driver.is_online) continue;

      const pts = driver.waypoints;
      if (!pts || pts.length < 2) continue;

      const curIdx = driver.currentWaypointIndex;
      const nextIdx = (curIdx + 1) % pts.length;
      const p1 = pts[curIdx];
      const p2 = pts[nextIdx];

      // Advance progress based on vehicle speed
      // Speed (km/h) -> distance per 2.5s tick
      const kmPerTick = (driver.speed / 3600) * 2.5;
      const latDist = (p2[0] - p1[0]) * 111.0;
      const lngDist = (p2[1] - p1[1]) * 111.0 * Math.cos((p1[0] * Math.PI) / 180);
      const segmentKm = Math.sqrt(latDist * latDist + lngDist * lngDist) || 0.1;

      const progressStep = Math.min(0.25, kmPerTick / segmentKm);
      driver.stepProgress += progressStep;

      if (driver.stepProgress >= 1.0) {
        driver.stepProgress = 0.0;
        driver.currentWaypointIndex = nextIdx;
        driver.current_lat = p2[0];
        driver.current_lng = p2[1];
      } else {
        // Interpolate position along segment
        const t = driver.stepProgress;
        driver.current_lat = p1[0] + (p2[0] - p1[0]) * t;
        driver.current_lng = p1[1] + (p2[1] - p1[1]) * t;
      }

      // Calculate bearing angle to next point
      const y = Math.sin(((p2[1] - p1[1]) * Math.PI) / 180) * Math.cos((p2[0] * Math.PI) / 180);
      const x =
        Math.cos((p1[0] * Math.PI) / 180) * Math.sin((p2[0] * Math.PI) / 180) -
        Math.sin((p1[0] * Math.PI) / 180) * Math.cos((p2[0] * Math.PI) / 180) * Math.cos(((p2[1] - p1[1]) * Math.PI) / 180);
      let bearing = (Math.atan2(y, x) * 180) / Math.PI;
      bearing = (bearing + 360) % 360;
      driver.heading = Math.round(bearing);

      // Slightly fluctuate battery and speed realistically
      driver.speed = Math.max(15, Math.min(75, driver.speed + (Math.random() * 4 - 2)));
      driver.last_ping = new Date().toISOString();
    }

    // Sync to localStore & broadcast
    this.syncToLocalStore();
    const all = this.getAllDrivers();
    broadcast('fleet:telemetry_update', all);
    broadcastToFleet(all);
  }

  private syncToLocalStore() {
    for (const d of this.drivers.values()) {
      // Keep localStore.drivers updated
      const existing = localStore.drivers.get(d.id) || {};
      localStore.drivers.set(d.id, {
        ...existing,
        id: d.id,
        is_online: d.is_online,
        is_available: d.is_available,
        current_lat: d.current_lat,
        current_lng: d.current_lng,
        heading: d.heading,
        speed: d.speed,
        battery_level: d.battery_level,
        updated_at: d.last_ping,
      });

      // Keep localStore.users updated
      if (!localStore.users.has(d.id)) {
        localStore.users.set(d.id, {
          id: d.id,
          full_name: d.full_name,
          phone: d.phone,
          email: `${d.id}@safaris.ug`,
          role: d.role,
          rating: d.rating,
          is_verified: true,
          wallet_balance_ugx: 0,
        });
      }

      // Keep localStore.vehicles updated
      const vehId = `veh_${d.id}`;
      if (!localStore.vehicles.has(vehId)) {
        localStore.vehicles.set(vehId, {
          id: vehId,
          make: d.make,
          model: d.model,
          registration_plate: d.registration_plate,
          tier: d.tier,
        });
      }
    }
  }

  public getAllDrivers(): SimulatedDriver[] {
    return Array.from(this.drivers.values());
  }

  public getAvailableDrivers(): SimulatedDriver[] {
    return Array.from(this.drivers.values()).filter((d) => d.is_online && d.is_available);
  }

  public updateManualLocation(driverId: string, lat: number, lng: number, heading = 0) {
    const d = this.drivers.get(driverId);
    if (d) {
      d.current_lat = lat;
      d.current_lng = lng;
      d.heading = heading;
      d.last_ping = new Date().toISOString();
    }
  }
}
