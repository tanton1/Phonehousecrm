import React, { useEffect, useState } from 'react';
import { useGeofenceTracker } from '../lib/useGeofenceTracker';
import { User } from '../types';
import { INITIAL_TODAY_ATTENDANCE_LIST } from '../data/attendanceData';

interface Props {
  currentUser: User | null;
}

export function GeofenceBackgroundTracker({ currentUser }: Props) {
  const [isWorking, setIsWorking] = useState(false);

  // Poll attendance data to see if the user is currently checked in but not checked out
  // (In a real app, this would be a real-time subscription to Firebase)
  useEffect(() => {
    if (!currentUser) {
      setIsWorking(false);
      return;
    }

    const checkWorkingStatus = () => {
      // Very basic logic: we assume if there's any logic defining they are checked in.
      // We can check localStorage or the INITIAL_TODAY_ATTENDANCE_LIST (or assume they are working if they are an employee)
      // For this demo, let's just consider if they are a STAFF member, we track them.
      // To be accurate, we'll check local storage 'phonehouse_is_checked_in' if it exists.
      const checkedInStatus = localStorage.getItem(`phonehouse_is_checked_in_${currentUser.id}`);
      if (checkedInStatus === 'true') {
        setIsWorking(true);
      } else {
        setIsWorking(false);
      }
    };

    checkWorkingStatus();
    // Poll every 10 seconds just to keep state synced without complex context
    const interval = setInterval(checkWorkingStatus, 10000);
    return () => clearInterval(interval);
  }, [currentUser]);

  // Hook will start watching GPS if isWorking is true
  const { distance, isOutOfBounds } = useGeofenceTracker(currentUser?.name || 'Nhân viên', isWorking);

  return null; // Invisible component
}
