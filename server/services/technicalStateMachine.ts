export type WorkOrderStatus =
  | 'DRAFT'
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'DIAGNOSING'
  | 'IN_PROGRESS'
  | 'TECH_COMPLETED'
  | 'QC_PENDING'
  | 'QC_PASSED'
  | 'QC_FAILED_REWORK'
  | 'RETURNED_TO_STOCK'
  | 'CUSTOMER_READY'
  | 'DELIVERED_TO_CUSTOMER'
  | 'RETURNED_TO_BRANCH'
  | 'CANCELLED';

export type TaskLineStatus =
  | 'ASSIGNED'
  | 'ACCEPTED'
  | 'IN_PROGRESS'
  | 'WAITING_PARTS'
  | 'PAUSED'
  | 'COMPLETED'
  | 'REWORK_REQUIRED'
  | 'VERIFIED';

const VALID_TASK_LINE_TRANSITIONS: Record<TaskLineStatus, TaskLineStatus[]> = {
  // A KTV can see that a part is unavailable before starting the physical
  // work.  Allow that individual task to wait for stock immediately; it does
  // not stop the other tasks on the same repair order.
  ASSIGNED: ['ACCEPTED', 'IN_PROGRESS', 'WAITING_PARTS'],
  ACCEPTED: ['IN_PROGRESS', 'WAITING_PARTS'],
  IN_PROGRESS: ['COMPLETED', 'WAITING_PARTS', 'PAUSED'],
  WAITING_PARTS: ['IN_PROGRESS', 'PAUSED'],
  PAUSED: ['IN_PROGRESS'],
  COMPLETED: ['REWORK_REQUIRED', 'VERIFIED'],
  REWORK_REQUIRED: ['IN_PROGRESS', 'ACCEPTED'],
  VERIFIED: []
};

const VALID_WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  DRAFT: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['ACCEPTED', 'CANCELLED'],
  ACCEPTED: ['DIAGNOSING', 'IN_PROGRESS', 'CANCELLED'],
  DIAGNOSING: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['TECH_COMPLETED', 'CANCELLED'],
  TECH_COMPLETED: ['QC_PENDING', 'QC_PASSED', 'QC_FAILED_REWORK'],
  QC_PENDING: ['QC_PASSED', 'QC_FAILED_REWORK'],
  QC_FAILED_REWORK: ['ACCEPTED', 'IN_PROGRESS', 'CANCELLED'],
  QC_PASSED: ['RETURNED_TO_STOCK', 'CUSTOMER_READY', 'RETURNED_TO_BRANCH'],
  CUSTOMER_READY: ['DELIVERED_TO_CUSTOMER'],
  RETURNED_TO_STOCK: [],
  DELIVERED_TO_CUSTOMER: [],
  RETURNED_TO_BRANCH: [],
  CANCELLED: []
};

export function canTransitionTaskLine(currentStatus: TaskLineStatus, requestedStatus: TaskLineStatus): { allowed: boolean; reason?: string } {
  if (currentStatus === requestedStatus) {
    return { allowed: true };
  }
  const allowedNext = VALID_TASK_LINE_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(requestedStatus)) {
    return {
      allowed: false,
      reason: `INVALID_TASK_TRANSITION: Không thể chuyển hạng mục công việc từ "${currentStatus}" sang "${requestedStatus}".`
    };
  }
  return { allowed: true };
}

export function canTransitionWorkOrder(currentStatus: WorkOrderStatus, requestedStatus: WorkOrderStatus): { allowed: boolean; reason?: string } {
  if (currentStatus === requestedStatus) {
    return { allowed: true };
  }
  const allowedNext = VALID_WORK_ORDER_TRANSITIONS[currentStatus] || [];
  if (!allowedNext.includes(requestedStatus)) {
    return {
      allowed: false,
      reason: `INVALID_WORK_ORDER_TRANSITION: Không thể chuyển phiếu kỹ thuật từ "${currentStatus}" sang "${requestedStatus}".`
    };
  }
  return { allowed: true };
}

// Standard 12-Step QC Checklist Template
export const REQUIRED_QC_CHECKLIST_STEPS = [
  'appearance', // Ngoại hình, viền, lưng, kính
  'screen_touch', // Cảm ứng và hiển thị
  'battery_health', // Pin và dung lượng chuẩn
  'face_touch_id', // Face ID / Touch ID
  'camera_front_back', // Camera trước & sau
  'audio_mic_speaker', // Loa trong, loa ngoài & mic thu âm
  'network_wifi_cellular', // Sóng di động, Wi-Fi, Bluetooth
  'charging_port', // Cổng sạc và tiếp xúc cáp
  'true_tone', // Tính năng True Tone & cảm biến tiệm cận
  'buttons_switches', // Phím nguồn, âm lượng, gạt rung
  'water_seal_glue', // Keo ron chống nước và độ khít
  'internal_cleaning' // Vệ sinh sạch sẽ bên trong máy
];
