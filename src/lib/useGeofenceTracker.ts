import { useEffect, useRef, useState } from 'react';
import { sendTelegramAlert } from './telegram';
import { useAuth } from './AuthContext'; // Might not exist, we'll check

// Tọa độ chi nhánh giả lập (Ví dụ: Cầu Giấy)
const STORE_LATITUDE = 21.033333;
const STORE_LONGITUDE = 105.783333;
const MAX_RADIUS_METERS = 100; // Bán kính 100 mét
const ALERT_COOLDOWN_MS = 15 * 60 * 1000; // 15 phút cooldown chống spam

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // Bán kính trái đất (mét)
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
            Math.cos(φ1) * Math.cos(φ2) *
            Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c); // Khoảng cách theo mét
}

export function useGeofenceTracker(employeeName: string, isWorking: boolean) {
  const [distance, setDistance] = useState<number | null>(null);
  const [isOutOfBounds, setIsOutOfBounds] = useState(false);
  const lastAlertTime = useRef<number>(0);
  const watchId = useRef<number | null>(null);

  useEffect(() => {
    // Chỉ theo dõi nếu nhân viên đang trong ca làm việc
    if (!isWorking || !navigator.geolocation) {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
      return;
    }

    watchId.current = navigator.geolocation.watchPosition(
      (position) => {
        const { latitude, longitude } = position.coords;
        const dist = calculateDistance(latitude, longitude, STORE_LATITUDE, STORE_LONGITUDE);
        setDistance(dist);

        if (dist > MAX_RADIUS_METERS) {
          setIsOutOfBounds(true);
          
          const now = Date.now();
          if (now - lastAlertTime.current > ALERT_COOLDOWN_MS) {
            // Trigger Telegram Alert
            const message = `🚨 <b>CẢNH BÁO RỜI CHI NHÁNH</b> 🚨\n\n` +
                            `👤 <b>Nhân viên:</b> ${employeeName}\n` +
                            `📍 <b>Khoảng cách hiện tại:</b> ${dist} mét (Vượt quá ${MAX_RADIUS_METERS}m)\n` +
                            `⏰ <b>Thời gian:</b> ${new Date().toLocaleTimeString('vi-VN')}\n` +
                            `⚠️ <i>Hệ thống phát hiện nhân viên đang ngoài vùng cho phép trong ca làm việc!</i>`;
            
            sendTelegramAlert(message);
            lastAlertTime.current = now;
          }
        } else {
          setIsOutOfBounds(false);
        }
      },
      (error) => {
        console.warn("Geofence tracking error:", error);
      },
      { enableHighAccuracy: true, maximumAge: 10000, timeout: 5000 }
    );

    return () => {
      if (watchId.current !== null) {
        navigator.geolocation.clearWatch(watchId.current);
      }
    };
  }, [employeeName, isWorking]);

  return { distance, isOutOfBounds };
}
