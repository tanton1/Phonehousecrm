import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Clock3,
  Eye,
  ExternalLink,
  Loader2,
  Phone,
  RefreshCw,
  Save,
  Search,
  Settings2,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Trash2,
  UserRound,
  Wrench,
} from "lucide-react";
import type { StoreBranch, UserAccount } from "../types";
import { apiJson } from "../services/apiClient";

type QuoteType = "DEVICE" | "REPAIR" | "ACCESSORY";
type QuoteRequest = {
  id: string;
  leadId?: string;
  requestCode: string;
  quoteType: QuoteType;
  branchId: string;
  branchName: string;
  customerName: string;
  customerPhone: string;
  contactChannel: "CALL" | "ZALO";
  note?: string;
  lines: Array<{
    name: string;
    quantity: number;
    unitPrice: number;
    lineTotal: number;
    inspectionRequired?: boolean;
  }>;
  estimatedTotal: number;
  status: string;
  assignedStaffId?: string;
  assignedStaffName?: string;
  officialQuoteCode?: string;
  responseDueAt: string;
  expiresAt: string;
  createdAt: string;
};
type Settings = {
  enabled: boolean;
  validityHours: number;
  responseSlaMinutes: number;
  disclaimer: string;
  maxRepairLines: number;
  maxAccessoryLines: number;
  fallbackBranchId: string;
};
type CatalogItem = {
  id: string;
  kind: QuoteType;
  name: string;
  detail: string;
  price: number;
  publicVisible: boolean;
  publicName?: string;
  publicDescription?: string;
  imageUrl?: string;
  quoteMode?: string;
  publicSortOrder?: number;
  variantKey?: string;
  stockCount?: number;
  colors?: string[];
  configured?: boolean;
};

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const typeLabels: Record<QuoteType, string> = {
  DEVICE: "iPhone",
  REPAIR: "Sửa chữa",
  ACCESSORY: "Phụ kiện",
};
const statusLabels: Record<string, string> = {
  NEW: "Chưa phân công",
  ASSIGNED: "Đã phân công",
  CONTACTED: "Đã liên hệ",
  QUOTED: "Đã báo giá",
  CONVERTED: "Đã chuyển đổi",
  CLOSED: "Đã đóng",
  SPAM: "Spam",
};

