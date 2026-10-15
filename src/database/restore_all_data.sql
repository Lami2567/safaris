-- ==========================================================
-- RESTORE USER'S PERMANENT DESTINATIONS, PACKAGES, SERVICES, BANNERS
-- ==========================================================

-- 1. DESTINATIONS
INSERT INTO destinations (
    id, name, title, subtitle, region, description, highlights, best_time_to_visit, 
    distance_hours_from_kampala, hero_tag, image_url, image_placeholder, category, rating, is_popular, is_active, updated_at
) VALUES 
(
    'dest_murchison',
    'Murchison Falls National Park',
    'Murchison Falls National Park',
    'Uganda’s Largest Savanna & Dramatic Falls',
    'North-Western Uganda',
    'Witness the world’s most powerful surge of water where the Nile squeezes through a 7-meter gorge. Home to 76 mammal species including lions, leopards, elephants, and Rothschild giraffes.',
    ARRAY['Top of the Falls Hike', 'Nile River Boat Cruise', 'Big 4 Game Drives', 'Delta Point Birding'],
    'December to February, June to September',
    5,
    'THE NILE SURGE',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
    'national_park',
    4.95,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'dest_bwindi',
    'Bwindi Impenetrable Forest National Park',
    'Bwindi Impenetrable Forest National Park',
    'Ancient Rainforest & Mountain Gorilla Sanctuary',
    'South-Western Uganda',
    'A UNESCO World Heritage primeval forest harboring over 459 endangered mountain gorillas. Mist-covered valleys, canopy walks, and intimate encounters with habituated gorilla families.',
    ARRAY['Gorilla Tracking (Buhoma/Rushaga)', 'Batwa Pygmy Cultural Experience', 'Munyaga Waterfall Walk', 'Bird Watching (350+ species)'],
    'June to August, December to February',
    8,
    'GORILLA SANCTUARY',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
    'national_park',
    4.98,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'dest_mgahinga',
    'Mgahinga Gorilla National Park',
    'Mgahinga Gorilla National Park',
    'Where Gold Meets Silver - Volcanic Peaks & Golden Monkeys',
    'Kisoro, South-Western Uganda',
    'Nestled in the Virunga volcanoes bordering Rwanda and DR Congo. Famous for habituated mountain gorillas, rare golden monkeys, and the scenic Lake Mutanda.',
    ARRAY['Golden Monkey Trekking', 'Mount Muhavura Volcano Hike', 'Gorge Nature Trail', 'Lake Mutanda Canoe Tour'],
    'June to October, December to February',
    9,
    'VIRUNGA VOLCANOES',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790792932037-cc95a11c-mutanda-e1613740518759-1400x500.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790792932037-cc95a11c-mutanda-e1613740518759-1400x500.jpg',
    'national_park',
    4.92,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'dest_kibale',
    'Kibale National Park',
    'Kibale National Park',
    'Primate Capital of the World & Chimpanzee Tracking',
    'Kabarole & Kamwenge, Western Uganda',
    'The highest density and diversity of primates in Africa with 13 species, including over 1,500 wild chimpanzees, red colobus, and L''Hoest''s monkeys.',
    ARRAY['Chimpanzee Habituation', 'Bigodi Wetland Sanctuary Walk', 'Crater Lakes Exploration', 'Night Forest Primate Walk'],
    'December to February, June to September',
    5,
    'PRIMATE CAPITAL',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790790487672-326c3292-old-wise-chimp-860x510.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790790487672-326c3292-old-wise-chimp-860x510.jpg',
    'national_park',
    4.91,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'dest_queen_elizabeth',
    'Queen Elizabeth National Park',
    'Queen Elizabeth National Park',
    'Tree-Climbing Lions & Kazinga Channel Safari',
    'Kasese, Western Uganda',
    'Uganda’s most popular savanna reserve, featuring tree-climbing lions in Ishasha, immense hippopotamus pods along Kazinga Channel, and dramatic volcanic explosion craters.',
    ARRAY['Kazinga Channel Boat Safari', 'Ishasha Tree-Climbing Lions', 'Kyambura Gorge Chimp Trekking', 'Katwe Salt Lake Tour'],
    'January to February, June to July',
    6,
    'SAVANNA & CHANNEL',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790792600054-c61bdf0c-Scond-e1635835152589.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790792600054-c61bdf0c-Scond-e1635835152589.jpg',
    'national_park',
    4.89,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'dest_lake_mburo',
    'Lake Mburo National Park',
    'Lake Mburo National Park',
    'Compact Zebra Sanctuary & Whispers of the Wild',
    'Kiruhura District, Western Uganda',
    'The closest savanna park to Kampala, celebrated for massive zebra herds, elands, impalas, leopards, and tranquil boat cruises on Lake Mburo.',
    ARRAY['Walking Safaris with Armed Ranger', 'Horseback Wildlife Safari', 'Lake Mburo Boat Cruise', 'Night Game Drives for Leopards'],
    'Year-round',
    4,
    'ZEBRA SANCTUARY',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793390740-048c2870-images_1_.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793390740-048c2870-images_1_.jpg',
    'national_park',
    4.85,
    TRUE,
    TRUE,
    CURRENT_TIMESTAMP
)
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
    updated_at = CURRENT_TIMESTAMP;

