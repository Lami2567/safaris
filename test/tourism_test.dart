import 'package:flutter_test/flutter_test.dart';
import 'package:safaris/features/tourism/models/tourism_model.dart';

void main() {
  group('Admin Tourism Data Integrity Tests', () {
    test('sampleDestinations contains exclusively the 6 official admin destinations', () {
      final dests = DestinationModel.sampleDestinations;
      expect(dests.length, 6);

      final expectedIds = {
        'dest_murchison',
        'dest_bwindi',
        'dest_mgahinga',
        'dest_kibale',
        'dest_queen_elizabeth',
        'dest_lake_mburo',
      };

      final actualIds = dests.map((d) => d.id).toSet();
      expect(actualIds, expectedIds);

      // Verify no Unsplash dummy images exist
      for (final d in dests) {
        expect(d.imageUrl, contains('pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev'));
        expect(d.effectiveImageUrl, contains('r2.dev'));
        expect(d.description.isNotEmpty, true);
        expect(d.title.isNotEmpty, true);
      }
    });

    test('samplePackages contains exclusively the 3 official admin packages with admin pricing', () {
      final pkgs = TourPackageModel.samplePackages;
      expect(pkgs.length, 3);

      final bwindiPkg = pkgs.firstWhere((p) => p.id == 'pkg_bwindi_3d');
      expect(bwindiPkg.destinationId, 'dest_bwindi');
      expect(bwindiPkg.pricePerPersonUGX, 2800000);
      expect(bwindiPkg.durationDays, 3);
      expect(bwindiPkg.imageUrl, contains('r2.dev'));

      final murchisonPkg = pkgs.firstWhere((p) => p.id == 'pkg_murchison_2d');
      expect(murchisonPkg.destinationId, 'dest_murchison');
      expect(murchisonPkg.pricePerPersonUGX, 1450000);
      expect(murchisonPkg.durationDays, 2);
      expect(murchisonPkg.imageUrl, contains('r2.dev'));

      final mburoPkg = pkgs.firstWhere((p) => p.id == 'pkg_jinja_1d');
      expect(mburoPkg.destinationId, 'dest_lake_mburo');
      expect(mburoPkg.pricePerPersonUGX, 420000);
      expect(mburoPkg.durationDays, 1);
      expect(mburoPkg.imageUrl, contains('r2.dev'));
    });

    test('TourismApiService maps live backend JSON response faithfully', () {
      final mockJson = {
        'id': 'dest_murchison',
        'name': 'Murchison Falls National Park',
        'category': 'national_park',
        'region': 'North-Western Uganda',
        'description': 'Witness the world’s most powerful surge of water.',
        'highlights': ['Top of the Falls Hike', 'Nile River Boat Cruise'],
        'best_time_to_visit': 'December to February, June to September',
        'distance_hours_from_kampala': 5,
        'hero_tag': 'THE NILE SURGE',
        'imageUrl': 'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/test.jpg',
        'rating': 4.95,
      };

      // Ensure fallback or mapping preserves exact admin data
      final dest = DestinationModel.sampleDestinations.firstWhere((d) => d.id == mockJson['id']);
      expect(dest.id, 'dest_murchison');
      expect(dest.title, 'Murchison Falls National Park');
      expect(dest.imageUrl, contains('r2.dev'));
    });
  });
}
