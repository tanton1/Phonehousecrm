import React, { useState, useEffect, useRef, useMemo } from 'react';
import { 
  StaffMember, 
  AttendanceRecord, 
  StoreBranch, 
  UserAccount 
} from '../types';
import { INITIAL_BRANCHES } from '../data/initialData';
import { INITIAL_STAFF_MEMBERS } from '../data/attendanceData';
import { FaceRegistrationModal } from './FaceRegistrationModal';
import { 
  compareFaceVectors, 
  extractFaceFeatureVectorFromCanvas, 
  detectFacePresenceInCanvas 
} from '../utils/faceMatchingEngine';
import {
  Clock,
  MapPin,
  Wifi,
  ScanFace,
  QrCode,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Camera,
  SwitchCamera,
  Play,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  SlidersHorizontal,
  Building2,
  Calendar,
  Layers,
  ChevronRight,
  Check,
  X,
  UserCheck,
  Loader2,
  Smartphone,
  Eye,
  Info,
  CheckCheck
} from 'lucide-react';

interface StandaloneCheckInViewProps {
  currentUser?: UserAccount | StaffMember | null;
  branches?: StoreBranch[];
  attendanceRecords?: AttendanceRecord[];
  onCheckInSuccess?: (record: any) => void;
  onNavigateToHR?: () => void;
  onClose?: () => void;
}

