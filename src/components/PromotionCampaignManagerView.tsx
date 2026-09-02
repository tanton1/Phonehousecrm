import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  BarChart3,
  CalendarClock,
  Copy,
  Eye,
  ImagePlus,
  Loader2,
  Megaphone,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import type { StoreBranch, UserAccount } from "../types";
import { apiJson } from "../services/apiClient";
import { requestPromotionAiContent, requestPromotionAiImage, type PromotionAiContent } from "../services/promotionAiApiClient";

type PromotionStatus =
  "DRAFT" | "SCHEDULED" | "PUBLISHED" | "EXPIRED" | "ARCHIVED";
type Promotion = {
  id: string;
  title: string;
  summary: string;
  details?: string;
  category: string;
  bannerUrl?: string;
  startsAt: string;
  endsAt: string;
  status: PromotionStatus;
  allBranches: boolean;
  branchIds: string[];
  targetModelKeywords?: string[];
  targetCustomerTiers?: string[];
  targetActivityTypes?: string[];
  conditions?: string[];
  ctaLabel?: string;
  voucherCode?: string;
  priority?: number;
  hashtags?: string[];
};

function localDateTime(daysFromNow = 0) {
  const date = new Date(Date.now() + daysFromNow * 86_400_000);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

const emptyDraft = () => ({
  title: "",
  summary: "",
  details: "",
  category: "GENERAL",
  bannerUrl: "",
  startsAt: localDateTime(),
  endsAt: localDateTime(7),
  allBranches: true,
  branchIds: [] as string[],
  targetModelKeywords: "",
  targetCustomerTiers: "",
  targetActivityTypes: "",
  conditions: "",
  ctaLabel: "Xem chi tiết",
  voucherCode: "",
  hashtags: "",
  priority: 0,
});

const statusLabels: Record<PromotionStatus, string> = {
  DRAFT: "Bản nháp",
  SCHEDULED: "Đã lên lịch",
  PUBLISHED: "Đang phát hành",
  EXPIRED: "Đã hết hạn",
  ARCHIVED: "Đã lưu trữ",
};

function toLocalInput(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function csv(value: string) {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function campaignDraft(item: Promotion) {
  return {
    title: item.title || "",
    summary: item.summary || "",
    details: item.details || "",
    category: item.category || "GENERAL",
    bannerUrl: item.bannerUrl || "",
    startsAt: toLocalInput(item.startsAt),
    endsAt: toLocalInput(item.endsAt),
    allBranches: item.allBranches !== false,
    branchIds: item.branchIds || [],
    targetModelKeywords: (item.targetModelKeywords || []).join(", "),
    targetCustomerTiers: (item.targetCustomerTiers || []).join(", "),
    targetActivityTypes: (item.targetActivityTypes || []).join(", "),
    conditions: (item.conditions || []).join("\n"),
    ctaLabel: item.ctaLabel || "Xem chi tiết",
    voucherCode: item.voucherCode || "",
    hashtags: (item.hashtags || []).join(", "),
    priority: Number(item.priority || 0),
  };
}

function dateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

export function PromotionCampaignManagerView({
  branches,
  currentUser,
}: {
  branches: StoreBranch[];
  currentUser?: UserAccount | null;
}) {
  const mayUseGlobalScope = ["ADMIN", "REGIONAL_MANAGER"].includes(
    String(currentUser?.role || ""),
  );
  const [items, setItems] = useState<Promotion[]>([]);
  const [filter, setFilter] = useState<"ALL" | PromotionStatus>("ALL");
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [preview, setPreview] = useState<Promotion | null>(null);
  const [draft, setDraft] = useState(emptyDraft());
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [aiBrief, setAiBrief] = useState("");
  const [aiTone, setAiTone] = useState("SELLING");
  const [aiTargetAudience, setAiTargetAudience] = useState("");
  const [aiOffer, setAiOffer] = useState("");
  const [aiImagePrompt, setAiImagePrompt] = useState("");
  const [aiMessage, setAiMessage] = useState("");
  const [aiProvider, setAiProvider] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await apiJson<{ success: boolean; data: Promotion[] }>(
        "/api/customer-portal/staff/promotions",
      );
      setItems(response.data || []);
    } catch (e: any) {
      setError(e?.message || "Không tải được chiến dịch.");
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visible = useMemo(
    () =>
      filter === "ALL" ? items : items.filter((item) => item.status === filter),
    [filter, items],
  );
  const stats = useMemo(
    () => ({
      total: items.length,
      published: items.filter((item) => item.status === "PUBLISHED").length,
      scheduled: items.filter((item) => item.status === "SCHEDULED").length,
      drafts: items.filter((item) => item.status === "DRAFT").length,
    }),
    [items],
  );
  const startCreate = () => {
    setEditing(null);
    setDraft({
      ...emptyDraft(),
      allBranches: mayUseGlobalScope,
      branchIds:
        mayUseGlobalScope || !currentUser?.branchId
          ? []
          : [currentUser.branchId],
    });
    setAiBrief("");
    setAiTargetAudience("");
    setAiOffer("");
    setAiImagePrompt("");
    setAiMessage("");
    setAiProvider("");
    setOpen(true);
  };
  const startEdit = (item: Promotion) => {
    setEditing(item);
    setDraft(campaignDraft(item));
    setAiBrief(item.summary || item.title || "");
    setAiTargetAudience("");
    setAiOffer("");
    setAiImagePrompt("");
    setAiMessage("");
    setAiProvider("");
    setOpen(true);
  };
  const startDuplicate = (item: Promotion) => {
    setEditing(null);
    setDraft({
      ...campaignDraft(item),
      title: `${item.title} (bản sao)`,
      voucherCode: "",
      hashtags: "",
      allBranches: mayUseGlobalScope ? item.allBranches !== false : false,
      branchIds: mayUseGlobalScope
        ? item.branchIds || []
        : currentUser?.branchId
          ? [currentUser.branchId]
          : [],
    });
    setAiBrief("");
    setAiTargetAudience("");
    setAiOffer("");
    setAiImagePrompt("");
    setAiMessage("");
    setAiProvider("");
    setOpen(true);
  };

  const applyAiContent = (content: PromotionAiContent) => {
    setDraft(current => ({
      ...current,
      title: content.title || current.title,
      summary: content.summary || current.summary,
      details: content.details || current.details,
      category: content.category || current.category,
      ctaLabel: content.ctaLabel || current.ctaLabel,
      conditions: content.conditions.join("\n"),
      hashtags: content.hashtags.join(", ")
    }));
    setAiImagePrompt(content.imagePrompt || "");
  };

  const generateContent = async () => {
    if (aiBrief.trim().length < 8) {
      setError("Hãy mô tả chương trình muốn đăng (ít nhất 8 ký tự) để AI viết đúng ý.");
      return;
    }
    setBusy("ai-content");
    setError("");
    setAiMessage("");
    try {
      const result = await requestPromotionAiContent({
        brief: aiBrief,
        category: draft.category,
        tone: aiTone,
        targetAudience: aiTargetAudience,
        offer: aiOffer,
        voucherCode: draft.voucherCode,
        existingTitle: draft.title,
        existingSummary: draft.summary
      });
      applyAiContent(result.content);
      setAiProvider(`${result.provider === "OPENAI_COMPATIBLE" ? "AI proxy" : "Google Gemini"} · ${result.model}`);
      setAiMessage("AI đã viết xong. Hãy đọc lại các trường màu cam trước khi lưu hoặc phát hành.");
    } catch (e: any) {
      setError(e?.message || "Không tạo được nội dung bằng AI.");
    } finally {
      setBusy("");
    }
  };

  const generateImage = async () => {
    if (aiImagePrompt.trim().length < 12) {
      setError("Hãy tạo nội dung trước hoặc bổ sung mô tả banner rõ hơn.");
      return;
    }
    setBusy("ai-image");
    setError("");
    setAiMessage("");
    try {
      const result = await requestPromotionAiImage({ imagePrompt: aiImagePrompt });
      setDraft(current => ({ ...current, bannerUrl: result.imageUrl }));
      setAiProvider(`${result.provider === "OPENAI_COMPATIBLE" ? "AI proxy" : "Google Gemini"} · ${result.model}`);
      setAiMessage("Banner đã được lưu an toàn vào Firebase Storage và gắn vào bản nháp.");
    } catch (e: any) {
      setError(e?.message || "Không tạo được banner bằng AI.");
    } finally {
      setBusy("");
    }
  };
  const save = async () => {
    setBusy("save");
    setError("");
    try {
      const body = {
        ...draft,
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        targetModelKeywords: csv(draft.targetModelKeywords),
        targetCustomerTiers: csv(draft.targetCustomerTiers),
        targetActivityTypes: csv(draft.targetActivityTypes),
        hashtags: csv(draft.hashtags),
        conditions: draft.conditions
          .split("\n")
          .map((item) => item.trim())
          .filter(Boolean),
        ctaType: "DETAIL",
      };
      await apiJson(
        `/api/customer-portal/staff/promotions${editing ? `/${encodeURIComponent(editing.id)}` : ""}`,
        {
          method: editing ? "PUT" : "POST",
          body: JSON.stringify(body),
        },
      );
      setOpen(false);
      await load();
    } catch (e: any) {
      setError(e?.message || "Không lưu được chiến dịch.");
    } finally {
      setBusy("");
    }
  };
  const changeStatus = async (item: Promotion, status: PromotionStatus) => {
    setBusy(item.id);
    setError("");
    try {
      await apiJson(
        `/api/customer-portal/staff/promotions/${encodeURIComponent(item.id)}/status`,
        { method: "POST", body: JSON.stringify({ status }) },
      );
      await load();
    } catch (e: any) {
      setError(e?.message || "Không đổi được trạng thái chiến dịch.");
    } finally {
      setBusy("");
    }
  };
  const toggleBranch = (id: string) =>
    setDraft((current) => ({
      ...current,
      branchIds: current.branchIds.includes(id)
        ? current.branchIds.filter((item) => item !== id)
        : [...current.branchIds, id],
    }));

  return (
    <main className="space-y-4">
      <div className="rounded-3xl bg-zinc-950 p-5 text-white shadow-xl shadow-zinc-200 sm:p-6">
        <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
          <div>
            <p className="text-xs font-black uppercase tracking-[.16em] text-[#ff4b16]">
              PhoneHouse Care
            </p>
            <h1 className="mt-1 text-2xl font-black">Đăng bài & khuyến mãi</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-zinc-300">
              Soạn nội dung, chọn đối tượng và phát hành từ một nơi. Bài ở trạng
              thái <b>Đang phát hành</b> sẽ xuất hiện tại trang ưu đãi và
              miniweb báo giá của khách.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href="/khach-hang/uu-dai"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-black text-white"
            >
              <Eye className="h-4 w-4" />
              Xem trang khách
            </a>
            <button
              onClick={() => void load()}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-white/20 bg-white/10 px-3 text-xs font-black"
            >
              <RefreshCw
                className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"}
              />
              Làm mới
            </button>
            <button
              onClick={startCreate}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-[#ff4b16] px-4 text-xs font-black text-white"
            >
              <Plus className="h-4 w-4" />
              Tạo bài đăng
            </button>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {[
          ["Tổng bài đăng", stats.total, BarChart3, "bg-zinc-950 text-white"],
          [
            "Đang phát hành",
            stats.published,
            Send,
            "bg-emerald-50 text-emerald-700",
          ],
          [
            "Đã lên lịch",
            stats.scheduled,
            CalendarClock,
            "bg-sky-50 text-sky-700",
          ],
          ["Bản nháp", stats.drafts, Pencil, "bg-orange-50 text-orange-700"],
        ].map(([label, value, Icon, color]) => {
          const StatIcon = Icon as React.ElementType;
          return (
            <div
              key={String(label)}
              className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm"
            >
              <div
                className={`flex h-9 w-9 items-center justify-center rounded-xl ${String(color)}`}
              >
                <StatIcon className="h-4 w-4" />
              </div>
              <p className="mt-3 text-2xl font-black text-zinc-950">
                {String(value)}
              </p>
              <p className="text-xs font-bold text-zinc-500">{String(label)}</p>
            </div>
          );
        })}
      </div>
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(
          [
            "ALL",
            "DRAFT",
            "SCHEDULED",
            "PUBLISHED",
            "EXPIRED",
            "ARCHIVED",
          ] as const
        ).map((value) => (
          <button
            key={value}
            onClick={() => setFilter(value)}
            className={`shrink-0 rounded-full px-3 py-2 text-xs font-black ${filter === value ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600"}`}
          >
            {value === "ALL" ? "Tất cả" : statusLabels[value]}
          </button>
        ))}
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl bg-rose-50 p-3 text-sm font-bold text-rose-700"
        >
          {error}
        </p>
      )}
      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
        </div>
      ) : !visible.length ? (
        <div className="rounded-2xl border border-dashed p-12 text-center text-sm text-zinc-500">
          <Megaphone className="mx-auto mb-2 h-8 w-8 text-zinc-300" />
          Chưa có chiến dịch ở trạng thái này.
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {visible.map((item) => (
            <article
              key={item.id}
              className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm"
            >
              {item.bannerUrl ? (
                <img
                  src={item.bannerUrl}
                  alt={`Banner ${item.title}`}
                  className="h-36 w-full bg-zinc-100 object-cover"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-24 items-center justify-center bg-gradient-to-br from-orange-50 to-amber-100 text-orange-300">
                  <Megaphone className="h-9 w-9" />
                </div>
              )}
              <div className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap gap-2">
                      <span className="rounded-full bg-orange-50 px-2 py-1 text-[10px] font-black text-orange-700">
                        {item.category}
                      </span>
                      <span className="rounded-full bg-zinc-100 px-2 py-1 text-[10px] font-black text-zinc-600">
                        {statusLabels[item.status]}
                      </span>
                    </div>
                    <h2 className="mt-2 font-black text-zinc-900">
                      {item.title}
                    </h2>
                    <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-500">
                      {item.summary}
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button
                      onClick={() => setPreview(item)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200"
                      aria-label="Xem trước"
                    >
                      <Eye className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => startEdit(item)}
                      disabled={item.status === "ARCHIVED"}
                      className="flex h-11 w-11 items-center justify-center rounded-xl border border-zinc-200 disabled:opacity-30"
                      aria-label="Sửa"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3 rounded-xl bg-zinc-50 p-3 text-xs">
                  <div>
                    <span className="text-zinc-400">Bắt đầu</span>
                    <b className="mt-1 block">{dateTime(item.startsAt)}</b>
                  </div>
                  <div>
                    <span className="text-zinc-400">Kết thúc</span>
                    <b className="mt-1 block">{dateTime(item.endsAt)}</b>
                  </div>
                  <div className="col-span-2">
                    <span className="text-zinc-400">Phạm vi</span>
                    <b className="mt-1 block">
                      {item.allBranches
                        ? "Toàn hệ thống"
                        : `${item.branchIds.length} chi nhánh`}
                    </b>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    onClick={() => setPreview(item)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black text-sky-700"
                  >
                    <Eye className="h-4 w-4" />
                    Xem trước
                  </button>
                  <button
                    onClick={() => startDuplicate(item)}
                    className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black text-zinc-600"
                  >
                    <Copy className="h-4 w-4" />
                    Sao chép
                  </button>
                  {item.status === "DRAFT" && (
                    <>
                      <button
                        onClick={() => void changeStatus(item, "SCHEDULED")}
                        disabled={busy === item.id}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black"
                      >
                        <CalendarClock className="h-4 w-4" />
                        Lên lịch
                      </button>
                      <button
                        onClick={() => void changeStatus(item, "PUBLISHED")}
                        disabled={busy === item.id}
                        className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"
                      >
                        <Send className="h-4 w-4" />
                        Phát hành
                      </button>
                    </>
                  )}
                  {item.status === "SCHEDULED" && (
                    <button
                      onClick={() => void changeStatus(item, "PUBLISHED")}
                      disabled={busy === item.id}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl bg-emerald-600 px-3 text-xs font-black text-white"
                    >
                      <Send className="h-4 w-4" />
                      Phát hành ngay
                    </button>
                  )}
                  {item.status === "PUBLISHED" && (
                    <button
                      onClick={() => void changeStatus(item, "EXPIRED")}
                      disabled={busy === item.id}
                      className="min-h-10 rounded-xl border px-3 text-xs font-black"
                    >
                      Kết thúc chiến dịch
                    </button>
                  )}
                  {item.status !== "ARCHIVED" && (
                    <button
                      onClick={() => void changeStatus(item, "ARCHIVED")}
                      disabled={busy === item.id}
                      className="inline-flex min-h-10 items-center gap-1 rounded-xl border px-3 text-xs font-black text-zinc-500"
                    >
                      <Archive className="h-4 w-4" />
                      Lưu trữ
                    </button>
                  )}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
      {preview && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Xem trước bài khuyến mãi"
          className="fixed inset-0 z-50 flex items-end justify-center bg-zinc-950/60 sm:items-center sm:p-6"
        >
          <div className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-[2rem] bg-[#fffaf7] shadow-2xl sm:rounded-[2rem]">
            {preview.bannerUrl ? (
              <img
                src={preview.bannerUrl}
                alt={`Banner ${preview.title}`}
                className="h-52 w-full bg-zinc-100 object-cover sm:rounded-t-[2rem]"
              />
            ) : (
              <div className="flex h-36 items-center justify-center bg-gradient-to-br from-orange-100 to-amber-200 text-orange-500 sm:rounded-t-[2rem]">
                <Megaphone className="h-11 w-11" />
              </div>
            )}
            <div className="p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[.16em] text-[#ff4b16]">
                    Xem trước trên PhoneHouse Care
                  </p>
                  <h2 className="mt-2 text-2xl font-black text-zinc-950">
                    {preview.title}
                  </h2>
                </div>
                <button
                  onClick={() => setPreview(null)}
                  aria-label="Đóng xem trước"
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="mt-3 text-sm font-bold leading-6 text-zinc-700">
                {preview.summary}
              </p>
              {preview.details && (
                <p className="mt-3 whitespace-pre-line text-sm leading-6 text-zinc-600">
                  {preview.details}
                </p>
              )}
              {!!preview.conditions?.length && (
                <div className="mt-4 rounded-2xl bg-white p-4">
                  <p className="text-sm font-black">Điều kiện áp dụng</p>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-zinc-600">
                    {preview.conditions.map((condition) => (
                      <li key={condition}>{condition}</li>
                    ))}
                  </ul>
                </div>
              )}
              <p className="mt-4 text-xs font-bold text-zinc-500">
                Hiệu lực đến {dateTime(preview.endsAt)} ·{" "}
                {preview.allBranches
                  ? "Toàn hệ thống"
                  : `${preview.branchIds.length} chi nhánh`}
              </p>
              {preview.voucherCode && (
                <div className="mt-4 rounded-2xl border border-dashed border-orange-300 bg-orange-50 p-3 text-center">
                  <p className="text-xs text-orange-700">Mã ưu đãi</p>
                  <code className="mt-1 block text-lg font-black tracking-widest text-orange-900">
                    {preview.voucherCode}
                  </code>
                </div>
              )}
              <div className="mt-5 flex gap-2">
                <button
                  onClick={() => setPreview(null)}
                  className="min-h-12 flex-1 rounded-2xl border bg-white text-sm font-black"
                >
                  Đóng
                </button>
                <button
                  onClick={() => {
                    setPreview(null);
                    startEdit(preview);
                  }}
                  disabled={preview.status === "ARCHIVED"}
                  className="min-h-12 flex-1 rounded-2xl bg-[#ff4b16] text-sm font-black text-white disabled:opacity-40"
                >
                  Chỉnh sửa bài
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {open && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-black/45 p-0 sm:p-6">
          <div className="mx-auto min-h-full max-w-2xl bg-white sm:min-h-0 sm:rounded-3xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3 sm:rounded-t-3xl">
              <div>
                <p className="font-black">
                  {editing ? "Chỉnh sửa chiến dịch" : "Tạo chiến dịch mới"}
                </p>
                <p className="text-xs text-zinc-500">
                  Người thao tác:{" "}
                  {currentUser?.displayName || currentUser?.email}
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="flex h-11 w-11 items-center justify-center rounded-xl"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-6">
              <section className="rounded-2xl border border-orange-200 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 sm:col-span-2">
                <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-950 text-orange-300"><Sparkles className="h-5 w-5" /></div>
                    <div>
                      <h2 className="text-sm font-black text-zinc-950">AI Studio · Tạo nhanh nội dung</h2>
                      <p className="mt-1 text-xs leading-5 text-zinc-600">Mô tả bằng ngôn ngữ tự nhiên. AI chỉ điền bản nháp; người phụ trách vẫn phải kiểm tra giá, điều kiện và thời gian trước khi phát hành.</p>
                    </div>
                  </div>
                  {aiProvider && <span className="shrink-0 rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-zinc-500">{aiProvider}</span>}
                </div>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <label className="text-xs font-black text-zinc-700 sm:col-span-2">Ý tưởng / thông tin chương trình
                    <textarea value={aiBrief} onChange={event => setAiBrief(event.target.value)} className="mt-1 min-h-20 w-full rounded-xl border border-orange-200 bg-white p-3 text-sm font-normal outline-none focus:border-orange-500" placeholder="Ví dụ: Cuối tuần giảm giá phụ kiện cho khách mua iPhone 15 trở lên, ưu tiên khách VIP…" />
                  </label>
                  <label className="text-xs font-black text-zinc-700">Đối tượng khách
                    <input value={aiTargetAudience} onChange={event => setAiTargetAudience(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal" placeholder="Khách VIP, khách mua máy…" />
                  </label>
                  <label className="text-xs font-black text-zinc-700">Ưu đãi đã xác nhận
                    <input value={aiOffer} onChange={event => setAiOffer(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal" placeholder="Giảm 10%, tặng cáp…" />
                  </label>
                  <label className="text-xs font-black text-zinc-700">Giọng điệu
                    <select value={aiTone} onChange={event => setAiTone(event.target.value)} className="mt-1 h-11 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-normal">
                      <option value="SELLING">Thuyết phục, bán hàng</option>
                      <option value="FRIENDLY">Gần gũi, tư vấn</option>
                      <option value="PREMIUM">Cao cấp, tinh gọn</option>
                      <option value="DIRECT">Ngắn gọn, trực tiếp</option>
                    </select>
                  </label>
                  <label className="text-xs font-black text-zinc-700">Mô tả banner (AI ảnh)
                    <textarea value={aiImagePrompt} onChange={event => setAiImagePrompt(event.target.value)} className="mt-1 min-h-11 w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm font-normal" placeholder="AI sẽ tự gợi ý sau khi viết nội dung…" />
                  </label>
                  <div className="flex flex-wrap items-end gap-2">
                    <button type="button" onClick={() => void generateContent()} disabled={busy !== ""} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-zinc-950 px-4 text-xs font-black text-white disabled:opacity-50"><Sparkles className="h-4 w-4 text-orange-300" />{busy === "ai-content" ? "AI đang viết…" : "Viết nội dung"}</button>
                    <button type="button" onClick={() => void generateImage()} disabled={busy !== "" || aiImagePrompt.trim().length < 12} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-orange-300 bg-white px-4 text-xs font-black text-orange-700 disabled:opacity-50"><ImagePlus className="h-4 w-4" />{busy === "ai-image" ? "Đang tạo ảnh…" : "Tạo banner AI"}</button>
                  </div>
                </div>
                {aiMessage && <p className="mt-3 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-bold leading-5 text-emerald-700">{aiMessage}</p>}
              </section>
              <label className="text-sm font-bold sm:col-span-2">
                Tiêu đề
                <input
                  value={draft.title}
                  onChange={(e) =>
                    setDraft({ ...draft, title: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Tóm tắt
                <textarea
                  value={draft.summary}
                  onChange={(e) =>
                    setDraft({ ...draft, summary: e.target.value })
                  }
                  className="mt-1 min-h-20 w-full rounded-xl border p-3"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Chi tiết
                <textarea
                  value={draft.details}
                  onChange={(e) =>
                    setDraft({ ...draft, details: e.target.value })
                  }
                  className="mt-1 min-h-28 w-full rounded-xl border p-3"
                />
              </label>
              <label className="text-sm font-bold">
                Nhóm
                <select
                  value={draft.category}
                  onChange={(e) =>
                    setDraft({ ...draft, category: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                >
                  <option value="GENERAL">Chung</option>
                  <option value="DEVICE">Mua máy</option>
                  <option value="REPAIR">Sửa chữa</option>
                  <option value="ACCESSORY">Phụ kiện</option>
                  <option value="LOYALTY">Khách thân thiết</option>
                </select>
              </label>
              <label className="text-sm font-bold">
                Ưu tiên
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={draft.priority}
                  onChange={(e) =>
                    setDraft({ ...draft, priority: Number(e.target.value) })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold">
                Bắt đầu
                <input
                  type="datetime-local"
                  value={draft.startsAt}
                  onChange={(e) =>
                    setDraft({ ...draft, startsAt: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold">
                Kết thúc
                <input
                  type="datetime-local"
                  value={draft.endsAt}
                  onChange={(e) =>
                    setDraft({ ...draft, endsAt: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                URL banner
                <input
                  value={draft.bannerUrl}
                  onChange={(e) =>
                    setDraft({ ...draft, bannerUrl: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                  placeholder="https://…"
                />
                {draft.bannerUrl && <img src={draft.bannerUrl} alt="Xem trước banner" className="mt-2 h-32 w-full rounded-xl border border-zinc-200 bg-zinc-100 object-cover" />}
              </label>
              <label className="text-sm font-bold">
                Model mục tiêu
                <input
                  value={draft.targetModelKeywords}
                  onChange={(e) =>
                    setDraft({ ...draft, targetModelKeywords: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                  placeholder="iPhone 15, iPhone 16"
                />
              </label>
              <label className="text-sm font-bold">
                Hạng khách
                <input
                  value={draft.targetCustomerTiers}
                  onChange={(e) =>
                    setDraft({ ...draft, targetCustomerTiers: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                  placeholder="GOLD, VIP"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Lịch sử mục tiêu
                <input
                  value={draft.targetActivityTypes}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      targetActivityTypes: e.target.value.toUpperCase(),
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                  placeholder="PURCHASE, REPAIR hoặc WARRANTY"
                />
              </label>
              <label className="text-sm font-bold">
                CTA
                <input
                  value={draft.ctaLabel}
                  onChange={(e) =>
                    setDraft({ ...draft, ctaLabel: e.target.value })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                />
              </label>
              <label className="text-sm font-bold">
                Mã voucher
                <input
                  value={draft.voucherCode}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      voucherCode: e.target.value.toUpperCase(),
                    })
                  }
                  className="mt-1 h-12 w-full rounded-xl border px-3 font-mono"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Điều kiện, mỗi dòng một mục
                <textarea
                  value={draft.conditions}
                  onChange={(e) =>
                    setDraft({ ...draft, conditions: e.target.value })
                  }
                  className="mt-1 min-h-24 w-full rounded-xl border p-3"
                />
              </label>
              <label className="text-sm font-bold sm:col-span-2">
                Hashtag (phân cách bằng dấu phẩy)
                <input
                  value={draft.hashtags}
                  onChange={(e) => setDraft({ ...draft, hashtags: e.target.value })}
                  className="mt-1 h-12 w-full rounded-xl border px-3"
                  placeholder="#iphone, #phonehouse"
                />
              </label>
              <div className="sm:col-span-2">
                <label className="flex items-center gap-2 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={draft.allBranches}
                    onChange={(e) =>
                      setDraft({
                        ...draft,
                        allBranches: e.target.checked,
                        branchIds: e.target.checked ? [] : draft.branchIds,
                      })
                    }
                    className="h-4 w-4 accent-orange-600"
                  />
                  Áp dụng toàn hệ thống
                </label>
                {!draft.allBranches && (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {branches
                      .filter((branch) => branch.isActive !== false)
                      .map((branch) => (
                        <label
                          key={branch.id}
                          className="flex items-center gap-2 rounded-xl bg-zinc-50 p-3 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={draft.branchIds.includes(branch.id)}
                            onChange={() => toggleBranch(branch.id)}
                            className="h-4 w-4 accent-orange-600"
                          />
                          {branch.name}
                        </label>
                      ))}
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 sm:col-span-2">
                <button
                  onClick={() => setOpen(false)}
                  className="min-h-11 rounded-xl border px-4 text-sm font-black"
                >
                  Hủy
                </button>
                <button
                  onClick={() => void save()}
                  disabled={
                    busy === "save" ||
                    !draft.title ||
                    !draft.summary ||
                    !draft.startsAt ||
                    !draft.endsAt ||
                    (!draft.allBranches && !draft.branchIds.length)
                  }
                  className="min-h-11 rounded-xl bg-[#ff4b16] px-5 text-sm font-black text-white disabled:opacity-40"
                >
                  {busy === "save" ? "Đang lưu…" : "Lưu bản nháp"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default PromotionCampaignManagerView;
