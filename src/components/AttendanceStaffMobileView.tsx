import React, { useState, useEffect, useMemo, useRef } from 'react';
import { 
  StaffMember, 
  AttendanceRecord, 
  WeeklyShiftSchedule, 
  LeaveRequest, 
  CommissionTransaction, 
  MonthlyPayrollSlip,
  PayrollLedgerItem,
  StoreBranch
} from '../types';
import { FaceRegistrationModal } from './FaceRegistrationModal';
import { compareFaceVectors, extractFaceFeatureVectorFromCanvas, detectFacePresenceInCanvas } from '../utils/faceMatchingEngine';
import { submitServerCheckIn, submitServerCheckOut } from '../features/attendance/api/attendanceApi';
import { 
  CheckCircle2, 
  Clock, 
  MapPin, 
  Wifi, 
  ScanFace, 
  QrCode, 
  Calendar, 
  TrendingUp, 
  Sparkles, 
  ChevronRight, 
  ArrowLeft, 
  ArrowRight,
  Coffee, 
  ExternalLink, 
  Truck, 
  Wrench, 
  FileText, 
  AlertCircle, 
  DollarSign, 
  Plus, 
  User, 
  Bell, 
  Briefcase, 
  Home, 
  Check, 
  X, 
  ShieldCheck, 
  ChevronDown,
  Layers,
  ShoppingBag,
  Award,
  Target,
  Zap,
  CheckSquare,
  Square,
  LogOut,
  Flame,
  ArrowUpRight,
  Activity,
  CheckCircle,
  HelpCircle,
  TrendingDown,
  Camera,
  RefreshCw,
  AlertTriangle,
  XCircle,
  Loader2,
  ShieldAlert,
  Scan,
  Radio,
  SlidersHorizontal,
  Play,
  SwitchCamera,
  Eye,
  CheckCheck
} from 'lucide-react';

interface AttendanceStaffMobileViewProps {
  currentUser: StaffMember;
  attendanceRecord: AttendanceRecord;
  weeklySchedule: WeeklyShiftSchedule;
  leaveRequests: LeaveRequest[];
  commissions: CommissionTransaction[];
  payrollSlip: MonthlyPayrollSlip;
  payrollLedgers: PayrollLedgerItem[];
  branches?: StoreBranch[];
  onCheckIn: (verificationData: any) => void;
  onCheckOut: () => void;
  onChangeActivity: (activity: 'WORKING' | 'BREAK' | 'OUTSIDE' | 'DELIVERY' | 'SUPPORT_TECH') => void;
  onCreateLeaveRequest: (req: Partial<LeaveRequest>) => void;
}

