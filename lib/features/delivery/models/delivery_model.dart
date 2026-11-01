enum PackageCategory {
  documents,
  electronics,
  foodAndPerishables,
  generalMerchandise,
  heavyCargo,
}

enum DeliveryStatus {
  placed,
  courierAssigned,
  packageCollected,
  inTransit,
  delivered,
}

class DeliveryOrderModel {
  final String id;
  final String pickupAddress;
  final String dropoffAddress;
  final String senderPhone;
  final String recipientName;
  final String recipientPhone;
  final PackageCategory category;
  final String packageDescription;
  final double weightKg;
  final double priceUGX;
  final DeliveryStatus status;
  final String courierName;
  final String courierPhone;
  final String courierVehicle;

  const DeliveryOrderModel({
    required this.id,
    required this.pickupAddress,
    required this.dropoffAddress,
    required this.senderPhone,
    required this.recipientName,
    required this.recipientPhone,
    required this.category,
    required this.packageDescription,
    required this.weightKg,
    required this.priceUGX,
    this.status = DeliveryStatus.inTransit,
    this.courierName = 'Geoffrey Ssenyonga',
    this.courierPhone = '+256 752 901842',
    this.courierVehicle = 'Safaris Boda • UEX 419P',
  });
}