-- 2. TOUR PACKAGES
INSERT INTO tour_packages (
    id, destination_id, title, duration_days, price_per_person_ugx, group_type, 
    inclusions, itinerary_summary, image_url, image_placeholder, is_active, updated_at
) VALUES 
(
    'pkg_bwindi_3d',
    'dest_bwindi',
    '3-Day Bwindi Ultimate Gorilla Trekking',
    3,
    2800000.00,
    'Small Group (Max 6)',
    ARRAY['UWA Mountain Gorilla Tracking Permit', 'Safari 4x4 Land Cruiser with pop-up roof', 'Certified English/French speaking Safari Guide', '2 Nights Luxury Eco-Lodge Full Board', 'Bottled drinking water & park entry fees'],
    ARRAY['Day 1: Kampala to Bwindi via Equator Monument & Mbarara', 'Day 2: Gorilla Trekking in Buhoma Rainforest & Community Walk', 'Day 3: Scenic return to Kampala or Entebbe Airport drop-off'],
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790793736631-51949ed3-park-entry-fees-bwindi.jpg',
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'pkg_murchison_2d',
    'dest_murchison',
    '2-Day Murchison Falls Safari & Nile Cruise',
    2,
    1450000.00,
    'Private / Couple',
    ARRAY['Game drive with armed Uganda Wildlife Authority ranger', 'River Nile Boat Cruise to bottom of the falls', 'Top of the falls viewpoint permit', '1 Night Safari Lodge on River Nile banks', 'Round-trip 4x4 Prado transport from Kampala'],
    ARRAY['Day 1: Early departure from Kampala, Ziwa Rhino sanctuary stop, afternoon Nile cruise', 'Day 2: Morning big-game savannah drive, Top of the Falls, return to Kampala'],
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg',
    TRUE,
    CURRENT_TIMESTAMP
),
(
    'pkg_jinja_1d',
    'dest_lake_mburo',
    '1-Day Lake Mburo Wildlife & Walking Safari',
    1,
    420000.00,
    'Daily Group',
    ARRAY['Guided walking safari with UWA ranger', 'Equator Monument photography stop', 'Buffet lunch in Mbarara', 'Comfort AC mini-coach transport from Kampala'],
    ARRAY['Morning: Transit along Masaka Highway with Equator stop', 'Midday: Savannah walking safari & wildlife photography', 'Afternoon: Lake Mburo boat ride and scenic evening return to Kampala'],
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790792600054-c61bdf0c-Scond-e1635835152589.jpg',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790792600054-c61bdf0c-Scond-e1635835152589.jpg',
    TRUE,
    CURRENT_TIMESTAMP
)
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
    updated_at = CURRENT_TIMESTAMP;

-- 3. TOUR GUIDES (Ensure Patrick Mukasa has image)
INSERT INTO users (id, full_name, phone, email, password_hash, role, avatar_url, rating, total_trips, is_verified)
VALUES (
    'usr_gd_001',
    'Patrick Mukasa',
    '+256 782 391029',
    'patrick.mukasa@safaris.ug',
    '$2a$10$wVb7P3m6a0c0o.NnB0xWd.Xk/t2/b61R578kZ1sHqN1R31q123456',
    'tour_guide',
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795831699-713d1d3e-Uganda-Tour-Guides.jpg',
    4.98,
    310,
    TRUE
)
ON CONFLICT (id) DO UPDATE SET
    avatar_url = EXCLUDED.avatar_url,
    full_name = EXCLUDED.full_name;

INSERT INTO tour_guides (
    id, title, bio, languages, specialties, daily_rate_ugx, is_uwa_certified, is_available, expeditions_count, avatar_url, full_name, rating, updated_at
) VALUES (
    'usr_gd_001',
    'Senior UWA Ranger & Primate Specialist',
    'Over 12 years guiding expeditions through Bwindi, Kibale, and Mgahinga. Certified in wilderness medicine and bird identification.',
    ARRAY['English', 'Luganda', 'Rukiga', 'French'],
    ARRAY['Gorilla Trekking', 'Chimpanzee Habituation', 'Birding Expeditions'],
    180000.00,
    TRUE,
    TRUE,
    310,
    'https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795831699-713d1d3e-Uganda-Tour-Guides.jpg',
    'Patrick Mukasa',
    4.98,
    CURRENT_TIMESTAMP
)
ON CONFLICT (id) DO UPDATE SET
    avatar_url = EXCLUDED.avatar_url,
    full_name = EXCLUDED.full_name,
    title = EXCLUDED.title,
    bio = EXCLUDED.bio,
    specialties = EXCLUDED.specialties,
    daily_rate_ugx = EXCLUDED.daily_rate_ugx,
    is_uwa_certified = EXCLUDED.is_uwa_certified,
    is_available = EXCLUDED.is_available,
    expeditions_count = EXCLUDED.expeditions_count,
    rating = EXCLUDED.rating,
    updated_at = CURRENT_TIMESTAMP;

