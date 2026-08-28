import { useEffect, useRef, useState } from 'react';
import { requestAttendanceLocationHeartbeat } from '../services/attendanceApiClient';

const HEARTBEAT_INTERVAL_MS = 2 * 60 * 1000;

export function useGeofenceTracker(_employeeName: string, isWorking: boolean, branchId?: string) {
  const [distance, setDistance] = useState<number | null>(null);
  const [isOutOfBounds, setIsOutOfBounds] = useState(false);
  const lastSentAt = useRef<number>(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    // Chỉ theo dõi nếu nhân viên đang trong ca làm việc
    if (!isWorking || !branchId || !navigator.geolocation) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const now = Date.now();
        if (now - lastSentAt.current < HEARTBEAT_INTERVAL_MS) return;
        lastSentAt.current = now;
        void requestAttendanceLocationHeartbeat({
          branchId,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracyMeters: Math.round(position.coords.accuracy || 0)
        }).then(result => {
          setDistance(result.distanceMeters);
          setIsOutOfBounds(!result.isInside);
        }).catch(error => {
          // A closed/expired shift stops producing useful heartbeats. The next
          // attendance state refresh will unmount this watcher automatically.
          console.warn('[Attendance Location Heartbeat]:', error?.message || error);
        });
      },
      (error) => {
        console.warn("Geofence tracking error:", error);
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 20_000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [branchId, isWorking]);

  return { distance, isOutOfBounds };
}
