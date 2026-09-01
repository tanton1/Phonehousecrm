import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  BatteryCharging,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Copy,
  Filter,
  Headphones,
  Loader2,
  MapPin,
  MessageCircle,
  Minus,
  PackageCheck,
  Phone,
  Plus,
  Search,
  ShieldCheck,
  ShoppingBag,
  Smartphone,
  Sparkles,
  Wrench,
  X,
} from "lucide-react";
import { ApiClientError } from "../services/apiClient";
import {
  createQuickQuoteRequest,
  quickQuoteAccessories,
  quickQuoteBootstrap,
  quickQuoteDevices,
  quickQuoteRepairServices,
  trackQuickQuoteEvent,
  type QuickQuoteAccessoryOffer,
  type QuickQuoteBootstrap,
  type QuickQuoteDeviceOffer,
  type QuickQuoteRepairOffer,
  type QuickQuoteRequestResult,
  type QuickQuoteType,
} from "../services/customerPortalApiClient";

const money = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND",
  maximumFractionDigits: 0,
});
const quoteTabs: Array<{
  id: QuickQuoteType;
  label: string;
  short: string;
  icon: React.ElementType;
}> = [
  { id: "DEVICE", label: "Báo giá iPhone", short: "iPhone", icon: Smartphone },
  { id: "REPAIR", label: "Giá sửa chữa", short: "Sửa chữa", icon: Wrench },
  {
    id: "ACCESSORY",
    label: "Giá phụ kiện",
    short: "Phụ kiện",
    icon: ShoppingBag,
  },
];

type SelectedLine = {
  token: string;
  name: string;
  unitPrice: number;
  quantity: number;
  inspectionRequired?: boolean;
};

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}
function unique(values: Array<string | null | undefined>) {
  return [
    ...new Set(
      values.map((value) => String(value || "").trim()).filter(Boolean),
    ),
  ].sort((a, b) => a.localeCompare(b, "vi"));
}
function analyticsSessionId() {
  if (typeof window === "undefined") return crypto.randomUUID();
  const key = "phonehouse_quick_quote_analytics_session";
  const existing = window.sessionStorage.getItem(key);
  if (existing) return existing;
  const created = crypto.randomUUID();
  window.sessionStorage.setItem(key, created);
  return created;
}

function OfferImage({
  url,
  icon: Icon,
}: {
  url?: string | null;
  icon: React.ElementType;
}) {
  return (
    <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-orange-50 to-zinc-100 text-orange-500">
      {url ? (
        <img src={url} alt="" className="h-full w-full object-cover" />
      ) : (
        <Icon className="h-8 w-8" />
      )}
    </div>
  );
}

function FilterSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 sm:hidden">
      <button
        aria-label="Đóng bộ lọc"
        className="absolute inset-0"
        onClick={onClose}
      />
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="quick-quote-filter-title"
        className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-[2rem] bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))]"
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <p id="quick-quote-filter-title" className="font-black text-zinc-950">
              Bộ lọc
            </p>
            <p className="text-xs text-zinc-500">
              Thu hẹp kết quả phù hợp nhất
            </p>
          </div>
          <button
            aria-label="Đóng bộ lọc"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
        <button
          onClick={onClose}
          className="mt-4 min-h-12 w-full rounded-2xl bg-zinc-950 text-sm font-black text-white"
        >
          Xem kết quả
        </button>
      </section>
    </div>
  );
}

