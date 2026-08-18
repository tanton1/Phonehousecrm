/**
 * Geofencing & Location Verification Service
 * Calculates Haversine distance between employee coordinates and registered store location.
 */

export interface LatLng {
  latitude: number;
  longitude: number;
}

export function calculateDistanceInMeters(point1: LatLng, point2: LatLng): number {
  const R = 6371e3; // Earth radius in meters
  const lat1Rad = (point1.latitude * Math.PI) / 180;
  const lat2Rad = (point2.latitude * Math.PI) / 180;
  const deltaLat = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const deltaLng = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

export function verifyGeofence(
  userCoords: LatLng | null | undefined,
  storeCoords: LatLng | null | undefined,
  allowedRadiusMeters: number = 100
): { isInside: boolean; distanceMeters: number; error?: string } {
  if (!storeCoords || (!storeCoords.latitude && !storeCoords.longitude)) {
    return {
      isInside: false,
      distanceMeters: -1,
      error: 'Chi nhánh chưa được cấu hình tọa độ GPS chuẩn trên hệ thống.'
    };
  }

  if (!userCoords || (userCoords.latitude === 0 && userCoords.longitude === 0)) {
    return {
      isInside: false,
      distanceMeters: -1,
      error: 'Không thể xác định vị trí GPS hiện tại của thiết bị nhân viên.'
    };
  }

  const distance = calculateDistanceInMeters(userCoords, storeCoords);
  const isInside = distance <= allowedRadiusMeters;

  return {
    isInside,
    distanceMeters: distance,
    error: isInside ? undefined : `Bạn đang ở cách cửa hàng ${distance}m (Vượt quá bán kính cho phép ${allowedRadiusMeters}m).`
  };
}