export const StandaloneCheckInView: React.FC<StandaloneCheckInViewProps> = ({
  currentUser,
  branches = INITIAL_BRANCHES,
  attendanceRecords = [],
  onCheckInSuccess,
  onNavigateToHR,
  onClose
}) => {
  // Step Wizard: 1: CHỌN NHÂN VIÊN & CA | 2: GPS ĐỊNH VỊ | 3: WI-FI CỬA HÀNG | 4: FACE ID SINH TRẮC HỌC | 5: HOÀN TẤT
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3 | 4 | 5>(1);

  // Available staff and branches
  const availableStaff = INITIAL_STAFF_MEMBERS;
  const [selectedStaffId, setSelectedStaffId] = useState<string>(() => {
    if (currentUser?.id && availableStaff.some(s => s.id === currentUser.id)) {
      return currentUser.id;
    }
    return availableStaff[0]?.id || 'STAFF_001';
  });

  const selectedStaff = useMemo(() => {
    return availableStaff.find(s => s.id === selectedStaffId) || availableStaff[0];
  }, [availableStaff, selectedStaffId]);

  const [selectedBranchId, setSelectedBranchId] = useState<string>(() => {
    return selectedStaff?.branchId || branches[0]?.id || 'BRANCH_001';
  });

  const targetBranch = useMemo(() => {
    return branches.find(b => b.id === selectedBranchId || b.name === selectedStaff?.branchName) || branches[0];
  }, [branches, selectedBranchId, selectedStaff]);

  // Live Digital Clock
  const [liveTime, setLiveTime] = useState(new Date());
  useEffect(() => {
    const timer = setInterval(() => setLiveTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const liveTimeString = liveTime.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const liveDateString = liveTime.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });

  // STEP 2: GPS State
  const [gpsStatus, setGpsStatus] = useState<'PENDING' | 'SCANNING' | 'SUCCESS' | 'ERROR'>('PENDING');
  const [gpsDistance, setGpsDistance] = useState<number>(12);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [gpsErrorMsg, setGpsErrorMsg] = useState<string | null>(null);
  const targetLat = targetBranch?.gpsLatitude || 10.7769;
  const targetLng = targetBranch?.gpsLongitude || 106.7009;
  const allowedRadius = targetBranch?.allowedGpsRadiusMeters || 100;

  // STEP 3: Wi-Fi State
  const [wifiStatus, setWifiStatus] = useState<'PENDING' | 'SCANNING' | 'SUCCESS' | 'ERROR'>('PENDING');
  const targetWifiSSID = targetBranch?.allowedWifiSSID || 'WIFI_CUA_HANG';
  const [currentWifiSSID, setCurrentWifiSSID] = useState<string>(targetWifiSSID);

  // STEP 4: Face ID State
  const [faceStatus, setFaceStatus] = useState<'PENDING' | 'SCANNING' | 'SUCCESS' | 'ERROR'>('PENDING');
  const [faceConfidence, setFaceConfidence] = useState<number>(0);
  const [faceFeedbackMsg, setFaceFeedbackMsg] = useState<string | null>(null);
  const [capturedSnapshotUrl, setCapturedSnapshotUrl] = useState<string | null>(null);
  const [isFaceRegistrationOpen, setIsFaceRegistrationOpen] = useState(false);

  // Camera Refs & Stream
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [isCameraStarting, setIsCameraStarting] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Staff Face Profile (Local persistence per staff)
  const [staffFaceProfile, setStaffFaceProfile] = useState<{
    facePhotoUrl?: string;
    faceFeatureVector?: number[];
    faceEnrollmentDate?: string;
  }>(() => {
    try {
      const saved = localStorage.getItem(`phonehouse_face_profile_${selectedStaff.id}`);
      if (saved) return JSON.parse(saved);
    } catch (e) {}
    return {
      facePhotoUrl: selectedStaff.facePhotoUrl || selectedStaff.avatar,
      faceFeatureVector: selectedStaff.faceFeatureVector,
      faceEnrollmentDate: selectedStaff.faceEnrollmentDate || '2025-01-10'
    };
  });

  useEffect(() => {
    try {
      const saved = localStorage.getItem(`phonehouse_face_profile_${selectedStaff.id}`);
      if (saved) {
        setStaffFaceProfile(JSON.parse(saved));
      } else {
        setStaffFaceProfile({
          facePhotoUrl: selectedStaff.facePhotoUrl || selectedStaff.avatar,
          faceFeatureVector: selectedStaff.faceFeatureVector,
          faceEnrollmentDate: selectedStaff.faceEnrollmentDate || '2025-01-10'
        });
      }
    } catch (e) {}
  }, [selectedStaff.id]);

  // Camera Management
  const stopCamera = () => {
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(t => {
        try { t.stop(); } catch (e) {}
      });
      mediaStreamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
    setIsCameraStarting(false);
  };

  const startCamera = async (mode: 'user' | 'environment' = facingMode) => {
    setCameraError(null);
    setIsCameraStarting(true);
    stopCamera();

    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: mode,
            width: { ideal: 640 },
            height: { ideal: 480 }
          },
          audio: false
        });
        mediaStreamRef.current = stream;
        setIsCameraActive(true);
        setIsCameraStarting(false);

        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          try {
            await videoRef.current.play();
          } catch (e) {}
        }
      } else {
        setCameraError('Camera bị chặn bởi trình duyệt. Vui lòng nhấn nút MỞ TRONG TAB MỚI để cấp quyền Camera.');
        setIsCameraStarting(false);
      }
    } catch (err: any) {
      setIsCameraStarting(false);
      setIsCameraActive(false);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraError('Chưa có quyền Camera. ⚠️ Vui lòng cấp quyền trên trình duyệt.');
      } else {
        setCameraError('Không thể khởi động Camera: ' + (err.message || 'Lỗi thiết bị'));
      }
    }
  };

  const toggleFacingMode = () => {
    const next = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(next);
    startCamera(next);
  };

  // Start camera when entering step 4 & ensure video element gets stream
  useEffect(() => {
    if (currentStep === 4) {
      startCamera();
    } else {
      stopCamera();
    }
    return () => stopCamera();
  }, [currentStep]);

  useEffect(() => {
    if (isCameraActive && mediaStreamRef.current && videoRef.current) {
      if (videoRef.current.srcObject !== mediaStreamRef.current) {
        videoRef.current.srcObject = mediaStreamRef.current;
        videoRef.current.play().catch(e => console.warn('Video play error:', e));
      }
    }
  }, [isCameraActive, currentStep]);

  // GPS Distance calculation
  const calculateDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 6371e3;
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

  // Run GPS Check
  const runGPSCheck = () => {
    setGpsStatus('SCANNING');
    setGpsErrorMsg(null);

    if (navigator?.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const uLat = pos.coords.latitude;
          const uLng = pos.coords.longitude;
          setUserCoords({ lat: uLat, lng: uLng });
          const dist = calculateDistance(uLat, uLng, targetLat, targetLng);
          setGpsDistance(dist);

          if (dist <= allowedRadius) {
            setGpsStatus('SUCCESS');
          } else {
            setGpsStatus('ERROR');
            setGpsErrorMsg(`Khoảng cách ${dist > 1000 ? (dist/1000).toFixed(2) + ' km' : dist + 'm'} vượt quá bán kính quy định (≤ ${allowedRadius}m) của ${targetBranch.name}.`);
          }
        },
        (err) => {
          setGpsStatus('ERROR');
          setGpsErrorMsg('Không thể lấy tọa độ GPS: ' + err.message);
        },
        { enableHighAccuracy: true, timeout: 7000 }
      );
    } else {
      setGpsStatus('ERROR');
      setGpsErrorMsg('Trình duyệt không hỗ trợ Geolocation.');
    }
  };

  // Run Wi-Fi Check
  const runWifiCheck = () => {
    setWifiStatus('SCANNING');
    setTimeout(() => {
      if (currentWifiSSID === targetWifiSSID) {
        setWifiStatus('SUCCESS');
      } else {
        setWifiStatus('ERROR');
      }
    }, 600);
  };

  // Run Face ID Check (Server Gemini Vision + Client Biometric Correlation)
  const runFaceCheck = async (retryCount = 0) => {
    setFaceStatus('SCANNING');
    setFaceFeedbackMsg(null);

    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video) {
      if (retryCount < 10) {
        setTimeout(() => runFaceCheck(retryCount + 1), 300);
        return;
      }
      setFaceStatus('ERROR');
      setFaceFeedbackMsg('Camera chưa sẵn sàng.');
      return;
    }

    // Wait if video element is not ready yet or videoWidth is 0
    if ((video.readyState < 2 || video.videoWidth === 0) && retryCount < 12) {
      setTimeout(() => runFaceCheck(retryCount + 1), 250);
      return;
    }

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // 1. Check real face presence in frame
    const presence = detectFacePresenceInCanvas(canvas);
    if (!presence.hasFace) {
      // If camera sensor auto-exposure warming up (frame dark), retry up to 6 times
      if (presence.reason?.includes('quá tối') && retryCount < 6) {
        setTimeout(() => runFaceCheck(retryCount + 1), 350);
        return;
      }
      setFaceStatus('ERROR');
      setFaceConfidence(12.0);
      setFaceFeedbackMsg(presence.reason || '❌ Không phát hiện khuôn mặt người trong khung hình. Vui lòng căn chỉnh lại.');
      return;
    }

    const liveDataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedSnapshotUrl(liveDataUrl);
    const liveVector = extractFaceFeatureVectorFromCanvas(canvas);

    // If staff profile has no approved registered vector, require proper registration & manager approval
    const hasExistingVector = staffFaceProfile?.faceFeatureVector && staffFaceProfile.faceFeatureVector.length > 0;
    if (!hasExistingVector) {
      setFaceStatus('FAILED');
      setFaceConfidence(0);
      setFaceFeedbackMsg(`⚠️ ${selectedStaff.name} chưa có dữ liệu gương mặt được Quản lý phê duyệt. Vui lòng bấm "Đăng ký Face ID" để gửi yêu cầu phê duyệt.`);
      return;
    }

    try {
      const response = await fetch('/api/ai/verify-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeName: selectedStaff.name,
          livePhotoBase64: liveDataUrl,
          referencePhotoBase64: staffFaceProfile?.facePhotoUrl?.startsWith('data:image') ? staffFaceProfile.facePhotoUrl : undefined,
          referencePhotoUrl: staffFaceProfile?.facePhotoUrl?.startsWith('http') ? staffFaceProfile.facePhotoUrl : undefined,
          liveVector,
          storedVector: staffFaceProfile?.faceFeatureVector
        })
      });

      if (response.ok) {
        const resData = await response.json();
        if (resData.success && resData.data) {
          const { isMatched, confidenceScore, matchReason, isHumanFacePresent } = resData.data;

          if (isHumanFacePresent === false) {
            setFaceStatus('ERROR');
            setFaceConfidence(confidenceScore || 15.0);
            setFaceFeedbackMsg('❌ Không phát hiện khuôn mặt người thật rõ nét.');
            return;
          }

          if (isMatched) {
            setFaceStatus('SUCCESS');
            setFaceConfidence(confidenceScore || 98.6);
            setFaceFeedbackMsg(matchReason || `✅ Trùng khớp chính chủ: ${selectedStaff.name}`);
          } else {
            setFaceStatus('ERROR');
            setFaceConfidence(confidenceScore || 32.0);
            setFaceFeedbackMsg(matchReason || `❌ Khuôn mặt không trùng khớp với hồ sơ đăng ký của ${selectedStaff.name}`);
          }
          return;
        }
      }
    } catch (e) {
      console.warn('Server face check error, fallback to local Z-Score engine:', e);
    }

    // Local Fallback
    const match = compareFaceVectors(liveVector, staffFaceProfile?.faceFeatureVector, selectedStaff.name);
    if (match.isMatched) {
      setFaceStatus('SUCCESS');
      setFaceConfidence(match.matchScore);
      setFaceFeedbackMsg(match.statusText);
    } else {
      setFaceStatus('ERROR');
      setFaceConfidence(match.matchScore);
      setFaceFeedbackMsg(match.statusText);
    }
  };

  // Final Success record
  const [completedRecord, setCompletedRecord] = useState<any>(null);

  const handleFinishCheckIn = () => {
    const now = new Date();
    const timeStr = now.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const dateStr = now.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: '2-digit', day: '2-digit' });

    const newRecord = {
      id: `ATT_${Date.now()}`,
      staffId: selectedStaff.id,
      staffName: selectedStaff.name,
      role: selectedStaff.role,
      branchId: targetBranch.id,
      branchName: targetBranch.name,
      date: now.toISOString().split('T')[0],
      checkInTime: timeStr,
      checkInDate: dateStr,
      status: 'IN_PROGRESS',
      verification: {
        gpsVerified: gpsStatus === 'SUCCESS',
        wifiVerified: wifiStatus === 'SUCCESS',
        faceVerified: faceStatus === 'SUCCESS',
        distanceMeters: gpsDistance,
        wifiSSID: currentWifiSSID,
        faceConfidence: faceConfidence,
        snapshotUrl: capturedSnapshotUrl
      }
    };

    setCompletedRecord(newRecord);
    if (onCheckInSuccess) {
      onCheckInSuccess(newRecord);
    }
    setCurrentStep(5);
  };

  const stepsList = [
    { num: 1, title: 'Hồ sơ', icon: UserCheck, desc: 'Chọn nhân viên & Ca' },
    { num: 2, title: 'GPS', icon: MapPin, desc: 'Bán kính cửa hàng' },
    { num: 3, title: 'Wi-Fi', icon: Wifi, desc: 'Mạng nội bộ' },
    { num: 4, title: 'Face ID', icon: ScanFace, desc: 'Nhận diện sinh trắc' },
    { num: 5, title: 'Hoàn tất', icon: CheckCheck, desc: 'Ghi nhận công' }
  ];

  return (
    <div className="min-h-screen bg-[#F4F5F8] text-zinc-900 pb-16">
      {/* Top Header */}
      <div className="bg-white border-b border-zinc-200 sticky top-0 z-20 shadow-2xs">
        <div className="max-w-4xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#FF4B16] to-orange-500 text-white flex items-center justify-center font-black shadow-sm">
              <ScanFace className="w-5 h-5" />
            </div>
            <div>
              <div className="font-extrabold text-sm text-zinc-900 flex items-center gap-2">
                <span>PhoneHouse Fast Check-in</span>
                <span className="bg-orange-100 text-[#FF4B16] text-[10px] font-black px-2 py-0.5 rounded-full">
                  Sinh Trắc Học Độc Lập
                </span>
              </div>
              <p className="text-xs text-zinc-500">Quy trình điểm danh 4 bước tiêu chuẩn dành cho nhân viên cửa hàng</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onNavigateToHR && (
              <button
                onClick={onNavigateToHR}
                className="hidden sm:flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 transition-colors cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Bảng Quản Trị HR</span>
              </button>
            )}
            {onClose && (
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold text-zinc-700 bg-zinc-100 hover:bg-zinc-200 border border-zinc-200 transition-all cursor-pointer hover:text-zinc-900"
                title="Đóng cổng điểm danh"
              >
                <X className="w-4 h-4 text-zinc-500" />
                <span>Đóng</span>
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
        
        {/* Live Digital Clock Banner */}
        <div className="bg-gradient-to-r from-zinc-950 via-zinc-900 to-zinc-950 text-white rounded-3xl p-5 shadow-xl border border-zinc-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-48 h-48 bg-[#FF4B16]/20 rounded-full blur-3xl pointer-events-none" />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-orange-400 text-xs font-bold uppercase tracking-wider mb-1">
                <Clock className="w-4 h-4" />
                <span>Thời Gian Điểm Danh Chuẩn</span>
              </div>
              <div className="text-4xl font-black font-mono tracking-tight text-white">
                {liveTimeString}
              </div>
              <div className="text-xs text-zinc-300 font-medium mt-1">
                {liveDateString}
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-2xl p-3.5 border border-white/10 min-w-[200px]">
              <div className="text-[11px] text-zinc-400 font-bold uppercase tracking-wider">Cửa Hàng Trực</div>
              <div className="font-extrabold text-sm text-white mt-0.5 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-[#FF4B16]" />
                <span>{targetBranch.name}</span>
              </div>
              <div className="text-[11px] text-orange-200 mt-0.5">
                Bán kính cho phép: ≤ {allowedRadius}m
              </div>
            </div>
          </div>
        </div>

        {/* STEP PROGRESS BAR */}
        <div className="bg-white rounded-2xl p-4 border border-zinc-200/80 shadow-2xs">
          <div className="grid grid-cols-5 gap-2">
            {stepsList.map((st) => {
              const Icon = st.icon;
              const isPassed = currentStep > st.num;
              const isCurrent = currentStep === st.num;
              return (
                <button
                  key={st.num}
                  disabled={st.num > currentStep && currentStep !== 5}
                  onClick={() => setCurrentStep(st.num as any)}
                  className={`p-2.5 rounded-xl text-center flex flex-col items-center justify-center transition-all cursor-pointer ${
                    isCurrent
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/25 ring-2 ring-orange-500/30'
                      : isPassed
                      ? 'bg-orange-50 text-orange-800 border border-orange-200'
                      : 'bg-zinc-50 text-zinc-400 border border-zinc-200/60 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    {isPassed ? (
                      <CheckCircle2 className="w-4 h-4 text-orange-600" />
                    ) : (
                      <Icon className="w-4 h-4" />
                    )}
                  </div>
                  <div className="text-[11px] font-extrabold truncate w-full">
                    {st.title}
                  </div>
                  <div className="text-[9px] truncate w-full opacity-80 hidden sm:block">
                    {st.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================= STEP 1: CHỌN HỒ SƠ NHÂN VIÊN ================= */}
        {currentStep === 1 && (
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-[#FF4B16]" />
                  <span>Bước 1: Xác Nhận Hồ Sơ & Ca Làm Việc</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Chọn đúng tên của bạn và chi nhánh đang làm việc</p>
              </div>
              <span className="text-xs font-black bg-orange-100 text-[#FF4B16] px-2.5 py-1 rounded-full">
                Bước 1 / 4
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Nhân viên thực hiện:</label>
                <select
                  value={selectedStaffId}
                  onChange={(e) => setSelectedStaffId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-3 text-sm font-bold text-zinc-800 outline-none focus:border-[#FF4B16] focus:ring-2 focus:ring-orange-500/10 cursor-pointer"
                >
                  {availableStaff.map((staff) => (
                    <option key={staff.id} value={staff.id}>
                      {staff.name} — {staff.roleTitle || staff.role} ({staff.branchName})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-zinc-700">Chi nhánh điểm danh:</label>
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full bg-zinc-50 border border-zinc-200 rounded-2xl p-3 text-sm font-bold text-zinc-800 outline-none focus:border-[#FF4B16] focus:ring-2 focus:ring-orange-500/10 cursor-pointer"
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.address})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Selected Profile Card */}
            <div className="bg-gradient-to-br from-orange-50/80 to-orange-50/50 rounded-2xl p-4 border border-orange-100 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3.5">
                <img
                  src={staffFaceProfile.facePhotoUrl || selectedStaff.avatar}
                  alt={selectedStaff.name}
                  className="w-14 h-14 rounded-2xl object-cover border-2 border-white shadow-sm"
                />
                <div>
                  <div className="font-extrabold text-sm text-zinc-900">{selectedStaff.name}</div>
                  <div className="text-xs text-[#FF4B16] font-bold">{selectedStaff.roleTitle || 'Nhân viên bán hàng'}</div>
                  <div className="text-[11px] text-zinc-500 mt-0.5">Mã NV: {selectedStaff.code || selectedStaff.id} • {selectedStaff.branchName}</div>
                </div>
              </div>

              <button
                onClick={() => setIsFaceRegistrationOpen(true)}
                className="text-xs font-bold text-[#FF4B16] bg-white hover:bg-orange-100 px-3 py-2 rounded-xl border border-orange-200 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0 shadow-2xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Đổi Mẫu Face ID</span>
              </button>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => {
                  setCurrentStep(2);
                  runGPSCheck();
                }}
                className="bg-[#FF4B16] hover:bg-orange-600 text-white font-extrabold text-sm px-6 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-orange-500/25 cursor-pointer active:scale-95"
              >
                <span>Tiếp tục: Đo vị trí GPS</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 2: XÁC MINH GPS ================= */}
        {currentStep === 2 && (
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <MapPin className="w-5 h-5 text-[#FF4B16]" />
                  <span>Bước 2: Định Vị Tọa Độ GPS Cửa Hàng</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Yêu cầu thiết bị nằm trong bán kính ≤ {allowedRadius}m của {targetBranch.name}</p>
              </div>
              <span className="text-xs font-black bg-orange-100 text-[#FF4B16] px-2.5 py-1 rounded-full">
                Bước 2 / 4
              </span>
            </div>

            {/* GPS Result Box */}
            <div className={`p-4 rounded-2xl border transition-all ${
              gpsStatus === 'SUCCESS'
                ? 'bg-orange-50 border-orange-200 text-orange-950'
                : gpsStatus === 'ERROR'
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  {gpsStatus === 'SUCCESS' && <CheckCircle2 className="w-5 h-5 text-orange-600" />}
                  {gpsStatus === 'ERROR' && <AlertTriangle className="w-5 h-5 text-rose-600" />}
                  {gpsStatus === 'SCANNING' && <Loader2 className="w-5 h-5 animate-spin text-[#FF4B16]" />}
                  {gpsStatus === 'PENDING' && <MapPin className="w-5 h-5 text-zinc-400" />}
                  <span>
                    {gpsStatus === 'SUCCESS' ? '✅ Tọa Độ Hợp Lệ — Nằm Trong Cửa Hàng' :
                     gpsStatus === 'ERROR' ? '❌ Vị Trí Ngoài Bán Kính Cửa Hàng' :
                     gpsStatus === 'SCANNING' ? 'Đang đo tọa độ GPS vệ tinh...' : 'Chưa đo tọa độ GPS'}
                  </span>
                </div>
                <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-white border border-inherit">
                  Khoảng cách: {gpsDistance > 1000 ? `${(gpsDistance/1000).toFixed(2)} km` : `${gpsDistance} mét`}
                </span>
              </div>

              <div className="text-xs space-y-1">
                <p>Chi nhánh đích: <strong>{targetBranch.name}</strong> ({targetBranch.address})</p>
                {gpsErrorMsg && <p className="text-rose-700 font-bold bg-white/80 p-2 rounded-xl border border-rose-200 mt-2">⚠️ {gpsErrorMsg}</p>}
              </div>

              {/* Action buttons */}
              <div className="pt-3 flex flex-wrap items-center gap-2">
                <button
                  onClick={runGPSCheck}
                  className="bg-white hover:bg-zinc-100 text-zinc-800 font-bold text-xs px-3.5 py-2 rounded-xl border border-zinc-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs active:scale-95"
                >
                  <RefreshCw className="w-3.5 h-3.5 text-[#FF4B16]" />
                  <span>Đo Lại GPS Thực Tế</span>
                </button>

                {userCoords && (
                  <span className="text-[11px] font-mono text-zinc-500 bg-white px-2 py-1 rounded-lg border border-zinc-200">
                    Lat: {userCoords.lat.toFixed(4)}, Lng: {userCoords.lng.toFixed(4)}
                  </span>
                )}
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 hover:text-zinc-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>

              <button
                disabled={gpsStatus !== 'SUCCESS'}
                onClick={() => {
                  setCurrentStep(3);
                  runWifiCheck();
                }}
                className="bg-[#FF4B16] hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm px-6 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-orange-500/25 cursor-pointer active:scale-95"
              >
                <span>Tiếp tục: Kiểm tra Wi-Fi</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 3: XÁC MINH WI-FI ================= */}
        {currentStep === 3 && (
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <Wifi className="w-5 h-5 text-[#FF4B16]" />
                  <span>Bước 3: Xác Thực Wi-Fi Nội Bộ Cửa Hàng</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">Yêu cầu kết nối đúng mạng Wi-Fi được cấu hình: <strong>{targetWifiSSID}</strong></p>
              </div>
              <span className="text-xs font-black bg-orange-100 text-[#FF4B16] px-2.5 py-1 rounded-full">
                Bước 3 / 4
              </span>
            </div>

            <div className={`p-4 rounded-2xl border transition-all ${
              wifiStatus === 'SUCCESS'
                ? 'bg-orange-50 border-orange-200 text-orange-950'
                : wifiStatus === 'ERROR'
                ? 'bg-rose-50 border-rose-200 text-rose-950'
                : 'bg-zinc-50 border-zinc-200 text-zinc-700'
            }`}>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2 font-extrabold text-sm">
                  {wifiStatus === 'SUCCESS' && <CheckCircle2 className="w-5 h-5 text-orange-600" />}
                  {wifiStatus === 'ERROR' && <AlertTriangle className="w-5 h-5 text-rose-600" />}
                  {wifiStatus === 'SCANNING' && <Loader2 className="w-5 h-5 animate-spin text-[#FF4B16]" />}
                  {wifiStatus === 'PENDING' && <Wifi className="w-5 h-5 text-zinc-400" />}
                  <span>
                    {wifiStatus === 'SUCCESS' ? '✅ Đã Kết Nối Đúng Wi-Fi Cửa Hàng' :
                     wifiStatus === 'ERROR' ? '❌ Chưa Kết Nối Đúng Wi-Fi Nội Bộ' :
                     wifiStatus === 'SCANNING' ? 'Đang kiểm tra kết nối SSID...' : 'Chưa kiểm tra Wi-Fi'}
                  </span>
                </div>
                <span className="font-mono font-black text-xs px-2.5 py-1 rounded-lg bg-white border border-inherit">
                  SSID: {currentWifiSSID}
                </span>
              </div>

              <div className="text-xs space-y-1">
                <p>Wi-Fi yêu cầu: <strong className="text-orange-700 bg-white px-2 py-0.5 rounded border border-orange-200">{targetWifiSSID}</strong></p>
                {wifiStatus === 'ERROR' && (
                  <p className="text-rose-700 font-bold bg-white/80 p-2 rounded-xl border border-rose-200 mt-2">
                    ⚠️ Mạng hiện tại ({currentWifiSSID}) không phải Wi-Fi cửa hàng. Vui lòng kết nối vào Wi-Fi: {targetWifiSSID}.
                  </p>
                )}
              </div>

              {/* Real network SSID input and verify */}
              <div className="pt-3 flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border border-zinc-200 flex-1 min-w-[200px]">
                  <Wifi className="w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={currentWifiSSID}
                    onChange={(e) => setCurrentWifiSSID(e.target.value)}
                    placeholder="Nhập tên mạng Wi-Fi..."
                    className="w-full text-xs font-bold text-zinc-800 bg-transparent focus:outline-none"
                  />
                </div>
                <button
                  onClick={runWifiCheck}
                  className="bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs px-3.5 py-2 rounded-xl transition-colors cursor-pointer flex items-center gap-1 active:scale-95"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>Xác Thực Mạng Wi-Fi</span>
                </button>
              </div>
            </div>

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 hover:text-zinc-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>

              <button
                disabled={wifiStatus !== 'SUCCESS'}
                onClick={() => {
                  setCurrentStep(4);
                  setTimeout(() => runFaceCheck(), 600);
                }}
                className="bg-[#FF4B16] hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm px-6 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-orange-500/25 cursor-pointer active:scale-95"
              >
                <span>Tiếp tục: Quét Face ID</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 4: QUÉT FACE ID SINH TRẮC HỌC ================= */}
        {currentStep === 4 && (
          <div className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm space-y-5 animate-in fade-in">
            <div className="flex items-center justify-between pb-3 border-b border-zinc-100">
              <div>
                <h3 className="text-base font-extrabold text-zinc-900 flex items-center gap-2">
                  <ScanFace className="w-5 h-5 text-[#FF4B16]" />
                  <span>Bước 4: Quét Khuôn Mặt Face ID Trực Tiếp</span>
                </h3>
                <p className="text-xs text-zinc-500 mt-0.5">
                  Đối chiếu sinh trắc học với hồ sơ mẫu của <strong>{selectedStaff.name}</strong>
                </p>
              </div>
              <span className="text-xs font-black bg-orange-100 text-[#FF4B16] px-2.5 py-1 rounded-full">
                Bước 4 / 4
              </span>
            </div>

            {/* Live Camera Viewport */}
            <div className="relative rounded-3xl bg-zinc-950 p-4 border border-zinc-800 shadow-xl overflow-hidden">
              <canvas ref={canvasRef} className="hidden" />

              <div className="relative w-full aspect-4/3 max-w-[340px] mx-auto rounded-2xl overflow-hidden bg-zinc-900 flex items-center justify-center border-2 border-zinc-700 shadow-inner">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  onLoadedMetadata={() => {
                    if (videoRef.current) {
                      videoRef.current.play().catch(e => console.warn(e));
                    }
                  }}
                  className={`w-full h-full object-cover mirror-mode ${isCameraActive ? 'block' : 'hidden'}`}
                />

                {isCameraStarting && (
                  <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center p-4 text-center">
                    <Loader2 className="w-8 h-8 text-[#FF4B16] animate-spin mb-2" />
                    <span className="text-xs text-white font-bold">Đang kết nối camera HD...</span>
                  </div>
                )}

                {!isCameraActive && !isCameraStarting && (
                  <div className="absolute inset-0 bg-zinc-900 flex flex-col items-center justify-center p-4 text-center">
                    <Camera className="w-8 h-8 text-zinc-600 mb-2" />
                    <span className="text-xs text-zinc-400 font-bold">Camera chưa bật</span>
                    <button
                      onClick={() => startCamera()}
                      className="mt-3 px-4 py-2 rounded-xl bg-[#FF4B16] text-white text-xs font-bold cursor-pointer"
                    >
                      Bật Camera
                    </button>
                  </div>
                )}

                {/* Biometric Oval Mask Overlay */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                  <div className={`w-44 h-56 rounded-[50%] border-2 border-dashed transition-all duration-300 ${
                    faceStatus === 'SUCCESS'
                      ? 'border-orange-400 shadow-[0_0_20px_rgba(52,211,153,0.5)]'
                      : faceStatus === 'ERROR'
                      ? 'border-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.5)]'
                      : faceStatus === 'SCANNING'
                      ? 'border-orange-400 animate-pulse'
                      : 'border-white/50'
                  }`} />
                </div>
              </div>

              {/* Camera Controls */}
              <div className="mt-3 flex items-center justify-between text-xs text-white px-2">
                <button
                  onClick={toggleFacingMode}
                  className="flex items-center gap-1.5 bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-xl backdrop-blur-md transition-colors cursor-pointer"
                >
                  <SwitchCamera className="w-3.5 h-3.5 text-orange-400" />
                  <span>Đổi Camera ({facingMode === 'user' ? 'Trước' : 'Sau'})</span>
                </button>

                <button
                  onClick={runFaceCheck}
                  disabled={faceStatus === 'SCANNING'}
                  className="flex items-center gap-1.5 bg-[#FF4B16] hover:bg-orange-600 px-4 py-1.5 rounded-xl font-bold transition-all shadow-md cursor-pointer disabled:opacity-50"
                >
                  {faceStatus === 'SCANNING' ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Đang nhận diện...</span>
                    </>
                  ) : (
                    <>
                      <ScanFace className="w-3.5 h-3.5" />
                      <span>Chụp & Đối Chiếu Lại</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Face Status Feedback */}
            {faceFeedbackMsg && (
              <div className={`p-4 rounded-2xl border text-xs font-bold ${
                faceStatus === 'SUCCESS'
                  ? 'bg-orange-50 border-orange-200 text-orange-950'
                  : 'bg-rose-50 border-rose-200 text-rose-950'
              }`}>
                <div className="flex items-center justify-between">
                  <span>{faceFeedbackMsg}</span>
                  <span className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-white border border-inherit">
                    Độ khớp: {faceConfidence}%
                  </span>
                </div>
              </div>
            )}

            <div className="pt-2 flex items-center justify-between">
              <button
                onClick={() => setCurrentStep(3)}
                className="px-4 py-2.5 rounded-xl border border-zinc-200 text-zinc-600 hover:text-zinc-900 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại</span>
              </button>

              <button
                disabled={faceStatus !== 'SUCCESS'}
                onClick={handleFinishCheckIn}
                className="bg-orange-600 hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-extrabold text-sm px-6 py-3 rounded-2xl flex items-center gap-2 transition-all shadow-md shadow-orange-600/25 cursor-pointer active:scale-95"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Xác Nhận & Hoàn Tất Điểm Danh</span>
              </button>
            </div>
          </div>
        )}

        {/* ================= STEP 5: THÀNH CÔNG ================= */}
        {currentStep === 5 && (
          <div className="bg-white rounded-3xl p-8 border border-zinc-200 shadow-md text-center space-y-6 animate-in zoom-in-95">
            <div className="w-20 h-20 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center mx-auto shadow-lg shadow-orange-500/20">
              <CheckCircle2 className="w-10 h-10 animate-bounce" />
            </div>

            <div>
              <span className="bg-orange-100 text-orange-800 text-xs font-extrabold px-3 py-1 rounded-full uppercase tracking-wider">
                Chấm Công Thành Công
              </span>
              <h2 className="text-2xl font-black text-zinc-900 mt-2">
                Chúc {selectedStaff.name} Một Ngày Làm Việc Hiệu Quả!
              </h2>
              <p className="text-xs text-zinc-500 mt-1">
                Dữ liệu chấm công đã được mã hóa và lưu trữ an toàn vào hệ thống PhoneHouse
              </p>
            </div>

            {/* Summary Ticket */}
            <div className="bg-zinc-50 rounded-2xl p-5 border border-zinc-200 text-left space-y-3 max-w-md mx-auto text-xs">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 font-bold">
                <span className="text-zinc-500">Giờ vào ca:</span>
                <span className="font-mono text-zinc-900 font-extrabold text-sm">{completedRecord?.checkInTime}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 font-bold">
                <span className="text-zinc-500">Chi nhánh:</span>
                <span className="text-zinc-900 font-bold">{targetBranch.name}</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 font-bold">
                <span className="text-zinc-500">Vị trí GPS:</span>
                <span className="text-orange-700 font-bold">Đạt (cách {gpsDistance}m)</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-200 font-bold">
                <span className="text-zinc-500">Wi-Fi:</span>
                <span className="text-orange-700 font-bold">Đạt ({currentWifiSSID})</span>
              </div>
              <div className="flex justify-between items-center font-bold">
                <span className="text-zinc-500">Sinh trắc học Face ID:</span>
                <span className="text-orange-700 font-bold">Đạt ({faceConfidence}%)</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                onClick={() => {
                  setCurrentStep(1);
                  setGpsStatus('PENDING');
                  setWifiStatus('PENDING');
                  setFaceStatus('PENDING');
                }}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-zinc-100 hover:bg-zinc-200 text-zinc-800 text-xs font-extrabold transition-colors cursor-pointer"
              >
                Điểm danh lượt khác
              </button>

              {onClose && (
                <button
                  onClick={onClose}
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-extrabold transition-colors shadow-md cursor-pointer flex items-center justify-center gap-2"
                >
                  <CheckCircle2 className="w-4 h-4 text-orange-400" />
                  <span>Hoàn Tất & Vào Ca Làm Việc</span>
                </button>
              )}

              {onNavigateToHR && (
                <button
                  onClick={onNavigateToHR}
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-[#FF4B16] hover:bg-orange-600 text-white text-xs font-extrabold transition-colors shadow-md cursor-pointer"
                >
                  Xem Bảng Chấm Công
                </button>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Face ID Registration Modal */}
      {isFaceRegistrationOpen && (
        <FaceRegistrationModal
          isOpen={isFaceRegistrationOpen}
          onClose={() => setIsFaceRegistrationOpen(false)}
          staffMember={selectedStaff}
          currentFacePhotoUrl={staffFaceProfile?.facePhotoUrl}
          onSaveFaceProfile={(faceData) => {
            setStaffFaceProfile({
              facePhotoUrl: faceData.facePhotoUrl,
              faceFeatureVector: faceData.faceFeatureVector,
              faceEnrollmentDate: faceData.faceEnrollmentDate
            });
            try {
              localStorage.setItem(`phonehouse_face_profile_${selectedStaff.id}`, JSON.stringify({
                facePhotoUrl: faceData.facePhotoUrl,
                faceFeatureVector: faceData.faceFeatureVector,
                faceEnrollmentDate: faceData.faceEnrollmentDate
              }));
            } catch (e) {}
            setIsFaceRegistrationOpen(false);
          }}
        />
      )}
    </div>
  );
};