function FilterFields({
  type,
  branchId,
  setBranchId,
  branches,
  search,
  setSearch,
  deviceFilters,
  setDeviceFilters,
  deviceOptions,
  repairModel,
  setRepairModel,
  repairModels,
  accessoryFilters,
  setAccessoryFilters,
  accessoryOptions,
}: any) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <label className="text-xs font-black text-zinc-600">
        Chi nhánh
        <select
          value={branchId}
          onChange={(event) => setBranchId(event.target.value)}
          className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold outline-none focus:border-orange-500"
        >
          <option value="">
            {type === "DEVICE" ? "Tất cả chi nhánh" : "Chọn chi nhánh"}
          </option>
          {branches.map((branch: any) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
      </label>
      {type === "REPAIR" && (
        <label className="text-xs font-black text-zinc-600 sm:col-span-2">
          Model cần sửa
          <select
            value={repairModel}
            onChange={(event) => setRepairModel(event.target.value)}
            className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm font-bold outline-none focus:border-orange-500"
          >
            <option value="">Chọn model iPhone</option>
            {repairModels.map((model: string) => (
              <option key={model} value={model}>
                {model}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="text-xs font-black text-zinc-600 sm:col-span-2 lg:col-span-1">
        Tìm nhanh
        <div className="relative mt-1">
          <Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
          <input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            className="h-12 w-full rounded-2xl border border-zinc-200 pl-10 pr-3 text-sm outline-none focus:border-orange-500"
            placeholder={
              type === "DEVICE"
                ? "iPhone 15 Pro…"
                : type === "REPAIR"
                  ? "Thay pin, ép kính…"
                  : "Cáp, sạc, ốp…"
            }
          />
        </div>
      </label>
      {type === "DEVICE" && (
        <>
          <label className="text-xs font-black text-zinc-600">
            Dòng máy
            <select
              value={deviceFilters.model}
              onChange={(event) =>
                setDeviceFilters((current: any) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {deviceOptions.models.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-zinc-600">
            Dung lượng
            <select
              value={deviceFilters.storage}
              onChange={(event) =>
                setDeviceFilters((current: any) => ({
                  ...current,
                  storage: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {deviceOptions.storages.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-zinc-600">
            Tình trạng
            <select
              value={deviceFilters.condition}
              onChange={(event) =>
                setDeviceFilters((current: any) => ({
                  ...current,
                  condition: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {deviceOptions.conditions.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-zinc-600">
            Màu sắc
            <select
              value={deviceFilters.color}
              onChange={(event) =>
                setDeviceFilters((current: any) => ({
                  ...current,
                  color: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {deviceOptions.colors.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </>
      )}
      {type === "ACCESSORY" && (
        <>
          <label className="text-xs font-black text-zinc-600">
            Loại phụ kiện
            <select
              value={accessoryFilters.category}
              onChange={(event) =>
                setAccessoryFilters((current: any) => ({
                  ...current,
                  category: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {accessoryOptions.categories.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-zinc-600">
            Thương hiệu
            <select
              value={accessoryFilters.brand}
              onChange={(event) =>
                setAccessoryFilters((current: any) => ({
                  ...current,
                  brand: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {accessoryOptions.brands.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-zinc-600">
            Dùng cho model
            <select
              value={accessoryFilters.model}
              onChange={(event) =>
                setAccessoryFilters((current: any) => ({
                  ...current,
                  model: event.target.value,
                }))
              }
              className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3 text-sm"
            >
              <option value="">Tất cả</option>
              {accessoryOptions.models.map((value: string) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
          <label className="text-xs font-black text-zinc-600">
            Khoảng giá
            <div className="mt-1 grid grid-cols-2 gap-2">
              <input
                inputMode="numeric"
                value={accessoryFilters.minPrice}
                onChange={(event) =>
                  setAccessoryFilters((current: any) => ({
                    ...current,
                    minPrice: event.target.value.replace(/\D/g, ""),
                  }))
                }
                className="h-12 min-w-0 rounded-2xl border border-zinc-200 px-3 text-sm"
                placeholder="Từ"
              />
              <input
                inputMode="numeric"
                value={accessoryFilters.maxPrice}
                onChange={(event) =>
                  setAccessoryFilters((current: any) => ({
                    ...current,
                    maxPrice: event.target.value.replace(/\D/g, ""),
                  }))
                }
                className="h-12 min-w-0 rounded-2xl border border-zinc-200 px-3 text-sm"
                placeholder="Đến"
              />
            </div>
          </label>
        </>
      )}
    </div>
  );
}

export function QuickQuoteMiniweb({
  onBack,
  onChat,
  hotline,
}: {
  onBack: () => void;
  onChat: () => void;
  hotline?: string;
}) {
  const [type, setType] = useState<QuickQuoteType>("DEVICE");
  const [bootstrap, setBootstrap] = useState<QuickQuoteBootstrap | null>(null);
  const [branchId, setBranchId] = useState("");
  const [search, setSearch] = useState("");
  const [deviceFilters, setDeviceFilters] = useState({
    model: "",
    storage: "",
    condition: "",
    color: "",
  });
  const [accessoryFilters, setAccessoryFilters] = useState({
    category: "",
    brand: "",
    model: "",
    minPrice: "",
    maxPrice: "",
  });
  const [repairModel, setRepairModel] = useState("");
  const [devices, setDevices] = useState<QuickQuoteDeviceOffer[]>([]);
  const [repairs, setRepairs] = useState<QuickQuoteRepairOffer[]>([]);
  const [availableRepairModels, setAvailableRepairModels] = useState<string[]>([]);
  const [accessories, setAccessories] = useState<QuickQuoteAccessoryOffer[]>(
    [],
  );
  const [deviceCursor, setDeviceCursor] = useState<string | null>(null);
  const [accessoryCursor, setAccessoryCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [selected, setSelected] = useState<
    Record<QuickQuoteType, SelectedLine[]>
  >({ DEVICE: [], REPAIR: [], ACCESSORY: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<QuickQuoteRequestResult | null>(null);
  const [formStartedAt, setFormStartedAt] = useState(0);
  const [idempotencyKey, setIdempotencyKey] = useState("");
  const [form, setForm] = useState({
    customerName: "",
    customerPhone: "",
    contactChannel: "CALL",
    note: "",
    contactConsent: false,
    marketingConsent: false,
    website: "",
  });
  const [analyticsSession] = useState(analyticsSessionId);

  const track = useCallback(
    (event: string, extra: Record<string, unknown> = {}) => {
      const query = new URLSearchParams(window.location.search);
      void trackQuickQuoteEvent({
        event,
        sessionId: analyticsSession,
        quoteType: type,
        branchId,
        utm: {
          source: query.get("utm_source") || "",
          medium: query.get("utm_medium") || "",
          campaign: query.get("utm_campaign") || "",
          content: query.get("utm_content") || "",
        },
        ...extra,
      }).catch(() => undefined);
    },
    [analyticsSession, branchId, type],
  );

  const changeBranch = (nextBranchId: string) => {
    setBranchId(nextBranchId);
    setSelected((current) => ({ ...current, DEVICE: [], ACCESSORY: [] }));
  };

  const changeRepairModel = (nextModel: string) => {
    setRepairModel(nextModel);
    setSelected((current) => ({ ...current, REPAIR: [] }));
  };

  useEffect(() => {
    const previous = document.title;
    document.title = "Báo giá iPhone, sửa chữa & phụ kiện · PhoneHouse Care";
    return () => {
      document.title = previous;
    };
  }, []);

  const loadBootstrap = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await quickQuoteBootstrap();
      setBootstrap(response.data);
      setBranchId(
        (current) =>
          current ||
          response.data.settings.fallbackBranchId ||
          response.data.branches[0]?.id ||
          "",
      );
    } catch (loadError: any) {
      setError(loadError?.message || "Không tải được miniweb báo giá.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadBootstrap();
  }, [loadBootstrap]);
  useEffect(() => {
    track("PAGE_VIEW");
  }, []); // one event for this mounted miniweb session

  const loadOffers = useCallback(async () => {
    if (!bootstrap) return;
    setLoading(true);
    setError("");
    try {
      if (type === "DEVICE") {
        const response = await quickQuoteDevices({
          ...(branchId ? { branchId } : {}),
          ...(search ? { search } : {}),
          ...Object.fromEntries(
            Object.entries(deviceFilters).filter(([, value]) => value),
          ),
        });
        setDevices(response.data.items);
        setDeviceCursor(response.data.nextCursor);
      } else if (type === "REPAIR") {
        const response = await quickQuoteRepairServices({
          ...(repairModel ? { model: repairModel } : {}),
          ...(search ? { search } : {}),
        });
        setRepairs(response.data);
        if (!repairModel && !search) {
          setAvailableRepairModels(
            unique(response.data.flatMap((item) => item.compatibleModels)),
          );
        }
      } else if (branchId) {
        const response = await quickQuoteAccessories({
          branchId,
          ...(search ? { search } : {}),
          ...Object.fromEntries(
            Object.entries(accessoryFilters).filter(([, value]) => value),
          ),
        });
        setAccessories(response.data.items);
        setAccessoryCursor(response.data.nextCursor);
      } else {
        setAccessories([]);
        setAccessoryCursor(null);
      }
    } catch (loadError: any) {
      setError(loadError?.message || "Không tải được bảng giá.");
    } finally {
      setLoading(false);
    }
  }, [
    accessoryFilters,
    bootstrap,
    branchId,
    deviceFilters,
    repairModel,
    search,
    type,
  ]);
  useEffect(() => {
    const timer = window.setTimeout(() => void loadOffers(), 250);
    return () => window.clearTimeout(timer);
  }, [loadOffers]);

  const loadMoreOffers = async () => {
    const cursor = type === "DEVICE" ? deviceCursor : accessoryCursor;
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    setError("");
    try {
      if (type === "DEVICE") {
        const response = await quickQuoteDevices({
          cursor,
          ...(branchId ? { branchId } : {}),
          ...(search ? { search } : {}),
          ...Object.fromEntries(
            Object.entries(deviceFilters).filter(([, value]) => value),
          ),
        });
        setDevices((current) => [...current, ...response.data.items]);
        setDeviceCursor(response.data.nextCursor);
      } else if (type === "ACCESSORY" && branchId) {
        const response = await quickQuoteAccessories({
          cursor,
          branchId,
          ...(search ? { search } : {}),
          ...Object.fromEntries(
            Object.entries(accessoryFilters).filter(([, value]) => value),
          ),
        });
        setAccessories((current) => [...current, ...response.data.items]);
        setAccessoryCursor(response.data.nextCursor);
      }
    } catch (loadError: any) {
      setError(loadError?.message || "Không tải thêm được bảng giá.");
    } finally {
      setLoadingMore(false);
    }
  };

  const activeSelected = selected[type];
  const estimatedTotal = activeSelected.reduce(
    (sum, line) => sum + line.unitPrice * line.quantity,
    0,
  );
  const repairModels = useMemo(
    () => unique([...availableRepairModels, ...repairs.flatMap((item) => item.compatibleModels)]),
    [availableRepairModels, repairs],
  );
  const deviceOptions = useMemo(
    () => ({
      models: unique(devices.map((item) => item.model)),
      storages: unique(devices.map((item) => item.storage)),
      conditions: unique(devices.map((item) => item.condition)),
      colors: unique(devices.map((item) => item.color)),
    }),
    [devices],
  );
  const accessoryOptions = useMemo(
    () => ({
      categories: unique(accessories.map((item) => item.category)),
      brands: unique(accessories.map((item) => item.brand)),
      models: unique(accessories.flatMap((item) => item.compatibleModels)),
    }),
    [accessories],
  );

  const chooseDevice = (offer: QuickQuoteDeviceOffer) => {
    setBranchId(offer.branchId);
    setSelected((current) => ({
      ...current,
      DEVICE: [
        {
          token: offer.selectionToken,
          name: offer.name,
          unitPrice: offer.price,
          quantity: 1,
        },
      ],
    }));
    track("OFFER_SELECTED", { branchId: offer.branchId });
  };
  const toggleRepair = (offer: QuickQuoteRepairOffer) =>
    setSelected((current) => {
      const exists = current.REPAIR.some(
        (line) => line.token === offer.selectionToken,
      );
      if (!exists) track("OFFER_SELECTED");
      return {
        ...current,
        REPAIR: exists
          ? current.REPAIR.filter((line) => line.token !== offer.selectionToken)
          : [
              ...current.REPAIR,
              {
                token: offer.selectionToken,
                name: offer.name,
                unitPrice: Number(offer.price || 0),
                quantity: 1,
                inspectionRequired: offer.inspectionRequired,
              },
            ].slice(0, 10),
      };
    });
  const addAccessory = (offer: QuickQuoteAccessoryOffer) =>
    setSelected((current) => {
      const exists = current.ACCESSORY.find(
        (line) => line.token === offer.selectionToken,
      );
      track("OFFER_SELECTED");
      return {
        ...current,
        ACCESSORY: exists
          ? current.ACCESSORY.map((line) =>
              line.token === offer.selectionToken
                ? { ...line, quantity: Math.min(100, line.quantity + 1) }
                : line,
            )
          : [
              ...current.ACCESSORY,
              {
                token: offer.selectionToken,
                name: offer.name,
                unitPrice: offer.price,
                quantity: 1,
              },
            ].slice(0, 20),
      };
    });
  const changeQuantity = (token: string, delta: number) =>
    setSelected((current) => ({
      ...current,
      ACCESSORY: current.ACCESSORY.map((line) =>
        line.token === token
          ? { ...line, quantity: Math.max(0, line.quantity + delta) }
          : line,
      ).filter((line) => line.quantity > 0),
    }));
  const openForm = () => {
    if (
      !activeSelected.length ||
      !branchId ||
      (type === "REPAIR" && !repairModel)
    )
      return;
    setFormStartedAt(Date.now());
    setIdempotencyKey(crypto.randomUUID());
    setFormOpen(true);
    track("FORM_OPENED");
  };
  const submit = async () => {
    if (
      !bootstrap ||
      !form.contactConsent ||
      !form.customerName.trim() ||
      !form.customerPhone.trim()
    )
      return;
    const effectiveBranchId = branchId || bootstrap.branches[0]?.id || "";
    setSubmitting(true);
    setError("");
    try {
      const query = new URLSearchParams(window.location.search);
      const response = await createQuickQuoteRequest({
        quoteType: type,
        branchId: effectiveBranchId,
        repairModel: type === "REPAIR" ? repairModel : undefined,
        selections: activeSelected.map((line) => ({
          selectionToken: line.token,
          quantity: line.quantity,
        })),
        ...form,
        idempotencyKey,
        formStartedAt,
        utm: {
          source: query.get("utm_source") || "",
          medium: query.get("utm_medium") || "",
          campaign: query.get("utm_campaign") || "",
          content: query.get("utm_content") || "",
        },
      });
      setSuccess(response.data);
      setFormOpen(false);
      setSelected((current) => ({ ...current, [type]: [] }));
      track("SUBMIT_SUCCESS", { requestCode: response.data.requestCode });
    } catch (submitError: any) {
      if (
        submitError instanceof ApiClientError &&
        ["QUICK_QUOTE_PRICE_CHANGED", "QUICK_QUOTE_OFFER_UNAVAILABLE"].includes(
          submitError.code,
        )
      ) {
        setFormOpen(false);
        setError(
          submitError.code === "QUICK_QUOTE_PRICE_CHANGED"
            ? "Giá vừa được cập nhật. Danh sách đã tải lại để bạn xác nhận giá mới."
            : "Một lựa chọn vừa hết hàng hoặc ngừng áp dụng. Vui lòng chọn phương án khác.",
        );
        setSelected((current) => ({ ...current, [type]: [] }));
        track(
          submitError.code === "QUICK_QUOTE_PRICE_CHANGED"
            ? "PRICE_CHANGED"
            : "OFFER_UNAVAILABLE",
        );
        await loadOffers();
      } else
        setError(submitError?.message || "Không gửi được yêu cầu báo giá.");
    } finally {
      setSubmitting(false);
    }
  };

  const filterFields = (
    <FilterFields
      type={type}
      branchId={branchId}
      setBranchId={changeBranch}
      branches={bootstrap?.branches || []}
      search={search}
      setSearch={setSearch}
      deviceFilters={deviceFilters}
      setDeviceFilters={setDeviceFilters}
      deviceOptions={deviceOptions}
      repairModel={repairModel}
      setRepairModel={changeRepairModel}
      repairModels={repairModels}
      accessoryFilters={accessoryFilters}
      setAccessoryFilters={setAccessoryFilters}
      accessoryOptions={accessoryOptions}
    />
  );

  return (
    <div className="relative -mx-4 -mt-5 min-h-[calc(100vh-5rem)] bg-[#fffaf7] pb-28 sm:-mx-6 lg:pb-8">
      <section className="overflow-hidden bg-zinc-950 px-4 py-6 text-white sm:px-6 sm:py-8">
        <div className="mx-auto max-w-6xl">
          <button
            onClick={onBack}
            className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-white/10 px-3 text-xs font-black text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            PhoneHouse Care
          </button>
          <div className="mt-5 max-w-2xl">
            <div className="flex items-center gap-2 text-orange-300">
              <Sparkles className="h-4 w-4" />
              <span className="text-xs font-black uppercase tracking-[.18em]">
                Báo giá trong 30 giây
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black leading-tight sm:text-4xl">
              Giá rõ ràng.
              <br />
              Chọn đúng nhu cầu.
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-zinc-300">
              Tra cứu giá iPhone, sửa chữa và phụ kiện trực tiếp từ dữ liệu đang
              vận hành tại PhoneHouse.
            </p>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative z-10 -mt-5 grid grid-cols-3 gap-1 rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-lg shadow-zinc-200/50">
          {quoteTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setType(tab.id);
                  setSearch("");
                  track("CATEGORY_SELECTED", { quoteType: tab.id });
                }}
                className={classes(
                  "flex min-h-12 items-center justify-center gap-1.5 rounded-xl px-1 text-[11px] font-black transition sm:text-sm",
                  type === tab.id
                    ? "bg-[#ff4b16] text-white shadow"
                    : "text-zinc-500 hover:bg-zinc-50",
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="sm:hidden">{tab.short}</span>
                <span className="hidden sm:inline">{tab.label}</span>
              </button>
            );
          })}
        </div>
        <div className="mt-5 flex items-center gap-2 sm:hidden">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-zinc-400" />
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              className="h-12 w-full rounded-2xl border border-zinc-200 bg-white pl-10 pr-3 text-sm"
              placeholder="Tìm nhanh…"
            />
          </div>
          <button
            onClick={() => setFiltersOpen(true)}
            className="flex h-12 items-center gap-1.5 rounded-2xl border border-zinc-200 bg-white px-3 text-xs font-black"
          >
            <Filter className="h-4 w-4" />
            Lọc
          </button>
        </div>
        <section className="mt-5 hidden rounded-3xl border border-zinc-200 bg-white p-4 shadow-sm sm:block">
          {filterFields}
        </section>
        <FilterSheet open={filtersOpen} onClose={() => setFiltersOpen(false)}>
          {filterFields}
        </FilterSheet>
        {bootstrap && !bootstrap.settings.enabled && (
          <p className="mt-5 rounded-2xl bg-amber-50 p-4 text-sm font-bold text-amber-800">
            Miniweb báo giá đang tạm ngưng. Vui lòng liên hệ hotline để được hỗ
            trợ.
          </p>
        )}
        {error && (
          <div
            role="alert"
            className="mt-5 flex items-start gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-bold text-rose-700"
          >
            <span className="flex-1">{error}</span>
            <button
              onClick={() => setError("")}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="mt-5 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-black text-zinc-950">
              {quoteTabs.find((tab) => tab.id === type)?.label}
            </h2>
            <p className="text-xs text-zinc-500">
              Giá được lấy lại từ máy chủ khi bạn gửi yêu cầu.
            </p>
          </div>
          {loading && (
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
          )}
        </div>
        {!loading && type === "REPAIR" && !repairModel && (
          <div className="mt-4 rounded-3xl border border-dashed border-orange-200 bg-orange-50/50 p-8 text-center">
            <Wrench className="mx-auto h-9 w-9 text-orange-400" />
            <p className="mt-3 font-black">Chọn model iPhone cần sửa</p>
            <p className="mt-1 text-sm text-zinc-500">
              PhoneHouse sẽ chỉ hiện các dịch vụ tương thích với máy của bạn.
            </p>
          </div>
        )}
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {type === "DEVICE" &&
            devices.map((offer) => {
              const checked = selected.DEVICE.some(
                (line) => line.token === offer.selectionToken,
              );
              return (
                <article
                  key={offer.selectionToken}
                  className={classes(
                    "rounded-3xl border bg-white p-4 shadow-sm transition",
                    checked
                      ? "border-orange-500 ring-2 ring-orange-100"
                      : "border-zinc-200",
                  )}
                >
                  <div className="flex gap-3">
                    <OfferImage url={offer.imageUrl} icon={Smartphone} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <h3 className="font-black text-zinc-950">
                            {offer.name}
                          </h3>
                          <p className="mt-1 text-xs text-zinc-500">
                            {offer.color} · {offer.condition} · {offer.region}
                          </p>
                        </div>
                        <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                          Còn hàng
                        </span>
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2 text-[11px] font-bold text-zinc-600">
                        <span className="rounded-lg bg-zinc-100 px-2 py-1">
                          <BatteryCharging className="mr-1 inline h-3 w-3" />
                          Pin {offer.batteryHealth || "—"}%
                        </span>
                        <span className="rounded-lg bg-zinc-100 px-2 py-1">
                          <ShieldCheck className="mr-1 inline h-3 w-3" />
                          BH {offer.warrantyPeriodMonths} tháng
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-xl font-black text-[#ff4b16]">
                      {money.format(offer.price)}
                    </p>
                    <button
                      onClick={() => chooseDevice(offer)}
                      className={classes(
                        "min-h-11 rounded-2xl px-4 text-xs font-black",
                        checked
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-950 text-white",
                      )}
                    >
                      {checked ? (
                        <>
                          <Check className="mr-1 inline h-4 w-4" />
                          Đã chọn
                        </>
                      ) : (
                        "Chọn máy này"
                      )}
                    </button>
                  </div>
                </article>
              );
            })}
          {type === "REPAIR" &&
            repairModel &&
            repairs.map((offer) => {
              const checked = selected.REPAIR.some(
                (line) => line.token === offer.selectionToken,
              );
              return (
                <article
                  key={offer.selectionToken}
                  className={classes(
                    "rounded-3xl border bg-white p-4 shadow-sm",
                    checked
                      ? "border-orange-500 ring-2 ring-orange-100"
                      : "border-zinc-200",
                  )}
                >
                  <div className="flex gap-3">
                    <OfferImage url={offer.imageUrl} icon={Wrench} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase text-orange-600">
                        {offer.category}
                      </p>
                      <h3 className="mt-1 font-black text-zinc-950">
                        {offer.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {offer.description || `Áp dụng cho ${repairModel}`}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-2 text-[11px] font-bold">
                    <span className="rounded-lg bg-sky-50 px-2 py-1 text-sky-700">
                      <Clock3 className="mr-1 inline h-3 w-3" />
                      {offer.durationMinutes
                        ? `${offer.durationMinutes} phút`
                        : "Hẹn sau kiểm tra"}
                    </span>
                    <span className="rounded-lg bg-emerald-50 px-2 py-1 text-emerald-700">
                      <ShieldCheck className="mr-1 inline h-3 w-3" />
                      BH {offer.warrantyPeriodMonths || 0} tháng
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between gap-3">
                    <p className="text-lg font-black text-[#ff4b16]">
                      {offer.inspectionRequired
                        ? "Cần kiểm tra máy"
                        : money.format(Number(offer.price || 0))}
                    </p>
                    <button
                      onClick={() => toggleRepair(offer)}
                      className={classes(
                        "min-h-11 rounded-2xl px-4 text-xs font-black",
                        checked
                          ? "bg-emerald-600 text-white"
                          : "bg-zinc-950 text-white",
                      )}
                    >
                      {checked ? "Bỏ chọn" : "Thêm hạng mục"}
                    </button>
                  </div>
                </article>
              );
            })}
          {type === "ACCESSORY" &&
            accessories.map((offer) => {
              const line = selected.ACCESSORY.find(
                (item) => item.token === offer.selectionToken,
              );
              return (
                <article
                  key={offer.selectionToken}
                  className={classes(
                    "rounded-3xl border bg-white p-4 shadow-sm",
                    line
                      ? "border-orange-500 ring-2 ring-orange-100"
                      : "border-zinc-200",
                  )}
                >
                  <div className="flex gap-3">
                    <OfferImage url={offer.imageUrl} icon={ShoppingBag} />
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-black uppercase text-orange-600">
                        {offer.category} · {offer.brand}
                      </p>
                      <h3 className="mt-1 font-black text-zinc-950">
                        {offer.name}
                      </h3>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-500">
                        {offer.description}
                      </p>
                      <p className="mt-2 text-lg font-black text-[#ff4b16]">
                        {money.format(offer.price)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-3 flex items-center justify-between">
                    <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">
                      Còn hàng
                    </span>
                    {line ? (
                      <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 p-1">
                        <button
                          onClick={() => changeQuantity(line.token, -1)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-white"
                        >
                          <Minus className="h-4 w-4" />
                        </button>
                        <span className="min-w-6 text-center text-sm font-black">
                          {line.quantity}
                        </span>
                        <button
                          onClick={() => changeQuantity(line.token, 1)}
                          className="flex h-10 w-10 items-center justify-center rounded-xl bg-zinc-950 text-white"
                        >
                          <Plus className="h-4 w-4" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => addAccessory(offer)}
                        className="min-h-11 rounded-2xl bg-zinc-950 px-4 text-xs font-black text-white"
                      >
                        Thêm vào báo giá
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
        </div>
        {!loading &&
          ((type === "DEVICE" && deviceCursor) ||
            (type === "ACCESSORY" && accessoryCursor)) && (
            <button
              onClick={() => void loadMoreOffers()}
              disabled={loadingMore}
              className="mx-auto mt-5 flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-zinc-200 bg-white px-5 text-sm font-black text-zinc-700 disabled:opacity-50"
            >
              {loadingMore && <Loader2 className="h-4 w-4 animate-spin" />}
              Xem thêm lựa chọn
            </button>
          )}
        {!loading &&
          ((type === "DEVICE" && !devices.length) ||
            (type === "REPAIR" && repairModel && !repairs.length) ||
            (type === "ACCESSORY" && !accessories.length)) && (
            <div className="mt-4 rounded-3xl border border-dashed border-zinc-200 bg-white p-10 text-center">
              <PackageCheck className="mx-auto h-9 w-9 text-zinc-300" />
              <p className="mt-3 font-black text-zinc-800">
                Chưa có lựa chọn phù hợp
              </p>
              <p className="mt-1 text-sm text-zinc-500">
                Thử đổi chi nhánh hoặc bộ lọc, hoặc nhắn CSKH để được tìm giúp.
              </p>
              <button
                onClick={onChat}
                className="mt-4 min-h-11 rounded-2xl border border-sky-200 px-4 text-xs font-black text-sky-700"
              >
                <MessageCircle className="mr-1 inline h-4 w-4" />
                Chat với PhoneHouse
              </button>
            </div>
          )}
      </div>
      {activeSelected.length > 0 && (
        <div className="fixed inset-x-0 bottom-[calc(3.6rem+env(safe-area-inset-bottom))] z-30 border-t border-zinc-200 bg-white/95 px-4 py-3 shadow-[0_-12px_35px_rgba(0,0,0,.12)] backdrop-blur lg:bottom-0">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase text-zinc-400">
                Đã chọn {activeSelected.length} hạng mục
              </p>
              <p className="truncate text-lg font-black text-zinc-950">
                {activeSelected.some((line) => line.inspectionRequired)
                  ? `${money.format(estimatedTotal)} + hạng mục cần kiểm tra`
                  : money.format(estimatedTotal)}
              </p>
              {(!branchId || (type === "REPAIR" && !repairModel)) && (
                <p className="text-[10px] font-bold text-rose-600">
                  Chọn chi nhánh và model trước khi gửi.
                </p>
              )}
            </div>
            <button
              onClick={openForm}
              disabled={!branchId || (type === "REPAIR" && !repairModel)}
              className="min-h-12 shrink-0 rounded-2xl bg-[#ff4b16] px-5 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:cursor-not-allowed disabled:opacity-40"
            >
              Nhận báo giá
            </button>
          </div>
        </div>
      )}
      {formOpen && bootstrap && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-quote-request-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-0 sm:p-6"
        >
          <div className="mx-auto min-h-full max-w-xl bg-white sm:min-h-0 sm:rounded-[2rem]">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 sm:rounded-t-[2rem]">
              <div>
                <p id="quick-quote-request-title" className="font-black text-zinc-950">
                  Nhận báo giá từ PhoneHouse
                </p>
                <p className="text-xs text-zinc-500">
                  Sale phản hồi trong khoảng{" "}
                  {bootstrap.settings.responseSlaMinutes} phút
                </p>
              </div>
              <button
                aria-label="Đóng biểu mẫu báo giá"
                onClick={() => setFormOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl bg-zinc-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="space-y-4 p-4 sm:p-6">
              <section className="rounded-2xl bg-zinc-950 p-4 text-white">
                <div className="space-y-2">
                  {activeSelected.map((line) => (
                    <div
                      key={line.token}
                      className="flex justify-between gap-3 text-sm"
                    >
                      <span className="line-clamp-1 text-zinc-300">
                        {line.name} × {line.quantity}
                      </span>
                      <b className="shrink-0">
                        {line.inspectionRequired
                          ? "Kiểm tra sau"
                          : money.format(line.unitPrice * line.quantity)}
                      </b>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between border-t border-white/15 pt-3">
                  <span className="text-sm font-bold text-zinc-300">
                    Tạm tính
                  </span>
                  <span className="text-xl font-black text-orange-300">
                    {money.format(estimatedTotal)}
                  </span>
                </div>
              </section>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-bold text-zinc-700 sm:col-span-2">
                  Họ và tên
                  <input
                    value={form.customerName}
                    onChange={(event) =>
                      setForm({ ...form, customerName: event.target.value })
                    }
                    className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 px-3 outline-none focus:border-orange-500"
                    placeholder="Nguyễn Văn A"
                  />
                </label>
                <label className="text-sm font-bold text-zinc-700">
                  Số điện thoại
                  <input
                    inputMode="tel"
                    value={form.customerPhone}
                    onChange={(event) =>
                      setForm({ ...form, customerPhone: event.target.value })
                    }
                    className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 px-3 outline-none focus:border-orange-500"
                    placeholder="09xx xxx xxx"
                  />
                </label>
                <label className="text-sm font-bold text-zinc-700">
                  Kênh liên hệ
                  <select
                    value={form.contactChannel}
                    onChange={(event) =>
                      setForm({ ...form, contactChannel: event.target.value })
                    }
                    className="mt-1 h-12 w-full rounded-2xl border border-zinc-200 bg-white px-3"
                  >
                    <option value="CALL">Gọi điện</option>
                    <option value="ZALO">Zalo</option>
                  </select>
                </label>
                <label className="text-sm font-bold text-zinc-700 sm:col-span-2">
                  Ghi chú
                  <textarea
                    value={form.note}
                    onChange={(event) =>
                      setForm({ ...form, note: event.target.value })
                    }
                    className="mt-1 min-h-20 w-full rounded-2xl border border-zinc-200 p-3"
                    placeholder="Màu mong muốn, thời gian tiện nghe máy…"
                  />
                </label>
                <label className="sr-only" aria-hidden="true">
                  Website
                  <input
                    tabIndex={-1}
                    autoComplete="off"
                    value={form.website}
                    onChange={(event) =>
                      setForm({ ...form, website: event.target.value })
                    }
                  />
                </label>
              </div>
              <label className="flex items-start gap-3 rounded-2xl bg-orange-50 p-3 text-xs font-bold leading-5 text-orange-950">
                <input
                  type="checkbox"
                  checked={form.contactConsent}
                  onChange={(event) =>
                    setForm({ ...form, contactConsent: event.target.checked })
                  }
                  className="mt-1 h-4 w-4 accent-orange-600"
                />
                Tôi đồng ý để PhoneHouse liên hệ về yêu cầu báo giá này.
              </label>
              <label className="flex items-start gap-3 px-3 text-xs leading-5 text-zinc-600">
                <input
                  type="checkbox"
                  checked={form.marketingConsent}
                  onChange={(event) =>
                    setForm({ ...form, marketingConsent: event.target.checked })
                  }
                  className="mt-1 h-4 w-4 accent-orange-600"
                />
                Tôi muốn nhận thêm chương trình ưu đãi phù hợp.
              </label>
              <p className="rounded-xl bg-zinc-50 p-3 text-[11px] leading-5 text-zinc-500">
                {bootstrap.settings.disclaimer}
              </p>
              <button
                onClick={() => void submit()}
                disabled={
                  submitting ||
                  !form.customerName.trim() ||
                  !form.customerPhone.trim() ||
                  !form.contactConsent
                }
                className="min-h-13 w-full rounded-2xl bg-[#ff4b16] px-4 py-3 text-sm font-black text-white shadow-lg shadow-orange-200 disabled:opacity-40"
              >
                {submitting ? (
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                ) : (
                  "Gửi yêu cầu báo giá"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {success && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="quick-quote-success-title"
          className="fixed inset-0 z-50 overflow-y-auto bg-zinc-950/70 p-4 sm:p-8"
        >
          <div className="mx-auto mt-8 max-w-md rounded-[2rem] bg-white p-5 text-center shadow-2xl sm:mt-16 sm:p-7">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <p className="mt-4 text-xs font-black uppercase tracking-[.16em] text-emerald-600">
              Đã gửi thành công
            </p>
            <h2 id="quick-quote-success-title" className="mt-2 text-2xl font-black text-zinc-950">
              {success.requestCode}
            </h2>
            <p className="mt-2 text-sm leading-6 text-zinc-500">
              PhoneHouse {success.branchName} sẽ phản hồi trong khoảng{" "}
              {success.responseSlaMinutes} phút.
            </p>
            <div className="mt-5 rounded-2xl bg-zinc-950 p-4 text-white">
              <p className="text-xs text-zinc-400">Tổng tạm tính</p>
              <p className="mt-1 text-2xl font-black text-orange-300">
                {money.format(success.estimatedTotal)}
              </p>
              <p className="mt-2 text-[11px] text-zinc-400">
                Hiệu lực đến{" "}
                {new Date(success.expiresAt).toLocaleString("vi-VN", {
                  timeZone: "Asia/Ho_Chi_Minh",
                })}
              </p>
            </div>
            <button
              onClick={() =>
                void navigator.clipboard.writeText(success.requestCode)
              }
              className="mt-4 flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-zinc-200 text-xs font-black"
            >
              <Copy className="h-4 w-4" />
              Sao chép mã yêu cầu
            </button>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <a
                href={`tel:${hotline || ""}`}
                className="flex min-h-11 items-center justify-center gap-1 rounded-2xl bg-zinc-950 px-3 text-xs font-black text-white"
              >
                <Phone className="h-4 w-4" />
                Gọi hotline
              </a>
              <button
                onClick={() => {
                  setSuccess(null);
                  onChat();
                }}
                className="flex min-h-11 items-center justify-center gap-1 rounded-2xl bg-sky-600 px-3 text-xs font-black text-white"
              >
                <Headphones className="h-4 w-4" />
                Chat CSKH
              </button>
            </div>
            <button
              onClick={() => setSuccess(null)}
              className="mt-4 text-xs font-black text-zinc-500 underline"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default QuickQuoteMiniweb;
