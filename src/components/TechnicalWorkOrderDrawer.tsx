import React, { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  DollarSign,
  Clock,
  History,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  ScanLine,
  Wrench,
  UserCheck,
  X,
} from "lucide-react";
import {
  FundAccount,
  TechnicalTaskTypeConfig,
  UserAccount,
  WarehouseInfo,
  WarrantyTicket,
} from "../types";
import {
  fetchTechnicalCostBreakdown,
  fetchTechnicalSpareParts,
  requestAddTechnicalExternalCost,
  requestAddTechnicalRecovery,
  requestCreateTechnicalTaskAddition,
  requestDecideTechnicalTaskAddition,
  requestCompleteTaskLine,
  requestDecideTechnicalPartException,
  requestDecideTechnicalExternalCost,
  requestDecideTechnicalRecovery,
  requestTechnicalQuoteAdjustment,
  decideTechnicalQuoteAdjustment,
  requestDeliverToCustomer,
  requestConsumeSparePart,
  requestCancelSparePartReservation,
  requestCancelSparePartIssue,
  requestFinalizeTechnicalCost,
  requestIssueSparePart,
  requestMarkTaskWaitingForParts,
  requestReserveSparePart,
  requestTechnicalPartStockRequest,
  requestTechnicalPartException,
  requestRevealTechnicalPasscode,
  requestTechnicalHandoff,
  requestReturnSparePart,
  requestScrapSparePart,
  requestReturnToStock,
} from "../services/technicalApiClient";
import { fetchTechnicalTaskSettings } from "../services/configurationApiClient";
import { uploadTechnicalEvidence } from "../services/technicalEvidenceService";
import {
  DeviceLifecycleTimeline,
  fetchDeviceLifecycleTimeline,
} from "../services/inventoryApiClient";

interface TechnicalWorkOrderDrawerProps {
  task: WarrantyTicket | null;
  warehouses: WarehouseInfo[];
  funds?: FundAccount[];
  currentUser?: UserAccount | null;
  onClose: () => void;
  onRefresh?: () => Promise<void> | void;
}

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const ACTIVE_LINE_STATUSES = [
  "ACCEPTED",
  "IN_PROGRESS",
  "WAITING_PARTS",
  "REWORK_REQUIRED",
];

type TaskPartRule = {
  category?: string;
  sku?: string;
  partId?: string;
  quantity?: number;
  maxQuantity?: number;
  allowSubstitution?: boolean;
};

const normalizedPartValue = (value: unknown) =>
  String(value || "")
    .trim()
    .toUpperCase();

const canonicalPartGroup = (value: unknown) => {
  const compact = normalizedPartValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/[^A-Z0-9]/g, "");
  const aliases: Record<string, string> = {
    MH: "MANHINH",
    MANHINH: "MANHINH",
    SCREEN: "MANHINH",
    DISPLAY: "MANHINH",
    PIN: "PIN",
    BATTERY: "PIN",
    CAM: "CAMERA",
    CAMERA: "CAMERA",
    CS: "CAPSAC",
    CAPSAC: "CAPSAC",
    CHANSAC: "CAPSAC",
    CHARGINGPORT: "CAPSAC",
    LOA: "LOA",
    LT: "LOA",
    LN: "LOA",
    SPEAKER: "LOA",
    MIC: "MIC",
    MICRO: "MIC",
    FACE: "FACE",
    FACEID: "FACE",
    VO: "VO",
    KHUNG: "VO",
    VOVO: "VO",
    FRAME: "VO",
    HOUSING: "VO",
    KINH: "KINH",
    KINHLUNG: "KINH",
    GLASS: "KINH",
    MAIN: "MAINBOARD",
    MAINBOARD: "MAINBOARD",
    IC: "IC",
    ANT: "ANTEN",
    ANTEN: "ANTEN",
    RUNG: "RUNG",
  };
  return aliases[compact] || compact;
};

// Keep the part selector aligned with the server.  Old stock may contain a
// short alias ("12 prm") while Product Master uses "iPhone 12 Pro Max".
const compactModelToken = (value: unknown) =>
  normalizedPartValue(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/Đ/g, "D")
    .replace(/[^A-Z0-9]/g, "");

const canonicalIphoneModelCode = (value: unknown) => {
  const compact = compactModelToken(value);
  const aliases: Record<string, string> = {
    IPX: "IPX",
    IPHONEX: "IPX",
    IPXR: "IPXR",
    IPHONEXR: "IPXR",
    IPXS: "IPXS",
    IPHONEXS: "IPXS",
    IPXSM: "IPXSM",
    IPHONEXSMAX: "IPXSM",
  };
  if (aliases[compact]) return aliases[compact];
  const se = compact.match(/^(?:IPHONE)?(?:IP)?SE([23])$/);
  if (se) return `IPSE${se[1]}`;
  const normalized = compact.replace(/^IPHONE/, "").replace(/^IP/, "");
  const match = normalized.match(
    /^(\d{1,2})(MINI|M|PLUS|PL|PROMAX|PRM|PM|PRO|P|E)?$/,
  );
  if (!match) return "";
  const suffixes: Record<string, string> = {
    MINI: "M",
    M: "M",
    PLUS: "PL",
    PL: "PL",
    PROMAX: "PM",
    PRM: "PM",
    PM: "PM",
    PRO: "P",
    P: "P",
    E: "E",
  };
  return `IP${match[1]}${suffixes[match[2] || ""] || ""}`;
};

const modelTokens = (values: unknown[]) => [
  ...new Set(
    values
      .flatMap((value) => [
        normalizedPartValue(value),
        compactModelToken(value),
        canonicalIphoneModelCode(value),
      ])
      .filter(Boolean),
  ),
];

const technicalErrorMessage = (cause: unknown) => {
  const message = String(cause || "Không thể hoàn tất thao tác.");
  if (message.includes("SPARE_PART_MODEL_INCOMPATIBLE")) {
    return "Linh kiện này chưa được khai báo tương thích với model máy đang sửa. Hãy chọn đúng model hoặc bổ sung model tương thích trong Danh mục.";
  }
  if (message.includes("TASK_PART_NOT_ALLOWED")) {
    return "Linh kiện không thuộc nhóm được phép dùng cho task này. Nếu thật sự phát sinh, hãy thêm hạng mục hoặc gửi yêu cầu duyệt ngoại lệ.";
  }
  if (message.includes("TASK_PART_POLICY_NOT_CONFIGURED")) {
    return "Task này chưa được thiết lập nhóm linh kiện đi kèm. Quản lý hãy bổ sung trong Cài đặt task kỹ thuật trước.";
  }
  if (message.includes("TASK_NOT_OPEN_FOR_PARTS")) {
    return "Task này chưa ở trạng thái có thể xử lý linh kiện. Hãy nhận task hoặc chọn đúng hạng mục đang làm.";
  }
  if (message.includes("CUSTOMER_APPROVAL_REQUIRED_FOR_ADDITIONAL_TASK")) {
    return "Cần xác nhận khách đã đồng ý báo giá phát sinh trước khi thêm hạng mục mới.";
  }
  return message;
};

const isPartCompatibleWithMachine = (part: any, workOrder: any, line?: any) => {
  const partModels = [
    ...(Array.isArray(part?.compatibleModelCodes)
      ? part.compatibleModelCodes
      : []),
    ...(Array.isArray(part?.compatibleModelIds) ? part.compatibleModelIds : []),
    ...(Array.isArray(part?.compatibleModels) ? part.compatibleModels : []),
    part?.catalogModelCode,
    part?.modelCode,
  ];
  if (partModels.filter(Boolean).length === 0) return true;
  const machineModels = [
    workOrder?.catalogModelCode,
    workOrder?.modelCode,
    workOrder?.deviceSnapshot?.catalogModelCode,
    workOrder?.deviceSnapshot?.modelCode,
    line?.catalogModelCode,
    line?.modelCode,
    workOrder?.deviceModel,
    workOrder?.model,
    line?.deviceModel,
    line?.model,
    workOrder?.deviceSnapshot?.model,
  ];
  const expected = modelTokens(partModels);
  const actual = modelTokens(machineModels);
  return (
    actual.length === 0 || actual.some((model) => expected.includes(model))
  );
};

const partGroupTokens = (part: any) => [
  ...new Set(
    [
      part?.category,
      part?.catalogGroupCode,
      part?.groupCode,
      part?.categoryCode,
    ]
      .map(canonicalPartGroup)
      .filter(Boolean),
  ),
];

const partMatchesTaskRule = (part: any, rule: TaskPartRule): boolean => {
  const category = canonicalPartGroup(rule.category);
  const sku = normalizedPartValue(rule.sku);
  const partId = String(rule.partId || "").trim();
  const categoryMatches = !category || partGroupTokens(part).includes(category);
  if (!categoryMatches) return false;
  if (partId && String(part?.id || "") !== partId) return false;

  if (sku) {
    if (normalizedPartValue(part?.sku) === sku) return true;
    return Boolean(rule.allowSubstitution && category);
  }

  // partId only supports records configured by an older version of the setup.
  if (!category && partId) return true;
  return Boolean(category);
};

const taskPartRuleLabel = (rule: TaskPartRule) => {
  const target = [
    rule.category ? `Nhóm ${normalizedPartValue(rule.category)}` : "",
    rule.sku ? `SKU ${normalizedPartValue(rule.sku)}` : "",
    !rule.category && !rule.sku && rule.partId ? `Mã cũ ${rule.partId}` : "",
  ]
    .filter(Boolean)
    .join(" · ");
  const maximum = Number(rule.maxQuantity ?? rule.quantity ?? 0);
  return `${target || "Chưa định danh"} · tối đa ${maximum > 0 ? maximum : "—"}${rule.allowSubstitution ? " · cho phép thay thế cùng nhóm" : ""}`;
};

export const TechnicalWorkOrderDrawer: React.FC<
  TechnicalWorkOrderDrawerProps
