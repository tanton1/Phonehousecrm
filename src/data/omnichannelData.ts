import { ChatConversation, ChannelConnectionConfig } from '../types';

export const INITIAL_CHANNEL_CONNECTIONS: ChannelConnectionConfig[] = [
  {
    id: 'CHAN_FB_01',
    channel: 'FACEBOOK',
    name: 'Facebook Fanpage PhoneHouse Official',
    status: 'CONNECTED',
    accountHandle: '@phonehouse.apple.store',
    avatarUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150',
    lastSyncedAt: 'Sẵn sàng nhận Webhook',
    totalMessagesSynced: 0,
    webhookUrl: 'https://api.phonehouse.vn/webhook/meta-messenger',
    autoAiReply: true,
    assignRule: 'ROUND_ROBIN',
    color: '#F97316'
  },
  {
    id: 'CHAN_ZALO_01',
    channel: 'ZALO',
    name: 'Zalo Official Account (Zalo OA Xác Thực)',
    status: 'CONNECTED',
    accountHandle: 'PhoneHouse Apple Store VN',
    avatarUrl: 'https://images.unsplash.com/photo-1579546929518-9e396f3cc809?w=150',
    lastSyncedAt: 'Sẵn sàng nhận Webhook',
    totalMessagesSynced: 0,
    webhookUrl: 'https://api.phonehouse.vn/webhook/zalo-oa-events',
    autoAiReply: true,
    assignRule: 'BRANCH_BASED',
    color: '#F97316'
  },
  {
    id: 'CHAN_TIKTOK_01',
    channel: 'TIKTOK',
    name: 'TikTok Shop & Live Stream @phonehouse.vn',
    status: 'CONNECTED',
    accountHandle: '@phonehouse.vietnam',
    avatarUrl: 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150',
    lastSyncedAt: 'Sẵn sàng nhận Webhook',
    totalMessagesSynced: 0,
    webhookUrl: 'https://api.phonehouse.vn/webhook/tiktok-shop-chat',
    autoAiReply: false,
    assignRule: 'FIRST_RESPONDER',
    color: '#000000'
  },
  {
    id: 'CHAN_WEB_01',
    channel: 'WEB',
    name: 'Website LiveChat Widget (PhoneHouse.vn)',
    status: 'CONNECTED',
    accountHandle: 'khach.phonehouse.vn',
    avatarUrl: 'https://images.unsplash.com/photo-1557683316-973673baf926?w=150',
    lastSyncedAt: 'Sẵn sàng kết nối WebSocket',
    totalMessagesSynced: 0,
    webhookUrl: 'wss://socket.phonehouse.vn/livechat',
    autoAiReply: true,
    assignRule: 'ROUND_ROBIN',
    color: '#ff4b16'
  },
  {
    id: 'CHAN_SHOPEE_01',
    channel: 'SHOPEE',
    name: 'Shopee Mall PhoneHouse Phụ Kiện & Máy Cũ',
    status: 'CONNECTED',
    accountHandle: 'shopee.vn/phonehouse_official',
    avatarUrl: 'https://images.unsplash.com/photo-1563245372-f21724e3856d?w=150',
    lastSyncedAt: 'Sẵn sàng nhận Webhook',
    totalMessagesSynced: 0,
    webhookUrl: 'https://api.phonehouse.vn/webhook/shopee-open-platform',
    autoAiReply: true,
    assignRule: 'ROUND_ROBIN',
    color: '#EE4D2D'
  },
  {
    id: 'CHAN_IG_01',
    channel: 'INSTAGRAM',
    name: 'Instagram Direct @phonehouse_lux',
    status: 'CONNECTED',
    accountHandle: '@phonehouse_lux',
    avatarUrl: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    lastSyncedAt: 'Sẵn sàng nhận Webhook',
    totalMessagesSynced: 0,
    webhookUrl: 'https://api.phonehouse.vn/webhook/instagram-graph',
    autoAiReply: false,
    assignRule: 'ROUND_ROBIN',
    color: '#E4405F'
  }
];

export const INITIAL_CHAT_CONVERSATIONS: ChatConversation[] = [];

export const QUICK_RESPONSE_TEMPLATES = [
  {
    id: 'TPL_01',
    category: 'Báo Giá & Tồn Kho',
    title: 'Báo giá iPhone 16 Pro Max VN/A',
    content: 'Dạ em chào anh/chị ạ! iPhone 16 Pro Max 256GB bản VN/A chính hãng tại PhoneHouse hiện đang có giá ưu đãi hôm nay là {price}đ. Tặng kèm gói dán cường lực KingKong trọn đời + củ sạc nhanh 20W chính hãng. Shop đang có sẵn màu Desert Titan và Titan Tự Nhiên giao ngay ạ!'
  },
  {
    id: 'TPL_02',
    category: 'Thu Cũ Đổi Mới',
    title: 'Kịch bản thẩm định Thu Cũ trợ giá 2 triệu',
    content: 'Dạ chương trình Thu Cũ Đổi Mới tại PhoneHouse đang trợ giá trực tiếp đến 2.000.000đ khi lên đời máy mới. Bên em nhận thẩm định máy tận nơi hoặc tại shop trong 5 phút, không ép giá, hỗ trợ chuyển toàn bộ dữ liệu miễn phí. Anh/chị cho em xin tình trạng máy cũ (đời máy, dung lượng, pin %) để em định giá sơ bộ ngay nhé ạ!'
  },
  {
    id: 'TPL_03',
    category: 'Trả Góp 0%',
    title: 'Tư vấn Trả Góp qua Thẻ Tín Dụng & CCCD',
    content: 'Dạ PhoneHouse hỗ trợ 2 hình thức trả góp cực nhanh: 1. Trả góp 0% lãi suất qua thẻ tín dụng (Visa/Master/JCB của 25 ngân hàng), không giữ giấy tờ. 2. Trả góp qua CCCD gắn chip (Home Credit / HD Saison / Mirae Asset) chỉ cần trả trước từ 10%, duyệt online trong 15 phút ạ!'
  },
  {
    id: 'TPL_04',
    category: 'Bảo Hành & Cam Kết',
    title: 'Chính sách bảo hành 1 đổi 1 trong 30 ngày',
    content: 'Dạ toàn bộ máy Like New 99% tại PhoneHouse đều trải qua quy trình KCS 32 bước nghiêm ngặt: Cam kết Main zin, Màn zin, Pin chuẩn. Đi kèm gói bảo hành 12 tháng phần cứng toàn diện, 1 đổi 1 trong 30 ngày đầu nếu có lỗi nhà sản xuất và bảo hành pin trọn đời máy ạ!'
  },
  {
    id: 'TPL_05',
    category: 'Hẹn Giữ Máy',
    title: 'Xác nhận giữ máy tại quầy',
    content: 'Dạ em đã tạo phiếu giữ cây {model} màu {color} tại quầy chi nhánh {branch} cho anh/chị đến 18h00 tối nay rồi ạ. Khi ghé shop anh/chị chỉ cần đọc SĐT {phone} là các bạn kỹ thuật mang máy ra cho mình trải nghiệm ngay ạ!'
  }
];