export const AttendanceStaffMobileView: React.FC<AttendanceStaffMobileViewProps> = ({
  currentUser,
  attendanceRecord,
  weeklySchedule,
  leaveRequests,
  commissions,
  payrollSlip,
  payrollLedgers,
  branches = [],
  onCheckIn,
  onCheckOut,
  onChangeActivity,
  onCreateLeaveRequest
}) => {
  // Mobile Nav 4 Tabs: 'today' | 'schedule' | 'notifications' | 'profile'
  const [activeBottomTab, setActiveBottomTab] = useState<'today' | 'schedule' | 'notifications' | 'profile'>('today');

  // Sub-screens & Modals
  const [currentScreen, setCurrentScreen] = useState<'HOME' | 'VERIFY_CHECKIN' | 'SUCCESS_CHECKIN' | 'CHECKOUT_SUMMARY' | 'PAYROLL_DETAIL' | 'LEAVE_MODAL'>('HOME');

  // Store Branch Target Lookup & Config
  const availableBranches = useMemo(() => {
    return branches || [];
  }, [branches]);

  const targetBranch = useMemo(() => {
    if (currentUser?.branchId) {
      const found = availableBranches.find(b => b.id === currentUser.branchId || b.code === currentUser.branchId);
      if (found) return found;
    }
    if (currentUser?.branchName) {
      const found = availableBranches.find(b => 
        b.name.toLowerCase().includes(currentUser.branchName!.toLowerCase()) || 
        currentUser.branchName!.toLowerCase().includes(b.name.toLowerCase())
      );
      if (found) return found;
    }
    return availableBranches[0];
  }, [availableBranches, currentUser?.branchId, currentUser?.branchName]);

  const [activeBranchGps, setActiveBranchGps] = useState<{ lat: number; lng: number } | null>(null);

  const targetLat = activeBranchGps ? activeBranchGps.lat : (targetBranch?.gpsLatitude ?? 0);
  const targetLng = activeBranchGps ? activeBranchGps.lng : (targetBranch?.gpsLongitude ?? 0);
  const allowedRadiusMeters = targetBranch?.attendanceRadius ?? targetBranch?.allowedGpsRadiusMeters ?? 50;
  const targetWifiSSID = targetBranch?.allowedWifiSSID || currentUser?.allowedWifiSSID || 'WIFI_CUA_HANG';

  // Device coordinates & Error messages
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const [serverVerifiedTime, setServerVerifiedTime] = useState<string | null>(null);
  const [serverVerifiedDate, setServerVerifiedDate] = useState<string | null>(null);

  // Haversine formula to compute exact distance in meters between two lat/lng points
  const calculateDistanceInMeters = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3; // metres
    const φ1 = (lat1 * Math.PI) / 180;
    const φ2 = (lat2 * Math.PI) / 180;
    const Δφ = ((lat2 - lat1) * Math.PI) / 180;
    const Δλ = ((lon2 - lon1) * Math.PI) / 180;

    const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
              Math.cos(φ1) * Math.cos(φ2) *
              Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return Math.round(R * c);
  };
  
  // Face Biometric State & Persistence
  const [isFaceRegistrationOpen, setIsFaceRegistrationOpen] = useState<boolean>(false);
  const [staffFaceProfile, setStaffFaceProfile] = useState<{
    facePhotoUrl?: string;
    assignedFaceEmbedding: boolean;
    faceFeatureVector?: number[];
    faceEnrollmentDate?: string;
  }>(() => {
    try {
      const storageKey = `phonehouse_face_profile_${currentUser.id || currentUser.code || 'STAFF'}`;
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        return JSON.parse(saved);
      }
    } catch (e) {
      console.warn('Could not read saved face profile:', e);
    }
    return {
      facePhotoUrl: currentUser.facePhotoUrl || currentUser.avatar,
      assignedFaceEmbedding: currentUser.assignedFaceEmbedding ?? true,
      faceFeatureVector: currentUser.faceFeatureVector,
      faceEnrollmentDate: currentUser.faceEnrollmentDate || '2024-01-15'
    };
  });

  const handleSaveSelfFaceProfile = (faceData: {
    facePhotoUrl: string;
    faceFeatureVector: number[];
    faceEnrollmentDate: string;
  }) => {
    const updated = {
      facePhotoUrl: faceData.facePhotoUrl,
      assignedFaceEmbedding: true,
      faceFeatureVector: faceData.faceFeatureVector,
      faceEnrollmentDate: faceData.faceEnrollmentDate
    };
    setStaffFaceProfile(updated);
    try {
      const storageKey = `phonehouse_face_profile_${currentUser.id || currentUser.code || 'STAFF'}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (e) {
      console.warn('Could not persist face profile:', e);
    }
    setFaceStatus('SUCCESS');
    setFaceConfidence(98.8);
    setFaceFeedbackMsg(`Đã cập nhật & xác thực mẫu Face ID của nhân viên ${currentUser.name}`);
  };

  // Real Camera Refs & Video Stream Lifecycle
  const liveVideoRef = useRef<HTMLVideoElement | null>(null);
  const liveCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const liveMediaStreamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState<boolean>(false);
  const [isCameraStarting, setIsCameraStarting] = useState<boolean>(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isVerifyingFace, setIsVerifyingFace] = useState<boolean>(false);
  const [faceFeedbackMsg, setFaceFeedbackMsg] = useState<string | null>(null);
  const [cameraFacingMode, setCameraFacingMode] = useState<'user' | 'environment'>('user');
  const [capturedSnapshotUrl, setCapturedSnapshotUrl] = useState<string | null>(null);

  const stopLiveCamera = () => {
    if (liveMediaStreamRef.current) {
      liveMediaStreamRef.current.getTracks().forEach(track => {
        try { track.stop(); } catch (e) {}
      });
      liveMediaStreamRef.current = null;
    }
    if (liveVideoRef.current) {
      liveVideoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraStarting(false);
  };

  const startLiveCamera = async (facing: 'user' | 'environment' = cameraFacingMode) => {
    setCameraError(null);
    setIsCameraStarting(true);
    stopLiveCamera();

    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: facing,
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
        liveMediaStreamRef.current = stream;
        if (liveVideoRef.current) {
          liveVideoRef.current.srcObject = stream;
          try {
            await liveVideoRef.current.play();
          } catch (playErr) {
            console.warn('Video play error:', playErr);
          }
        }
        setIsCameraActive(true);
        setIsCameraStarting(false);
        setCameraError(null);
      } else {
        setCameraError('Trình duyệt hoặc môi trường không hỗ trợ Camera Web API.');
        setIsCameraStarting(false);
      }
    } catch (err: any) {
      console.warn('Camera access error:', err);
      setIsCameraStarting(false);
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Quyền Camera bị từ chối. Nếu đang xem trên Preview, hãy mở ứng dụng ở Tab mới (↗️) và Bật quyền Camera.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setCameraError('Không tìm thấy thiết bị Camera khả dụng.');
      } else {
        setCameraError(`Chưa kết nối được Camera: ${err.message || 'Lỗi thiết bị'}`);
      }
    }
  };

  // Toggle Camera Front/Back
  const handleToggleCameraFacing = () => {
    const nextFacing = cameraFacingMode === 'user' ? 'environment' : 'user';
    setCameraFacingMode(nextFacing);
    startLiveCamera(nextFacing);
  };

  // Real Face ID Biometric Verification Execution
  const executeRealFaceScan = async () => {
    if (!liveVideoRef.current || !isCameraActive) {
      await startLiveCamera();
      return;
    }

    setIsVerifyingFace(true);
    setFaceStatus('PENDING');
    setFaceFeedbackMsg('Đang chụp khung hình camera & đối soát dữ liệu sinh trắc học...');

    try {
      // Đợi 500ms để camera lấy nét và điều chỉnh sáng
      await new Promise(resolve => setTimeout(resolve, 500));
      const video = liveVideoRef.current;
      const canvas = liveCanvasRef.current || document.createElement('canvas');
      const width = video.videoWidth || 640;
      const height = video.videoHeight || 480;
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Không thể khởi tạo canvas 2D');
      
      // Capture live frame
      ctx.drawImage(video, 0, 0, width, height);
      const liveDataUrl = canvas.toDataURL('image/jpeg', 0.85);
      setCapturedSnapshotUrl(liveDataUrl);

      // Check real face presence in frame first
      const presence = detectFacePresenceInCanvas(canvas);
      if (!presence.hasFace) {
        setFaceStatus('ERROR');
        setFaceConfidence(10.0);
        setFaceFeedbackMsg(presence.reason || '❌ Không phát hiện khuôn mặt người trong khung hình. Vui lòng hướng mặt thẳng vào camera.');
        setIsVerifyingFace(false);
        return;
      }

      // Extract local biometric vector
      const liveVector = extractFaceFeatureVectorFromCanvas(canvas);

      // Verify registered baseline vector from approved enrollment profile
      const hasExistingVector = staffFaceProfile?.faceFeatureVector && staffFaceProfile.faceFeatureVector.length > 0;
      if (!hasExistingVector) {
        setFaceStatus('ERROR');
        setFaceConfidence(0);
        setFaceFeedbackMsg(`Tài khoản ${currentUser.name} chưa được Quản lý duyệt mẫu Face ID. Vui lòng liên hệ Quản lý/Admin.`);
        setIsVerifyingFace(false);
        return;
      }

      // Call backend AI Face Verification endpoint
      let isVerified = false;
      try {
        const res = await fetch('/api/ai/verify-face', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            livePhotoBase64: liveDataUrl,
            referencePhotoBase64: staffFaceProfile.facePhotoUrl?.startsWith('data:') ? staffFaceProfile.facePhotoUrl : undefined,
            referencePhotoUrl: !staffFaceProfile.facePhotoUrl?.startsWith('data:') ? staffFaceProfile.facePhotoUrl : undefined,
            employeeName: currentUser.name,
            liveVector,
            storedVector: staffFaceProfile.faceFeatureVector
          })
        });

        if (res.ok) {
          const json = await res.json();
          if (json.success && json.data) {
            const { isMatched, confidenceScore, matchReason, isHumanFacePresent } = json.data;
            if (isMatched && isHumanFacePresent) {
              setFaceStatus('SUCCESS');
              setFaceConfidence(confidenceScore || 98.6);
              setFaceFeedbackMsg(matchReason || `Đã đối soát trùng khớp khuôn mặt nhân viên: ${currentUser.name}`);
              isVerified = true;
            } else {
              setFaceStatus('ERROR');
              setFaceConfidence(confidenceScore || 35.0);
              setFaceFeedbackMsg(matchReason || `Khuôn mặt không trùng khớp với hồ sơ đăng ký của ${currentUser.name}`);
              isVerified = true;
            }
          }
        }
      } catch (apiErr) {
        console.warn('Backend face verification fallback:', apiErr);
      }

      if (!isVerified) {
        setFaceStatus('ERROR');
        setFaceConfidence(0);
        setFaceFeedbackMsg('Máy chủ AI xác thực bảo mật không phản hồi. Vui lòng kiểm tra mạng và quét lại.');
      }
    } catch (err: any) {
      console.error('Execute face scan error:', err);
      setFaceStatus('ERROR');
      setFaceFeedbackMsg('Lỗi camera khi chụp khung hình. Vui lòng thử lại.');
    } finally {
      setIsVerifyingFace(false);
    }
  };

  // Manage Camera on screen transition
  useEffect(() => {
    if (currentScreen === 'VERIFY_CHECKIN') {
      startLiveCamera('user');
    } else {
      stopLiveCamera();
    }
    return () => {
      stopLiveCamera();
    };
  }, [currentScreen]);

  // Real-time Live Clock State
  const [currentRealTime, setCurrentRealTime] = useState<Date>(new Date());
  useEffect(() => {
    const timer = setInterval(() => setCurrentRealTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveTimeString = currentRealTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const liveDateString = currentRealTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });

  // Captured Check-in Timestamps
  const [recordedCheckInTime, setRecordedCheckInTime] = useState<string>('');
  const [recordedCheckInDate, setRecordedCheckInDate] = useState<string>('');
  const [checkInStartTimestamp, setCheckInStartTimestamp] = useState<number | null>(null);

  type StepStatus = 'SUCCESS' | 'PENDING' | 'ERROR';
  const [gpsStatus, setGpsStatus] = useState<StepStatus>('PENDING');
  const [wifiStatus, setWifiStatus] = useState<StepStatus>('PENDING');
  const [faceStatus, setFaceStatus] = useState<StepStatus>('PENDING');
  const [qrStatus, setQrStatus] = useState<StepStatus>('PENDING');
  const [isAutoScanning, setIsAutoScanning] = useState<boolean>(false);
  const [faceConfidence, setFaceConfidence] = useState<number>(99.4);
  const [gpsDistance, setGpsDistance] = useState<number>(0);
  const [currentWifiSSID, setCurrentWifiSSID] = useState<string>(targetWifiSSID);
  const [qrSessionCode, setQrSessionCode] = useState<string>(`PH-QR-${targetBranch.code || 'STORE'}-LIVE`);

  // Real GPS Location Verification via Geolocation API & Haversine Formula
  const fetchRealGPSLocation = (tLat = targetLat, tLng = targetLng, maxMeters = allowedRadiusMeters) => {
    setGpsStatus('PENDING');
    setGpsErrorMsg(null);

    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const uLat = position.coords.latitude;
          const uLng = position.coords.longitude;
          setUserCoords({ lat: uLat, lng: uLng });
          
          if (!tLat || !tLng || tLat === 0 || tLng === 0) {
            setGpsStatus('ERROR');
            setGpsErrorMsg(`Chi nhánh ${targetBranch.name} chưa được cấu hình tọa độ GPS chuẩn. Vui lòng liên hệ Quản lý/Admin.`);
          } else {
            const distance = calculateDistanceInMeters(uLat, uLng, tLat, tLng);
            setGpsDistance(distance);

            if (distance <= maxMeters) {
              setGpsStatus('SUCCESS');
              setGpsErrorMsg(null);
            } else {
              setGpsStatus('ERROR');
              setGpsErrorMsg(`Nằm ngoài bán kính cửa hàng ${targetBranch.name} (${distance > 1000 ? `${(distance/1000).toFixed(2)} km` : `${distance} mét`}). Yêu cầu ≤ ${maxMeters}m.`);
            }
          }
        },
        (error) => {
          console.warn('GPS location request warning/error:', error);
          setGpsStatus('ERROR');
          let errText = 'Không thể truy cập tọa độ GPS từ thiết bị.';
          if (error.code === error.PERMISSION_DENIED) {
            errText = 'Quyền vị trí GPS bị từ chối trên trình duyệt/thiết bị.';
          } else if (error.code === error.POSITION_UNAVAILABLE) {
            errText = 'Tín hiệu GPS thiết bị không khả dụng.';
          } else if (error.code === error.TIMEOUT) {
            errText = 'Hết thời gian chờ định vị GPS.';
          }
          setGpsErrorMsg(errText);
        },
        { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }
      );
    } else {
      setGpsStatus('ERROR');
      setGpsErrorMsg('Trình duyệt không hỗ trợ Geolocation API.');
    }
  };

  // Trigger automated scan with real GPS and Face verification
  const runAutoScanSimulation = () => {
    setIsAutoScanning(true);
    setGpsStatus('PENDING');
    setWifiStatus('PENDING');
    setFaceStatus('PENDING');
    setQrStatus('PENDING');

    fetchRealGPSLocation();

    // Real Server Network / Public IP verification
    fetch('/api/attendance/network-check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branchId: targetBranch?.id })
    })
      .then(res => res.json())
      .then(json => {
        if (json.success && json.data?.isAllowed) {
          setWifiStatus('SUCCESS');
          setCurrentWifiSSID(`Mạng cửa hàng (${json.data.networkSignature || 'Hợp lệ'})`);
          if (json.data.serverTimeFormatted) {
            setServerVerifiedTime(json.data.serverTimeFormatted);
            setServerVerifiedDate(json.data.serverDateFormatted);
          }
        } else {
          setWifiStatus('ERROR');
          setCurrentWifiSSID(json.data?.clientIp ? `Mạng ngoài: ${json.data.clientIp}` : 'Mạng chưa được cấp phép');
        }
      })
      .catch(() => {
        setWifiStatus('ERROR');
        setCurrentWifiSSID('Không kết nối được cổng kiểm tra mạng');
      });

    setTimeout(() => {
      executeRealFaceScan();
      setIsAutoScanning(false);
    }, 1000);
  };

  // Simplified 3-Factor Verification: GPS + Wi-Fi + Face ID
  const isAllVerified = gpsStatus === 'SUCCESS' && wifiStatus === 'SUCCESS' && faceStatus === 'SUCCESS';

  // Retry individual verification step
  const retryStep = (step: 'GPS' | 'WIFI' | 'FACE' | 'QR') => {
    if (step === 'GPS') {
      fetchRealGPSLocation();
    } else if (step === 'WIFI') {
      setWifiStatus('PENDING');
      fetch('/api/attendance/network-check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ branchId: targetBranch?.id })
      })
        .then(res => res.json())
        .then(json => {
          if (json.success && json.data?.isAllowed) {
            setWifiStatus('SUCCESS');
            setCurrentWifiSSID(`Mạng cửa hàng (${json.data.networkSignature || 'Hợp lệ'})`);
            if (json.data.serverTimeFormatted) {
              setServerVerifiedTime(json.data.serverTimeFormatted);
              setServerVerifiedDate(json.data.serverDateFormatted);
            }
          } else {
            setWifiStatus('ERROR');
            setCurrentWifiSSID(json.data?.clientIp ? `Mạng ngoài: ${json.data.clientIp}` : 'Mạng chưa được cấp phép');
          }
        })
        .catch(() => {
          setWifiStatus('ERROR');
          setCurrentWifiSSID('Không kết nối được cổng kiểm tra mạng');
        });
    } else if (step === 'FACE') {
      executeRealFaceScan();
    } else if (step === 'QR') {
      setQrStatus('PENDING');
      setTimeout(() => {
        setQrStatus('SUCCESS');
        setQrSessionCode(`PH-QR-${targetBranch.code || 'STORE'}-LIVE`);
      }, 700);
    }
  };

  // Drilldown Modal for Commission items (Truy vết nguồn tiền)
  const [selectedLedgerItem, setSelectedLedgerItem] = useState<PayrollLedgerItem | null>(null);

  // New Leave Request form state
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    type: 'ANNUAL_LEAVE' as LeaveRequest['type'],
    startDate: new Date().toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    reason: '',
    swapWithStaffName: ''
  });

  // Demo switch to preview both states: 'CHECKED_IN' or 'NOT_CHECKED_IN' or use real attendanceRecord.status
  const [shiftStatusOverride, setShiftStatusOverride] = useState<'AUTO' | 'NOT_CHECKED_IN' | 'CHECKED_IN'>('AUTO');
  
  // Real Attendance status calculation
  const isActuallyCheckedIn = Boolean(attendanceRecord && attendanceRecord.checkInTime && !attendanceRecord.checkOutTime);
  const isShiftCheckedIn = shiftStatusOverride === 'CHECKED_IN' ? true : (shiftStatusOverride === 'NOT_CHECKED_IN' ? false : isActuallyCheckedIn);

  // Live timer for in-shift
  const [secondsInShift, setSecondsInShift] = useState<number>(0);
  useEffect(() => {
    if (attendanceRecord?.status === 'IN_PROGRESS' || shiftStatusOverride === 'IN_PROGRESS') {
      const baseTime = checkInStartTimestamp || (Date.now() - 3 * 3600 * 1000 - 15 * 60 * 1000); // default ~03h 15m if demo
      const updateSeconds = () => {
        const elapsed = Math.max(0, Math.floor((Date.now() - baseTime) / 1000));
        setSecondsInShift(elapsed);
      };
      updateSeconds();
      const interval = setInterval(updateSeconds, 1000);
      return () => clearInterval(interval);
    }
  }, [attendanceRecord?.status, shiftStatusOverride, checkInStartTimestamp]);

  const formatTimer = (totalSeconds: number) => {
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const secs = totalSeconds % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  };

  // Daily checklist tasks for Screen 01
  const [dailyTasks, setDailyTasks] = useState([
    { id: 't1', title: 'Kiểm kê số lượng máy iPhone tủ kính đầu ca', category: 'Vận hành', completed: true, time: '08:05' },
    { id: 't2', title: 'Vệ sinh bàn trải nghiệm & lau máy demo iPhone 15/16', category: 'Vận hành', completed: true, time: '08:15' },
    { id: 't3', title: 'Tư vấn khách hàng tiềm năng mua máy mới (8/15 khách)', category: 'Tư vấn', completed: false, highlight: true },
    { id: 't4', title: 'Gọi điện hỏi thăm & chăm sóc 5 khách mua tuần trước', category: 'CSKH', completed: false },
    { id: 't5', title: 'Bàn giao ca & đối soát tiền mặt, máy thu cũ cuối ngày', category: 'Vận hành', completed: false }
  ]);

  const toggleTask = (taskId: string) => {
    setDailyTasks(prev => prev.map(t => t.id === taskId ? { ...t, completed: !t.completed } : t));
  };

  const isCheckedIn = shiftStatusOverride === 'AUTO'
    ? (attendanceRecord?.status === 'IN_PROGRESS' || attendanceRecord?.status === 'COMPLETED')
    : (shiftStatusOverride === 'IN_PROGRESS');

  // Handle perform Check-in flow: Reset steps, navigate to Screen 02 & start active scan
  const handleStartCheckInVerify = () => {
    setGpsStatus('PENDING');
    setWifiStatus('PENDING');
    setFaceStatus('PENDING');
    setQrStatus('PENDING');
    setCurrentScreen('VERIFY_CHECKIN');
    runAutoScanSimulation();
  };

  const handleConfirmCheckIn = async () => {
    if (attendanceRecord?.checkInTime) {
      alert(`Bạn đã điểm danh vào ca hôm nay lúc ${attendanceRecord.checkInTime}.`);
      return;
    }

    const timeStr = serverVerifiedTime || new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });
    const dateStr = serverVerifiedDate || new Date().toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Asia/Ho_Chi_Minh' });

    setRecordedCheckInTime(timeStr);
    setRecordedCheckInDate(dateStr);
    setCheckInStartTimestamp(Date.now());

    try {
      await submitServerCheckIn({
        staffId: currentUser.id,
        staffName: currentUser.displayName,
        role: currentUser.role,
        branchId: targetBranch?.id || currentUser.branchId || 'CN01',
        branchName: targetBranch?.name || 'Chi nhánh PhoneHouse',
        userCoords: userCoords ? { latitude: userCoords.lat, longitude: userCoords.lng } : undefined,
        storeCoords: targetBranch ? { latitude: targetBranch.gpsLatitude || targetBranch.latitude || 0, longitude: targetBranch.gpsLongitude || targetBranch.longitude || 0 } : undefined,
        allowedRadiusMeters: targetBranch?.attendanceRadius || targetBranch?.allowedGpsRadiusMeters || 50,
        faceVerified: faceStatus === 'SUCCESS',
        faceConfidence: faceConfidence || 0,
        networkVerified: wifiStatus === 'SUCCESS',
        qrScanned: qrStatus === 'SUCCESS'
      });
    } catch (e: any) {
      console.warn('Server Check-in sync note:', e?.message || e);
    }

    onCheckIn({
      time: timeStr,
      gpsVerified: gpsStatus === 'SUCCESS',
      wifiVerified: wifiStatus === 'SUCCESS',
      faceVerified: faceStatus === 'SUCCESS',
      qrScanned: qrStatus === 'SUCCESS'
    });
    setCurrentScreen('SUCCESS_CHECKIN');
    localStorage.setItem(`phonehouse_is_checked_in_${currentUser.id}`, 'true');
  };

  const handleConfirmCheckOut = async () => {
    try {
      await submitServerCheckOut(currentUser.id, targetBranch?.id || currentUser.branchId || 'CN01');
    } catch (e) {
      console.warn('Server Check-out sync note:', e);
    }
    onCheckOut();
    localStorage.removeItem(`phonehouse_is_checked_in_${currentUser.id}`);
    setShiftStatusOverride('AUTO'); // reset demo state
    setCurrentScreen('HOME');
  };

  // Schedule selected date
  const [selectedDateKey, setSelectedDateKey] = useState<string>('2026-05-16');
  const [scheduleViewMode, setScheduleViewMode] = useState<'WEEK' | 'MONTH'>('WEEK');

  // Submit Leave Request
  const handleSubmitLeave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!leaveForm.reason.trim()) return;
    onCreateLeaveRequest({
      staffId: currentUser.id,
      staffName: currentUser.name,
      role: currentUser.role,
      branchName: currentUser.branchName,
      type: leaveForm.type,
      startDate: leaveForm.startDate,
      endDate: leaveForm.endDate,
      totalDays: leaveForm.type === 'HALF_DAY' ? 0.5 : 1,
      reason: leaveForm.reason,
      swapWithStaffName: leaveForm.swapWithStaffName || undefined,
      status: 'PENDING'
    });
    setIsLeaveModalOpen(false);
    setLeaveForm({
      type: 'ANNUAL_LEAVE',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date().toISOString().split('T')[0],
      reason: '',
      swapWithStaffName: ''
    });
  };

  return (
    <div className="min-h-screen bg-[#F7F8FA] pb-24 text-zinc-900 font-sans antialiased select-none max-w-md mx-auto relative border-x border-zinc-200/60 shadow-xl overflow-hidden">
      
      {/* SCREEN 02: XÁC MINH CHẤM CÔNG (4-FACTOR VERIFICATION: GPS, WI-FI, FACE ID, QR CODE) */}
      {currentScreen === 'VERIFY_CHECKIN' && (
        <div className="min-h-screen bg-[#F8F9FC] flex flex-col p-4 animate-in fade-in duration-200">
          
          {/* BRAND HERO HEADER WITH LIVE DIGITAL CLOCK & STORE CONTEXT */}
          <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-3xl p-4 shadow-xl border border-zinc-800/80 mb-3.5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-36 h-36 bg-[#FF4B16]/20 rounded-full blur-3xl pointer-events-none" />
            <div className="absolute -bottom-10 -left-10 w-28 h-28 bg-[#FF4B16]/10 rounded-full blur-2xl pointer-events-none" />

            {/* Top Bar */}
            <div className="flex items-center justify-between relative z-10 mb-3">
              <button 
                onClick={() => setCurrentScreen('HOME')}
                className="p-2 -ml-1 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer backdrop-blur-md flex items-center space-x-1"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-[11px] font-bold">Trở về</span>
              </button>

              <div className="flex items-center space-x-1.5 bg-[#FF4B16]/15 border border-[#FF4B16]/30 px-3 py-1 rounded-full backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-[#FF4B16] animate-pulse" />
                <span className="text-[11px] font-black text-[#FF4B16] tracking-wide uppercase">{targetBranch.name}</span>
              </div>

              <button
                onClick={runAutoScanSimulation}
                disabled={isAutoScanning}
                title="Đo lại vị trí & Wi-Fi"
                className="p-2 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-all cursor-pointer backdrop-blur-md disabled:opacity-50 flex items-center space-x-1"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isAutoScanning ? 'animate-spin text-[#FF4B16]' : ''}`} />
                <span className="text-[10px] font-bold">Quét lại</span>
              </button>
            </div>

            {/* Live Clock & Staff Identity */}
            <div className="flex items-end justify-between relative z-10 pt-1">
              <div>
                <div className="text-[10px] text-zinc-400 font-bold uppercase tracking-wider flex items-center space-x-1">
                  <Clock className="w-3 h-3 text-[#FF4B16]" />
                  <span>Giờ điểm danh chuẩn</span>
                </div>
                <div className="text-3xl font-black font-mono tracking-tight text-white mt-0.5">
                  {liveTimeString}
                </div>
                <div className="text-[11px] text-zinc-300 font-medium mt-0.5">
                  {liveDateString}
                </div>
              </div>

              <div className="text-right">
                <div className="text-[11px] font-extrabold text-white flex items-center justify-end space-x-1">
                  <User className="w-3.5 h-3.5 text-[#FF4B16]" />
                  <span>{currentUser.name}</span>
                </div>
                <div className="text-[10px] text-orange-200 font-bold bg-[#FF4B16]/20 px-2.5 py-0.5 rounded-full border border-[#FF4B16]/30 mt-1 inline-block">
                  {currentUser.roleName || 'Nhân viên bán hàng'}
                </div>
              </div>
            </div>
          </div>

          {/* REAL DEVICE SENSORS TOOLBAR */}
          <div className="bg-white rounded-2xl p-3 border border-zinc-200/80 shadow-2xs mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center space-x-1.5 text-zinc-600 text-xs font-bold">
              <MapPin className="w-4 h-4 text-[#FF4B16]" />
              <span>Đo cảm biến GPS & mạng thực tế:</span>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => fetchRealGPSLocation()}
                className="py-1.5 px-3 rounded-xl bg-orange-50 hover:bg-orange-100 text-[#FF4B16] border border-orange-200 transition-all flex items-center justify-center space-x-1.5 cursor-pointer text-xs font-black active:scale-95 shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Quét lại GPS thực tế</span>
              </button>
            </div>
          </div>

          {/* FRIENDLY WARNING BANNER FOR OUTSIDE RADIUS / WIFI ERROR */}
          {(gpsStatus === 'ERROR' || wifiStatus === 'ERROR') && (
            <div className="mb-3 bg-rose-50/90 border-2 border-rose-200 rounded-2xl p-3.5 space-y-2 text-rose-950 shadow-xs">
              <div className="flex items-center gap-2 font-black text-rose-800 text-xs uppercase tracking-wide">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 animate-bounce" />
                <span>CẢNH BÁO THÔNG TIN CHẤM CÔNG</span>
              </div>

              {gpsStatus === 'ERROR' && (
                <div className="bg-white/95 rounded-xl p-2.5 text-[11px] border border-rose-200 space-y-1.5">
                  <div className="font-extrabold text-rose-900 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-rose-600" />
                      Vị Trí Ngoài Bán Kính Cửa Hàng
                    </span>
                    <span className="bg-rose-100 text-rose-800 font-mono font-black text-[10px] px-2 py-0.5 rounded-md">
                      {gpsDistance > 1000 ? `${(gpsDistance/1000).toFixed(2)} km` : `${gpsDistance} mét`}
                    </span>
                  </div>
                  <p className="text-rose-800 font-medium leading-tight">
                    Thiết bị của bạn đang ở cách chi nhánh <strong>{targetBranch.name}</strong> khoảng cách <strong>{gpsDistance > 1000 ? `${(gpsDistance/1000).toFixed(2)} km` : `${gpsDistance}m`}</strong> (Yêu cầu ≤ {allowedRadiusMeters} mét).
                  </p>
                  {gpsErrorMsg && (
                    <p className="text-[10px] text-rose-700 italic bg-rose-50 p-1.5 rounded-lg border border-rose-200">
                      ⚠️ Chi tiết: {gpsErrorMsg}
                    </p>
                  )}
                </div>
              )}

              {wifiStatus === 'ERROR' && (
                <div className="bg-white/95 rounded-xl p-2.5 text-[11px] border border-rose-200 space-y-1.5">
                  <div className="font-extrabold text-rose-900 flex items-center justify-between">
                    <span className="flex items-center gap-1">
                      <Wifi className="w-3.5 h-3.5 text-rose-600" />
                      Chưa Kết Nối Wi-Fi Cửa Hàng
                    </span>
                    <span className="bg-rose-100 text-rose-800 font-mono font-black text-[10px] px-2 py-0.5 rounded-md">
                      Mạng 4G/Khác
                    </span>
                  </div>
                  <p className="text-rose-800 font-medium">
                    Mạng hiện tại: <strong className="line-through text-rose-950">{currentWifiSSID}</strong>. Cửa hàng yêu cầu kết nối đúng Wi-Fi nội bộ: <strong className="text-orange-800 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200">{targetWifiSSID}</strong>.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* MAIN VERIFICATION CARD CONTAINER */}
          <div className="bg-white rounded-3xl p-4 shadow-sm border border-zinc-200/80 mb-3 space-y-4">
            
            {/* Title & Overall Progress */}
            <div className="flex items-center justify-between pb-2.5 border-b border-zinc-100">
              <div>
                <h2 className="text-sm font-black text-zinc-900 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-[#FF4B16]" />
                  <span>Xác minh 3 yếu tố an toàn</span>
                </h2>
                <p className="text-[11px] text-zinc-500 font-medium">Cửa hàng: {targetBranch.name}</p>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center space-x-1 px-3 py-1 rounded-xl text-xs font-black border ${
                  isAllVerified 
                    ? 'bg-orange-50 text-orange-700 border-orange-200 shadow-2xs' 
                    : 'bg-orange-50 text-[#FF4B16] border-orange-200'
                }`}>
                  {isAllVerified ? (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                      <span>ĐẠT 3/3</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-[#FF4B16]" />
                      <span>
                        {[gpsStatus, wifiStatus, faceStatus].filter(s => s === 'SUCCESS').length}/3 Đạt
                      </span>
                    </>
                  )}
                </span>
              </div>
            </div>

            {/* CAMERA PREVIEW: REAL-TIME BIOMETRIC LIVE CAMERA & FACE ID SCANNER */}
            <div className="relative rounded-3xl bg-zinc-950 p-4 overflow-hidden border border-zinc-800 shadow-xl">
              
              {/* Hidden canvas for taking snapshot and extracting biometric vectors */}
              <canvas ref={liveCanvasRef} className="hidden" />

              {/* Main Camera HUD Viewport */}
              <div className="relative w-full aspect-4/3 max-w-[280px] mx-auto rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center border-2 border-zinc-700 shadow-inner">
                
                {/* Live Video Stream from Device Camera */}
                <video 
     ref={liveVideoRef} 
     autoPlay 
     playsInline 
     muted 
     className={`w-full h-full object-cover ${isCameraActive ? 'block' : 'hidden'}`} 
     style={{ transform: "scaleX(-1)" }}
     onLoadedMetadata={() => liveVideoRef.current?.play().catch(e=>console.warn(e))}
   />

                {/* Camera Starting / Initializing State */}
                {isCameraStarting && (
                  <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center p-4 text-center z-10">
                    <Loader2 className="w-8 h-8 text-[#FF4B16] animate-spin mb-2" />
                    <p className="text-xs font-bold text-zinc-200">Đang khởi động Camera...</p>
                    <p className="text-[10px] text-zinc-500 mt-0.5">Vui lòng cho phép truy cập camera</p>
                  </div>
                )}

                {/* Camera Error / Permission Denied Fallback */}
                {cameraError && !isCameraStarting && (
                  <div className="absolute inset-0 bg-zinc-950/95 flex flex-col items-center justify-center p-4 text-center z-10 space-y-2">
                    <div className="w-10 h-10 rounded-full bg-rose-500/20 text-rose-400 flex items-center justify-center mx-auto">
                      <Camera className="w-5 h-5" />
                    </div>
                    <p className="text-xs font-bold text-rose-300 px-2">{cameraError}</p>
                    <button
                      type="button"
                      onClick={() => startLiveCamera()}
                      className="text-xs font-black bg-[#FF4B16] hover:bg-[#E03E0C] text-white px-3.5 py-1.5 rounded-xl shadow-md transition-colors cursor-pointer flex items-center gap-1.5 mx-auto"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Cấp quyền & Bật Camera</span>
                    </button>
                  </div>
                )}

                {/* Live Camera Badge */}
                {isCameraActive && (
                  <div className="absolute top-2.5 left-2.5 bg-zinc-950/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-zinc-700/60 flex items-center gap-1.5 shadow-xs z-10 pointer-events-none">
                    <span className="w-2 h-2 rounded-full bg-orange-500 animate-ping" />
                    <span className="text-[10px] font-black text-orange-400 tracking-wider">LIVE HD CAMERA</span>
                  </div>
                )}

                {/* Switch Camera Button (Front/Back) */}
                {isCameraActive && (
                  <button
                    type="button"
                    onClick={handleToggleCameraFacing}
                    title="Đổi camera trước/sau"
                    className="absolute top-2.5 right-2.5 bg-zinc-950/80 hover:bg-zinc-800 backdrop-blur-md p-1.5 rounded-full border border-zinc-700 text-zinc-300 hover:text-white transition-colors z-10 cursor-pointer shadow-xs"
                  >
                    <SwitchCamera className="w-4 h-4" />
                  </button>
                )}

                {/* Facial HUD Box & Target Brackets */}
                <div className="absolute inset-3 pointer-events-none flex flex-col justify-between p-1 z-10">
                  <div className="flex justify-between">
                    <div className={`w-6 h-6 border-t-[3px] border-l-[3px] rounded-tl-lg transition-all ${
                      faceStatus === 'SUCCESS' 
                        ? 'border-orange-400 shadow-sm shadow-orange-400' 
                        : faceStatus === 'PENDING' 
                        ? 'border-[#FF4B16] shadow-sm shadow-orange-500' 
                        : 'border-rose-500 shadow-sm shadow-rose-500'
                    }`} />
                    <div className={`w-6 h-6 border-t-[3px] border-r-[3px] rounded-tr-lg transition-all ${
                      faceStatus === 'SUCCESS' 
                        ? 'border-orange-400 shadow-sm shadow-orange-400' 
                        : faceStatus === 'PENDING' 
                        ? 'border-[#FF4B16] shadow-sm shadow-orange-500' 
                        : 'border-rose-500 shadow-sm shadow-rose-500'
                    }`} />
                  </div>
                  
                  {/* Subtle Face Alignment Oval */}
                  <div className={`w-28 h-36 mx-auto rounded-full border border-dashed transition-colors flex items-center justify-center ${
                    faceStatus === 'SUCCESS' ? 'border-orange-400/60' : faceStatus === 'PENDING' ? 'border-orange-400/60' : 'border-rose-500/60'
                  }`}>
                    {isVerifyingFace && (
                      <span className="text-[10px] font-bold text-[#FF4B16] bg-zinc-950/80 px-2 py-0.5 rounded-md">
                        Đang quét...
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between">
                    <div className={`w-6 h-6 border-b-[3px] border-l-[3px] rounded-bl-lg transition-all ${
                      faceStatus === 'SUCCESS' 
                        ? 'border-orange-400 shadow-sm shadow-orange-400' 
                        : faceStatus === 'PENDING' 
                        ? 'border-[#FF4B16] shadow-sm shadow-orange-500' 
                        : 'border-rose-500 shadow-sm shadow-rose-500'
                    }`} />
                    <div className={`w-6 h-6 border-b-[3px] border-r-[3px] rounded-br-lg transition-all ${
                      faceStatus === 'SUCCESS' 
                        ? 'border-orange-400 shadow-sm shadow-orange-400' 
                        : faceStatus === 'PENDING' 
                        ? 'border-[#FF4B16] shadow-sm shadow-orange-500' 
                        : 'border-rose-500 shadow-sm shadow-rose-500'
                    }`} />
                  </div>
                </div>

                {/* Laser scan line in PENDING or VERIFYING state */}
                {(isVerifyingFace || faceStatus === 'PENDING') && isCameraActive && (
                  <div className="absolute inset-x-0 h-1 bg-gradient-to-r from-transparent via-[#FF4B16] to-transparent animate-pulse top-1/2 -translate-y-1/2 shadow-lg shadow-orange-500/80 pointer-events-none z-20" />
                )}

                {/* Face ID Status Pill on Camera Viewport */}
                <div className="absolute bottom-2.5 inset-x-2 flex justify-center z-20 pointer-events-none">
                  {faceStatus === 'SUCCESS' && (
                    <div className="bg-orange-600/95 text-white text-[11px] font-black px-3.5 py-1 rounded-full backdrop-blur-md flex items-center space-x-1.5 shadow-md border border-orange-400/50 animate-in fade-in">
                      <Check className="w-3.5 h-3.5 text-white stroke-[3]" />
                      <span>Khớp khuôn mặt AI ({faceConfidence}%)</span>
                    </div>
                  )}

                  {faceStatus === 'PENDING' && (
                    <div className="bg-orange-600/95 text-white text-[11px] font-black px-3.5 py-1 rounded-full backdrop-blur-md flex items-center space-x-1.5 shadow-md border border-orange-400/50 animate-pulse">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-white" />
                      <span>{faceFeedbackMsg || 'Đang so khớp với mẫu hồ sơ...'}</span>
                    </div>
                  )}

                  {faceStatus === 'ERROR' && (
                    <div className="bg-rose-600/95 text-white text-[11px] font-black px-3.5 py-1 rounded-full backdrop-blur-md flex items-center space-x-1.5 shadow-md border border-rose-400/50">
                      <X className="w-3.5 h-3.5 text-white stroke-[3]" />
                      <span>{faceFeedbackMsg || 'Chưa khớp khuôn mặt'}</span>
                    </div>
                  )}
                </div>
              </div>

              {/* ENROLLED REFERENCE PROFILE COMPARISON CARD */}
              <div className="mt-3 bg-zinc-900/90 rounded-2xl p-2.5 border border-zinc-800 flex items-center justify-between gap-2.5">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className="relative shrink-0">
                    <img 
                      src={staffFaceProfile.facePhotoUrl || currentUser.avatar} 
                      alt={currentUser.name} 
                      className="w-11 h-11 rounded-xl object-cover border-2 border-[#FF4B16]/60 shadow-xs"
                    />
                    <span className="absolute -bottom-1 -right-1 bg-orange-500 text-white rounded-full p-0.5 shadow-xs">
                      <Check className="w-2.5 h-2.5" />
                    </span>
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-black text-white truncate">{currentUser.name}</span>
                      <span className="text-[9px] bg-zinc-800 text-zinc-300 font-mono px-1.5 py-0.2 rounded border border-zinc-700">
                        {currentUser.code}
                      </span>
                    </div>
                    <p className="text-[10px] text-zinc-400 truncate mt-0.5">
                      Hồ sơ mẫu Face ID: <strong className="text-orange-400 font-semibold">{staffFaceProfile.assignedFaceEmbedding ? 'Đã cài đặt AI' : 'Chưa có'}</strong>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsFaceRegistrationOpen(true)}
                  className="shrink-0 text-[10px] font-bold text-orange-400 hover:text-orange-300 bg-orange-950/60 hover:bg-orange-900/80 px-2.5 py-1.5 rounded-xl border border-orange-700/60 transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <ScanFace className="w-3 h-3 text-orange-400" />
                  <span>Đổi mẫu</span>
                </button>
              </div>

              {/* Primary Face Scan CTA Button */}
              <div className="mt-3">
                <button
                  type="button"
                  disabled={isVerifyingFace}
                  onClick={executeRealFaceScan}
                  className={`w-full py-2.5 rounded-xl font-black text-xs transition-all flex items-center justify-center space-x-2 cursor-pointer shadow-md ${
                    isVerifyingFace
                      ? 'bg-zinc-800 text-zinc-400 cursor-not-allowed'
                      : faceStatus === 'SUCCESS'
                      ? 'bg-orange-600 hover:bg-orange-500 text-white shadow-orange-900/30'
                      : 'bg-gradient-to-r from-[#FF4B16] to-orange-500 hover:from-[#E03E0C] hover:to-orange-600 text-white shadow-orange-900/40 active:scale-[0.99]'
                  }`}
                >
                  {isVerifyingFace ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-white" />
                      <span>Đang chụp & đối soát AI...</span>
                    </>
                  ) : faceStatus === 'SUCCESS' ? (
                    <>
                      <RefreshCw className="w-4 h-4 text-white" />
                      <span>📸 Quét lại Face ID ({faceConfidence}%)</span>
                    </>
                  ) : (
                    <>
                      <Camera className="w-4 h-4 text-white" />
                      <span>📸 Bắt đầu Quét & Đối Soát Face ID</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* THE 3 VERIFICATION STEPS: GPS, WI-FI, FACE ID */}
            <div className="space-y-2.5 text-xs">
              
              {/* 1. GPS VERIFICATION */}
              <div className={`p-3 rounded-2xl border transition-all ${
                gpsStatus === 'SUCCESS'
                  ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/20'
                  : gpsStatus === 'PENDING'
                  ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/20'
                  : 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-400/20'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                      gpsStatus === 'SUCCESS'
                        ? 'bg-orange-500 text-white'
                        : gpsStatus === 'PENDING'
                        ? 'bg-gradient-to-br from-[#FF4B16] to-orange-500 text-white animate-pulse'
                        : 'bg-rose-600 text-white'
                    }`}>
                      <MapPin className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-extrabold text-zinc-900 text-xs">1. Vị trí GPS Cửa hàng</span>
                        <span className="text-[10px] text-zinc-400 font-medium">• Bán kính {allowedRadiusMeters}m</span>
                      </div>

                      {gpsStatus === 'SUCCESS' && (
                        <div className="text-[11px] text-orange-800 font-medium mt-0.5">
                          Hợp lệ • Cách cửa hàng <strong className="font-black text-orange-900">{gpsDistance}m</strong> ({targetBranch.name})
                        </div>
                      )}

                      {gpsStatus === 'PENDING' && (
                        <div className="text-[11px] text-[#FF4B16] font-medium mt-0.5 flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                          <span>Đang đo khoảng cách tọa độ GPS...</span>
                        </div>
                      )}

                      {gpsStatus === 'ERROR' && (
                        <div className="text-[11px] text-rose-800 font-medium mt-0.5">
                          ❌ Ngoài phạm vi • Cách <strong className="font-black text-rose-900">{gpsDistance > 1000 ? `${(gpsDistance/1000).toFixed(2)} km` : `${gpsDistance}m`}</strong> (Yêu cầu ≤ {allowedRadiusMeters}m)
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {gpsStatus === 'SUCCESS' && (
                      <span className="bg-orange-100 text-orange-800 text-[10px] font-black px-2.5 py-1 rounded-xl border border-orange-300 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                        <span>ĐẠT</span>
                      </span>
                    )}

                    {gpsStatus === 'PENDING' && (
                      <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-black px-2.5 py-1 rounded-xl border border-orange-300 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-[#FF4B16]" />
                        <span>CHỜ</span>
                      </span>
                    )}

                    {gpsStatus === 'ERROR' && (
                      <button
                        onClick={() => retryStep('GPS')}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-black px-2.5 py-1 rounded-xl border border-rose-300 flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-rose-600" />
                        <span>ĐO LẠI GPS</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 2. WI-FI VERIFICATION */}
              <div className={`p-3 rounded-2xl border transition-all ${
                wifiStatus === 'SUCCESS'
                  ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/20'
                  : wifiStatus === 'PENDING'
                  ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/20'
                  : 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-400/20'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                      wifiStatus === 'SUCCESS'
                        ? 'bg-orange-500 text-white'
                        : wifiStatus === 'PENDING'
                        ? 'bg-gradient-to-br from-[#FF4B16] to-orange-500 text-white animate-pulse'
                        : 'bg-rose-600 text-white'
                    }`}>
                      <Wifi className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5 flex-wrap">
                        <span className="font-extrabold text-zinc-900 text-xs">2. Wi-Fi Cửa Hàng</span>
                        <span className="text-[10px] bg-orange-100 text-[#FF4B16] font-bold px-1.5 py-0.2 rounded-md">Mạng Nội Bộ</span>
                      </div>

                      {wifiStatus === 'SUCCESS' && (
                        <div className="text-[11px] text-orange-800 font-medium mt-0.5">
                          Đã kết nối Wi-Fi cửa hàng: <strong className="font-black text-orange-900">{currentWifiSSID}</strong>
                        </div>
                      )}

                      {wifiStatus === 'PENDING' && (
                        <div className="text-[11px] text-[#FF4B16] font-medium mt-0.5 flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                          <span>Đang kiểm tra tín hiệu Wi-Fi cửa hàng...</span>
                        </div>
                      )}

                      {wifiStatus === 'ERROR' && (
                        <div className="text-[11px] text-rose-800 font-medium mt-0.5 space-y-1">
                          <div>
                            ❌ Đang kết nối mạng di động / Wi-Fi khác: <strong className="font-black text-rose-900">{currentWifiSSID}</strong>
                          </div>
                          <div className="text-[10px] bg-rose-100/80 p-1.5 rounded-lg border border-rose-200 text-rose-900">
                            Vui lòng bật Wi-Fi và kết nối mạng nội bộ của cửa hàng ({targetWifiSSID}).
                          </div>
                        </div>
                      )}

                      {/* Interactive Test Wi-Fi Controls */}
                      <div className="mt-2 pt-1.5 border-t border-zinc-200/60 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-zinc-500">Thử nghiệm Wi-Fi:</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentWifiSSID(targetWifiSSID);
                            setWifiStatus('SUCCESS');
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                            wifiStatus === 'SUCCESS'
                              ? 'bg-orange-600 text-white border-orange-700 shadow-2xs'
                              : 'bg-white hover:bg-orange-50 text-orange-800 border-orange-300'
                          }`}
                        >
                          📶 Kết nối Wi-Fi cửa hàng ({targetWifiSSID})
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCurrentWifiSSID('4G_Viettel_Mobile');
                            setWifiStatus('ERROR');
                          }}
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md border transition-colors cursor-pointer ${
                            wifiStatus === 'ERROR'
                              ? 'bg-rose-600 text-white border-rose-700 shadow-2xs'
                              : 'bg-white hover:bg-rose-50 text-rose-800 border-rose-300'
                          }`}
                        >
                          📵 Mạng 4G / Khác
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {wifiStatus === 'SUCCESS' && (
                      <span className="bg-orange-100 text-orange-800 text-[10px] font-black px-2.5 py-1 rounded-xl border border-orange-300 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                        <span>ĐẠT</span>
                      </span>
                    )}

                    {wifiStatus === 'PENDING' && (
                      <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-black px-2.5 py-1 rounded-xl border border-orange-300 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-[#FF4B16]" />
                        <span>CHỜ</span>
                      </span>
                    )}

                    {wifiStatus === 'ERROR' && (
                      <button
                        onClick={() => retryStep('WIFI')}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-black px-2.5 py-1 rounded-xl border border-rose-300 flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-rose-600" />
                        <span>KẾT NỐI</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* 3. FACE ID VERIFICATION */}
              <div className={`p-3 rounded-2xl border transition-all ${
                faceStatus === 'SUCCESS'
                  ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/20'
                  : faceStatus === 'PENDING'
                  ? 'bg-orange-50/90 border-orange-300 ring-1 ring-orange-400/20'
                  : 'bg-rose-50/90 border-rose-300 ring-1 ring-rose-400/20'
              }`}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start space-x-2.5 min-w-0">
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
                      faceStatus === 'SUCCESS'
                        ? 'bg-orange-500 text-white'
                        : faceStatus === 'PENDING'
                        ? 'bg-gradient-to-br from-[#FF4B16] to-orange-500 text-white animate-pulse'
                        : 'bg-rose-600 text-white'
                    }`}>
                      <ScanFace className="w-4 h-4" />
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center space-x-1.5">
                        <span className="font-extrabold text-zinc-900 text-xs">3. Face ID AI (Camera Scan)</span>
                        <span className="text-[10px] text-zinc-400 font-medium">• Liveness</span>
                      </div>

                      {faceStatus === 'SUCCESS' && (
                        <div className="text-[11px] text-orange-800 font-medium mt-0.5 space-y-0.5">
                          <div>
                            Khớp nhân viên: <strong className="font-black text-orange-900">{currentUser.name}</strong> ({faceConfidence}%)
                          </div>
                          {faceFeedbackMsg && (
                            <div className="text-[10px] text-orange-700 bg-orange-100/60 px-2 py-0.5 rounded border border-orange-200">
                              {faceFeedbackMsg}
                            </div>
                          )}
                        </div>
                      )}

                      {faceStatus === 'PENDING' && (
                        <div className="text-[11px] text-[#FF4B16] font-medium mt-0.5 flex items-center space-x-1">
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" />
                          <span>{faceFeedbackMsg || 'Đang đối soát sinh trắc học khuôn mặt AI...'}</span>
                        </div>
                      )}

                      {faceStatus === 'ERROR' && (
                        <div className="text-[11px] text-rose-800 font-medium mt-0.5 space-y-0.5">
                          <div>
                            ❌ {faceFeedbackMsg || 'Không nhận diện được khuôn mặt hoặc chưa khớp với hồ sơ.'}
                          </div>
                          <div className="text-[10px] text-rose-700">
                            Vui lòng căn chỉnh góc mặt chính diện hoặc đăng ký lại ảnh mẫu.
                          </div>
                        </div>
                      )}

                      {/* Interactive Test Face ID Controls */}
                      <div className="mt-2 pt-1.5 border-t border-zinc-200/60 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] font-bold text-zinc-500">Thao tác Face ID:</span>
                        <button
                          type="button"
                          onClick={() => setIsFaceRegistrationOpen(true)}
                          className="text-[10px] font-bold px-2 py-0.5 bg-orange-50 hover:bg-orange-100 text-orange-800 rounded-md border border-orange-300 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <ScanFace className="w-3 h-3 text-orange-600" />
                          <span>1. Đăng ký / Đổi ảnh mẫu</span>
                        </button>
                        <button
                          type="button"
                          disabled={isVerifyingFace}
                          onClick={executeRealFaceScan}
                          className="text-[10px] font-bold px-2 py-0.5 bg-orange-50 hover:bg-orange-100 text-[#FF4B16] rounded-md border border-orange-300 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <RefreshCw className={`w-3 h-3 text-[#FF4B16] ${isVerifyingFace ? 'animate-spin' : ''}`} />
                          <span>2. Chụp & Đối soát ngay</span>
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1.5 shrink-0">
                    {faceStatus === 'SUCCESS' && (
                      <span className="bg-orange-100 text-orange-800 text-[10px] font-black px-2.5 py-1 rounded-xl border border-orange-300 flex items-center space-x-1">
                        <CheckCircle2 className="w-3.5 h-3.5 text-orange-600" />
                        <span>ĐẠT</span>
                      </span>
                    )}

                    {faceStatus === 'PENDING' && (
                      <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-black px-2.5 py-1 rounded-xl border border-orange-300 flex items-center space-x-1">
                        <Clock className="w-3.5 h-3.5 text-[#FF4B16]" />
                        <span>CHỜ</span>
                      </span>
                    )}

                    {faceStatus === 'ERROR' && (
                      <button
                        onClick={() => retryStep('FACE')}
                        className="bg-rose-100 hover:bg-rose-200 text-rose-800 text-[10px] font-black px-2.5 py-1 rounded-xl border border-rose-300 flex items-center space-x-1 cursor-pointer transition-colors"
                      >
                        <RefreshCw className="w-3 h-3 text-rose-600" />
                        <span>QUÉT LẠI</span>
                      </button>
                    )}
                  </div>
                </div>
              </div>

            </div>
          </div>

          {/* BOTTOM SUBMIT CTA BUTTON IN BRAND ORANGE #FF4B16 */}
          <div className="mt-auto pt-2 pb-5 space-y-2">
            {isAllVerified ? (
              <button
                onClick={handleConfirmCheckIn}
                className="w-full py-4 bg-gradient-to-r from-[#FF4B16] via-[#FF5E2B] to-[#E03E0C] hover:from-[#E94312] hover:to-[#C8340A] text-white font-black text-sm rounded-2xl shadow-xl shadow-orange-500/30 transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98] border border-orange-400/30"
              >
                <CheckCircle2 className="w-5 h-5 text-white animate-pulse" />
                <span>BẮT ĐẦU CA LÀM VIỆC (3/3 HỢP LỆ)</span>
              </button>
            ) : (
              <div className="space-y-2">
                <button
                  disabled
                  className="w-full py-3.5 bg-zinc-200 text-zinc-500 font-extrabold text-xs rounded-2xl cursor-not-allowed flex items-center justify-center space-x-2"
                >
                  <AlertCircle className="w-4 h-4 text-zinc-400" />
                  <span>CẦN HOÀN TẤT ĐỦ 3 BƯỚC ĐỂ BẮT ĐẦU CA</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SCREEN 03: CHECK-IN THÀNH CÔNG */}
      {currentScreen === 'SUCCESS_CHECKIN' && (
        <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between p-5 text-center animate-in fade-in zoom-in-95 duration-300">
          <div className="pt-4 space-y-4">
            
            {/* Animated Check-in Confirmation in Orange #FF4B16 & Green */}
            <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
              {/* Outer pulsing ring in brand orange */}
              <div className="absolute inset-0 rounded-full bg-[#FF4B16]/20 animate-ping" />
              {/* Mid ring in orange */}
              <div className="absolute -inset-2 rounded-full bg-orange-500/15 animate-pulse" />
              {/* Main Badge */}
              <div className="relative w-24 h-24 rounded-full bg-gradient-to-tr from-orange-600 to-orange-400 border-4 border-white shadow-xl shadow-orange-500/30 flex items-center justify-center">
                <Check className="w-12 h-12 text-white stroke-[3.5]" />
              </div>
              {/* Floating Sparkle Badge */}
              <div className="absolute -top-1 -right-1 bg-[#FF4B16] text-white text-[10px] font-black px-2 py-0.5 rounded-full shadow-md flex items-center space-x-1">
                <Sparkles className="w-2.5 h-2.5" />
                <span>+100 Chuyên cần</span>
              </div>
            </div>

            <div>
              <h2 className="text-2xl font-black text-zinc-900 tracking-tight">Check-in thành công!</h2>
              <div className="text-3xl font-black font-mono text-[#FF4B16] mt-1 tracking-tight">
                {recordedCheckInTime || liveTimeString}
              </div>
              <div className="text-xs text-zinc-500 font-semibold mt-0.5">
                {recordedCheckInDate || liveDateString} • Cửa hàng {currentUser.branchName}
              </div>
            </div>

            {/* Thông tin ca làm việc */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs text-left space-y-2.5">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-100">
                <span className="text-[11px] font-extrabold text-zinc-400 uppercase tracking-wider">Thông tin ca làm việc</span>
                <span className="bg-orange-100 text-orange-800 text-[11px] font-extrabold px-2.5 py-0.5 rounded-full flex items-center space-x-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-orange-500" />
                  <span>Đúng giờ</span>
                </span>
              </div>
              <div className="flex justify-between text-xs py-0.5">
                <span className="text-zinc-500">Ca làm việc:</span>
                <span className="font-bold text-zinc-900">Ca sáng</span>
              </div>
              <div className="flex justify-between text-xs py-0.5">
                <span className="text-zinc-500">Khung giờ:</span>
                <span className="font-extrabold text-zinc-900 font-mono">08:00 – 17:00</span>
              </div>
              <div className="flex justify-between text-xs py-0.5">
                <span className="text-zinc-500">Địa điểm:</span>
                <span className="font-bold text-zinc-900">PhoneHouse Hải Châu (89 Nguyễn Văn Linh)</span>
              </div>
              <div className="flex justify-between text-xs py-0.5">
                <span className="text-zinc-500">Vị trí đảm nhiệm:</span>
                <span className="font-bold text-[#FF4B16]">{currentUser.roleTitle}</span>
              </div>
            </div>

            {/* Tóm tắt nhiệm vụ trọng tâm hôm nay (Tư vấn: 15 khách, Đơn hàng: 10 đơn, Doanh số: 20M) */}
            <div className="bg-gradient-to-br from-orange-50/90 to-orange-50/70 rounded-2xl p-4 border border-orange-200/80 text-left space-y-3 shadow-2xs">
              <div className="text-xs font-black text-orange-950 flex items-center justify-between">
                <div className="flex items-center space-x-1.5">
                  <Award className="w-4 h-4 text-[#FF4B16]" />
                  <span className="uppercase tracking-wider">Tóm tắt nhiệm vụ hôm nay</span>
                </div>
                <span className="text-[10px] text-[#FF4B16] font-bold bg-white px-2 py-0.5 rounded-full border border-orange-200">
                  Target Ngày
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="bg-white/90 p-2 rounded-xl border border-orange-100">
                  <div className="text-[10px] font-bold text-zinc-500">Tư vấn</div>
                  <div className="text-sm font-black text-zinc-900 font-mono mt-0.5">15 khách</div>
                </div>
                <div className="bg-white/90 p-2 rounded-xl border border-orange-100">
                  <div className="text-[10px] font-bold text-zinc-500">Đơn hàng</div>
                  <div className="text-sm font-black text-zinc-900 font-mono mt-0.5">10 đơn</div>
                </div>
                <div className="bg-white/90 p-2 rounded-xl border border-orange-100">
                  <div className="text-[10px] font-bold text-zinc-500">Doanh số</div>
                  <div className="text-sm font-black text-[#FF4B16] font-mono mt-0.5">20M đ</div>
                </div>
              </div>

              <ul className="text-xs text-zinc-700 space-y-1.5 pt-1 pl-0.5">
                <li className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-orange-600 shrink-0 stroke-[3]" />
                  <span>Tư vấn giới thiệu sản phẩm tối thiểu <strong>15 lượt khách</strong></span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-orange-600 shrink-0 stroke-[3]" />
                  <span>Chốt <strong>10 đơn hàng</strong> máy kèm phụ kiện & gói Care+</span>
                </li>
                <li className="flex items-center space-x-2">
                  <Check className="w-3.5 h-3.5 text-orange-600 shrink-0 stroke-[3]" />
                  <span>Đạt mốc <strong>20.000.000 đ</strong> để nhận thưởng nóng ngày</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pb-4 pt-3">
            <button
              onClick={() => {
                setShiftStatusOverride('IN_PROGRESS');
                localStorage.setItem(`phonehouse_is_checked_in_${currentUser.id}`, 'true');
                setCurrentScreen('HOME');
              }}
              className="w-full py-4 bg-[#FF4B16] hover:bg-[#E94312] text-white font-black text-sm rounded-2xl shadow-xl shadow-orange-500/30 transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98]"
            >
              <span>XEM CÔNG VIỆC HÔM NAY</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* SCREEN 05: CHECK-OUT SUMMARY MODAL */}
      {currentScreen === 'CHECKOUT_SUMMARY' && (
        <div className="min-h-screen bg-[#F7F8FA] flex flex-col justify-between p-4">
          <div>
            <div className="flex items-center justify-between pt-2 pb-4">
              <button 
                onClick={() => setCurrentScreen('HOME')}
                className="p-2 -ml-2 rounded-xl text-zinc-600 hover:bg-zinc-200/60"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <span className="font-bold text-sm text-zinc-800">Kết thúc ca làm việc</span>
              <div className="w-8" />
            </div>

            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs text-center">
              <div className="text-xs text-zinc-500 font-medium">Giờ hiện tại</div>
              <div className="text-3xl font-black font-mono text-zinc-900 mt-0.5">{liveTimeString}</div>
              <div className="text-xs font-bold text-orange-600 mt-1">Đủ điều kiện chốt công hoàn thành ca</div>

              <div className="grid grid-cols-3 gap-2 mt-4 pt-3 border-t border-zinc-100 text-center">
                <div className="bg-zinc-50 p-2 rounded-xl">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase">Tổng thời gian</div>
                  <div className="text-xs font-black text-zinc-800 mt-0.5">08h 46m</div>
                </div>
                <div className="bg-zinc-50 p-2 rounded-xl">
                  <div className="text-[10px] text-zinc-400 font-bold uppercase">Thời gian nghỉ</div>
                  <div className="text-xs font-black text-zinc-800 mt-0.5">45m</div>
                </div>
                <div className="bg-orange-50 p-2 rounded-xl border border-orange-100">
                  <div className="text-[10px] text-orange-700 font-bold uppercase">Tính công</div>
                  <div className="text-xs font-black text-[#FF4B16] mt-0.5">08h 01m</div>
                </div>
              </div>
            </div>

            {/* Tóm tắt công việc trong ngày */}
            <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs mt-3">
              <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider mb-2.5">Tóm tắt kết quả ngày</h3>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-500">Khách tư vấn:</span>
                  <span className="font-bold text-zinc-900">12 khách hàng</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-500">Đơn hàng thành công:</span>
                  <span className="font-bold text-zinc-900">7 đơn (2 iPhone, 5 Phụ kiện)</span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-500">Doanh số thực đạt:</span>
                  <span className="font-bold text-[#FF4B16]">18.500.000 đ (92% KPI)</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-zinc-500">Hoa hồng dự kiến tích lũy:</span>
                  <span className="font-bold text-orange-600">+175.000 đ</span>
                </div>
              </div>
            </div>
          </div>

          <div className="pb-4">
            <button
              onClick={handleConfirmCheckOut}
              className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-extrabold text-sm rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer"
            >
              <CheckCircle2 className="w-5 h-5 text-orange-400" />
              <span>CHẤM CÔNG RA & CHỐT CA</span>
            </button>
          </div>
        </div>
      )}

      {/* MAIN CONTENT BASED ON BOTTOM TAB */}
      {currentScreen === 'HOME' && (
        <div className="p-4 space-y-4">
          {/* TAB 1: HÔM NAY (SCREEN 01 & SCREEN 04) */}
          {activeBottomTab === 'today' && (
            <>
              {/* Header: Logo PhoneHouse + Avatar + Welcome + Status Demo Switcher */}
              <div className="bg-white rounded-2xl p-3.5 border border-zinc-200/80 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#FF4B16] to-orange-500 flex items-center justify-center text-white font-black text-sm shadow-xs">
                      PH
                    </div>
                    <div>
                      <div className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                        PhoneHouse Retail • {currentUser.branchName}
                      </div>
                      <h1 className="text-sm font-extrabold text-zinc-900 leading-tight">
                        Xin chào, {currentUser.name}
                      </h1>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <div className="text-[11px] font-black font-mono bg-zinc-900 text-white px-2.5 py-1 rounded-xl flex items-center space-x-1 shadow-xs border border-zinc-800">
                      <Clock className="w-3 h-3 text-[#FF4B16] animate-pulse" />
                      <span>{liveTimeString}</span>
                    </div>
                    <div className="relative">
                      <img 
                        src={currentUser.avatar} 
                        alt={currentUser.name} 
                        className="w-9 h-9 rounded-full object-cover border-2 border-white shadow-2xs"
                      />
                      <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 border-2 border-white rounded-full ${
                        isCheckedIn ? 'bg-orange-500' : 'bg-orange-500'
                      }`} />
                    </div>
                  </div>
                </div>

                {/* Mode Switcher for Demo Preview: Chưa Check-in vs Đang Trong Ca */}
                <div className="flex items-center justify-between pt-2 border-t border-zinc-100 text-xs">
                  <div className="flex items-center space-x-1.5 text-zinc-500">
                    <Activity className="w-3.5 h-3.5 text-[#FF4B16]" />
                    <span className="font-semibold text-[11px]">Trạng thái xem:</span>
                  </div>
                  <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-[11px] font-bold">
                    <button
                      onClick={() => setShiftStatusOverride('NOT_CHECKED_IN')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        !isCheckedIn ? 'bg-white text-zinc-900 shadow-2xs font-extrabold' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      Chưa Check-in
                    </button>
                    <button
                      onClick={() => setShiftStatusOverride('IN_PROGRESS')}
                      className={`px-2.5 py-1 rounded-lg transition-all cursor-pointer ${
                        isCheckedIn ? 'bg-[#FF4B16] text-white shadow-2xs font-extrabold' : 'text-zinc-500 hover:text-zinc-800'
                      }`}
                    >
                      Đang Trong Ca
                    </button>
                  </div>
                </div>
              </div>

              {/* HERO CARD (SCREEN 01): CA LÀM VIỆC HÔM NAY */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs relative overflow-hidden space-y-3">
                {/* Top of Card */}
                <div className="flex items-start justify-between">
                  <div>
                    <div className="flex items-center space-x-1.5">
                      <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                        Ca làm việc hôm nay
                      </span>
                      <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-extrabold px-2 py-0.2 rounded-full">
                        Ca Sáng (8h)
                      </span>
                    </div>
                    <div className="text-xl font-black text-zinc-900 mt-1 flex items-center space-x-2">
                      <span>08:00 – 17:00</span>
                    </div>
                    <div className="text-xs text-zinc-500 font-medium mt-1 flex items-center space-x-1">
                      <MapPin className="w-3.5 h-3.5 text-[#FF4B16] shrink-0" />
                      <span>{currentUser.branchName}</span>
                    </div>
                  </div>

                  {isCheckedIn ? (
                    <span className="inline-flex items-center bg-orange-50 text-orange-700 text-xs font-extrabold px-2.5 py-1 rounded-xl border border-orange-200 shadow-2xs">
                      <span className="relative flex h-2.5 w-2.5 mr-1.5">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-orange-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-orange-500"></span>
                      </span>
                      <span>Đang làm việc</span>
                    </span>
                  ) : (
                    <span className="inline-flex items-center space-x-1 bg-orange-50 text-orange-700 text-xs font-extrabold px-2.5 py-1 rounded-xl border border-orange-200">
                      <Clock className="w-3.5 h-3.5 text-orange-600" />
                      <span>Chưa check-in</span>
                    </span>
                  )}
                </div>

                {/* State A: CHƯA CHECK-IN (SCREEN 01 PRE-SHIFT) */}
                {!isCheckedIn && (
                  <div className="pt-3 border-t border-zinc-100 space-y-3">
                    {/* Location & Wi-Fi Pre-Check Status Chips */}
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center space-x-2">
                        <div className="p-1 rounded-lg bg-orange-100 text-orange-600">
                          <MapPin className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[11px] text-zinc-800">GPS: 15 mét</div>
                          <div className="text-[10px] text-orange-600 font-semibold">Hợp lệ tại cửa hàng</div>
                        </div>
                      </div>

                      <div className="p-2 rounded-xl bg-zinc-50 border border-zinc-200/70 flex items-center space-x-2">
                        <div className="p-1 rounded-lg bg-orange-100 text-orange-600">
                          <Wifi className="w-3.5 h-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-bold text-[11px] text-zinc-800 truncate">Staff_5G</div>
                          <div className="text-[10px] text-orange-600 font-semibold">Đã kết nối Wi-Fi</div>
                        </div>
                      </div>
                    </div>

                    {/* Countdown Banner */}
                    <div className="bg-orange-50/80 rounded-xl p-2.5 border border-orange-100 text-center text-xs">
                      <span className="text-zinc-600 font-medium">
                        Còn <strong className="text-[#FF4B16] font-black">12 phút</strong> nữa đến giờ bắt đầu ca làm việc
                      </span>
                    </div>

                    {/* Big Check-in CTA Button */}
                    <button
                      onClick={handleStartCheckInVerify}
                      className="w-full py-3.5 bg-[#FF4B16] hover:bg-[#E94312] text-white font-black text-sm rounded-xl shadow-lg shadow-orange-500/25 transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98]"
                    >
                      <CheckCircle2 className="w-5 h-5" />
                      <span>CHẤM CÔNG VÀO (FACE ID & GPS)</span>
                    </button>
                  </div>
                )}

                {/* State B: ĐANG TRONG CA (SCREEN 04 IN-SHIFT ACTIVE) */}
                {isCheckedIn && (
                  <div className="pt-3 border-t border-zinc-100 space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          Thời gian làm việc liên tục
                        </div>
                        <div className="text-3xl font-black font-mono text-zinc-900 tracking-tight mt-0.5">
                          {formatTimer(secondsInShift)}
                        </div>
                        <div className="text-[11px] text-zinc-500 font-medium mt-0.5">
                          Giờ vào: <strong className="text-zinc-800">{recordedCheckInTime || '08:00:00'}</strong> (Đúng giờ) • Nghỉ: <strong className="text-zinc-800">00:20:00</strong>
                        </div>
                      </div>

                      <button
                        onClick={() => setCurrentScreen('CHECKOUT_SUMMARY')}
                        className="p-2.5 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-extrabold flex items-center space-x-1.5 transition-all cursor-pointer shadow-xs"
                      >
                        <LogOut className="w-4 h-4 text-orange-400" />
                        <span>Kết thúc ca</span>
                      </button>
                    </div>

                    {/* Quick Activity Status Selector (Horizontal Scrollable Tabs) */}
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                          Trạng thái hoạt động trong ca
                        </span>
                        <span className="text-[10px] text-zinc-400 font-medium">Trượt ngang</span>
                      </div>
                      <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none snap-x">
                        <button
                          onClick={() => onChangeActivity('WORKING')}
                          className="px-3 py-1.5 rounded-xl bg-orange-50 hover:bg-orange-100 border border-orange-200 text-[#FF4B16] text-[11px] font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap snap-start shrink-0"
                        >
                          <Activity className="w-3.5 h-3.5 text-[#FF4B16]" />
                          <span>Đang làm việc</span>
                        </button>
                        <button
                          onClick={() => onChangeActivity('BREAK')}
                          className="px-3 py-1.5 rounded-xl bg-zinc-50 hover:bg-orange-50 border border-zinc-200/80 hover:border-orange-200 text-zinc-700 hover:text-[#FF4B16] text-[11px] font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap snap-start shrink-0"
                        >
                          <Coffee className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Nghỉ ca (30p)</span>
                        </button>
                        <button
                          onClick={() => onChangeActivity('OUTSIDE')}
                          className="px-3 py-1.5 rounded-xl bg-zinc-50 hover:bg-orange-50 border border-zinc-200/80 hover:border-orange-200 text-zinc-700 hover:text-[#FF4B16] text-[11px] font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap snap-start shrink-0"
                        >
                          <ExternalLink className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Ra ngoài (15p)</span>
                        </button>
                        <button
                          onClick={() => onChangeActivity('DELIVERY')}
                          className="px-3 py-1.5 rounded-xl bg-zinc-50 hover:bg-orange-50 border border-zinc-200/80 hover:border-orange-200 text-zinc-700 hover:text-[#FF4B16] text-[11px] font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap snap-start shrink-0"
                        >
                          <Truck className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Đi giao hàng</span>
                        </button>
                        <button
                          onClick={() => onChangeActivity('SUPPORT_TECH')}
                          className="px-3 py-1.5 rounded-xl bg-zinc-50 hover:bg-orange-50 border border-zinc-200/80 hover:border-orange-200 text-zinc-700 hover:text-[#FF4B16] text-[11px] font-bold transition-all flex items-center space-x-1.5 cursor-pointer whitespace-nowrap snap-start shrink-0"
                        >
                          <Wrench className="w-3.5 h-3.5 text-zinc-500" />
                          <span>Kỹ thuật & KCS</span>
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* CARD: DANH SÁCH NHIỆM VỤ HÔM NAY (TƯ VẤN, ĐƠN HÀNG, DOANH SỐ VỚI PROGRESS BAR MÀU CAM #FF4B16) */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Target className="w-4 h-4 text-[#FF4B16]" />
                    <h3 className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider">
                      Nhiệm vụ hôm nay
                    </h3>
                  </div>
                  <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-extrabold px-2 py-0.5 rounded-full">
                    KPI Ngày 16/05/2026
                  </span>
                </div>

                {/* 3 Main KPI Progress Bars */}
                <div className="space-y-3.5 text-xs">
                  {/* 1. Tư vấn */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-zinc-700 flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#FF4B16]" />
                        <span>Tư vấn khách hàng</span>
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-zinc-900 font-extrabold">8 / 15 khách</span>
                        <span className="text-[#FF4B16] font-bold text-[11px]">(53.3%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-zinc-200/60">
                      <div 
                        className="bg-[#FF4B16] h-full rounded-full transition-all duration-500 shadow-xs" 
                        style={{ width: '53.3%' }} 
                      />
                    </div>
                    <div className="text-[10px] text-zinc-400 font-medium">
                      Cần thêm 7 lượt tư vấn để hoàn thành chỉ tiêu ngày
                    </div>
                  </div>

                  {/* 2. Đơn hàng */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-zinc-700 flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#FF4B16]" />
                        <span>Đơn hàng chốt thành công</span>
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-zinc-900 font-extrabold">6 / 10 đơn</span>
                        <span className="text-[#FF4B16] font-bold text-[11px]">(60.0%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-zinc-200/60">
                      <div 
                        className="bg-[#FF4B16] h-full rounded-full transition-all duration-500 shadow-xs" 
                        style={{ width: '60%' }} 
                      />
                    </div>
                    <div className="text-[10px] text-zinc-400 font-medium">
                      Đã bán: 2 iPhone 15 Pro, 4 Ốp lưng & Củ sạc Apple 20W
                    </div>
                  </div>

                  {/* 3. Doanh số */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center font-bold">
                      <span className="text-zinc-700 flex items-center space-x-1.5">
                        <span className="w-2 h-2 rounded-full bg-[#FF4B16]" />
                        <span>Doanh số mục tiêu</span>
                      </span>
                      <div className="flex items-center space-x-1.5">
                        <span className="text-zinc-900 font-extrabold">12.5M / 20.0M</span>
                        <span className="text-[#FF4B16] font-bold text-[11px]">(62.5%)</span>
                      </div>
                    </div>
                    <div className="w-full bg-zinc-100 h-2.5 rounded-full overflow-hidden p-0.5 border border-zinc-200/60">
                      <div 
                        className="bg-[#FF4B16] h-full rounded-full transition-all duration-500 shadow-xs" 
                        style={{ width: '62.5%' }} 
                      />
                    </div>
                    <div className="text-[10px] text-zinc-400 font-medium">
                      Còn thiếu 7.500.000 đ để đạt định mức thưởng nóng 150k
                    </div>
                  </div>
                </div>

                {/* Checklist công việc chi tiết trong ngày (Interactive) */}
                <div className="pt-3 border-t border-zinc-100 space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold text-zinc-800">
                    <div className="flex items-center space-x-1.5">
                      <Award className="w-3.5 h-3.5 text-[#FF4B16]" />
                      <span>Checklist công việc ca làm</span>
                    </div>
                    <span className="text-[11px] text-zinc-400">
                      {dailyTasks.filter(t => t.completed).length}/{dailyTasks.length} hoàn thành
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {dailyTasks.map(task => (
                      <button
                        key={task.id}
                        onClick={() => toggleTask(task.id)}
                        className={`w-full p-2.5 rounded-xl border text-left flex items-start space-x-2.5 transition-all cursor-pointer ${
                          task.completed 
                            ? 'bg-zinc-50/80 border-zinc-200 text-zinc-400' 
                            : 'bg-orange-50/30 hover:bg-orange-50/70 border-orange-200/60 text-zinc-800'
                        }`}
                      >
                        <div className="mt-0.5 shrink-0">
                          {task.completed ? (
                            <CheckSquare className="w-4 h-4 text-orange-600" />
                          ) : (
                            <Square className="w-4 h-4 text-zinc-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1 text-xs">
                          <div className={`font-semibold leading-tight ${task.completed ? 'line-through text-zinc-400' : 'text-zinc-800'}`}>
                            {task.title}
                          </div>
                          <div className="flex items-center space-x-2 text-[10px] text-zinc-400 mt-0.5">
                            <span className="font-bold text-orange-600">{task.category}</span>
                            {task.time && <span>• Xong lúc {task.time}</span>}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Estimated Daily Commission Card */}
                <div className="bg-gradient-to-r from-orange-500/10 via-orange-500/10 to-orange-500/5 rounded-2xl p-3 border border-orange-200 flex items-center justify-between">
                  <div className="flex items-center space-x-2.5">
                    <div className="p-2 rounded-xl bg-[#FF4B16] text-white">
                      <DollarSign className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[10px] font-bold text-zinc-500 uppercase">Hoa hồng tạm tính hôm nay</div>
                      <div className="text-sm font-black text-zinc-900">+285.000 đ</div>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] font-extrabold text-[#FF4B16] bg-white px-2 py-1 rounded-lg border border-orange-200 shadow-2xs">
                      2 máy • 4 PK
                    </span>
                  </div>
                </div>
              </div>

              {/* QUICK ACTIONS GRID: LỊCH LÀM VIỆC, XIN NGHỈ, BẢNG LƯƠNG */}
              <div>
                <div className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider px-1 mb-2">
                  Thao tác nhanh
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setActiveBottomTab('schedule')}
                    className="p-3 bg-white hover:bg-orange-50/60 rounded-2xl border border-zinc-200/80 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                      <Calendar className="w-5 h-5 text-[#FF4B16]" />
                    </div>
                    <span className="text-xs font-extrabold text-zinc-800">Lịch làm việc</span>
                    <span className="text-[9px] text-zinc-400 mt-0.5">Xem ca tuần</span>
                  </button>

                  <button
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="p-3 bg-white hover:bg-orange-50/60 rounded-2xl border border-zinc-200/80 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                      <FileText className="w-5 h-5 text-orange-600" />
                    </div>
                    <span className="text-xs font-extrabold text-zinc-800">Xin nghỉ</span>
                    <span className="text-[9px] text-zinc-400 mt-0.5">Phép & đổi ca</span>
                  </button>

                  <button
                    onClick={() => setActiveBottomTab('profile')}
                    className="p-3 bg-white hover:bg-orange-50/60 rounded-2xl border border-zinc-200/80 shadow-2xs flex flex-col items-center justify-center transition-all cursor-pointer group active:scale-95"
                  >
                    <div className="w-10 h-10 rounded-xl bg-orange-50 border border-orange-100 flex items-center justify-center mb-1.5 group-hover:scale-105 transition-transform">
                      <DollarSign className="w-5 h-5 text-orange-600" />
                    </div>
                    <span className="text-xs font-extrabold text-zinc-800">Bảng lương</span>
                    <span className="text-[9px] text-zinc-400 mt-0.5">Phiếu & hoa hồng</span>
                  </button>
                </div>
              </div>

              {/* FOOTER CTA (SCREEN 04): KẾT THÚC CA */}
              {isCheckedIn && (
                <div className="pt-2 pb-2">
                  <button
                    onClick={() => setCurrentScreen('CHECKOUT_SUMMARY')}
                    className="w-full py-3.5 bg-zinc-900 hover:bg-zinc-800 text-white font-black text-xs rounded-2xl shadow-lg transition-all flex items-center justify-center space-x-2 cursor-pointer active:scale-[0.98]"
                  >
                    <LogOut className="w-4 h-4 text-[#FF4B16]" />
                    <span className="tracking-wider">KẾT THÚC CA LÀM VIỆC</span>
                  </button>
                </div>
              )}
            </>
          )}

          {/* TAB 2: LỊCH LÀM VIỆC & NGHỈ PHÉP (SCREEN 06 & SCREEN 07) */}
          {activeBottomTab === 'schedule' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-zinc-900">Lịch làm việc</h2>
                  <p className="text-xs text-zinc-500">Đăng ký ca & quản lý nghỉ phép</p>
                </div>

                <div className="flex items-center bg-zinc-100 p-0.5 rounded-xl text-xs font-bold">
                  <button 
                    onClick={() => setScheduleViewMode('WEEK')}
                    className={`px-3 py-1 rounded-lg transition-all ${scheduleViewMode === 'WEEK' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'}`}
                  >
                    Tuần
                  </button>
                  <button 
                    onClick={() => setScheduleViewMode('MONTH')}
                    className={`px-3 py-1 rounded-lg transition-all ${scheduleViewMode === 'MONTH' ? 'bg-white text-zinc-900 shadow-2xs' : 'text-zinc-500'}`}
                  >
                    Tháng
                  </button>
                </div>
              </div>

              {/* Dải ngày trong tuần ngang (T2 -> CN) */}
              <div className="grid grid-cols-7 gap-1 bg-white p-2.5 rounded-2xl border border-zinc-200/80 shadow-2xs text-center">
                {[
                  { dayName: 'T2', dayNum: 13, key: '2026-05-11' },
                  { dayName: 'T3', dayNum: 14, key: '2026-05-12' },
                  { dayName: 'T4', dayNum: 15, key: '2026-05-13' },
                  { dayName: 'T5', dayNum: 16, key: '2026-05-14' },
                  { dayName: 'T6', dayNum: 17, key: '2026-05-15' },
                  { dayName: 'T7', dayNum: 18, key: '2026-05-16', active: true },
                  { dayName: 'CN', dayNum: 19, key: '2026-05-17' },
                ].map(d => (
                  <button
                    key={d.key}
                    onClick={() => setSelectedDateKey(d.key)}
                    className={`py-2 rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer ${
                      d.active || selectedDateKey === d.key
                        ? 'bg-[#FF4B16] text-white font-bold shadow-xs'
                        : 'hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <span className="text-[10px] uppercase">{d.dayName}</span>
                    <span className="text-sm font-black mt-0.5">{d.dayNum}</span>
                  </button>
                ))}
              </div>

              {/* Danh sách ca ngày được chọn */}
              <div className="space-y-2">
                <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                  Ca làm Thứ 7, 16/05/2026
                </div>

                {/* Ca sáng (Đã chấm công) */}
                <div className="bg-white p-3.5 rounded-2xl border border-orange-200/80 shadow-2xs flex items-center justify-between">
                  <div>
                    <div className="font-extrabold text-sm text-zinc-900">Ca sáng (08:00 – 15:00)</div>
                    <div className="text-xs text-zinc-500 font-medium">{currentUser.branchName}</div>
                  </div>
                  <span className="bg-orange-100 text-orange-800 text-[10px] font-bold px-2.5 py-1 rounded-full">
                    Đã chấm công
                  </span>
                </div>

                {/* Ca chiều (Có thể đăng ký / đổi) */}
                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs flex items-center justify-between opacity-80">
                  <div>
                    <div className="font-extrabold text-sm text-zinc-900">Ca chiều (14:00 – 21:00)</div>
                    <div className="text-xs text-zinc-500 font-medium">{currentUser.branchName}</div>
                  </div>
                  <span className="bg-zinc-100 text-zinc-600 text-[10px] font-bold px-2.5 py-1 rounded-full">
                    Chưa đăng ký
                  </span>
                </div>

                {/* Ca tối */}
                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs flex items-center justify-between opacity-80">
                  <div>
                    <div className="font-extrabold text-sm text-zinc-900">Ca tối (17:00 – 22:00)</div>
                    <div className="text-xs text-zinc-500 font-medium">Chi nhánh Cầu Giấy</div>
                  </div>
                  <span className="bg-orange-50 text-[#FF4B16] text-[10px] font-bold px-2.5 py-1 rounded-full border border-orange-100">
                    Có thể đăng ký
                  </span>
                </div>
              </div>

              {/* Nghỉ phép summary card */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-extrabold text-zinc-900 uppercase">Quỹ nghỉ phép năm</h3>
                  <button 
                    onClick={() => setIsLeaveModalOpen(true)}
                    className="text-xs font-bold text-[#FF4B16] hover:underline"
                  >
                    + Tạo yêu cầu
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-2 text-center text-xs">
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Phép còn lại</div>
                    <div className="text-sm font-black text-orange-600 mt-0.5">8 ngày</div>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <div className="text-[10px] text-zinc-400 font-bold uppercase">Đã sử dụng</div>
                    <div className="text-sm font-black text-zinc-800 mt-0.5">4 ngày</div>
                  </div>
                  <div className="bg-orange-50 p-2.5 rounded-xl border border-orange-100">
                    <div className="text-[10px] text-orange-700 font-bold uppercase">Chờ duyệt</div>
                    <div className="text-sm font-black text-orange-800 mt-0.5">1 yêu cầu</div>
                  </div>
                </div>

                {/* Danh sách yêu cầu nghỉ gần đây */}
                <div className="mt-3 pt-2.5 border-t border-zinc-100 space-y-1.5">
                  {leaveRequests.map(req => (
                    <div key={req.id} className="flex items-center justify-between text-xs py-1">
                      <div>
                        <span className="font-bold text-zinc-800">{req.startDate}</span>
                        <span className="text-zinc-500 ml-1.5">({req.type === 'ANNUAL_LEAVE' ? 'Nghỉ phép năm' : 'Đổi ca'})</span>
                      </div>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                        req.status === 'APPROVED' ? 'bg-orange-100 text-orange-800' : 'bg-orange-100 text-orange-800'
                      }`}>
                        {req.status === 'APPROVED' ? 'Đã duyệt' : 'Chờ duyệt'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={() => setIsLeaveModalOpen(true)}
                className="w-full py-3 bg-[#FF4B16] hover:bg-[#E94312] text-white font-extrabold text-sm rounded-2xl shadow-md transition-all cursor-pointer"
              >
                ĐĂNG KÝ / ĐỔI CA LÀM
              </button>
            </div>
          )}

          {/* TAB 3: THÔNG BÁO */}
          {activeBottomTab === 'notifications' && (
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-extrabold text-zinc-900">Thông báo</h2>
                <span className="text-xs text-[#FF4B16] font-bold">Đánh dấu đã đọc</span>
              </div>

              <div className="space-y-2">
                <div className="bg-white p-3.5 rounded-2xl border border-orange-100 shadow-2xs flex space-x-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 text-[#FF4B16] flex items-center justify-center shrink-0">
                    <DollarSign className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-zinc-900">+75.000đ Hoa hồng bán máy</div>
                    <div className="text-zinc-600 mt-0.5">HĐ #PH260801001 (iPhone 16 Pro Max 256GB Desert Titanium) đã thanh toán.</div>
                    <div className="text-[10px] text-zinc-400 mt-1">10:30 Hôm nay</div>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-2xl border border-zinc-200/80 shadow-2xs flex space-x-3">
                  <div className="w-8 h-8 rounded-full bg-orange-100 text-orange-700 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4" />
                  </div>
                  <div className="text-xs">
                    <div className="font-bold text-zinc-900">Đã duyệt đơn nghỉ phép</div>
                    <div className="text-zinc-600 mt-0.5">Cửa hàng trưởng Nguyễn Thị E đã duyệt đơn nghỉ ngày 12/08.</div>
                    <div className="text-[10px] text-zinc-400 mt-1">Hôm qua</div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: CÁ NHÂN & BẢNG LƯƠNG DỰ KIẾN (SCREEN 08, 09, 10) */}
          {activeBottomTab === 'profile' && (
            <div className="space-y-4">
              
              {/* FACE ID BIOMETRIC REGISTRATION CARD */}
              <div className="bg-gradient-to-r from-orange-500 via-orange-500 to-orange-600 text-white rounded-2xl p-4 shadow-md flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <div className="w-11 h-11 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-md">
                    <ScanFace className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-sm text-white flex items-center gap-1.5">
                      <span>Sinh Trắc Học Face ID</span>
                      {staffFaceProfile.assignedFaceEmbedding && (
                        <span className="bg-orange-500 text-white text-[9px] font-black px-1.5 py-0.5 rounded-full">ĐÃ LƯU</span>
                      )}
                    </h3>
                    <p className="text-[11px] text-orange-100">
                      {staffFaceProfile.assignedFaceEmbedding 
                        ? 'Dữ liệu gương mặt đã mã hóa & sẵn sàng chấm công' 
                        : 'Chưa khai báo gương mặt. Bấm để chụp & lưu'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setIsFaceRegistrationOpen(true)}
                  className="bg-white text-orange-600 font-extrabold text-xs px-3 py-2 rounded-xl shadow-xs hover:bg-orange-50 transition-all shrink-0 cursor-pointer flex items-center gap-1"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{staffFaceProfile.assignedFaceEmbedding ? 'Cập Nhật' : 'Đăng Ký'}</span>
                </button>
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-base font-extrabold text-zinc-900">Bảng lương dự kiến</h2>
                  <p className="text-xs text-zinc-500">Minh bạch hoa hồng & công chuẩn</p>
                </div>

                <select className="bg-white border border-zinc-200 rounded-xl px-2.5 py-1 text-xs font-bold text-zinc-800 shadow-2xs">
                  <option value="2026-08">Tháng 08/2026</option>
                  <option value="2026-07">Tháng 07/2026</option>
                </select>
              </div>

              {/* HERO CARD LƯƠNG THỰC LĨNH */}
              <div className="bg-zinc-900 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
                <div className="relative z-10">
                  <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Tổng dự kiến thực nhận</span>
                  <div className="text-3xl font-black font-mono text-[#FF4B16] mt-1">
                    {payrollSlip.netReceivable.toLocaleString()} VND
                  </div>
                  <div className="text-xs text-zinc-400 mt-1">
                    Trạng thái: <span className="text-orange-400 font-bold">Quản lý cửa hàng đã duyệt</span>
                  </div>
                </div>
                <div className="absolute right-3 top-3 opacity-10">
                  <DollarSign className="w-24 h-24 text-white" />
                </div>
              </div>

              {/* CHI TIẾT CÁC KHOẢN THU NHẬP & GIẢM TRỪ */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs space-y-2.5">
                <div className="text-xs font-extrabold text-zinc-900 uppercase tracking-wider pb-1 border-b border-zinc-100 flex justify-between items-center">
                  <span>Bóc tách thu nhập</span>
                  <span className="text-[10px] text-zinc-400 font-normal">Chạm để xem nguồn tiền</span>
                </div>

                {payrollLedgers.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setSelectedLedgerItem(item)}
                    className="w-full flex items-center justify-between text-xs py-1.5 hover:bg-zinc-50 px-2 rounded-xl transition-colors cursor-pointer group text-left"
                  >
                    <div className="min-w-0 pr-2">
                      <div className="font-bold text-zinc-800 group-hover:text-[#FF4B16] truncate">
                        {item.title}
                      </div>
                      <div className="text-[10px] text-zinc-400 truncate">{item.description}</div>
                    </div>

                    <div className={`font-black font-mono shrink-0 ${item.isAddition ? 'text-zinc-900' : 'text-rose-600'}`}>
                      {item.isAddition ? '+' : '-'}{item.amount.toLocaleString()} đ
                    </div>
                  </button>
                ))}
              </div>

              {/* PERFORMANCE / KPI THÁNG */}
              <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-extrabold text-zinc-900 uppercase">Hiệu suất tháng 8</h3>
                  <span className="text-sm font-black text-[#FF4B16]">82% KPI</span>
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Doanh số bán</span>
                    <div className="font-black text-zinc-900 mt-0.5">125M / 150M</div>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Đơn hàng</span>
                    <div className="font-black text-zinc-900 mt-0.5">58 / 70 đơn</div>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Bán kèm PK</span>
                    <div className="font-black text-orange-600 mt-0.5">68% (Đạt)</div>
                  </div>
                  <div className="bg-zinc-50 p-2.5 rounded-xl">
                    <span className="text-[10px] text-zinc-400 font-bold uppercase">Hoa hồng chờ</span>
                    <div className="font-black text-orange-600 mt-0.5">430.000 đ</div>
                  </div>
                </div>
              </div>

              <div className="text-[11px] text-zinc-400 text-center px-4 italic">
                * Đây là mức dự kiến. Số liệu chính thức được xác nhận khi kỳ lương được ban giám đốc phê duyệt và khóa sổ.
              </div>
            </div>
          )}
        </div>
      )}

      {/* DRILLDOWN MODAL: TRUY VẾT NGUỒN TIỀN HOA HỒNG (SCREEN 09) */}
      {selectedLedgerItem && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs">
          <div className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <div>
                <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">Truy vết nguồn tiền</span>
                <h3 className="text-sm font-black text-zinc-900">{selectedLedgerItem.title}</h3>
              </div>
              <button 
                onClick={() => setSelectedLedgerItem(null)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500 hover:bg-zinc-200"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="bg-orange-50/70 p-3 rounded-2xl border border-orange-100 flex justify-between items-center">
              <span className="text-xs font-bold text-zinc-700">Tổng khoản này:</span>
              <span className="text-base font-black font-mono text-[#FF4B16]">
                {selectedLedgerItem.amount.toLocaleString()} đ
              </span>
            </div>

            {/* List of distinct orders & commission transactions */}
            <div className="space-y-2">
              <div className="text-xs font-extrabold text-zinc-800 uppercase">Danh sách phát sinh thực tế</div>
              {commissions.map(c => (
                <div key={c.id} className="p-3 bg-zinc-50 rounded-2xl border border-zinc-200/70 text-xs space-y-1">
                  <div className="flex justify-between font-bold">
                    <span className="text-[#FF4B16]">#{c.orderCode}</span>
                    <span className="text-orange-700">+{c.commissionAmount.toLocaleString()} đ</span>
                  </div>
                  <div className="text-zinc-800 font-semibold">{c.productName}</div>
                  <div className="text-[10px] text-zinc-400 flex justify-between pt-1 border-t border-zinc-200/50">
                    <span>IMEI: {c.imei ? c.imei.slice(-6) : 'N/A'}</span>
                    <span>{c.occurredAt}</span>
                  </div>
                </div>
              ))}
            </div>

            <button
              onClick={() => setSelectedLedgerItem(null)}
              className="w-full py-3 bg-zinc-900 text-white font-bold text-xs rounded-xl cursor-pointer"
            >
              ĐÓNG
            </button>
          </div>
        </div>
      )}

      {/* CREATE LEAVE / SWAP MODAL */}
      {isLeaveModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 backdrop-blur-xs">
          <form onSubmit={handleSubmitLeave} className="bg-white w-full max-w-md rounded-t-3xl sm:rounded-3xl p-5 shadow-2xl space-y-3 max-h-[90vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-2">
              <h3 className="text-sm font-black text-zinc-900">Tạo yêu cầu Nghỉ phép / Đổi ca</h3>
              <button 
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="w-8 h-8 rounded-full bg-zinc-100 flex items-center justify-center text-zinc-500"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-zinc-700 mb-1">Loại yêu cầu</label>
                <select
                  value={leaveForm.type}
                  onChange={(e) => setLeaveForm({ ...leaveForm, type: e.target.value as any })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-semibold"
                >
                  <option value="ANNUAL_LEAVE">Nghỉ phép năm (Có lương)</option>
                  <option value="HALF_DAY">Nghỉ nửa ngày (Buổi sáng/chiều)</option>
                  <option value="SHIFT_SWAP">Đổi ca với đồng nghiệp</option>
                  <option value="SICK_LEAVE">Nghỉ ốm / Khám bệnh</option>
                  <option value="UNPAID">Nghỉ không lương</option>
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Từ ngày</label>
                  <input
                    type="date"
                    value={leaveForm.startDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Đến ngày</label>
                  <input
                    type="date"
                    value={leaveForm.endDate}
                    onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
              </div>

              {leaveForm.type === 'SHIFT_SWAP' && (
                <div>
                  <label className="block font-bold text-zinc-700 mb-1">Nhân viên đổi ca cùng</label>
                  <input
                    type="text"
                    placeholder="VD: Phạm Văn D (Thu ngân)"
                    value={leaveForm.swapWithStaffName}
                    onChange={(e) => setLeaveForm({ ...leaveForm, swapWithStaffName: e.target.value })}
                    className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2 font-semibold"
                  />
                </div>
              )}

              <div>
                <label className="block font-bold text-zinc-700 mb-1">Lý do chi tiết *</label>
                <textarea
                  required
                  rows={3}
                  placeholder="Ghi rõ lý do xin nghỉ hoặc đổi ca..."
                  value={leaveForm.reason}
                  onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-xl px-3 py-2"
                />
              </div>
            </div>

            <div className="pt-2 flex space-x-2">
              <button
                type="button"
                onClick={() => setIsLeaveModalOpen(false)}
                className="flex-1 py-3 bg-zinc-100 text-zinc-700 font-bold text-xs rounded-xl"
              >
                HỦY
              </button>
              <button
                type="submit"
                className="flex-1 py-3 bg-[#FF4B16] text-white font-black text-xs rounded-xl shadow-md shadow-orange-500/20"
              >
                GỬI DUYỆT
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FIXED BOTTOM NAVIGATION BAR (4 TABS ONLY: Hôm nay - Công việc - Thông báo - Cá nhân) */}
      <div className="fixed bottom-0 left-0 right-0 max-w-md mx-auto bg-white/95 border-t border-zinc-200/80 px-4 py-2 z-40 flex items-center justify-around shadow-lg backdrop-blur-md">
        <button
          onClick={() => { setActiveBottomTab('today'); setCurrentScreen('HOME'); }}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeBottomTab === 'today' ? 'text-[#FF4B16]' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Home className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold">Hôm nay</span>
        </button>

        <button
          onClick={() => { setActiveBottomTab('schedule'); setCurrentScreen('HOME'); }}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeBottomTab === 'schedule' ? 'text-[#FF4B16]' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <Briefcase className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold">Công việc</span>
        </button>

        <button
          onClick={() => { setActiveBottomTab('notifications'); setCurrentScreen('HOME'); }}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer relative ${
            activeBottomTab === 'notifications' ? 'text-[#FF4B16]' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <div className="relative">
            <Bell className="w-5 h-5 mb-0.5" />
            <span className="absolute -top-1 -right-1 w-2 h-2 bg-[#FF4B16] rounded-full" />
          </div>
          <span className="text-[10px] font-bold">Thông báo</span>
        </button>

        <button
          onClick={() => { setActiveBottomTab('profile'); setCurrentScreen('HOME'); }}
          className={`flex flex-col items-center justify-center py-1 px-3 rounded-xl transition-all cursor-pointer ${
            activeBottomTab === 'profile' ? 'text-[#FF4B16]' : 'text-zinc-400 hover:text-zinc-600'
          }`}
        >
          <User className="w-5 h-5 mb-0.5" />
          <span className="text-[10px] font-bold">Cá nhân</span>
        </button>
      </div>

      {/* FACE REGISTRATION MODAL */}
      <FaceRegistrationModal
        isOpen={isFaceRegistrationOpen}
        onClose={() => setIsFaceRegistrationOpen(false)}
        staffName={currentUser.name}
        staffEmail={currentUser.email}
        currentFacePhotoUrl={staffFaceProfile.facePhotoUrl}
        onSaveFaceProfile={handleSaveSelfFaceProfile}
      />

    </div>
  );
};