> = ({ task, warehouses, funds = [], currentUser, onClose, onRefresh }) => {
  const [activeTab, setActiveTab] = useState<
    "OVERVIEW" | "TASKS" | "PARTS" | "COST" | "QC" | "TIMELINE" | "RETURN"
  >("OVERVIEW");
  const [details, setDetails] = useState<any>(null);
  const [lifecycle, setLifecycle] = useState<DeviceLifecycleTimeline | null>(null);
  const [parts, setParts] = useState<any[]>([]);
  const [centralParts, setCentralParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [selectedLineId, setSelectedLineId] = useState("");
  const [selectedPartId, setSelectedPartId] = useState("");
  const [partsWarehouseId, setPartsWarehouseId] = useState("");
  const [selectedLotId, setSelectedLotId] = useState("");
  const [issueQuantity, setIssueQuantity] = useState(1);
  const [orderPartId, setOrderPartId] = useState("");
  const [orderQuantity, setOrderQuantity] = useState(1);
  const [partExceptionReason, setPartExceptionReason] = useState("");
  const [settleQuantities, setSettleQuantities] = useState<
    Record<string, number>
  >({});
  const [settleNotes, setSettleNotes] = useState<Record<string, string>>({});
  const [completionNotes, setCompletionNotes] = useState("");
  const [completionFiles, setCompletionFiles] = useState<File[]>([]);
  const [replacementSerials, setReplacementSerials] = useState("");
  const [externalCost, setExternalCost] = useState({
    category: "OUTSOURCED_REPAIR",
    amount: 0,
    note: "",
  });
  const [recovery, setRecovery] = useState({
    category: "SUPPLIER_RECOVERY",
    amount: 0,
    note: "",
  });
  const [returnWarehouseId, setReturnWarehouseId] = useState("");
  const [returnScannedImei, setReturnScannedImei] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [deliveryPayment, setDeliveryPayment] = useState({
    finalAmount: 0,
    paidAmount: 0,
    paymentMethod: "CASH" as "CASH" | "BANK" | "DEBT",
    fundId: "",
    note: "",
  });
  const [quoteRequest, setQuoteRequest] = useState({
    amount: 0,
    reason: "",
    customerApprovalEvidenceId: "",
  });
  const [revealedPasscode, setRevealedPasscode] = useState<string | null>(null);
  const [handoffTargetWarehouseId, setHandoffTargetWarehouseId] = useState("");
  const [handoffScannedImei, setHandoffScannedImei] = useState("");
  const [handoffReason, setHandoffReason] = useState("");
  const [handoffFiles, setHandoffFiles] = useState<File[]>([]);
  const [technicalTaskTypes, setTechnicalTaskTypes] = useState<
    TechnicalTaskTypeConfig[]
  >([]);
  const [additionTaskType, setAdditionTaskType] = useState("");
  const [additionPriority, setAdditionPriority] = useState<
    "NORMAL" | "PRIORITY" | "URGENT"
  >("NORMAL");
  const [additionReason, setAdditionReason] = useState("");
  const [additionFiles, setAdditionFiles] = useState<File[]>([]);
  const [additionQuote, setAdditionQuote] = useState(0);
  const [partsWaitingReason, setPartsWaitingReason] = useState("");
  const [additionDecisionNotes, setAdditionDecisionNotes] = useState<
    Record<string, string>
  >({});
  const [additionDecisionQuotes, setAdditionDecisionQuotes] = useState<
    Record<string, number>
  >({});
  const [additionCustomerApproved, setAdditionCustomerApproved] = useState<
    Record<string, boolean>
  >({});

  const workOrderId = String((task as any)?.workOrderId || task?.id || "");
  const role = String(currentUser?.role || "").toUpperCase();
  const isTechnician = ["TECHNICIAN", "TECH"].includes(role);
  const canFinalizeCost = ["ADMIN", "MANAGER", "ACCOUNTANT"].includes(role);
  const canReturnStock = ["ADMIN", "MANAGER", "INVENTORY_MANAGER"].includes(
    role,
  );
  const canManagePartExceptions = [
    "ADMIN",
    "MANAGER",
    "INVENTORY_MANAGER",
    "WAREHOUSE",
  ].includes(role);
  const canManageTaskAdditions = ["ADMIN", "MANAGER", "TECH_LEAD"].includes(
    role,
  );
  const canDeliverCustomer = [
    "ADMIN",
    "MANAGER",
    "SALES",
    "SALE",
    "CASHIER",
  ].includes(role);
  const canRequestQuote = [
    "ADMIN",
    "MANAGER",
    "SALES",
    "SALE",
    "CASHIER",
  ].includes(role);
  const canApproveQuote = ["ADMIN", "MANAGER", "ACCOUNTANT"].includes(role);
  const customerPaymentFunds = useMemo(
    () =>
      funds.filter(
        (fund) =>
          fund.isActive !== false &&
          fund.isArchived !== true &&
          fund.branchId === details?.workOrder?.branchId,
      ),
    [funds, details?.workOrder?.branchId],
  );

  const load = async () => {
    if (!workOrderId) return;
    setLoading(true);
    setError("");
    try {
      const [nextDetails, nextParts] = await Promise.all([
        fetchTechnicalCostBreakdown(workOrderId),
        partsWarehouseId
          ? fetchTechnicalSpareParts(partsWarehouseId)
          : Promise.resolve([]),
      ]);
      setDetails(nextDetails);
      const nextLifecycle = await fetchDeviceLifecycleTimeline(
        {
          deviceId: String(nextDetails?.workOrder?.deviceId || (task as any)?.deviceId || ""),
          imei: String(nextDetails?.workOrder?.imei || (task as any)?.imei || ""),
          workOrderId,
        },
        currentUser || undefined,
      ).catch(() => null);
      setLifecycle(nextLifecycle);
      setParts(nextParts || []);
      setDeliveryPayment((current) => ({
        ...current,
        finalAmount: Number(
          nextDetails?.workOrder?.approvedFinalAmount ??
            (nextDetails?.workOrder?.workOrderType === "WARRANTY" ? 0 : 0),
        ),
        paidAmount: 0,
      }));
      setQuoteRequest((current) => ({
        ...current,
        amount:
          current.amount ||
          Number(
            nextDetails?.workOrder?.proposedQuoteAmount ??
              nextDetails?.workOrder?.totalEstimatedCost ??
              0,
          ),
      }));
      const firstLine =
        nextDetails?.taskLines?.find(
          (line: any) => line.id === (task as any)?.lineId,
        ) || nextDetails?.taskLines?.[0];
      if (!selectedLineId && firstLine) setSelectedLineId(firstLine.id);
      if (!partsWarehouseId) {
        const ownTechnicianWarehouse = warehouses.find(
          (item) =>
            item.type === "TECHNICIAN_SUB" &&
            (item.custodianUid === currentUser?.id ||
              item.technicianId === currentUser?.id) &&
            (!nextDetails?.workOrder?.branchId ||
              item.branchId === nextDetails.workOrder.branchId) &&
            item.isActive !== false &&
            !item.isArchived,
        );
        const preferred = isTechnician
          ? ownTechnicianWarehouse
          : warehouses.find(
              (item) => item.id === nextDetails?.workOrder?.currentLocationId,
            ) ||
            warehouses.find(
              (item) =>
                item.branchId === nextDetails?.workOrder?.branchId &&
                item.isActive !== false,
            );
        if (preferred) setPartsWarehouseId(preferred.id);
      }
      if (!returnWarehouseId) {
        const target = warehouses.find(
          (item) =>
            item.branchId === nextDetails?.workOrder?.branchId &&
            item.isActive !== false &&
            ["CENTRAL", "RETAIL_STORE"].includes(String(item.type || "")),
        );
        if (target) setReturnWarehouseId(target.id);
      }
    } catch (cause: any) {
      setError(cause?.message || "Không thể tải hồ sơ kỹ thuật.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let active = true;
    fetchTechnicalTaskSettings()
      .then((items) => {
        if (active)
          setTechnicalTaskTypes((items || []).filter((item) => item.isActive));
      })
      .catch(() => {
        if (active) setTechnicalTaskTypes([]);
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setRevealedPasscode(null);
    if (!task) return;
    setActiveTab("OVERVIEW");
    setDetails(null);
    setLifecycle(null);
    setError("");
    setMessage("");
    setSelectedLineId(String((task as any).lineId || ""));
    setSelectedPartId("");
    setSelectedLotId("");
    setPartExceptionReason("");
    setPartsWarehouseId("");
    void load();
  }, [workOrderId]);

  useEffect(() => {
    const part = parts.find((item: any) => item.id === selectedPartId);
    const firstAvailableLot = Array.isArray(part?.lots)
      ? part.lots.find((lot: any) => Number(lot.availableQuantity || 0) > 0)
      : null;
    setSelectedLotId(firstAvailableLot?.id || "");
  }, [selectedPartId, parts]);

  const run = async (
    operation: () => Promise<any>,
    success: string | ((result: any) => string),
  ) => {
    setSaving(true);
    setError("");
    setMessage("");
    try {
      const result = await operation();
      setMessage(typeof success === "function" ? success(result) : success);
      await load();
      await onRefresh?.();
    } catch (cause: any) {
      setError(technicalErrorMessage(cause?.message));
    } finally {
      setSaving(false);
    }
  };

  const selectedLine = details?.taskLines?.find(
    (line: any) => line.id === selectedLineId,
  );
  const selectedPart = parts.find((part: any) => part.id === selectedPartId);
  const selectedPartLots = Array.isArray(selectedPart?.lots)
    ? selectedPart.lots.filter(
        (lot: any) => Number(lot.availableQuantity || 0) > 0,
      )
    : [];
  const eligiblePartWarehouses = useMemo(
    () =>
      warehouses.filter(
        (item) =>
          item.isActive !== false &&
          !item.isArchived &&
          (!details?.workOrder?.branchId ||
            item.branchId === details.workOrder.branchId),
      ),
    [warehouses, details?.workOrder?.branchId],
  );
  const centralPartWarehouse = useMemo(
    () =>
      eligiblePartWarehouses.find(
        (item) => String(item.type || "") === "CENTRAL",
      ),
    [eligiblePartWarehouses],
  );
  const ownTechnicianPartWarehouses = useMemo(
    () =>
      eligiblePartWarehouses.filter(
        (item) =>
          item.type === "TECHNICIAN_SUB" &&
          (item.custodianUid === currentUser?.id ||
            item.technicianId === currentUser?.id),
      ),
    [eligiblePartWarehouses, currentUser?.id],
  );
  const selectablePartWarehouses = isTechnician
    ? ownTechnicianPartWarehouses
    : eligiblePartWarehouses;
  const taskPartRules = useMemo<TaskPartRule[]>(() => {
    const snapshotRules =
      selectedLine?.requiredParts ?? selectedLine?.requiredPartTemplates;
    return Array.isArray(snapshotRules) ? snapshotRules : [];
  }, [selectedLine]);
  const taskMatchedParts = useMemo(
    () =>
      parts.filter(
        (part: any) =>
          Number(part.availableQuantity || 0) > 0 &&
          taskPartRules.some((rule) => partMatchesTaskRule(part, rule)),
      ),
    [parts, taskPartRules],
  );
  const compatibleParts = useMemo(
    () =>
      taskMatchedParts.filter((part: any) =>
        isPartCompatibleWithMachine(part, details?.workOrder, selectedLine),
      ),
    [taskMatchedParts, details?.workOrder, selectedLine],
  );
  const wrongModelParts = useMemo(
    () =>
      taskMatchedParts.filter(
        (part: any) =>
          !isPartCompatibleWithMachine(part, details?.workOrder, selectedLine),
      ),
    [taskMatchedParts, details?.workOrder, selectedLine],
  );
  const orderableCentralParts = useMemo(
    () =>
      centralParts.filter(
        (part: any) =>
          Number(part.availableQuantity || 0) > 0 &&
          taskPartRules.some((rule) => partMatchesTaskRule(part, rule)) &&
          isPartCompatibleWithMachine(part, details?.workOrder, selectedLine),
      ),
    [centralParts, taskPartRules, details?.workOrder, selectedLine],
  );
  const incompatibleParts = useMemo(
    () =>
      parts.filter(
        (part: any) =>
          Number(part.availableQuantity || 0) > 0 &&
          !taskPartRules.some((rule) => partMatchesTaskRule(part, rule)),
      ),
    [parts, taskPartRules],
  );
  const selectedPartRule = selectedPart
    ? taskPartRules.find((rule) => partMatchesTaskRule(selectedPart, rule))
    : undefined;
  const selectedPartModelMismatch = Boolean(
    selectedPart &&
    selectedPartRule &&
    !isPartCompatibleWithMachine(
      selectedPart,
      details?.workOrder,
      selectedLine,
    ),
  );
  const selectedPartMaximum = Number(
    selectedPartRule?.maxQuantity ?? selectedPartRule?.quantity ?? 0,
  );
  const exceedsTaskPartMaximum = Boolean(
    selectedPartRule &&
    Number.isFinite(selectedPartMaximum) &&
    selectedPartMaximum > 0 &&
    issueQuantity > selectedPartMaximum,
  );
  const selectedPartIsTaskMismatch = Boolean(selectedPart && !selectedPartRule);
  const selectedPartIsMismatch =
    selectedPartIsTaskMismatch || selectedPartModelMismatch;
  const selectedApprovedPartException = useMemo(
    () =>
      (details?.partExceptions || []).find(
        (exception: any) =>
          exception.status === "APPROVED" &&
          exception.workOrderLineId === selectedLineId &&
          exception.partId === selectedPartId &&
          exception.warehouseId === partsWarehouseId &&
          String(exception.lotId || "") === String(selectedLotId || "") &&
          Number(exception.quantityApproved || 0) >
            Number(exception.quantityIssued || 0),
      ),
    [
      details?.partExceptions,
      selectedLineId,
      selectedPartId,
      partsWarehouseId,
      selectedLotId,
    ],
  );
  const selectedPendingPartException = useMemo(
    () =>
      (details?.partExceptions || []).find(
        (exception: any) =>
          exception.status === "PENDING" &&
          exception.workOrderLineId === selectedLineId &&
          exception.partId === selectedPartId &&
          exception.warehouseId === partsWarehouseId &&
          String(exception.lotId || "") === String(selectedLotId || ""),
      ),
    [
      details?.partExceptions,
      selectedLineId,
      selectedPartId,
      partsWarehouseId,
      selectedLotId,
    ],
  );
  const selectedExceptionAvailableQuantity = selectedApprovedPartException
    ? Number(selectedApprovedPartException.quantityApproved || 0) -
      Number(selectedApprovedPartException.quantityIssued || 0)
    : 0;
  const exceedsExceptionApproval = Boolean(
    selectedApprovedPartException &&
    issueQuantity > selectedExceptionAvailableQuantity,
  );
  const partSelectionReady = Boolean(
    selectedLineId &&
    selectedPartId &&
    partsWarehouseId &&
    !selectedPartModelMismatch &&
    (selectedPartRule || selectedApprovedPartException) &&
    Number.isFinite(issueQuantity) &&
    issueQuantity > 0 &&
    !exceedsTaskPartMaximum &&
    !exceedsExceptionApproval &&
    (selectedPartLots.length === 0 || selectedLotId),
  );
  const eligibleHandoffWarehouses = useMemo(
    () =>
      warehouses.filter(
        (item) =>
          item.isActive !== false &&
          !item.isArchived &&
          item.type === "TECHNICIAN_SUB" &&
          item.branchId === details?.workOrder?.branchId &&
          item.id !== details?.workOrder?.currentLocationId &&
          !!item.custodianUid,
      ),
    [
      warehouses,
      details?.workOrder?.branchId,
      details?.workOrder?.currentLocationId,
    ],
  );

  useEffect(() => {
    if (!task || !workOrderId || !partsWarehouseId) return;
    let active = true;
    fetchTechnicalSpareParts(partsWarehouseId)
      .then((nextParts) => {
        if (active) setParts(nextParts || []);
      })
      .catch((cause) => {
        if (active)
          setError(
            cause?.message || "Không thể tải tồn linh kiện của kho đã chọn.",
          );
      });
    return () => {
      active = false;
    };
  }, [task, workOrderId, partsWarehouseId]);

  useEffect(() => {
    if (!task || !workOrderId || !centralPartWarehouse?.id || !isTechnician)
      return;
    let active = true;
    fetchTechnicalSpareParts(centralPartWarehouse.id)
      .then((nextParts) => {
        if (active) setCentralParts(nextParts || []);
      })
      .catch((cause) => {
        if (active)
          setError(cause?.message || "Không thể tải linh kiện từ Kho Tổng.");
      });
    return () => {
      active = false;
    };
  }, [task, workOrderId, centralPartWarehouse?.id, isTechnician]);

  useEffect(() => {
    if (!orderPartId && orderableCentralParts.length > 0)
      setOrderPartId(orderableCentralParts[0].id);
  }, [orderPartId, orderableCentralParts]);

  useEffect(() => {
    if (!isTechnician) return;
    const personalWarehouse = ownTechnicianPartWarehouses[0];
    if (personalWarehouse && partsWarehouseId !== personalWarehouse.id) {
      setPartsWarehouseId(personalWarehouse.id);
      setSelectedPartId("");
    }
  }, [isTechnician, ownTechnicianPartWarehouses, partsWarehouseId]);

  useEffect(() => {
    if (!details?.workOrder || partsWarehouseId) return;
    const preferred = isTechnician
      ? ownTechnicianPartWarehouses[0]
      : eligiblePartWarehouses.find(
          (item) => item.id === details.workOrder.currentLocationId,
        ) || eligiblePartWarehouses[0];
    if (preferred) setPartsWarehouseId(preferred.id);
  }, [
    details?.workOrder?.branchId,
    details?.workOrder?.currentLocationId,
    partsWarehouseId,
    isTechnician,
    ownTechnicianPartWarehouses,
    eligiblePartWarehouses,
  ]);

  useEffect(() => {
    if (!selectedPartId && compatibleParts.length > 0)
      setSelectedPartId(compatibleParts[0].id);
  }, [selectedPartId, compatibleParts]);

  if (!task) return null;
  const workOrder = details?.workOrder || {};
  const breakdown = details?.breakdown;
  const partsSettled =
    (details?.partIssues || []).every(
      (issue: any) =>
        Number(issue.quantityIssued || 0) ===
        Number(issue.quantityConsumed || 0) +
          Number(issue.quantityReturned || 0) +
          Number(issue.quantityScrapped || 0),
    ) &&
    (details?.partReservations || []).every(
      (reservation: any) =>
        Number(reservation.quantityReserved || 0) ===
        Number(reservation.quantityIssued || 0) +
          Number(reservation.quantityCancelled || 0),
    );
  const canRequestHandoff =
    ["ADMIN", "MANAGER", "TECH_LEAD"].includes(role) ||
    workOrder.currentCustodianUid === currentUser?.id;

  const completeSelectedTask = async () => {
    if (!selectedLine) throw new Error("Hãy chọn hạng mục cần báo hoàn thành.");
    if (completionNotes.trim().length < 10)
      throw new Error("Ghi chú kết quả phải có ít nhất 10 ký tự.");
    const requiredEvidence = Array.isArray(selectedLine.requiredEvidenceTypes)
      ? selectedLine.requiredEvidenceTypes
      : [];
    const normalizedSerials = replacementSerials
      .split(/[\n,]+/)
      .map((value) => value.trim())
      .filter(Boolean);
    if (
      requiredEvidence.includes("REPLACEMENT_SERIAL") &&
      normalizedSerials.length === 0
    )
      throw new Error("Hạng mục này bắt buộc ghi serial linh kiện thay thế.");
    const urls = completionFiles.length
      ? await uploadTechnicalEvidence(
          workOrderId,
          selectedLine.id,
          completionFiles,
        )
      : [];
    const result = await requestCompleteTaskLine(
      workOrderId,
      selectedLine.id,
      urls,
      completionNotes.trim(),
      { replacementSerials: normalizedSerials },
    );
    setCompletionNotes("");
    setCompletionFiles([]);
    setReplacementSerials("");
    return result;
  };

  const markSelectedTaskWaitingForParts = async () => {
    if (!selectedLine) throw new Error("Hãy chọn task đang chờ linh kiện.");
    if (partsWaitingReason.trim().length < 5)
      throw new Error("Hãy ghi lý do chờ linh kiện, tối thiểu 5 ký tự.");
    await requestMarkTaskWaitingForParts(
      workOrderId,
      selectedLine.id,
      partsWaitingReason.trim(),
    );
    setPartsWaitingReason("");
  };

  const submitTaskAddition = async () => {
    if (!additionTaskType) throw new Error("Hãy chọn hạng mục phát sinh.");
    if (additionReason.trim().length < 10)
      throw new Error("Mô tả lỗi phát sinh cần ít nhất 10 ký tự.");
    const evidencePhotoUrls = additionFiles.length
      ? await uploadTechnicalEvidence(
          workOrderId,
          `task-addition-${additionTaskType}`,
          additionFiles,
        )
      : [];
    await requestCreateTechnicalTaskAddition(workOrderId, {
      taskType: additionTaskType,
      priority: additionPriority,
      reason: additionReason.trim(),
      evidencePhotoUrls,
      additionalCustomerQuote: additionQuote,
    });
    setAdditionTaskType("");
    setAdditionPriority("NORMAL");
    setAdditionReason("");
    setAdditionFiles([]);
    setAdditionQuote(0);
  };

  const decideTaskAddition = async (
    request: any,
    decision: "APPROVED" | "REJECTED",
  ) => {
    const isCustomerRepair =
      String(workOrder.workOrderType || "") === "CUSTOMER_SERVICE";
    await requestDecideTechnicalTaskAddition(workOrderId, request.id, {
      decision,
      note: additionDecisionNotes[request.id] || "",
      ...(decision === "APPROVED" && isCustomerRepair
        ? {
            customerApprovalConfirmed:
              additionCustomerApproved[request.id] === true,
            additionalCustomerQuote: Number(
              additionDecisionQuotes[request.id] ??
                request.additionalCustomerQuote ??
                0,
            ),
          }
        : {}),
    });
  };

  const submitQuoteAdjustment = async () => {
    if (quoteRequest.amount < 0)
      throw new Error("Số tiền báo giá không hợp lệ.");
    if (quoteRequest.reason.trim().length < 5)
      throw new Error("Cần ghi rõ lý do báo giá.");
    await requestTechnicalQuoteAdjustment(workOrderId, {
      requestedAmount: quoteRequest.amount,
      reason: quoteRequest.reason.trim(),
      customerApprovalEvidenceId:
        quoteRequest.customerApprovalEvidenceId.trim() || undefined,
    });
    setQuoteRequest((current) => ({
      ...current,
      reason: "",
      customerApprovalEvidenceId: "",
    }));
  };

  const decideQuoteAdjustment = async (
    adjustmentId: string,
    decision: "APPROVED" | "REJECTED",
  ) => {
    await decideTechnicalQuoteAdjustment(
      workOrderId,
      adjustmentId,
      decision,
      decision === "REJECTED" ? "Báo giá chưa được duyệt." : undefined,
    );
  };

  const revealPasscode = async () => {
    setSaving(true);
    setError("");
    try {
      const result = await requestRevealTechnicalPasscode(workOrderId);
      setRevealedPasscode(result.passcode || "Không có mật mã");
    } catch (cause: any) {
      setError(cause?.message || "Không thể xem mật mã mở máy.");
    } finally {
      setSaving(false);
    }
  };

  const requestHandoff = async () => {
    const targetWarehouse = eligibleHandoffWarehouses.find(
      (item) => item.id === handoffTargetWarehouseId,
    );
    if (!targetWarehouse?.custodianUid)
      throw new Error("Kho KTV nhận phải gắn đúng tài khoản chịu trách nhiệm.");
    if (handoffReason.trim().length < 5)
      throw new Error("Lý do bàn giao phải có ít nhất 5 ký tự.");
    const handoverPhotoUrls = handoffFiles.length
      ? await uploadTechnicalEvidence(
          workOrderId,
          "handoff-request",
          handoffFiles,
        )
      : [];
    await requestTechnicalHandoff(workOrderId, {
      targetWarehouseId: targetWarehouse.id,
      targetTechnicianUid: targetWarehouse.custodianUid,
      targetTechnicianName:
        targetWarehouse.custodianName || targetWarehouse.technicianName,
      scannedImei: handoffScannedImei,
      reason: handoffReason.trim(),
      handoverPhotoUrls,
    });
    setHandoffFiles([]);
    setHandoffReason("");
    setHandoffScannedImei("");
    setHandoffTargetWarehouseId("");
  };

  const customerDeliveryPanel = (
    <div className="mx-auto max-w-xl space-y-4">
      <section className="rounded-2xl border bg-white p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-black">Báo giá khách hàng</h3><p className="mt-1 text-xs text-zinc-500">Giá chỉ có hiệu lực sau khi quản lý hoặc kế toán duyệt.</p></div>
          <span className={`rounded-full px-3 py-1 text-xs font-black ${["APPROVED", "NOT_REQUIRED"].includes(String(workOrder.quoteStatus || "")) ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-800"}`}>{workOrder.quoteStatus || "PENDING_APPROVAL"}</span>
        </div>
        <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm"><p className="flex justify-between"><span>Giá đã duyệt</span><strong>{money.format(Number(workOrder.approvedFinalAmount || 0))}</strong></p><p className="mt-1 flex justify-between"><span>Phiên bản</span><strong>#{Number(workOrder.quoteVersion || 0)}</strong></p></div>
        {canRequestQuote && workOrder.workOrderType !== "WARRANTY" && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <label><span className="text-xs font-black text-zinc-600">Giá đề nghị</span><input type="number" min={0} value={quoteRequest.amount} onChange={(event) => setQuoteRequest((current) => ({ ...current, amount: Math.max(0, Number(event.target.value || 0)) }))} className="mt-1 h-11 w-full rounded-xl border px-3 font-bold" /></label>
            <label><span className="text-xs font-black text-zinc-600">Mã bằng chứng khách duyệt</span><input value={quoteRequest.customerApprovalEvidenceId} onChange={(event) => setQuoteRequest((current) => ({ ...current, customerApprovalEvidenceId: event.target.value }))} placeholder="Tin nhắn / chữ ký / evidence ID" className="mt-1 h-11 w-full rounded-xl border px-3" /></label>
            <textarea value={quoteRequest.reason} onChange={(event) => setQuoteRequest((current) => ({ ...current, reason: event.target.value }))} placeholder="Lý do và nội dung báo giá" rows={2} className="rounded-xl border p-3 text-sm sm:col-span-2" />
            <button disabled={saving || quoteRequest.reason.trim().length < 5} onClick={() => void run(submitQuoteAdjustment, "Đã gửi báo giá chờ duyệt.")} className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40 sm:col-span-2">Gửi duyệt báo giá</button>
          </div>
        )}
        {!!details?.quoteAdjustments?.length && <div className="mt-4 divide-y rounded-xl border">{details.quoteAdjustments.map((adjustment: any) => <div key={adjustment.id} className="p-3"><div className="flex items-center justify-between gap-3"><div><p className="font-bold">{money.format(Number(adjustment.requestedAmount || 0))}</p><p className="text-xs text-zinc-500">{adjustment.reason}</p></div><span className="text-xs font-black">{adjustment.status}</span></div>{canApproveQuote && adjustment.status === "PENDING" && <div className="mt-2 flex gap-2"><button disabled={saving || (Number(adjustment.requestedAmount || 0) > 0 && !adjustment.customerApprovalEvidenceId)} onClick={() => void run(() => decideQuoteAdjustment(adjustment.id, "APPROVED"), "Đã duyệt giá cuối cùng.")} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-40">Duyệt</button><button disabled={saving} onClick={() => void run(() => decideQuoteAdjustment(adjustment.id, "REJECTED"), "Đã từ chối báo giá.")} className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-700">Từ chối</button></div>}</div>)}</div>}
      </section>
      <section className="rounded-2xl border bg-white p-5">
        <h3 className="font-black">Bàn giao máy & thu tiền</h3><p className="mt-1 text-sm text-zinc-500">KCS đạt và báo giá đã duyệt thì NVBH mới được giao máy.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2"><label><span className="text-xs font-black text-zinc-600">Tổng tiền đã duyệt</span><div className="mt-1 flex h-11 items-center rounded-xl bg-zinc-100 px-3 font-black">{money.format(Number(workOrder.approvedFinalAmount || 0))}</div></label><label><span className="text-xs font-black text-zinc-600">Khách thanh toán hôm nay</span><input type="number" min={0} max={Number(workOrder.approvedFinalAmount || 0)} value={deliveryPayment.paidAmount} onChange={(event) => setDeliveryPayment((current) => ({ ...current, paidAmount: Math.max(0, Number(event.target.value || 0)) }))} className="mt-1 h-11 w-full rounded-xl border px-3 font-bold" /></label><label><span className="text-xs font-black text-zinc-600">Hình thức thu</span><select value={deliveryPayment.paymentMethod} onChange={(event) => setDeliveryPayment((current) => ({ ...current, paymentMethod: event.target.value as "CASH" | "BANK" | "DEBT", fundId: "" }))} className="mt-1 h-11 w-full rounded-xl border px-3"><option value="CASH">Tiền mặt</option><option value="BANK">Chuyển khoản</option><option value="DEBT">Ghi nợ</option></select></label>{deliveryPayment.paidAmount > 0 && deliveryPayment.paymentMethod !== "DEBT" && <label><span className="text-xs font-black text-zinc-600">Quỹ nhận tiền</span><select value={deliveryPayment.fundId} onChange={(event) => setDeliveryPayment((current) => ({ ...current, fundId: event.target.value }))} className="mt-1 h-11 w-full rounded-xl border px-3"><option value="">Chọn quỹ nhận</option>{customerPaymentFunds.filter((fund) => String(fund.type).toUpperCase() === deliveryPayment.paymentMethod).map((fund) => <option key={fund.id} value={fund.id}>{fund.name}</option>)}</select></label>}</div>
        <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950"><p className="flex justify-between"><span>Đã thu</span><strong>{money.format(deliveryPayment.paidAmount)}</strong></p><p className="mt-1 flex justify-between"><span>Còn nợ</span><strong>{money.format(Math.max(0, Number(workOrder.approvedFinalAmount || 0) - deliveryPayment.paidAmount))}</strong></p></div>
        <textarea value={deliveryNotes} onChange={(event) => setDeliveryNotes(event.target.value)} rows={3} placeholder="Tình trạng bàn giao, phụ kiện đi kèm, người nhận..." className="mt-4 w-full rounded-xl border p-3 text-sm" />
        <button disabled={saving || !canDeliverCustomer || workOrder.status !== "QC_PASSED" || !["APPROVED", "NOT_REQUIRED"].includes(String(workOrder.quoteStatus || "")) || deliveryNotes.trim().length < 5 || deliveryPayment.paidAmount > Number(workOrder.approvedFinalAmount || 0) || (deliveryPayment.paidAmount > 0 && deliveryPayment.paymentMethod !== "DEBT" && !deliveryPayment.fundId)} onClick={() => void run(() => requestDeliverToCustomer(workOrderId, deliveryNotes.trim(), { paidAmount: deliveryPayment.paidAmount, paymentMethod: deliveryPayment.paymentMethod, fundId: deliveryPayment.paidAmount > 0 && deliveryPayment.paymentMethod !== "DEBT" ? deliveryPayment.fundId : undefined, note: deliveryPayment.note.trim() || undefined }), "Đã bàn giao máy, ghi nhận khoản thu và công nợ.")} className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40">Xác nhận giao máy & thu tiền</button>
      </section>
    </div>
  );

  const visibleTabs: Array<[typeof activeTab, string]> = isTechnician
    ? [["OVERVIEW", "Tổng quan"], ["TASKS", "Công việc"], ["PARTS", "Linh kiện"], ["TIMELINE", "Lịch sử"]]
    : ["SALES", "SALE", "CASHIER"].includes(role)
      ? [["OVERVIEW", "Tổng quan"], ["TASKS", "Tiến độ"], ["PARTS", "Linh kiện"], ["QC", "KCS"], ["RETURN", "Báo giá & trả máy"], ["TIMELINE", "Lịch sử"]]
      : [["OVERVIEW", "Tổng quan"], ["TASKS", "Task & bằng chứng"], ["PARTS", "Linh kiện"], ...(details?.canViewCost ? [["COST", "Giá vốn"] as [typeof activeTab, string]] : []), ["QC", "QC/KCS"], ["TIMELINE", "Lịch sử"], ["RETURN", workOrder.assetOwnership === "CUSTOMER" ? "Báo giá & trả máy" : "Nhận lại kho"]];

  return (
    <div
      data-ph-fullscreen-form
      className="fixed inset-0 z-[145] flex justify-end bg-black/55 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <aside className="flex h-full min-w-0 w-full max-w-5xl flex-col bg-zinc-50 shadow-2xl">
        <header className="flex min-w-0 items-start justify-between gap-3 bg-zinc-950 px-4 py-4 text-white sm:px-5">
          <div className="min-w-0">
            <div className="flex min-w-0 items-center gap-2">
              <Wrench className="h-5 w-5 shrink-0 text-orange-400" />
              <h2 className="truncate font-black">
                {workOrder.model || task.model || "Hồ sơ kỹ thuật"}
              </h2>
            </div>
            <p className="mt-1 truncate font-mono text-xs text-zinc-300">
              {workOrder.code || task.ticketNumber} · IMEI{" "}
              {workOrder.imei || task.imei}
            </p>
            <p className="mt-1 truncate text-xs text-orange-300">
              {workOrder.currentLocationId || "Chưa xác định vị trí"} ·{" "}
              {workOrder.status || task.status}
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void load()}
              className="rounded-xl bg-white/10 p-2"
            >
              <RefreshCw
                className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
              />
            </button>
            <button onClick={onClose} className="rounded-xl bg-white/10 p-2">
              <X className="h-5 w-5" />
            </button>
          </div>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b bg-white px-3 py-2">
          {visibleTabs.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as any)}
              className={`whitespace-nowrap rounded-xl px-3 py-2 text-xs font-black ${activeTab === id ? "bg-orange-600 text-white" : "text-zinc-600 hover:bg-zinc-100"}`}
            >
              {label}
            </button>
          ))}
        </nav>
        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 sm:p-6">
          {error && (
            <div className="mb-4 flex gap-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">
              <AlertCircle className="h-5 w-5 shrink-0" />
              {error}
            </div>
          )}
          {message && (
            <div className="mb-4 flex gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm font-semibold text-emerald-700">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              {message}
            </div>
          )}
          {loading && !details ? (
            <div className="grid h-48 place-items-center">
              <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
            </div>
          ) : (
            <>
              {activeTab === "OVERVIEW" && (
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-2xl border bg-white p-5">
                    <h3 className="font-black">Thiết bị và trách nhiệm</h3>
                    <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <dt className="text-xs text-zinc-500">Nguồn máy</dt>
                        <dd className="font-bold">
                          {workOrder.workOrderType || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Chủ sở hữu</dt>
                        <dd className="font-bold">
                          {workOrder.assetOwnership || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Người giữ</dt>
                        <dd className="font-bold">
                          {workOrder.currentCustodianName || "—"}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-xs text-zinc-500">Số task</dt>
                        <dd className="font-bold">
                          {details?.taskLines?.length || 0}
                        </dd>
                      </div>
                    </dl>
                    {workOrder.hasPasscode && (
                      <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-bold">Mật mã mở máy</span>
                          {revealedPasscode === null ? (
                            <button
                              disabled={saving}
                              onClick={() => void revealPasscode()}
                              className="rounded-lg bg-zinc-900 px-3 py-1.5 text-xs font-black text-white"
                            >
                              Xem có ghi audit
                            </button>
                          ) : (
                            <button
                              onClick={() => setRevealedPasscode(null)}
                              className="text-xs font-bold text-zinc-600"
                            >
                              Ẩn
                            </button>
                          )}
                        </div>
                        {revealedPasscode !== null && (
                          <p className="mt-2 select-all font-mono text-lg font-black">
                            {revealedPasscode}
                          </p>
                        )}
                      </div>
                    )}
                  </section>
                  <section className="rounded-2xl border bg-white p-5">
                    <h3 className="font-black">Trạng thái hồ sơ</h3>
                    <div className="mt-4 space-y-2 text-sm">
                      <p className="flex justify-between">
                        <span>QC/KCS</span>
                        <strong>{workOrder.qcStatus || "CHƯA QC"}</strong>
                      </p>
                      <p className="flex justify-between">
                        <span>Đối soát linh kiện</span>
                        <strong>
                          {partsSettled ? "ĐÃ KHỚP" : "CHƯA KHỚP"}
                        </strong>
                      </p>
                      <p className="flex justify-between">
                        <span>Kết chuyển giá vốn</span>
                        <strong>
                          {details?.costPostingStatus || "NOT_READY"}
                        </strong>
                      </p>
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "OVERVIEW" && canRequestHandoff && (
                <section className="mt-4 rounded-2xl border border-blue-200 bg-blue-50/40 p-5">
                  <h3 className="font-black text-zinc-900">
                    Bàn giao trách nhiệm sang KTV khác
                  </h3>
                  <p className="mt-1 text-xs text-zinc-500">
                    Task đang chạy phải dừng, linh kiện phải đối soát. Trách
                    nhiệm chỉ đổi sau khi KTV nhận quét đúng IMEI; ảnh là tùy
                    chọn.
                  </p>
                  {workOrder.activeHandoffId ? (
                    <div className="mt-3 rounded-xl bg-amber-100 p-3 text-sm font-bold text-amber-800">
                      Đang chờ KTV đích xác nhận bàn giao:{" "}
                      {workOrder.activeHandoffId}
                    </div>
                  ) : (
                    <>
                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <select
                          value={handoffTargetWarehouseId}
                          onChange={(event) =>
                            setHandoffTargetWarehouseId(event.target.value)
                          }
                          className="h-11 rounded-xl border bg-white px-3 text-sm"
                        >
                          <option value="">Chọn kho/KTV nhận</option>
                          {eligibleHandoffWarehouses.map((item) => (
                            <option key={item.id} value={item.id}>
                              {item.name} ·{" "}
                              {item.custodianName || item.technicianName}
                            </option>
                          ))}
                        </select>
                        <input
                          value={handoffScannedImei}
                          onChange={(event) =>
                            setHandoffScannedImei(
                              event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 15),
                            )
                          }
                          placeholder="Quét IMEI bàn giao"
                          className="h-11 rounded-xl border px-3 font-mono text-sm"
                        />
                        <input
                          value={handoffReason}
                          onChange={(event) =>
                            setHandoffReason(event.target.value)
                          }
                          placeholder="Lý do bàn giao"
                          className="h-11 rounded-xl border px-3 text-sm sm:col-span-2"
                        />
                        <label className="rounded-xl border border-dashed bg-white p-3 text-xs font-bold sm:col-span-2">
                          Ảnh tình trạng lúc bàn giao (không bắt buộc)
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) =>
                              setHandoffFiles(
                                Array.from(event.target.files || []),
                              )
                            }
                            className="mt-2 block w-full text-xs"
                          />
                        </label>
                      </div>
                      <button
                        disabled={
                          saving ||
                          !handoffTargetWarehouseId ||
                          !handoffScannedImei ||
                          handoffReason.trim().length < 5
                        }
                        onClick={() =>
                          void run(
                            requestHandoff,
                            "Đã tạo yêu cầu; trách nhiệm vẫn thuộc KTV hiện tại cho đến khi người nhận xác nhận.",
                          )
                        }
                        className="mt-3 rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                      >
                        Tạo yêu cầu bàn giao
                      </button>
                    </>
                  )}
                </section>
              )}

              {activeTab === "TASKS" && (
                <div className="space-y-4">
                  <section className="overflow-hidden rounded-2xl border bg-white">
                    <div className="border-b px-4 py-3 font-black">
                      Danh sách hạng mục
                    </div>
                    <div className="divide-y">
                      {(details?.taskLines || []).map((line: any) => (
                        <button
                          key={line.id}
                          onClick={() => setSelectedLineId(line.id)}
                          className={`grid w-full gap-1 p-4 text-left sm:grid-cols-[1fr_170px_130px] ${selectedLineId === line.id ? "bg-orange-50" : ""}`}
                        >
                          <span>
                            <strong>{line.taskName}</strong>
                            <span className="mt-1 block text-xs text-zinc-500">
                              {line.assigneeName} · {line.priority || "NORMAL"}
                            </span>
                          </span>
                          <span className="text-xs font-bold text-zinc-600">
                            SLA:{" "}
                            {line.deadlineAt
                              ? new Date(line.deadlineAt).toLocaleString(
                                  "vi-VN",
                                )
                              : "—"}
                          </span>
                          <span className="text-xs font-black text-orange-700">
                            {String(line.status || "").replaceAll("_", " ")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  {selectedLine?.status === "WAITING_PARTS" && (
                    <section className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
                      <h3 className="font-black text-amber-950">
                        Task đang chờ linh kiện
                      </h3>
                      <p className="mt-1 text-sm text-amber-800">
                        Xuất linh kiện đúng model ở tab Linh kiện thì task sẽ tự
                        trở lại Đang xử lý. Không thể hoàn thành khi còn chờ
                        linh kiện.
                      </p>
                    </section>
                  )}

                  {selectedLine &&
                    String(selectedLine.status || "") === "IN_PROGRESS" && (
                      <section className="rounded-2xl border bg-white p-5">
                        <h3 className="font-black">
                          Báo hoàn thành: {selectedLine.taskName}
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          Ảnh là tùy chọn. Trước khi hoàn thành, linh kiện đã
                          giữ/xuất vẫn phải được xác nhận dùng, trả hoặc báo
                          hỏng.
                        </p>
                        <textarea
                          value={completionNotes}
                          onChange={(event) =>
                            setCompletionNotes(event.target.value)
                          }
                          rows={3}
                          placeholder="Mô tả kết quả trước/sau, thông số thay đổi..."
                          className="mt-3 w-full rounded-xl border p-3 text-sm"
                        />
                        {Array.isArray(selectedLine.requiredEvidenceTypes) &&
                          selectedLine.requiredEvidenceTypes.includes(
                            "REPLACEMENT_SERIAL",
                          ) && (
                            <textarea
                              value={replacementSerials}
                              onChange={(event) =>
                                setReplacementSerials(event.target.value)
                              }
                              rows={2}
                              placeholder="Serial linh kiện thay thế, mỗi serial một dòng"
                              className="mt-3 w-full rounded-xl border p-3 font-mono text-sm"
                            />
                          )}
                        <label className="mt-3 block rounded-xl border border-dashed p-4 text-sm">
                          <span className="font-bold">
                            Ảnh bằng chứng trước/sau (không bắt buộc)
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) =>
                              setCompletionFiles(
                                Array.from(event.target.files || []),
                              )
                            }
                            className="mt-2 block w-full text-xs"
                          />
                          <span className="mt-1 block text-xs text-zinc-500">
                            Đã chọn {completionFiles.length} ảnh, tối đa 8 ảnh ·
                            20MB/ảnh.
                          </span>
                        </label>
                        <button
                          disabled={saving}
                          onClick={() =>
                            void run(completeSelectedTask, (result) =>
                              result?.allLinesCompleted
                                ? "Đã hoàn thành toàn bộ task; phiếu chuyển sang chờ KCS."
                                : "Đã hoàn thành task này. Các task còn lại vẫn tiếp tục xử lý.",
                            )
                          }
                          className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                        >
                          Hoàn thành hạng mục
                        </button>
                      </section>
                    )}

                  {![
                    "DELIVERED_TO_CUSTOMER",
                    "RETURNED_TO_STOCK",
                    "RETURNED_TO_BRANCH",
                    "CANCELLED",
                  ].includes(String(workOrder.status || "")) && (
                    <section className="rounded-2xl border border-orange-200 bg-orange-50/60 p-5">
                      <h3 className="font-black text-orange-950">
                        Phát sinh lỗi / hạng mục mới
                      </h3>
                      <p className="mt-1 text-xs text-orange-900">
                        KTV gửi mô tả và ảnh. Quản lý duyệt trước khi hệ thống
                        thêm task, hoa hồng và yêu cầu linh kiện. Không sửa
                        ngược lịch sử task cũ.
                      </p>
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        <select
                          value={additionTaskType}
                          onChange={(event) =>
                            setAdditionTaskType(event.target.value)
                          }
                          className="h-11 rounded-xl border bg-white px-3 text-sm"
                        >
                          <option value="">Chọn hạng mục phát sinh</option>
                          {technicalTaskTypes.map((item) => (
                            <option key={item.taskType} value={item.taskType}>
                              {item.name}
                            </option>
                          ))}
                        </select>
                        <select
                          value={additionPriority}
                          onChange={(event) =>
                            setAdditionPriority(event.target.value as any)
                          }
                          className="h-11 rounded-xl border bg-white px-3 text-sm"
                        >
                          <option value="NORMAL">Bình thường</option>
                          <option value="PRIORITY">Ưu tiên</option>
                          <option value="URGENT">Khẩn</option>
                        </select>
                        {String(workOrder.workOrderType || "") ===
                          "CUSTOMER_SERVICE" && (
                          <label className="sm:col-span-2">
                            <span className="text-xs font-black text-zinc-600">
                              Báo giá tăng thêm dự kiến
                            </span>
                            <input
                              type="number"
                              min={0}
                              value={additionQuote}
                              onChange={(event) =>
                                setAdditionQuote(
                                  Math.max(0, Number(event.target.value || 0)),
                                )
                              }
                              className="mt-1 h-11 w-full rounded-xl border bg-white px-3"
                            />
                          </label>
                        )}
                        <textarea
                          value={additionReason}
                          onChange={(event) =>
                            setAdditionReason(event.target.value)
                          }
                          rows={3}
                          placeholder="Mô tả lỗi mới, nguyên nhân và hướng xử lý (ít nhất 10 ký tự)"
                          className="rounded-xl border bg-white p-3 text-sm sm:col-span-2"
                        />
                        <label className="rounded-xl border border-dashed bg-white p-3 text-xs font-bold sm:col-span-2">
                          Ảnh lỗi phát sinh (không bắt buộc)
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={(event) =>
                              setAdditionFiles(
                                Array.from(event.target.files || []),
                              )
                            }
                            className="mt-2 block w-full text-xs"
                          />
                        </label>
                      </div>
                      <button
                        disabled={
                          saving ||
                          !additionTaskType ||
                          additionReason.trim().length < 10
                        }
                        onClick={() =>
                          void run(
                            submitTaskAddition,
                            "Đã gửi hạng mục phát sinh để quản lý duyệt.",
                          )
                        }
                        className="mt-3 rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-40"
                      >
                        Gửi duyệt hạng mục
                      </button>
                    </section>
                  )}

                  {!!details?.taskAdditionRequests?.length && (
                    <section className="overflow-hidden rounded-2xl border bg-white">
                      <div className="border-b px-4 py-3 font-black">
                        Hạng mục phát sinh
                      </div>
                      <div className="divide-y">
                        {details.taskAdditionRequests.map((request: any) => (
                          <div key={request.id} className="p-4">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                              <div>
                                <p className="font-bold">
                                  {request.taskName || request.taskType}
                                </p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {request.requestedByName || "KTV"} ·{" "}
                                  {request.priority || "NORMAL"} ·{" "}
                                  {request.status}
                                </p>
                              </div>
                              <span
                                className={`rounded-full px-2 py-1 text-[11px] font-black ${request.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : request.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}
                              >
                                {request.status}
                              </span>
                            </div>
                            <p className="mt-2 rounded-lg bg-zinc-50 p-2 text-sm text-zinc-700">
                              {request.reason}
                            </p>
                            {canManageTaskAdditions &&
                              request.status === "PENDING" && (
                                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                                  <input
                                    value={
                                      additionDecisionNotes[request.id] || ""
                                    }
                                    onChange={(event) =>
                                      setAdditionDecisionNotes((current) => ({
                                        ...current,
                                        [request.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Ghi chú duyệt/từ chối"
                                    className="h-10 rounded-lg border px-3 text-sm"
                                  />
                                  {String(workOrder.workOrderType || "") ===
                                    "CUSTOMER_SERVICE" && (
                                    <div className="space-y-2">
                                      <input
                                        type="number"
                                        min={0}
                                        value={
                                          additionDecisionQuotes[request.id] ??
                                          Number(
                                            request.additionalCustomerQuote ||
                                              0,
                                          )
                                        }
                                        onChange={(event) =>
                                          setAdditionDecisionQuotes(
                                            (current) => ({
                                              ...current,
                                              [request.id]: Math.max(
                                                0,
                                                Number(event.target.value || 0),
                                              ),
                                            }),
                                          )
                                        }
                                        placeholder="Báo giá tăng thêm"
                                        className="h-10 w-full rounded-lg border px-3 text-sm"
                                      />
                                      <label className="flex items-center gap-2 text-xs font-bold">
                                        <input
                                          type="checkbox"
                                          checked={
                                            additionCustomerApproved[
                                              request.id
                                            ] === true
                                          }
                                          onChange={(event) =>
                                            setAdditionCustomerApproved(
                                              (current) => ({
                                                ...current,
                                                [request.id]:
                                                  event.target.checked,
                                              }),
                                            )
                                          }
                                        />{" "}
                                        Khách đã đồng ý báo giá
                                      </label>
                                    </div>
                                  )}
                                  <div className="flex gap-2 sm:col-span-2">
                                    <button
                                      disabled={saving}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            decideTaskAddition(
                                              request,
                                              "APPROVED",
                                            ),
                                          "Đã duyệt và thêm task phát sinh vào phiếu.",
                                        )
                                      }
                                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-black text-white"
                                    >
                                      Duyệt thêm task
                                    </button>
                                    <button
                                      disabled={saving}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            decideTaskAddition(
                                              request,
                                              "REJECTED",
                                            ),
                                          "Đã từ chối hạng mục phát sinh.",
                                        )
                                      }
                                      className="rounded-lg bg-red-50 px-3 py-2 text-xs font-black text-red-700"
                                    >
                                      Từ chối
                                    </button>
                                  </div>
                                </div>
                              )}
                          </div>
                        ))}
                      </div>
                    </section>
                  )}
                </div>
              )}

              {activeTab === "PARTS" && (
                <div className="space-y-4">
                  <section className="rounded-2xl border bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-black">
                          Giữ trước hoặc xuất linh kiện cho task
                        </h3>
                        <p className="mt-1 text-xs text-zinc-500">
                          Chỉ linh kiện đúng policy của task mới được phát hành.
                          Chọn sai sẽ chỉ tạo yêu cầu chờ Kho/Admin duyệt, không
                          trừ tồn.
                        </p>
                      </div>
                      {isTechnician && (
                        <span className="rounded-full bg-blue-50 px-3 py-1.5 text-xs font-black text-blue-700">
                          Chỉ dùng kho KTV cá nhân
                        </span>
                      )}
                    </div>
                    {selectedLine && (
                      <div
                        className={`mt-4 rounded-xl border p-3 text-sm ${taskPartRules.length ? "border-emerald-200 bg-emerald-50/60 text-emerald-900" : "border-amber-200 bg-amber-50 text-amber-900"}`}
                      >
                        <p className="font-black">
                          Policy linh kiện: {selectedLine.taskName}
                        </p>
                        {taskPartRules.length ? (
                          <ul className="mt-2 list-inside list-disc space-y-1 text-xs">
                            {taskPartRules.map((rule, index) => (
                              <li
                                key={`${rule.category || rule.sku || rule.partId || "rule"}-${index}`}
                              >
                                {taskPartRuleLabel(rule)}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="mt-1 text-xs">
                            Task này chưa có quy tắc linh kiện. KTV không được
                            tự giữ/xuất; chỉ có thể gửi yêu cầu ngoại lệ để
                            Kho/Admin duyệt.
                          </p>
                        )}
                      </div>
                    )}
                    {isTechnician &&
                      ownTechnicianPartWarehouses.length === 0 && (
                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
                          Tài khoản KTV này chưa được gắn kho con kỹ thuật. Hãy
                          vào Cài đặt → Kho hàng để gắn đúng kho KTV trước khi
                          xuất linh kiện.
                        </div>
                      )}
                    {isTechnician &&
                      taskPartRules.length > 0 &&
                      compatibleParts.length === 0 && (
                        <div className="mt-3 rounded-xl border border-blue-200 bg-blue-50 p-3 text-xs font-semibold text-blue-800">
                          Kho KTV cá nhân chưa có linh kiện đúng{" "}
                          <strong>task và model máy</strong>, hoặc đã hết tồn.
                          Hãy yêu cầu Kho Tổng cấp đúng linh kiện trước khi
                          xuất.
                        </div>
                      )}
                    {selectedLine &&
                      ["ASSIGNED", "ACCEPTED", "IN_PROGRESS"].includes(
                        String(selectedLine.status || ""),
                      ) && (
                        <section className="mt-3 rounded-2xl border border-amber-200 bg-amber-50/70 p-3">
                          <p className="text-sm font-black text-amber-950">
                            Không có linh kiện ngay?
                          </p>
                          <p className="mt-1 text-xs text-amber-800">
                            Đánh dấu riêng task này là Chờ linh kiện. Có thể làm
                            ngay sau khi task được giao; những task khác của
                            cùng máy vẫn tiếp tục làm.
                          </p>
                          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
                            <input
                              value={partsWaitingReason}
                              onChange={(event) =>
                                setPartsWaitingReason(event.target.value)
                              }
                              placeholder="Ví dụ: chờ màn IP12PM từ Kho Tổng"
                              className="h-10 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-sm"
                            />
                            <button
                              disabled={
                                saving || partsWaitingReason.trim().length < 5
                              }
                              onClick={() =>
                                void run(
                                  markSelectedTaskWaitingForParts,
                                  "Task đã chuyển sang Chờ linh kiện; các task khác không bị dừng.",
                                )
                              }
                              className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-black text-white disabled:opacity-40"
                            >
                              Đánh dấu chờ linh kiện
                            </button>
                          </div>
                        </section>
                      )}
                    {isTechnician &&
                      taskPartRules.length > 0 &&
                      centralPartWarehouse && (
                        <section className="mt-3 rounded-2xl border border-sky-200 bg-sky-50/70 p-3">
                          <div>
                            <p className="text-sm font-black text-sky-950">
                              Yêu cầu Kho Tổng cấp linh kiện
                            </p>
                            <p className="mt-1 text-xs text-sky-800">
                              Gửi yêu cầu ngay tại task này. Kho/Admin duyệt
                              xong, linh kiện sẽ về kho cá nhân của bạn để xuất
                              đúng quy trình.
                            </p>
                          </div>
                          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-[1fr_100px_auto]">
                            <select
                              value={orderPartId}
                              onChange={(event) =>
                                setOrderPartId(event.target.value)
                              }
                              className="h-10 min-w-0 rounded-xl border border-sky-200 bg-white px-3 text-xs"
                            >
                              <option value="">
                                {orderableCentralParts.length
                                  ? "Chọn linh kiện đúng task ở Kho Tổng"
                                  : "Kho Tổng chưa có linh kiện đúng task"}
                              </option>
                              {orderableCentralParts.map((part) => (
                                <option key={part.id} value={part.id}>
                                  {part.name} · còn {part.availableQuantity}
                                </option>
                              ))}
                            </select>
                            <input
                              type="number"
                              min={1}
                              value={orderQuantity}
                              onChange={(event) =>
                                setOrderQuantity(Number(event.target.value))
                              }
                              className="h-10 min-w-0 rounded-xl border border-sky-200 bg-white px-3 text-sm"
                            />
                            <button
                              disabled={
                                saving ||
                                !selectedLineId ||
                                !partsWarehouseId ||
                                !orderPartId ||
                                !Number.isFinite(orderQuantity) ||
                                orderQuantity <= 0
                              }
                              onClick={() =>
                                void run(async () => {
                                  const part = orderableCentralParts.find(
                                    (item) => item.id === orderPartId,
                                  );
                                  if (!part)
                                    throw new Error(
                                      "Hãy chọn linh kiện đúng task từ Kho Tổng.",
                                    );
                                  await requestTechnicalPartStockRequest({
                                    sourceWarehouseId: centralPartWarehouse.id,
                                    targetWarehouseId: partsWarehouseId,
                                    partId: part.id,
                                    quantity: orderQuantity,
                                    reason: `Cấp ${part.name || part.sku} cho task ${selectedLine?.taskName || selectedLineId}.`,
                                    workOrderId,
                                    workOrderLineId: selectedLineId,
                                  });
                                  setOrderQuantity(1);
                                }, "Đã gửi yêu cầu Kho Tổng. Linh kiện chỉ về kho KTV sau khi được duyệt.")
                              }
                              className="h-10 rounded-xl bg-sky-700 px-3 text-xs font-black text-white disabled:opacity-40"
                            >
                              Yêu cầu cấp
                            </button>
                          </div>
                        </section>
                      )}
                    <div className="mt-3 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-5">
                      <select
                        value={selectedLineId}
                        onChange={(event) => {
                          setSelectedLineId(event.target.value);
                          setSelectedPartId("");
                          setSelectedLotId("");
                          setPartExceptionReason("");
                        }}
                        className="h-11 min-w-0 w-full rounded-xl border px-3 text-sm"
                      >
                        {(details?.taskLines || []).map((line: any) => (
                          <option key={line.id} value={line.id}>
                            {line.taskName}
                          </option>
                        ))}
                      </select>
                      <select
                        value={partsWarehouseId}
                        onChange={(event) => {
                          setPartsWarehouseId(event.target.value);
                          setSelectedPartId("");
                          setSelectedLotId("");
                          setPartExceptionReason("");
                        }}
                        disabled={
                          isTechnician &&
                          ownTechnicianPartWarehouses.length <= 1
                        }
                        className="h-11 min-w-0 w-full rounded-xl border px-3 text-sm disabled:bg-zinc-100"
                      >
                        <option value="">
                          {isTechnician
                            ? "Kho KTV chưa được gắn"
                            : "Chọn kho xuất"}
                        </option>
                        {selectablePartWarehouses.map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                            {isTechnician ? " · kho cá nhân" : ""}
                          </option>
                        ))}
                      </select>
                      <select
                        value={selectedPartId}
                        onChange={(event) => {
                          setSelectedPartId(event.target.value);
                          setPartExceptionReason("");
                        }}
                        className="h-11 min-w-0 w-full rounded-xl border px-3 text-sm"
                      >
                        <option value="">Chọn linh kiện</option>
                        {compatibleParts.length > 0 && (
                          <optgroup label="Đúng task và đúng model">
                            {compatibleParts.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ·{" "}
                                {item.category || item.sku || "Chưa phân loại"}{" "}
                                · còn {item.availableQuantity}
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {wrongModelParts.length > 0 && (
                          <optgroup label="Sai model — không thể xuất">
                            {wrongModelParts.map((item) => (
                              <option key={item.id} value={item.id} disabled>
                                {item.name} · model không khớp
                              </option>
                            ))}
                          </optgroup>
                        )}
                        {incompatibleParts.length > 0 && (
                          <optgroup label="Không đúng task — cần duyệt ngoại lệ">
                            {incompatibleParts.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name} ·{" "}
                                {item.category || item.sku || "Chưa phân loại"}{" "}
                                · còn {item.availableQuantity}
                              </option>
                            ))}
                          </optgroup>
                        )}
                      </select>
                      <select
                        value={selectedLotId}
                        onChange={(event) =>
                          setSelectedLotId(event.target.value)
                        }
                        disabled={selectedPartLots.length === 0}
                        className="h-11 min-w-0 w-full rounded-xl border px-3 text-sm disabled:bg-zinc-100"
                      >
                        <option value="">
                          {selectedPartLots.length
                            ? "Chọn lô xuất"
                            : "Không quản lý theo lô"}
                        </option>
                        {selectedPartLots.map((lot: any) => (
                          <option key={lot.id} value={lot.id}>
                            {lot.lotCode} · còn {lot.availableQuantity}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        value={issueQuantity}
                        onChange={(event) =>
                          setIssueQuantity(Number(event.target.value))
                        }
                        className="h-11 min-w-0 w-full rounded-xl border px-3"
                      />
                    </div>
                    {selectedPartRule && (
                      <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800">
                        ✓ Linh kiện phù hợp:{" "}
                        {taskPartRuleLabel(selectedPartRule)}
                      </p>
                    )}
                    {exceedsTaskPartMaximum && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        Số lượng đang chọn vượt tối đa {selectedPartMaximum} cho
                        task này. Hãy giảm số lượng hoặc gửi yêu cầu ngoại lệ.
                      </p>
                    )}
                    {selectedPartModelMismatch && (
                      <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3">
                        <p className="text-sm font-black text-red-900">
                          Linh kiện không tương thích với model máy
                        </p>
                        <p className="mt-1 text-xs text-red-800">
                          Không thể dùng duyệt ngoại lệ để xuất linh kiện sai
                          model. Hãy chọn đúng model hoặc bổ sung tương thích
                          của linh kiện trong Danh mục.
                        </p>
                      </div>
                    )}
                    {selectedPartIsTaskMismatch && (
                      <div className="mt-3 rounded-xl border border-amber-300 bg-amber-50 p-3">
                        <p className="text-sm font-black text-amber-900">
                          Linh kiện này không khớp task đã chọn
                        </p>
                        {selectedApprovedPartException ? (
                          <p className="mt-1 text-xs font-semibold text-emerald-800">
                            Ngoại lệ đã được Kho/Admin duyệt (
                            {selectedExceptionAvailableQuantity} còn lại). Có
                            thể xuất ngay, nhưng không thể giữ trước linh kiện
                            sai task.
                          </p>
                        ) : selectedPendingPartException ? (
                          <p className="mt-1 text-xs font-semibold text-amber-800">
                            Đã gửi yêu cầu ngoại lệ, đang chờ Kho/Admin xét
                            duyệt. Tồn kho chưa thay đổi.
                          </p>
                        ) : (
                          <>
                            <p className="mt-1 text-xs text-amber-800">
                              Không thể tự xuất linh kiện sai task. Nêu lý do để
                              gửi yêu cầu, sau đó Kho/Admin sẽ xét duyệt trước
                              khi có thể dùng.
                            </p>
                            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                              <input
                                value={partExceptionReason}
                                onChange={(event) =>
                                  setPartExceptionReason(event.target.value)
                                }
                                placeholder="Lý do cần dùng linh kiện này (ít nhất 5 ký tự)"
                                className="h-10 min-w-0 flex-1 rounded-lg border border-amber-300 bg-white px-3 text-sm"
                              />
                              <button
                                disabled={
                                  saving ||
                                  !selectedLineId ||
                                  !selectedPartId ||
                                  !partsWarehouseId ||
                                  issueQuantity <= 0 ||
                                  partExceptionReason.trim().length < 5 ||
                                  (selectedPartLots.length > 0 &&
                                    !selectedLotId)
                                }
                                onClick={() =>
                                  void run(async () => {
                                    await requestTechnicalPartException(
                                      workOrderId,
                                      {
                                        lineId: selectedLineId,
                                        partId: selectedPartId,
                                        warehouseId: partsWarehouseId,
                                        lotId: selectedLotId || undefined,
                                        quantity: issueQuantity,
                                        reason: partExceptionReason.trim(),
                                      },
                                    );
                                    setPartExceptionReason("");
                                  }, "Đã gửi yêu cầu ngoại lệ; linh kiện chưa được xuất cho đến khi Kho/Admin duyệt.")
                                }
                                className="rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                              >
                                Yêu cầu duyệt ngoại lệ
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                    {exceedsExceptionApproval && (
                      <p className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
                        Số lượng đang chọn vượt quyền ngoại lệ còn lại (
                        {selectedExceptionAvailableQuantity}). Hãy giảm số lượng
                        hoặc xin duyệt thêm.
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        disabled={
                          saving ||
                          !partSelectionReady ||
                          selectedPartIsMismatch
                        }
                        onClick={() =>
                          void run(
                            () =>
                              requestReserveSparePart(
                                workOrderId,
                                selectedLineId,
                                selectedPartId,
                                partsWarehouseId,
                                issueQuantity,
                                selectedLotId || undefined,
                              ),
                            "Đã giữ linh kiện đúng task.",
                          )
                        }
                        className="rounded-xl bg-blue-700 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                      >
                        Giữ trước
                      </button>
                      <button
                        disabled={saving || !partSelectionReady}
                        onClick={() =>
                          void run(
                            () =>
                              requestIssueSparePart(
                                workOrderId,
                                selectedLineId,
                                selectedPartId,
                                partsWarehouseId,
                                issueQuantity,
                                selectedLotId || undefined,
                                undefined,
                                selectedApprovedPartException?.id,
                              ),
                            selectedPartIsTaskMismatch
                              ? "Đã xuất linh kiện theo ngoại lệ đã được duyệt và snapshot giá vốn."
                              : "Đã xuất linh kiện đúng task, đúng model và đã snapshot giá vốn.",
                          )
                        }
                        className="rounded-xl bg-orange-600 px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
                      >
                        <Package className="mr-2 inline h-4 w-4" />
                        Xuất ngay
                      </button>
                    </div>
                  </section>

                  {!!details?.partExceptions?.length && (
                    <section className="overflow-hidden rounded-2xl border border-amber-200 bg-white">
                      <div className="border-b border-amber-100 px-4 py-3 font-black text-amber-950">
                        Ngoại lệ linh kiện theo task
                      </div>
                      <div className="divide-y">
                        {details.partExceptions.map((exception: any) => (
                          <article
                            key={exception.id}
                            className="flex flex-wrap items-center justify-between gap-3 p-4"
                          >
                            <div>
                              <p className="font-bold">
                                {exception.partName}{" "}
                                <span className="text-xs text-zinc-500">
                                  · {exception.category || exception.sku}
                                </span>
                              </p>
                              <p className="mt-1 text-xs text-zinc-500">
                                Task {exception.workOrderLineId} · Yêu cầu{" "}
                                {exception.quantityRequested} · Đã duyệt{" "}
                                {exception.quantityApproved || 0} · Đã xuất{" "}
                                {exception.quantityIssued || 0}
                              </p>
                              <p className="mt-1 text-xs text-amber-800">
                                Lý do: {exception.reason || "—"}
                              </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                              <span
                                className={`rounded-full px-2.5 py-1 text-xs font-black ${exception.status === "APPROVED" ? "bg-emerald-100 text-emerald-700" : exception.status === "REJECTED" ? "bg-red-100 text-red-700" : "bg-amber-100 text-amber-800"}`}
                              >
                                {exception.status}
                              </span>
                              {canManagePartExceptions &&
                                exception.status === "PENDING" && (
                                  <>
                                    <button
                                      disabled={saving}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            requestDecideTechnicalPartException(
                                              workOrderId,
                                              exception.id,
                                              {
                                                decision: "APPROVED",
                                                quantityApproved: Number(
                                                  exception.quantityRequested ||
                                                    1,
                                                ),
                                                note: "Đã duyệt ngoại lệ linh kiện theo hồ sơ kỹ thuật.",
                                              },
                                            ),
                                          "Đã duyệt ngoại lệ; KTV có thể xuất đúng số lượng được duyệt.",
                                        )
                                      }
                                      className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white"
                                    >
                                      Duyệt
                                    </button>
                                    <button
                                      disabled={saving}
                                      onClick={() =>
                                        void run(
                                          () =>
                                            requestDecideTechnicalPartException(
                                              workOrderId,
                                              exception.id,
                                              {
                                                decision: "REJECTED",
                                                note: "Không duyệt linh kiện ngoài policy task.",
                                              },
                                            ),
                                          "Đã từ chối ngoại lệ linh kiện.",
                                        )
                                      }
                                      className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-700"
                                    >
                                      Từ chối
                                    </button>
                                  </>
                                )}
                            </div>
                          </article>
                        ))}
                      </div>
                    </section>
                  )}

                  <section className="overflow-hidden rounded-2xl border bg-white">
                    <div className="border-b px-4 py-3 font-black">
                      Linh kiện đang giữ trước
                    </div>
                    <div className="divide-y">
                      {(details?.partReservations || []).map(
                        (reservation: any) => {
                          const outstanding =
                            Number(reservation.quantityReserved || 0) -
                            Number(reservation.quantityIssued || 0) -
                            Number(reservation.quantityCancelled || 0);
                          const reason = settleNotes[reservation.id] || "";
                          return (
                            <div key={reservation.id} className="p-4">
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <div>
                                  <strong>{reservation.partName}</strong>
                                  <p className="text-xs text-zinc-500">
                                    Giữ {reservation.quantityReserved} · Đã xuất{" "}
                                    {reservation.quantityIssued || 0} · Còn{" "}
                                    {outstanding} ·{" "}
                                    {reservation.lotId
                                      ? `Lô ${reservation.lotId}`
                                      : "Bình quân kho"}
                                  </p>
                                </div>
                                <span className="text-xs font-black">
                                  {reservation.status}
                                </span>
                              </div>
                              {outstanding > 0 && (
                                <div className="mt-3 flex flex-wrap gap-2">
                                  <button
                                    disabled={saving}
                                    onClick={() =>
                                      void run(
                                        () =>
                                          requestIssueSparePart(
                                            workOrderId,
                                            reservation.workOrderLineId,
                                            reservation.partId,
                                            reservation.warehouseId,
                                            outstanding,
                                            reservation.lotId || undefined,
                                            reservation.id,
                                          ),
                                        "Đã phát hành linh kiện từ phần giữ trước.",
                                      )
                                    }
                                    className="rounded-lg bg-orange-600 px-3 py-2 text-xs font-black text-white"
                                  >
                                    Xuất phần đã giữ
                                  </button>
                                  <input
                                    value={reason}
                                    onChange={(event) =>
                                      setSettleNotes((current) => ({
                                        ...current,
                                        [reservation.id]: event.target.value,
                                      }))
                                    }
                                    placeholder="Lý do hủy giữ"
                                    className="h-9 min-w-52 flex-1 rounded-lg border px-2 text-xs"
                                  />
                                  <button
                                    disabled={
                                      saving || reason.trim().length < 5
                                    }
                                    onClick={() =>
                                      void run(
                                        () =>
                                          requestCancelSparePartReservation(
                                            workOrderId,
                                            reservation.id,
                                            reason.trim(),
                                          ),
                                        "Đã giải phóng tồn giữ trước.",
                                      )
                                    }
                                    className="rounded-lg bg-red-50 px-3 text-xs font-black text-red-700 disabled:opacity-40"
                                  >
                                    Hủy giữ
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        },
                      )}
                      {!details?.partReservations?.length && (
                        <p className="p-6 text-sm text-zinc-500">
                          Chưa có linh kiện giữ trước.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="overflow-hidden rounded-2xl border bg-white">
                    <div className="border-b px-4 py-3 font-black">
                      Đối soát linh kiện đã xuất
                    </div>
                    <div className="divide-y">
                      {(details?.partIssues || []).map((issue: any) => {
                        const outstanding =
                          Number(issue.quantityIssued || 0) -
                          Number(issue.quantityConsumed || 0) -
                          Number(issue.quantityReturned || 0) -
                          Number(issue.quantityScrapped || 0);
                        const quantity =
                          settleQuantities[issue.id] || outstanding || 1;
                        const exceptionReason = settleNotes[issue.id] || "";
                        return (
                          <div key={issue.id} className="p-4">
                            <div className="flex flex-wrap justify-between gap-2">
                              <div>
                                <strong>{issue.partName}</strong>
                                <p className="text-xs text-zinc-500">
                                  Xuất {issue.quantityIssued} · Dùng{" "}
                                  {issue.quantityConsumed} · Trả{" "}
                                  {issue.quantityReturned} · Hỏng{" "}
                                  {issue.quantityScrapped || 0}
                                </p>
                              </div>
                              <span className="text-xs font-black">
                                {issue.status}
                              </span>
                            </div>
                            {outstanding > 0 && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <input
                                  type="number"
                                  min={1}
                                  max={outstanding}
                                  value={quantity}
                                  onChange={(event) =>
                                    setSettleQuantities((current) => ({
                                      ...current,
                                      [issue.id]: Number(event.target.value),
                                    }))
                                  }
                                  className="h-9 w-24 rounded-lg border px-2"
                                />
                                <button
                                  disabled={saving}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        requestConsumeSparePart(
                                          workOrderId,
                                          issue.id,
                                          quantity,
                                        ),
                                      "Đã ghi nhận linh kiện thực dùng.",
                                    )
                                  }
                                  className="rounded-lg bg-emerald-600 px-3 text-xs font-black text-white"
                                >
                                  Xác nhận dùng
                                </button>
                                <button
                                  disabled={saving}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        requestReturnSparePart(
                                          workOrderId,
                                          issue.id,
                                          quantity,
                                        ),
                                      "Đã trả linh kiện về đúng kho.",
                                    )
                                  }
                                  className="rounded-lg bg-zinc-800 px-3 text-xs font-black text-white"
                                >
                                  Trả lại kho
                                </button>
                                {canManagePartExceptions && (
                                  <>
                                    <input
                                      value={exceptionReason}
                                      onChange={(event) =>
                                        setSettleNotes((current) => ({
                                          ...current,
                                          [issue.id]: event.target.value,
                                        }))
                                      }
                                      placeholder="Lý do hỏng/hủy"
                                      className="h-9 min-w-44 flex-1 rounded-lg border px-2 text-xs"
                                    />
                                    <button
                                      disabled={
                                        saving ||
                                        exceptionReason.trim().length < 5
                                      }
                                      onClick={() =>
                                        void run(
                                          () =>
                                            requestScrapSparePart(
                                              workOrderId,
                                              issue.id,
                                              quantity,
                                              exceptionReason.trim(),
                                              true,
                                            ),
                                          "Đã ghi nhận linh kiện hỏng và ledger chi phí.",
                                        )
                                      }
                                      className="rounded-lg bg-amber-100 px-3 text-xs font-black text-amber-800 disabled:opacity-40"
                                    >
                                      Báo hỏng
                                    </button>
                                    {outstanding ===
                                      Number(issue.quantityIssued || 0) && (
                                      <button
                                        disabled={
                                          saving ||
                                          exceptionReason.trim().length < 5
                                        }
                                        onClick={() =>
                                          void run(
                                            () =>
                                              requestCancelSparePartIssue(
                                                workOrderId,
                                                issue.id,
                                                exceptionReason.trim(),
                                              ),
                                            "Đã đảo phiếu xuất và hoàn tồn kho.",
                                          )
                                        }
                                        className="rounded-lg bg-red-50 px-3 text-xs font-black text-red-700 disabled:opacity-40"
                                      >
                                        Hủy xuất
                                      </button>
                                    )}
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                      {!details?.partIssues?.length && (
                        <p className="p-6 text-sm text-zinc-500">
                          Chưa xuất linh kiện nào.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "COST" && (
                <div className="space-y-4">
                  {details?.canViewCost ? (
                    <>
                      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        {[
                          ["Giá vốn đầu kỳ", breakdown?.openingDeviceCost],
                          ["Linh kiện", breakdown?.partsCost],
                          ["Công kỹ thuật", breakdown?.laborCost],
                          [
                            "Chi phí ngoài",
                            Number(breakdown?.externalCost || 0) +
                              Number(breakdown?.otherCost || 0),
                          ],
                          [
                            "Thu hồi/hoàn trả",
                            -Number(breakdown?.recoveryAmount || 0),
                          ],
                          ["Giá vốn mới", breakdown?.closingDeviceCost],
                        ].map(([label, value]) => (
                          <div
                            key={String(label)}
                            className="rounded-2xl border bg-white p-4"
                          >
                            <p className="text-xs font-bold text-zinc-500">
                              {label}
                            </p>
                            <p className="mt-1 text-lg font-black">
                              {money.format(Number(value || 0))}
                            </p>
                          </div>
                        ))}
                      </section>
                      <section className="rounded-2xl border bg-white p-5">
                        <h3 className="font-black">Thêm chi phí ngoài</h3>
                        <div className="mt-3 grid gap-3 sm:grid-cols-3">
                          <select
                            value={externalCost.category}
                            onChange={(event) =>
                              setExternalCost((current) => ({
                                ...current,
                                category: event.target.value,
                              }))
                            }
                            className="h-11 rounded-xl border px-3"
                          >
                            <option value="OUTSOURCED_REPAIR">Sửa ngoài</option>
                            <option value="TRANSPORT">Vận chuyển</option>
                            <option value="MATERIAL">Vật tư</option>
                            <option value="OTHER">Chi phí khác</option>
                          </select>
                          <input
                            type="number"
                            value={externalCost.amount}
                            onChange={(event) =>
                              setExternalCost((current) => ({
                                ...current,
                                amount: Number(event.target.value),
                              }))
                            }
                            placeholder="Số tiền"
                            className="h-11 rounded-xl border px-3"
                          />
                          <input
                            value={externalCost.note}
                            onChange={(event) =>
                              setExternalCost((current) => ({
                                ...current,
                                note: event.target.value,
                              }))
                            }
                            placeholder="Nội dung/chứng từ"
                            className="h-11 rounded-xl border px-3"
                          />
                        </div>
                        <div className="mt-3 flex gap-2">
                          <button
                            disabled={saving}
                            onClick={() =>
                              void run(
                                () =>
                                  requestAddTechnicalExternalCost(
                                    workOrderId,
                                    externalCost,
                                  ),
                                "Đã ghi nhận chi phí.",
                              )
                            }
                            className="rounded-xl bg-zinc-900 px-4 py-2 text-sm font-black text-white"
                          >
                            Ghi chi phí
                          </button>
                          {canFinalizeCost &&
                            workOrder.status === "QC_PASSED" &&
                            details.costPostingStatus !== "POSTED" && (
                              <button
                                disabled={saving}
                                onClick={() =>
                                  void run(
                                    () =>
                                      requestFinalizeTechnicalCost(workOrderId),
                                    "Đã chốt giá vốn mới cho IMEI.",
                                  )
                                }
                                className="rounded-xl bg-orange-600 px-4 py-2 text-sm font-black text-white"
                              >
                                <DollarSign className="mr-1 inline h-4 w-4" />
                                Chốt giá vốn
                              </button>
                            )}
                        </div>
                      </section>
                      <section className="overflow-hidden rounded-2xl border bg-white">
                        <div className="border-b px-4 py-3 font-black">
                          Đối soát chi phí ngoài
                        </div>
                        <div className="divide-y">
                          {(details.externalCosts || []).map((cost: any) => (
                            <div
                              key={cost.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-4"
                            >
                              <div>
                                <p className="font-bold">{cost.note}</p>
                                <p className="mt-1 text-xs text-zinc-500">
                                  {cost.category} ·{" "}
                                  {money.format(Number(cost.amount || 0))}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-black">
                                  {cost.approvalStatus}
                                </span>
                                {canFinalizeCost &&
                                  cost.approvalStatus === "PENDING" && (
                                    <>
                                      <button
                                        disabled={saving}
                                        onClick={() =>
                                          void run(
                                            () =>
                                              requestDecideTechnicalExternalCost(
                                                workOrderId,
                                                cost.id,
                                                "APPROVED",
                                              ),
                                            "Đã duyệt chi phí.",
                                          )
                                        }
                                        className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-black text-white"
                                      >
                                        Duyệt
                                      </button>
                                      <button
                                        disabled={saving}
                                        onClick={() =>
                                          void run(
                                            () =>
                                              requestDecideTechnicalExternalCost(
                                                workOrderId,
                                                cost.id,
                                                "REJECTED",
                                              ),
                                            "Đã từ chối chi phí.",
                                          )
                                        }
                                        className="rounded-lg bg-red-50 px-3 py-1.5 text-xs font-black text-red-700"
                                      >
                                        Từ chối
                                      </button>
                                    </>
                                  )}
                              </div>
                            </div>
                          ))}
                          {!details.externalCosts?.length && (
                            <p className="p-5 text-sm text-zinc-500">
                              Chưa có chi phí ngoài.
                            </p>
                          )}
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500">
                      Tài khoản của bạn không có quyền xem giá vốn. Bạn vẫn có
                      thể đối soát số lượng linh kiện ở tab Linh kiện.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "COST" && details?.canViewCost && (
                <section className="rounded-2xl border bg-white p-5">
                  <h3 className="font-black">Thu hồi / NCC bồi hoàn</h3>
                  <div className="mt-3 grid gap-3 sm:grid-cols-3">
                    <select
                      value={recovery.category}
                      onChange={(event) =>
                        setRecovery((current) => ({
                          ...current,
                          category: event.target.value,
                        }))
                      }
                      className="h-11 rounded-xl border px-3"
                    >
                      <option value="SUPPLIER_RECOVERY">NCC bồi hoàn</option>
                      <option value="WARRANTY_COMPENSATION">
                        Bồi hoàn bảo hành
                      </option>
                      <option value="OTHER">Khoản thu hồi khác</option>
                    </select>
                    <input
                      type="number"
                      value={recovery.amount}
                      onChange={(event) =>
                        setRecovery((current) => ({
                          ...current,
                          amount: Number(event.target.value),
                        }))
                      }
                      placeholder="Số tiền giảm vốn"
                      className="h-11 rounded-xl border px-3"
                    />
                    <input
                      value={recovery.note}
                      onChange={(event) =>
                        setRecovery((current) => ({
                          ...current,
                          note: event.target.value,
                        }))
                      }
                      placeholder="Nội dung/chứng từ"
                      className="h-11 rounded-xl border px-3"
                    />
                  </div>
                  <button
                    disabled={
                      saving ||
                      recovery.amount <= 0 ||
                      recovery.note.trim().length < 3
                    }
                    onClick={() =>
                      void run(
                        () =>
                          requestAddTechnicalRecovery(workOrderId, recovery),
                        "Đã ghi nhận khoản bồi hoàn/thu hồi.",
                      )
                    }
                    className="mt-3 rounded-xl bg-blue-700 px-4 py-2 text-sm font-black text-white disabled:opacity-40"
                  >
                    Ghi khoản giảm giá vốn
                  </button>
                  <div className="mt-4 divide-y rounded-xl border">
                    {(details.recoveries || []).map((item: any) => (
                      <div
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3"
                      >
                        <div>
                          <p className="font-bold">{item.note}</p>
                          <p className="text-xs text-zinc-500">
                            {item.category} ·{" "}
                            {money.format(Number(item.amount || 0))}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <span className="text-xs font-black">
                            {item.approvalStatus}
                          </span>
                          {canFinalizeCost &&
                            item.approvalStatus === "PENDING" && (
                              <>
                                <button
                                  disabled={saving}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        requestDecideTechnicalRecovery(
                                          workOrderId,
                                          item.id,
                                          "APPROVED",
                                        ),
                                      "Đã duyệt khoản thu hồi.",
                                    )
                                  }
                                  className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-black text-white"
                                >
                                  Duyệt
                                </button>
                                <button
                                  disabled={saving}
                                  onClick={() =>
                                    void run(
                                      () =>
                                        requestDecideTechnicalRecovery(
                                          workOrderId,
                                          item.id,
                                          "REJECTED",
                                        ),
                                      "Đã từ chối khoản thu hồi.",
                                    )
                                  }
                                  className="rounded-lg bg-red-50 px-3 py-1 text-xs font-black text-red-700"
                                >
                                  Từ chối
                                </button>
                              </>
                            )}
                        </div>
                      </div>
                    ))}
                    {!details.recoveries?.length && (
                      <p className="p-3 text-sm text-zinc-500">
                        Chưa có khoản thu hồi.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {activeTab === "QC" && (
                <div className="space-y-3">
                  {(details?.qcInspections || []).map((inspection: any) => (
                    <section
                      key={inspection.id}
                      className="rounded-2xl border bg-white p-5"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h3 className="font-black">
                            KCS {inspection.overallResult}
                          </h3>
                          <p className="mt-1 text-xs text-zinc-500">
                            {inspection.inspectorName ||
                              inspection.inspectorUid ||
                              "Không có dữ liệu người QC"}{" "}
                            ·{" "}
                            {inspection.inspectedAt
                              ? new Date(inspection.inspectedAt).toLocaleString(
                                  "vi-VN",
                                )
                              : "Không có thời gian"}
                          </p>
                        </div>
                        <span
                          className={`rounded-full px-3 py-1 text-xs font-black ${inspection.overallResult === "PASS" ? "bg-emerald-100 text-emerald-700" : "bg-red-100 text-red-700"}`}
                        >
                          {inspection.overallResult}
                        </span>
                      </div>
                      {inspection.failedReason && (
                        <p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">
                          {inspection.failedReason}
                        </p>
                      )}
                      <div className="mt-4 grid gap-2 sm:grid-cols-2">
                        {Object.entries(inspection.checklistResults || {}).map(
                          ([key, value]) => (
                            <p
                              key={key}
                              className="flex justify-between rounded-lg bg-zinc-50 px-3 py-2 text-xs"
                            >
                              <span>{key}</span>
                              <strong
                                className={
                                  value ? "text-emerald-700" : "text-red-700"
                                }
                              >
                                {value ? "Đạt" : "Không đạt"}
                              </strong>
                            </p>
                          ),
                        )}
                      </div>
                    </section>
                  ))}
                  {!details?.qcInspections?.length && (
                    <div className="rounded-2xl border bg-white p-8 text-center text-sm text-zinc-500">
                      Chưa có biên bản QC/KCS.
                    </div>
                  )}
                </div>
              )}

              {activeTab === "TIMELINE" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                    {[
                      {
                        label: "Vị trí hiện tại",
                        value: lifecycle?.summary.currentLocationName || workOrder.currentLocationName || "Chưa xác định",
                        icon: MapPin,
                      },
                      {
                        label: "Người đang giữ",
                        value: lifecycle?.summary.currentCustodianName || workOrder.currentCustodianName || "Chưa xác định",
                        icon: UserCheck,
                      },
                      {
                        label: "Thời gian thực làm",
                        value: lifecycle ? `${lifecycle.summary.activeWorkMinutes.toLocaleString("vi-VN")} phút` : "Đang tổng hợp",
                        icon: Clock,
                      },
                      {
                        label: lifecycle?.canViewCost ? "Giá vốn hiện tại" : "KCS / sửa lại",
                        value: lifecycle?.canViewCost
                          ? money.format(Number(lifecycle.summary.currentCost || 0))
                          : `${lifecycle?.summary.qcFailCount || 0} lỗi · ${lifecycle?.summary.reworkCount || 0} sửa lại`,
                        icon: lifecycle?.canViewCost ? DollarSign : CheckCircle2,
                      },
                    ].map((item) => {
                      const SummaryIcon = item.icon;
                      return (
                        <div key={item.label} className="min-w-0 rounded-2xl border border-orange-100 bg-gradient-to-br from-white to-orange-50/70 p-3">
                          <p className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wide text-zinc-500">
                            <SummaryIcon className="h-3.5 w-3.5 text-orange-500" />
                            {item.label}
                          </p>
                          <p className="mt-1 truncate text-xs font-black text-zinc-900" title={item.value}>{item.value}</p>
                        </div>
                      );
                    })}
                  </div>

                  <section className="overflow-hidden rounded-2xl border bg-white">
                    <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
                      <div>
                        <p className="flex items-center gap-2 font-black"><History className="h-4 w-4 text-orange-500" /> Event Timeline IMEI</p>
                        <p className="mt-0.5 text-[11px] text-zinc-500">Đối chiếu từ kho, custody, task, linh kiện, KCS, giá vốn và hóa đơn.</p>
                      </div>
                      {lifecycle && <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">{lifecycle.summary.eventCount} mốc</span>}
                    </div>
                    <div className="divide-y">
                      {(lifecycle?.events || details?.timeline || []).map((event: any) => (
                        <div
                          key={event.id}
                          className="grid gap-2 p-4 sm:grid-cols-[170px_1fr]"
                        >
                          <time className="text-xs font-bold text-zinc-500">
                            {new Date(event.occurredAt).toLocaleString("vi-VN")}
                          </time>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              {event.category && <span className="rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[9px] font-black text-orange-800">{event.category}</span>}
                              <p className="font-bold">{event.title}</p>
                            </div>
                            {event.description && <p className="mt-1 text-xs leading-relaxed text-zinc-600">{event.description}</p>}
                            <p className="mt-1 text-xs text-zinc-500">
                              {event.actorName || event.actorUid || "Hệ thống"}
                              {event.fromLocationName || event.toLocationName || event.fromLocationId || event.toLocationId
                                ? ` · ${event.fromLocationName || event.fromLocationId || "—"} → ${event.toLocationName || event.toLocationId || "—"}`
                                : ""}
                              {Number(event.durationMinutes || 0) > 0 ? ` · ${Number(event.durationMinutes).toLocaleString("vi-VN")} phút` : ""}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] font-bold text-zinc-500">
                              {(event.documentCode || event.workOrderCode) && <span className="rounded border bg-zinc-50 px-1.5 py-0.5 font-mono">{event.documentCode || event.workOrderCode}</span>}
                              {Number(event.quantity || 0) > 0 && <span>SL {Number(event.quantity).toLocaleString("vi-VN")}</span>}
                            </div>
                            {(lifecycle?.canViewCost ?? details.canViewCost) && event.amount != null && (
                              <p className="mt-1 text-xs font-black text-orange-700">
                                Biến động {money.format(Number(event.amount))}
                                {event.costAfter != null ? ` · Giá vốn sau ${money.format(Number(event.costAfter || 0))}` : ""}
                              </p>
                            )}
                          </div>
                        </div>
                      ))}
                      {!(lifecycle?.events?.length || details?.timeline?.length) && (
                        <p className="p-8 text-center text-sm text-zinc-500">
                          Chưa có mốc lịch sử nào cho IMEI này.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {activeTab === "RETURN" &&
                (workOrder.assetOwnership === "CUSTOMER" ? customerDeliveryPanel : false ? (
                  <section className="mx-auto max-w-xl rounded-2xl border bg-white p-5">
                    <h3 className="font-black">Bàn giao máy & thu tiền</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      KCS đạt rồi mới giao máy. Có thể thu đủ, thu một phần hoặc
                      ghi nợ.
                    </p>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className="text-xs font-black text-zinc-600">
                          Tổng tiền dịch vụ
                        </span>
                        <input
                          type="number"
                          min={0}
                          value={deliveryPayment.finalAmount}
                          onChange={(event) =>
                            setDeliveryPayment((current) => ({
                              ...current,
                              finalAmount: Math.max(
                                0,
                                Number(event.target.value || 0),
                              ),
                            }))
                          }
                          className="mt-1 h-11 w-full rounded-xl border px-3 font-bold"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black text-zinc-600">
                          Khách thanh toán hôm nay
                        </span>
                        <input
                          type="number"
                          min={0}
                          max={deliveryPayment.finalAmount}
                          value={deliveryPayment.paidAmount}
                          onChange={(event) =>
                            setDeliveryPayment((current) => ({
                              ...current,
                              paidAmount: Math.max(
                                0,
                                Number(event.target.value || 0),
                              ),
                            }))
                          }
                          className="mt-1 h-11 w-full rounded-xl border px-3 font-bold"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-black text-zinc-600">
                          Hình thức thu
                        </span>
                        <select
                          value={deliveryPayment.paymentMethod}
                          onChange={(event) =>
                            setDeliveryPayment((current) => ({
                              ...current,
                              paymentMethod: event.target.value as
                                "CASH" | "BANK" | "DEBT",
                              fundId: "",
                            }))
                          }
                          className="mt-1 h-11 w-full rounded-xl border px-3"
                        >
                          <option value="CASH">Tiền mặt</option>
                          <option value="BANK">Chuyển khoản</option>
                          <option value="DEBT">Ghi nợ</option>
                        </select>
                      </label>
                      {deliveryPayment.paidAmount > 0 &&
                        deliveryPayment.paymentMethod !== "DEBT" && (
                          <label className="block">
                            <span className="text-xs font-black text-zinc-600">
                              Quỹ nhận tiền
                            </span>
                            <select
                              value={deliveryPayment.fundId}
                              onChange={(event) =>
                                setDeliveryPayment((current) => ({
                                  ...current,
                                  fundId: event.target.value,
                                }))
                              }
                              className="mt-1 h-11 w-full rounded-xl border px-3"
                            >
                              <option value="">Chọn quỹ nhận</option>
                              {customerPaymentFunds
                                .filter(
                                  (fund) =>
                                    String(fund.type).toUpperCase() ===
                                    deliveryPayment.paymentMethod,
                                )
                                .map((fund) => (
                                  <option key={fund.id} value={fund.id}>
                                    {fund.name}
                                  </option>
                                ))}
                            </select>
                          </label>
                        )}
                      <label className="block sm:col-span-2">
                        <span className="text-xs font-black text-zinc-600">
                          Ghi chú thu tiền (không bắt buộc)
                        </span>
                        <input
                          value={deliveryPayment.note}
                          onChange={(event) =>
                            setDeliveryPayment((current) => ({
                              ...current,
                              note: event.target.value,
                            }))
                          }
                          placeholder="Ví dụ: khách chuyển khoản, hẹn trả phần còn lại..."
                          className="mt-1 h-11 w-full rounded-xl border px-3 text-sm"
                        />
                      </label>
                    </div>
                    <div className="mt-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-950">
                      <p className="flex justify-between">
                        <span>Đã thu</span>
                        <strong>
                          {money.format(
                            Number(deliveryPayment.paidAmount || 0),
                          )}
                        </strong>
                      </p>
                      <p className="mt-1 flex justify-between">
                        <span>Còn nợ</span>
                        <strong>
                          {money.format(
                            Math.max(
                              0,
                              Number(deliveryPayment.finalAmount || 0) -
                                Number(deliveryPayment.paidAmount || 0),
                            ),
                          )}
                        </strong>
                      </p>
                    </div>
                    <textarea
                      value={deliveryNotes}
                      onChange={(event) => setDeliveryNotes(event.target.value)}
                      rows={3}
                      placeholder="Tình trạng bàn giao, phụ kiện đi kèm, người nhận..."
                      className="mt-4 w-full rounded-xl border p-3 text-sm"
                    />
                    <button
                      disabled={
                        saving ||
                        !canDeliverCustomer ||
                        workOrder.status !== "QC_PASSED" ||
                        deliveryNotes.trim().length < 5 ||
                        deliveryPayment.paidAmount >
                          deliveryPayment.finalAmount ||
                        (deliveryPayment.paidAmount > 0 &&
                          deliveryPayment.paymentMethod !== "DEBT" &&
                          !deliveryPayment.fundId)
                      }
                      onClick={() =>
                        void run(
                          () =>
                            requestDeliverToCustomer(
                              workOrderId,
                              deliveryNotes.trim(),
                              {
                                finalAmount: Number(
                                  deliveryPayment.finalAmount || 0,
                                ),
                                paidAmount: Number(
                                  deliveryPayment.paidAmount || 0,
                                ),
                                paymentMethod: deliveryPayment.paymentMethod,
                                fundId:
                                  deliveryPayment.paidAmount > 0 &&
                                  deliveryPayment.paymentMethod !== "DEBT"
                                    ? deliveryPayment.fundId
                                    : undefined,
                                note: deliveryPayment.note.trim() || undefined,
                              },
                            ),
                          "Đã bàn giao máy, ghi nhận khoản thu và chốt điều kiện hoa hồng.",
                        )
                      }
                      className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40"
                    >
                      Xác nhận giao máy & thu tiền
                    </button>
                    {!canDeliverCustomer && (
                      <p className="mt-2 text-xs text-amber-700">
                        Chỉ Sales, Trưởng kỹ thuật, Manager hoặc Admin được bàn
                        giao.
                      </p>
                    )}
                  </section>
                ) : (
                  <section className="mx-auto max-w-xl rounded-2xl border bg-white p-5">
                    <h3 className="font-black">Kho quét nhận máy sau sửa</h3>
                    <p className="mt-1 text-sm text-zinc-500">
                      Chỉ mở nhập kho khi QC đạt, linh kiện đã đối soát và giá
                      vốn đã POSTED.
                    </p>
                    <select
                      value={returnWarehouseId}
                      onChange={(event) =>
                        setReturnWarehouseId(event.target.value)
                      }
                      className="mt-4 h-11 w-full rounded-xl border px-3"
                    >
                      <option value="">Chọn kho nhận</option>
                      {eligiblePartWarehouses
                        .filter((item) =>
                          ["CENTRAL", "RETAIL_STORE"].includes(
                            String(item.type || ""),
                          ),
                        )
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </select>
                    <label className="mt-3 block">
                      <span className="text-xs font-black">
                        Quét IMEI thực nhận
                      </span>
                      <div className="relative mt-1">
                        <ScanLine className="absolute left-3 top-3 h-5 w-5 text-zinc-400" />
                        <input
                          value={returnScannedImei}
                          onChange={(event) =>
                            setReturnScannedImei(
                              event.target.value
                                .replace(/\D/g, "")
                                .slice(0, 15),
                            )
                          }
                          className="h-11 w-full rounded-xl border pl-11 pr-3 font-mono"
                          placeholder={workOrder.imei || "IMEI 5–15 số"}
                        />
                      </div>
                    </label>
                    <div className="mt-4 rounded-xl bg-zinc-50 p-3 text-sm">
                      <p className="flex justify-between">
                        <span>QC</span>
                        <strong>
                          {workOrder.status === "QC_PASSED"
                            ? "Đạt"
                            : workOrder.status}
                        </strong>
                      </p>
                      <p className="mt-2 flex justify-between">
                        <span>Giá vốn</span>
                        <strong>{details?.costPostingStatus}</strong>
                      </p>
                    </div>
                    <button
                      disabled={
                        saving ||
                        !canReturnStock ||
                        details?.costPostingStatus !== "POSTED" ||
                        !returnWarehouseId ||
                        !returnScannedImei
                      }
                      onClick={() =>
                        void run(
                          () =>
                            requestReturnToStock(
                              workOrderId,
                              returnWarehouseId,
                              returnScannedImei,
                            ),
                          "Đã nhận lại đúng IMEI và mở tồn kho bán.",
                        )
                      }
                      className="mt-4 w-full rounded-xl bg-emerald-600 py-3 text-sm font-black text-white disabled:opacity-40"
                    >
                      Quét nhận và nhập lại kho
                    </button>
                    {!canReturnStock && (
                      <p className="mt-2 text-xs text-amber-700">
                        Chỉ quản lý kho, Manager hoặc Admin được xác nhận nhận
                        lại.
                      </p>
                    )}
                  </section>
                ))}
            </>
          )}
        </main>
      </aside>
    </div>
  );
};
