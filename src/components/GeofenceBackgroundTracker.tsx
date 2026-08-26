import React from 'react';
import { useGeofenceTracker } from '../lib/useGeofenceTracker';
import { UserAccount } from '../types';

interface Props {
  currentUser: UserAccount | null;
  isCheckedIn: boolean;
}

export function GeofenceBackgroundTracker({ currentUser, isCheckedIn }: Props) {
  // Trạng thái ca đến từ attendance record trên backend; trình duyệt không tự
  // duy trì một cờ chấm công riêng có thể sai sau reload/đổi tài khoản.
  useGeofenceTracker(currentUser?.displayName || 'Nhân viên', Boolean(currentUser && isCheckedIn));

  return null; // Invisible component
}
