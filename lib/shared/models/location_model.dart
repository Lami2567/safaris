class LocationModel {
  final String id;
  final String title;
  final String address;
  final double latitude;
  final double longitude;
  final String city;

  const LocationModel({
    required this.id,
    required this.title,
    required this.address,
    required this.latitude,
    required this.longitude,
    this.city = 'Kampala',
  });

  static const LocationModel kampalaCentral = LocationModel(
    id: 'loc_kla_cbd',
    title: 'Kampala City Centre',
    address: 'Kampala Road, Central Division',
    latitude: 0.3136,
    longitude: 32.5811,
    city: 'Kampala',
  );

  static const LocationModel acaciaMall = LocationModel(
    id: 'loc_acacia',
    title: 'Acacia Mall, Kisementi',
    address: 'Acacia Avenue, Kololo',
    latitude: 0.3354,
    longitude: 32.5886,
    city: 'Kampala',
  );

  static const LocationModel entebbeAirport = LocationModel(
    id: 'loc_ebb_airport',
    title: 'Entebbe International Airport (EBB)',
    address: 'Airport Road, Entebbe Peninsula',
    latitude: 0.0424,
    longitude: 32.4435,
    city: 'Entebbe',
  );

  static const LocationModel jinjaNile = LocationModel(
    id: 'loc_jinja_nile',
    title: 'Source of the Nile Bridge',
    address: 'Jinja Town, Lake Victoria Basin',
    latitude: 0.4244,
    longitude: 33.1995,
    city: 'Jinja',
  );

  static const LocationModel bwindiGate = LocationModel(
    id: 'loc_bwindi_gate',
    title: 'Bwindi Buhoma Park Gate',
    address: 'Bwindi Impenetrable National Park, Kanungu',
    latitude: -0.9880,
    longitude: 29.6150,
    city: 'Bwindi',
  );

  static const LocationModel munyonyoResort = LocationModel(
    id: 'loc_munyonyo',
    title: 'Speke Resort Munyonyo',
    address: 'Wavamunno Road, Lake Victoria Shore',
    latitude: 0.2378,
    longitude: 32.6167,
    city: 'Kampala',
  );

  static List<LocationModel> get presets => [
        kampalaCentral,
        acaciaMall,
        entebbeAirport,
        munyonyoResort,
        jinjaNile,
        bwindiGate,
      ];
}