export function QuickQuoteRequestsView({
  currentUser,
  branches,
  onOpenLead,
  initialMode = "QUEUE",
  settingsOnly = false,
}: {
  currentUser?: UserAccount | null;
  branches: StoreBranch[];
  onOpenLead?: (leadId?: string) => void;
  initialMode?: "QUEUE" | "SETTINGS";
  settingsOnly?: boolean;
}) {
  const manager = [
    "ADMIN",
    "REGIONAL_MANAGER",
    "MANAGER",
    "STORE_MANAGER",
  ].includes(String(currentUser?.role || ""));
  const [mode, setMode] = useState<"QUEUE" | "SETTINGS">(initialMode);
  const [items, setItems] = useState<QuoteRequest[]>([]);
  const [status, setStatus] = useState("");
  const [quoteType, setQuoteType] = useState("");
  const [branchId, setBranchId] = useState(
    String(
      currentUser?.branchId ||
        branches.find((branch) => branch.isActive !== false)?.id ||
        "",
    ),
  );
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [settings, setSettings] = useState<Settings>({
    enabled: true,
    validityHours: 24,
    responseSlaMinutes: 15,
    disclaimer: "",
    maxRepairLines: 10,
    maxAccessoryLines: 20,
    fallbackBranchId: "",
  });
  const [catalogKind, setCatalogKind] = useState<QuoteType>("DEVICE");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [catalogSearch, setCatalogSearch] = useState("");
  const [catalogVisibility, setCatalogVisibility] = useState<
    "ALL" | "PUBLIC" | "HIDDEN"
  >("ALL");

  const loadQueue = useCallback(async () => {
    if (!branchId) return;
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        branchId,
        ...(status ? { status } : {}),
        ...(quoteType ? { quoteType } : {}),
      });
      const response = await apiJson<{
        success: boolean;
        data: QuoteRequest[];
      }>(`/api/customer-portal/staff/quick-quote/requests?${params}`);
      setItems(response.data || []);
    } catch (loadError: any) {
      setError(loadError?.message || "Không tải được hàng chờ báo giá.");
    } finally {
      setLoading(false);
    }
  }, [branchId, quoteType, status]);

  const loadSettings = useCallback(async () => {
    if (!manager) return;
    try {
      const response = await apiJson<{ success: boolean; data: Settings }>(
        "/api/customer-portal/staff/quick-quote/settings",
      );
      setSettings(response.data);
    } catch (loadError: any) {
      setError(loadError?.message || "Không tải được cấu hình miniweb.");
    }
  }, [manager]);

  const loadCatalog = useCallback(async () => {
    if (!manager || (catalogKind !== "REPAIR" && !branchId)) return;
    setCatalogLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({
        kind: catalogKind,
        ...(branchId ? { branchId } : {}),
      });
      const response = await apiJson<{ success: boolean; data: CatalogItem[] }>(
        `/api/customer-portal/staff/quick-quote/catalog?${params}`,
      );
      setCatalog(response.data || []);
    } catch (loadError: any) {
      setError(loadError?.message || "Không tải được danh mục công khai.");
    } finally {
      setCatalogLoading(false);
    }
  }, [branchId, catalogKind, manager]);

  useEffect(() => {
    if (mode === "QUEUE") void loadQueue();
    else {
      void loadSettings();
      void loadCatalog();
    }
  }, [loadCatalog, loadQueue, loadSettings, mode]);

  const updateStatus = async (
    item: QuoteRequest,
    nextStatus: "CONTACTED" | "CLOSED" | "SPAM",
  ) => {
    const note =
      nextStatus === "CONTACTED"
        ? window.prompt("Ghi chú kết quả liên hệ (không bắt buộc):", "") || ""
        : window.prompt(
            nextStatus === "SPAM"
              ? "Lý do đánh dấu spam:"
              : "Lý do đóng yêu cầu:",
            "",
          ) || "";
    setBusy(item.id);
    setError("");
    try {
      await apiJson(
        `/api/customer-portal/staff/quick-quote/requests/${encodeURIComponent(item.id)}`,
        { method: "PATCH", body: JSON.stringify({ status: nextStatus, note }) },
      );
      await loadQueue();
    } catch (actionError: any) {
      setError(actionError?.message || "Không cập nhật được yêu cầu.");
    } finally {
      setBusy("");
    }
  };

  const confirmQuote = async (item: QuoteRequest) => {
    if (item.lines.some((line) => line.inspectionRequired)) {
      setError(
        "Yêu cầu này có hạng mục cần kiểm tra máy. Hãy liên hệ khách và tạo báo giá chính thức sau khi có giá thực tế.",
      );
      return;
    }
    setBusy(item.id);
    setError("");
    try {
      const response = await apiJson<{
        success: boolean;
        data: { quote: { quoteCode: string; finalPrice: number } };
      }>(
        `/api/customer-portal/staff/quick-quote/requests/${encodeURIComponent(item.id)}/confirm`,
        {
          method: "POST",
          body: JSON.stringify({ validityHours: settings.validityHours || 24 }),
        },
      );
      setMessage(
        `Đã tạo báo giá ${response.data.quote.quoteCode} · ${money.format(response.data.quote.finalPrice)}.`,
      );
      await loadQueue();
    } catch (actionError: any) {
      setError(actionError?.message || "Không xác nhận được báo giá.");
    } finally {
      setBusy("");
    }
  };

  const saveSettings = async () => {
    setBusy("settings");
    setError("");
    setMessage("");
    try {
      const response = await apiJson<{ success: boolean; data: Settings }>(
        "/api/customer-portal/staff/quick-quote/settings",
        { method: "PUT", body: JSON.stringify(settings) },
      );
      setSettings(response.data);
      setMessage("Đã lưu cấu hình miniweb báo giá.");
    } catch (saveError: any) {
      setError(saveError?.message || "Không lưu được cấu hình.");
    } finally {
      setBusy("");
    }
  };

  const updateCatalog = async (
    item: CatalogItem,
    patch: Partial<CatalogItem>,
  ) => {
    setBusy(item.id);
    setError("");
    try {
      await apiJson(
        `/api/customer-portal/staff/quick-quote/catalog/${item.kind}/${encodeURIComponent(item.id)}`,
        {
          method: "PATCH",
          body: JSON.stringify({ ...item, ...patch, branchId }),
        },
      );
      setCatalog((current) =>
        current.map((row) => (row.id === item.id ? { ...row, ...patch } : row)),
      );
    } catch (saveError: any) {
      setError(
        saveError?.message || "Không cập nhật được trạng thái công khai.",
      );
    } finally {
      setBusy("");
    }
  };

  const editCatalogPresentation = async (item: CatalogItem) => {
    const publicName = window.prompt(
      "Tên hiển thị công khai:",
      item.publicName || item.name,
    );
    if (publicName === null) return;
    const publicDescription = window.prompt(
      "Mô tả ngắn công khai:",
      item.publicDescription || "",
    );
    if (publicDescription === null) return;
    const imageUrl = window.prompt(
      "URL ảnh công khai (có thể để trống):",
      item.imageUrl || "",
    );
    if (imageUrl === null) return;
    await updateCatalog(item, { publicName, publicDescription, imageUrl });
  };

  const overdueCount = useMemo(
    () =>
      items.filter(
        (item) =>
          !["QUOTED", "CONVERTED", "CLOSED", "SPAM"].includes(item.status) &&
          Date.parse(item.responseDueAt) < Date.now(),
      ).length,
    [items],
  );
  const visibleCatalog = useMemo(() => {
    const keyword = catalogSearch.trim().toLocaleLowerCase("vi");
    return catalog.filter((item) => {
      if (catalogVisibility === "PUBLIC" && !item.publicVisible) return false;
      if (catalogVisibility === "HIDDEN" && item.publicVisible) return false;
      if (!keyword) return true;
      return [item.name, item.publicName, item.detail, item.publicDescription]
        .filter(Boolean)
        .some((value) =>
          String(value).toLocaleLowerCase("vi").includes(keyword),
        );
    });
  }, [catalog, catalogSearch, catalogVisibility]);

  const setVisibleCatalogPublic = async (publicVisible: boolean) => {
    const targets = visibleCatalog.filter(item => item.publicVisible !== publicVisible);
    if (!targets.length) {
      setMessage(publicVisible ? 'Tất cả mục đang lọc đã được công khai.' : 'Tất cả mục đang lọc đã được ẩn.');
      return;
    }
    setBusy('catalog-bulk');
    setError('');
    setMessage('');
    try {
      for (let offset = 0; offset < targets.length; offset += 10) {
        await Promise.all(targets.slice(offset, offset + 10).map(item => apiJson(
          `/api/customer-portal/staff/quick-quote/catalog/${item.kind}/${encodeURIComponent(item.id)}`,
          { method: 'PATCH', body: JSON.stringify({ ...item, branchId, publicVisible }) }
        )));
      }
      const targetIds = new Set(targets.map(item => item.id));
      setCatalog(current => current.map(item => targetIds.has(item.id) ? { ...item, publicVisible } : item));
      setMessage(`Đã ${publicVisible ? 'công khai' : 'ẩn'} ${targets.length} mục tại chi nhánh đang chọn.`);
    } catch (saveError: any) {
      setError(saveError?.message || 'Không thể cập nhật hàng loạt danh mục.');
      await loadCatalog();
    } finally {
      setBusy('');
    }
  };

  return (
    <main className="space-y-4">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">
            PhoneHouse Care
          </p>
          <h1 className="mt-1 text-2xl font-black">Báo giá từ miniweb</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Tiếp nhận, xác nhận giá và chuyển đổi yêu cầu công khai thành báo
            giá CRM.
          </p>
        </div>
        {!settingsOnly && (
          <div className="flex gap-2">
            <button
              onClick={() => setMode("QUEUE")}
              className={`min-h-11 rounded-xl px-4 text-xs font-black ${mode === "QUEUE" ? "bg-zinc-950 text-white" : "border bg-white"}`}
            >
              Hàng chờ
            </button>
            {manager && (
              <button
                onClick={() => setMode("SETTINGS")}
                className={`min-h-11 rounded-xl px-4 text-xs font-black ${mode === "SETTINGS" ? "bg-zinc-950 text-white" : "border bg-white"}`}
              >
                <Settings2 className="mr-1 inline h-4 w-4" />
                Cài đặt
              </button>
            )}
          </div>
        )}
      </header>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700"
        >
          {error}
        </p>
      )}
      {message && (
        <p className="rounded-xl bg-emerald-50 p-3 text-sm font-bold text-emerald-700">
          {message}
        </p>
      )}
      {mode === "QUEUE" ? (
        <>
          <section className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border bg-white p-4">
              <p className="text-xs font-bold text-zinc-400">Tổng hàng chờ</p>
              <p className="mt-1 text-2xl font-black">{items.length}</p>
            </div>
            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4">
              <p className="text-xs font-bold text-rose-500">
                Quá SLA phản hồi
              </p>
              <p className="mt-1 text-2xl font-black text-rose-700">
                {overdueCount}
              </p>
            </div>
            <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">
              <p className="text-xs font-bold text-emerald-600">Đã báo giá</p>
              <p className="mt-1 text-2xl font-black text-emerald-700">
                {items.filter((item) => item.status === "QUOTED").length}
              </p>
            </div>
          </section>
          <div className="flex flex-wrap gap-2">
            <select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
              className="min-h-11 rounded-xl border bg-white px-3 text-xs font-black"
            >
              {branches
                .filter((branch) => branch.isActive !== false)
                .map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
            </select>
            <select
              value={quoteType}
              onChange={(event) => setQuoteType(event.target.value)}
              className="min-h-11 rounded-xl border bg-white px-3 text-xs font-black"
            >
              <option value="">Tất cả loại</option>
              <option value="DEVICE">iPhone</option>
              <option value="REPAIR">Sửa chữa</option>
              <option value="ACCESSORY">Phụ kiện</option>
            </select>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="min-h-11 rounded-xl border bg-white px-3 text-xs font-black"
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <button
              onClick={() => void loadQueue()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border bg-white px-3 text-xs font-black"
            >
              <RefreshCw
                className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Làm mới
            </button>
          </div>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
            </div>
          ) : !items.length ? (
            <div className="rounded-2xl border border-dashed bg-white p-12 text-center text-sm text-zinc-500">
              <CheckCircle2 className="mx-auto mb-2 h-9 w-9 text-zinc-300" />
              Không có yêu cầu phù hợp.
            </div>
          ) : (
            <div className="space-y-3">
              {items.map((item) => {
                const overdue =
                  !["QUOTED", "CONVERTED", "CLOSED", "SPAM"].includes(
                    item.status,
                  ) && Date.parse(item.responseDueAt) < Date.now();
                return (
                  <article
                    key={item.id}
                    className={`rounded-2xl border bg-white p-4 shadow-sm ${overdue ? "border-rose-300" : "border-zinc-200"}`}
                  >
                    <div className="flex flex-col justify-between gap-4 lg:flex-row">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono text-sm font-black text-[#ff4b16]">
                            {item.requestCode}
                          </span>
                          <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black">
                            {typeLabels[item.quoteType]}
                          </span>
                          <span className="rounded-full bg-sky-50 px-2 py-1 text-[10px] font-black text-sky-700">
                            {statusLabels[item.status] || item.status}
                          </span>
                          {overdue && (
                            <span className="rounded-full bg-rose-100 px-2 py-1 text-[10px] font-black text-rose-700">
                              Quá SLA
                            </span>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
                          <b className="text-zinc-950">{item.customerName}</b>
                          <a
                            href={`tel:${item.customerPhone}`}
                            className="font-mono font-bold text-sky-700"
                          >
                            {item.customerPhone}
                          </a>
                          <span className="text-zinc-500">
                            {item.contactChannel === "ZALO"
                              ? "Ưu tiên Zalo"
                              : "Ưu tiên gọi điện"}
                          </span>
                        </div>
                        <div className="mt-3 divide-y rounded-xl border border-zinc-100">
                          {item.lines.map((line, index) => (
                            <div
                              key={`${line.name}-${index}`}
                              className="flex justify-between gap-3 px-3 py-2 text-xs"
                            >
                              <span className="min-w-0 truncate font-bold">
                                {line.name} × {line.quantity}
                              </span>
                              <b className="shrink-0">
                                {line.inspectionRequired
                                  ? "Cần kiểm tra"
                                  : money.format(line.lineTotal)}
                              </b>
                            </div>
                          ))}
                        </div>
                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                          <div className="text-xs text-zinc-500">
                            <p>
                              {item.branchName} ·{" "}
                              {new Date(item.createdAt).toLocaleString("vi-VN")}
                            </p>
                            <p className="mt-1">
                              <UserRound className="mr-1 inline h-3 w-3" />
                              {item.assignedStaffName ||
                                "Hàng chờ chưa phân công"}
                            </p>
                          </div>
                          <p className="text-lg font-black text-[#ff4b16]">
                            {money.format(item.estimatedTotal)}
                          </p>
                        </div>
                        {item.note && (
                          <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-900">
                            {item.note}
                          </p>
                        )}
                        {item.officialQuoteCode && (
                          <p className="mt-2 text-xs font-black text-emerald-700">
                            Báo giá chính thức: {item.officialQuoteCode}
                          </p>
                        )}
                      </div>
                      <div className="flex shrink-0 flex-wrap content-start gap-2 lg:max-w-[260px]">
                        {!["QUOTED", "CONVERTED", "CLOSED", "SPAM"].includes(
                          item.status,
                        ) && (
                          <>
                            <button
                              onClick={() =>
                                void updateStatus(item, "CONTACTED")
                              }
                              disabled={busy === item.id}
                              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-sky-200 px-3 text-xs font-black text-sky-700"
                            >
                              <Phone className="h-4 w-4" />
                              Đã liên hệ
                            </button>
                            <button
                              onClick={() => void confirmQuote(item)}
                              disabled={busy === item.id}
                              className="inline-flex min-h-11 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"
                            >
                              <ShieldCheck className="h-4 w-4" />
                              Xác nhận giá
                            </button>
                            <button
                              onClick={() => void updateStatus(item, "CLOSED")}
                              disabled={busy === item.id}
                              className="min-h-11 rounded-xl border px-3 text-xs font-black"
                            >
                              Đóng
                            </button>
                            <button
                              onClick={() => void updateStatus(item, "SPAM")}
                              disabled={busy === item.id}
                              className="inline-flex min-h-11 items-center gap-1 rounded-xl border border-rose-200 px-3 text-xs font-black text-rose-600"
                            >
                              <Trash2 className="h-4 w-4" />
                              Spam
                            </button>
                          </>
                        )}
                        {item.officialQuoteCode && (
                          <button
                            className="inline-flex min-h-11 items-center gap-1 rounded-xl border px-3 text-xs font-black"
                            onClick={() => onOpenLead?.(item.leadId)}
                          >
                            <ExternalLink className="h-4 w-4" />
                            Mở CRM
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </>
      ) : (
        <>
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-black">Cấu hình vận hành</h2>
                <p className="text-xs text-zinc-500">
                  Giá luôn lấy từ bảng giá và dữ liệu tồn; đây chỉ là cấu hình
                  hành vi miniweb.
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm font-black">
                <input
                  type="checkbox"
                  checked={settings.enabled}
                  onChange={(event) =>
                    setSettings({ ...settings, enabled: event.target.checked })
                  }
                  className="h-5 w-5 accent-orange-600"
                />
                Kích hoạt
              </label>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-bold">
                Hiệu lực báo giá (giờ)
                <input
                  type="number"
                  min="1"
                  max="168"
                  value={settings.validityHours}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      validityHours: Number(event.target.value),
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold">
                SLA phản hồi (phút)
                <input
                  type="number"
                  min="1"
                  max="1440"
                  value={settings.responseSlaMinutes}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      responseSlaMinutes: Number(event.target.value),
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold">
                Tối đa dịch vụ sửa
                <input
                  type="number"
                  min="1"
                  max="10"
                  value={settings.maxRepairLines}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      maxRepairLines: Number(event.target.value),
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold">
                Tối đa SKU phụ kiện
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={settings.maxAccessoryLines}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      maxAccessoryLines: Number(event.target.value),
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Chi nhánh mặc định khi khách mở miniweb
                <select
                  value={settings.fallbackBranchId || ""}
                  onChange={(event) =>
                    setSettings({
                      ...settings,
                      fallbackBranchId: event.target.value,
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border bg-white px-3"
                >
                  <option value="">Chi nhánh đầu tiên đang hoạt động</option>
                  {branches
                    .filter((branch) => branch.isActive !== false)
                    .map((branch) => (
                      <option key={branch.id} value={branch.id}>
                        {branch.name}
                      </option>
                    ))}
                </select>
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Lưu ý hiển thị cho khách
                <textarea
                  value={settings.disclaimer}
                  onChange={(event) =>
                    setSettings({ ...settings, disclaimer: event.target.value })
                  }
                  className="mt-1 min-h-24 w-full rounded-xl border p-3"
                />
              </label>
              <p className="rounded-xl bg-amber-50 p-3 text-xs leading-5 text-amber-800 sm:col-span-2">
                Nếu không có Sale đang trong ca, yêu cầu sẽ ở trạng thái chưa
                phân công để quản lý nhận việc. Hệ thống không tự gán cho tài
                khoản ngoài ca.
              </p>
            </div>
            <button
              onClick={() => void saveSettings()}
              disabled={busy === "settings"}
              className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ff4b16] px-4 text-xs font-black text-white"
            >
              <Save className="h-4 w-4" />
              Lưu cấu hình
            </button>
          </section>
          <section className="rounded-2xl border bg-white p-4 shadow-sm">
            <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
              <div>
                <h2 className="font-black">
                  Sản phẩm hiển thị trên trang báo giá
                </h2>
                <p className="max-w-2xl text-xs leading-5 text-zinc-500">
                  iPhone được quản lý theo <b>model + dung lượng + tình trạng</b>, không còn bật từng IMEI.
                  Một lần bật sẽ áp dụng cho toàn bộ máy cùng biến thể tại chi nhánh và tự ẩn khi hết tồn.
                  Khách không thấy IMEI, giá vốn, số tồn thực hay dữ liệu kho;
                  giá cuối cùng luôn được máy chủ xác nhận lại.
                </p>
              </div>
              <div className="flex gap-2">
                <select
                  value={catalogKind}
                  onChange={(event) =>
                    setCatalogKind(event.target.value as QuoteType)
                  }
                  className="min-h-11 rounded-xl border bg-white px-3 text-xs font-black"
                >
                  <option value="DEVICE">iPhone</option>
                  <option value="REPAIR">Sửa chữa</option>
                  <option value="ACCESSORY">Phụ kiện</option>
                </select>
                <button
                  onClick={() => void loadCatalog()}
                  className="flex min-h-11 items-center gap-1 rounded-xl border px-3 text-xs font-black"
                >
                  <RefreshCw
                    className={
                      catalogLoading ? "h-4 w-4 animate-spin" : "h-4 w-4"
                    }
                  />
                  Tải
                </button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_auto]">
              <label className="relative block">
                <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
                <input
                  value={catalogSearch}
                  onChange={(event) => setCatalogSearch(event.target.value)}
                  className="h-11 w-full rounded-xl border border-zinc-200 pl-10 pr-3 text-sm"
                  placeholder="Tìm tên sản phẩm, model hoặc mô tả…"
                />
              </label>
              <select
                value={catalogVisibility}
                onChange={(event) =>
                  setCatalogVisibility(
                    event.target.value as "ALL" | "PUBLIC" | "HIDDEN",
                  )
                }
                className="min-h-11 rounded-xl border bg-white px-3 text-xs font-black"
              >
                <option value="ALL">Tất cả trạng thái</option>
                <option value="PUBLIC">Đang công khai</option>
                <option value="HIDDEN">Đang ẩn</option>
              </select>
              <a
                href="/khach-hang/bao-gia"
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center gap-1 rounded-xl border border-orange-200 bg-orange-50 px-3 text-xs font-black text-orange-700"
              >
                <Eye className="h-4 w-4" />
                Xem miniweb
              </a>
            </div>
            {catalogKind === 'DEVICE' && visibleCatalog.length > 0 && (
              <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl bg-sky-50 p-2.5">
                <span className="mr-auto text-[11px] font-bold text-sky-800">Thao tác trên {visibleCatalog.length} biến thể đang lọc · {branchId}</span>
                <button type="button" onClick={() => void setVisibleCatalogPublic(true)} disabled={busy === 'catalog-bulk'} className="min-h-9 rounded-lg bg-sky-700 px-3 text-[11px] font-black text-white disabled:opacity-50">Công khai tất cả</button>
                <button type="button" onClick={() => void setVisibleCatalogPublic(false)} disabled={busy === 'catalog-bulk'} className="min-h-9 rounded-lg border border-sky-200 bg-white px-3 text-[11px] font-black text-sky-800 disabled:opacity-50">Ẩn tất cả</button>
              </div>
            )}
            {catalogLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
              </div>
            ) : (
              <div className="mt-4 max-h-[620px] space-y-2 overflow-y-auto">
                {visibleCatalog.map((item) => {
                  const Icon =
                    item.kind === "DEVICE"
                      ? Smartphone
                      : item.kind === "REPAIR"
                        ? Wrench
                        : ShoppingBag;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col justify-between gap-3 rounded-xl border p-3 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 items-center gap-3">
                        {item.imageUrl ? (
                          <img
                            src={item.imageUrl}
                            alt=""
                            className="h-12 w-12 shrink-0 rounded-xl bg-zinc-100 object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="rounded-xl bg-orange-50 p-2 text-orange-600">
                            <Icon className="h-5 w-5" />
                          </div>
                        )}
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black">
                            {item.name}
                          </p>
                          <p className="truncate text-xs text-zinc-500">
                            {item.detail} ·{" "}
                            {item.price
                              ? money.format(item.price)
                              : "Cần kiểm tra"}
                          </p>
                          {item.kind === "DEVICE" && (
                            <p className="mt-1 text-[10px] font-bold text-sky-700">
                              {item.configured ? "Đã có cấu hình biến thể" : "Đang kế thừa trạng thái công khai cũ"}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                        <span
                          className={`rounded-full px-2 py-1 text-[10px] font-black ${item.publicVisible ? "bg-emerald-50 text-emerald-700" : "bg-zinc-100 text-zinc-500"}`}
                        >
                          {item.publicVisible ? "Đang công khai" : "Đang ẩn"}
                        </span>
                        <button
                          onClick={() => void editCatalogPresentation(item)}
                          disabled={busy === item.id}
                          className="min-h-11 rounded-xl border px-3 text-xs font-black text-sky-700"
                        >
                          Sửa nội dung
                        </button>
                        {item.kind === "REPAIR" && (
                          <button
                            onClick={() =>
                              void updateCatalog(item, {
                                quoteMode:
                                  item.quoteMode === "INSPECTION_REQUIRED"
                                    ? "FIXED"
                                    : "INSPECTION_REQUIRED",
                              })
                            }
                            disabled={busy === item.id}
                            className="min-h-11 rounded-xl border px-3 text-xs font-black text-amber-700"
                          >
                            {item.quoteMode === "INSPECTION_REQUIRED"
                              ? "Dùng giá cố định"
                              : "Yêu cầu kiểm tra"}
                          </button>
                        )}
                        <button
                          onClick={() =>
                            void updateCatalog(item, {
                              publicVisible: !item.publicVisible,
                            })
                          }
                          disabled={busy === item.id}
                          className={`min-h-11 rounded-xl px-3 text-xs font-black ${item.publicVisible ? "border text-zinc-600" : "bg-zinc-950 text-white"}`}
                        >
                          {item.publicVisible ? "Ẩn khỏi web" : "Bật công khai"}
                        </button>
                      </div>
                    </div>
                  );
                })}
                {!visibleCatalog.length && (
                  <p className="py-10 text-center text-sm text-zinc-500">
                    Không có sản phẩm phù hợp với bộ lọc.
                  </p>
                )}
              </div>
            )}
          </section>
        </>
      )}
    </main>
  );
}

export default QuickQuoteRequestsView;