-- 4. APP CONFIGURATION (SERVICES & BANNERS WITH USER IMAGES)
INSERT INTO app_config (key, value, updated_at) VALUES 
(
    'services',
    '[
        {"id": "rides", "type": "rides", "title": "Ride Hailing", "subtitle": "Fast, secure city trips & boda", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790757298938-a7b2dcfc-images.jpg", "enabled": true, "isEnabled": true, "displayOrder": 1},
        {"id": "airport_pickup", "type": "airportPickup", "title": "Airport Shuttle", "subtitle": "Reliable Entebbe airport transfers", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795569261-e26390d7-images_3_.jpg", "enabled": true, "isEnabled": true, "displayOrder": 2},
        {"id": "tourism", "type": "tourism", "title": "Uganda Safaris", "subtitle": "Explore national parks & wildlife", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795682684-8b6eccfc-lions-by-landy-on-safari.jpg", "enabled": true, "isEnabled": true, "displayOrder": 3},
        {"id": "tour_guides", "type": "tourGuides", "title": "Tour Guides", "subtitle": "Certified local guides on demand", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795831699-713d1d3e-Uganda-Tour-Guides.jpg", "enabled": true, "isEnabled": true, "displayOrder": 4},
        {"id": "delivery", "type": "delivery", "title": "Express Delivery", "subtitle": "Fast courier across Kampala", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790795966223-d96e63e4-images_4_.jpg", "enabled": true, "isEnabled": true, "displayOrder": 5},
        {"id": "hotel_booking", "type": "hotelBooking", "title": "Safari Lodges", "subtitle": "Eco-lodges & hotels booking", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790796080298-71e70511-4x4-safari-land-cruisers.jpg", "isNew": true, "enabled": false, "isEnabled": false, "displayOrder": 6},
        {"id": "car_rental", "type": "carRental", "title": "4x4 Self-Drive", "subtitle": "Land Cruisers with rooftop tents", "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/general/1790796080298-71e70511-4x4-safari-land-cruisers.jpg", "isNew": true, "enabled": false, "isEnabled": false, "displayOrder": 7}
    ]'::jsonb,
    CURRENT_TIMESTAMP
),
(
    'banners',
    '[
        {
            "id": "bwindi_promo",
            "title": "Bwindi Gorilla Trekking & Wildlife",
            "headline": "Bwindi Gorilla Trekking & Wildlife",
            "subtitle": "Save 15% on Permits & Certified UWA Guides",
            "discountText": "Save 15% on Permits & Certified UWA Guides",
            "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/banners/1790794165933-de83c948-images_2_.jpg",
            "imagePlaceholder": "safari",
            "actionType": "screen",
            "actionValue": "tourism",
            "destinationId": "dest_bwindi",
            "tag": "SPECIAL SAFARI",
            "active": true
        },
        {
            "id": "entebbe_express",
            "title": "Traditional Luwombo Feast & Safari",
            "headline": "Traditional Luwombo Feast & Safari",
            "subtitle": "Authentic Ugandan Cuisines & Pearl of Africa Tour",
            "discountText": "Authentic Ugandan Cuisines & Pearl of Africa Tour",
            "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/banners/1790794322136-2bfcab93-luwombo.jpg",
            "imagePlaceholder": "cuisine",
            "actionType": "screen",
            "actionValue": "tourism",
            "destinationId": "dest_mgahinga",
            "tag": "CULTURAL EXPEDITION",
            "active": true
        },
        {
            "id": "murchison_safari",
            "title": "Murchison Falls 3-Day Safari",
            "headline": "Murchison Falls 3-Day Safari",
            "subtitle": "Exclusive 4x4 Prado with Ranger & Boat Cruise",
            "discountText": "Exclusive 4x4 Prado with Ranger & Boat Cruise",
            "imageUrl": "https://pub-e2b1ab49fd8c4f2caad6781a542cd1b2.r2.dev/images/tourism/1790750196777-b5c00805-murchison-falls-national-park-1-3.jpg",
            "imagePlaceholder": "safari",
            "actionType": "screen",
            "actionValue": "tourism",
            "destinationId": "dest_murchison",
            "tag": "POPULAR TOUR",
            "active": true
        }
    ]'::jsonb,
    CURRENT_TIMESTAMP
)
ON CONFLICT (key) DO UPDATE SET
    value = EXCLUDED.value,
    updated_at = CURRENT_TIMESTAMP;

-- 5. UPDATE MASTER_CONFIG WITH RESTORED SERVICES & BANNERS
UPDATE app_config 
SET value = jsonb_set(
    jsonb_set(
        value, 
        '{banners}', 
        (SELECT value FROM app_config WHERE key = 'banners')
    ), 
    '{services}', 
    (SELECT value FROM app_config WHERE key = 'services')
),
updated_at = CURRENT_TIMESTAMP
WHERE key = 'master_config';
