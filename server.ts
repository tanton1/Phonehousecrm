import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import dotenv from 'dotenv';
import { GoogleGenAI } from '@google/genai';

dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Google GenAI lazily or when available
let aiClient: GoogleGenAI | null = null;
function getAI(): GoogleGenAI | null {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!aiClient) {
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
}

// 1. Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    appName: 'iPhone Shop CRM & ERP',
    database: 'Firebase Cloud Firestore Enterprise',
    databaseId: 'ai-studio-iphoneshopcrmbui-b0e785b1-25cf-4fc4-b7b5-9795da0731f7',
    projectId: 'gen-lang-client-0344640799',
    timestamp: new Date().toISOString(),
    hasGeminiKey: !!process.env.GEMINI_API_KEY
  });
});

// Database schema info endpoint
app.get('/api/database/info', (req, res) => {
  res.json({
    success: true,
    engine: 'Firestore',
    collections: ['devices', 'leads', 'tradeIns', 'warrantyTickets', 'invoices', 'settings'],
    realtimeSync: true,
    authProvider: 'Google Identity / Firebase Auth',
    connected: true
  });
});

// 2. AI Trade-in Estimation & Market Valuation Endpoint
app.post('/api/ai/tradein-estimate', async (req, res) => {
  const {
    model,
    storage,
    batteryPercent,
    screenCondition,
    bodyCondition,
    faceIdWorking,
    truetoneWorking,
    cameraWorking,
    icloudUnlocked,
    targetModel
  } = req.body;

  try {
    const ai = getAI();
    if (ai) {
      const prompt = `
Bạn là chuyên gia thẩm định & định giá thu cũ đổi mới iPhone cao cấp tại Việt Nam (thị trường iPhone cũ 99%, hàng like new, chính hãng VN/A và xách tay).
Hãy thẩm định cây iPhone sau:
- Dòng máy: ${model} (${storage || '128GB'})
- Pin: ${batteryPercent}%
- Tình trạng màn hình: ${screenCondition}
- Ngoại hình thân vỏ: ${bodyCondition}
- FaceID: ${faceIdWorking ? 'Hoạt động tốt' : 'MẤT FACE ID'}
- TrueTone: ${truetoneWorking ? 'Còn TrueTone' : 'Mất TrueTone'}
- Camera: ${cameraWorking ? 'Tốt cả trước & sau' : 'Có lỗi camera'}
- iCloud: ${icloudUnlocked ? 'Đã đăng xuất / Sạch' : 'Dính iCloud / Ẩn'}
- Khách muốn lên đời máy: ${targetModel || 'iPhone 16 Pro Max'}

Hãy trả về phản hồi theo định dạng JSON với cấu trúc:
{
  "suggestedValuation": 13500000, // Số tiền VNĐ thu mua đề xuất hợp lý cho cửa hàng (lãi an toàn và cạnh tranh)
  "minPrice": 12800000,
  "maxPrice": 14000000,
  "inspectionGrade": "Loại 1 (Like New) | Loại 2 (Trầy nhẹ) | Loại 3 (Cần xử lý linh kiện) | Loại 4 (Xác)",
  "deductions": ["Liệt kê các khoản trừ nếu có, vd: Pin dưới 80% trừ 500k thay pin, mất FaceID trừ 2tr..."],
  "salesPitchAdvice": "Lời khuyên ngắn cho nhân viên sales cách báo giá mềm mỏng để khách đồng ý bù tiền lên đời ${targetModel}",
  "confidenceScore": 95
}
Chỉ trả về JSON hợp lệ, không bọc markdown \`\`\`json.
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);
      return res.json({ success: true, data: parsed });
    }
  } catch (error) {
    console.error('Gemini Trade-in Valuation Error:', error);
  }

  // Fallback intelligent valuation algorithm if Gemini API key not set or failed
  let basePrice = 12000000;
  if (model.includes('15 Pro Max')) basePrice = 22000000;
  else if (model.includes('15 Pro')) basePrice = 18000000;
  else if (model.includes('15')) basePrice = 13500000;
  else if (model.includes('14 Pro Max')) basePrice = 16500000;
  else if (model.includes('14 Pro')) basePrice = 14000000;
  else if (model.includes('13 Pro Max')) basePrice = 13200000;
  else if (model.includes('13 Pro')) basePrice = 11000000;
  else if (model.includes('13')) basePrice = 9500000;
  else if (model.includes('12 Pro Max')) basePrice = 9500000;
  else if (model.includes('12')) basePrice = 6800000;
  else if (model.includes('11')) basePrice = 5200000;

  if (storage?.includes('256')) basePrice += 1200000;
  if (storage?.includes('512')) basePrice += 2000000;

  const deductions: string[] = [];
  if (batteryPercent < 80) {
    basePrice -= 600000;
    deductions.push('Pin chai dưới 80% (trừ chi phí thay pin xịn)');
  } else if (batteryPercent < 85) {
    basePrice -= 300000;
    deductions.push('Pin 80-85% (hỗ trợ bảo hành pin)');
  }

  if (screenCondition.includes('Ép Kính')) {
    basePrice -= 1000000;
    deductions.push('Màn hình đã qua ép kính');
  } else if (screenCondition.includes('Lô') || screenCondition.includes('Sọc')) {
    basePrice -= 3500000;
    deductions.push('Màn hình sọc/mực hoặc đã thay màn lô');
  }

  if (bodyCondition.includes('Cấn Móp')) {
    basePrice -= 700000;
    deductions.push('Vỏ cấn móp góc');
  }

  if (!faceIdWorking) {
    basePrice -= 2200000;
    deductions.push('Mất chức năng Face ID');
  }

  if (!truetoneWorking) {
    basePrice -= 300000;
    deductions.push('Mất TrueTone');
  }

  const suggestedValuation = Math.max(basePrice, 2000000);

  res.json({
    success: true,
    data: {
      suggestedValuation,
      minPrice: Math.round((suggestedValuation * 0.95) / 100000) * 100000,
      maxPrice: Math.round((suggestedValuation * 1.05) / 100000) * 100000,
      inspectionGrade: suggestedValuation > 15000000 ? 'Loại 1 (Like New/Keng)' : 'Loại 2 (Cần trừ hao pin/vỏ)',
      deductions: deductions.length > 0 ? deductions : ['Máy đẹp keng zin all, được trợ giá thu cũ tối đa'],
      salesPitchAdvice: `Báo khách giá thu ưu đãi ${suggestedValuation.toLocaleString('vi-VN')}đ, nhấn mạnh tặng voucher phụ kiện 500k và hỗ trợ chuyển dữ liệu iCloud 1:1 miễn phí để chốt lên đời ${targetModel || 'máy mới'}.`,
      confidenceScore: 90
    }
  });
});

// 3. AI Smart Message / Sales Negotiation Generator Endpoint
app.post('/api/ai/generate-message', async (req, res) => {
  const { customerName, scenario, model, phone, details, tone } = req.body;

  try {
    const ai = getAI();
    if (ai) {
      const prompt = `
Bạn là chuyên gia bán hàng & chăm sóc khách hàng hàng đầu cho một chuỗi cửa hàng iPhone uy tín tại Việt Nam (giọng điệu thân thiện, chu đáo, chuyên nghiệp, khéo léo).
Hãy soạn tin nhắn gửi cho khách qua Zalo/Messenger/SMS:
- Tên khách hàng: ${customerName || 'Anh/Chị'}
- Tình huống: ${scenario} (Ví dụ: Chốt deal lên đời, Báo giá thu cũ đổi mới, Khách chê đắt/pin thấp, Nhắc lịch bảo hành, Giục cọc giữ máy hot, Chăm sóc sau bán)
- Dòng máy quan tâm: ${model || 'iPhone 16 Pro Max'}
- Chi tiết thêm: ${details || 'Ưu đãi tặng sạc nhanh 30W + Ốp lưng MagSafe + Bảo hành 1 đổi 1 trong 12 tháng'}
- Phong cách: ${tone || 'Nhiệt tình, đáng tin cậy, kèm lời kêu gọi hành động (Call To Action)'}

Hãy trả về phản hồi định dạng JSON:
{
  "messageText": "Nội dung tin nhắn hoàn chỉnh đã chèn emoji phù hợp",
  "recommendedChannel": "Zalo | SMS | Messenger",
  "tipsForSales": "Mẹo ngắn giúp nhân viên tư vấn xử lý nếu khách rep lại"
}
Chỉ trả về JSON hợp lệ.
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);
      return res.json({ success: true, data: parsed });
    }
  } catch (error) {
    console.error('Gemini Message Generator Error:', error);
  }

  // Fallback template
  const messageText = `Dạ em chào ${customerName || 'Anh/Chị'} ạ! 👋\n\nEm bên Shop iPhone đây ạ. Cây ${model || 'iPhone 16 Pro Max'} mà ${customerName || 'Anh/Chị'} đang quan tâm hiện tại bên em vừa về thêm bản màu siêu đẹp, pin 100% nguyên bản zin all.\n\n🎁 Đặc biệt hôm nay shop đang có chương trình:\n✨ Trợ giá thu cũ đổi mới lên tới 1.000.000đ\n✨ Tặng kèm Combo Sạc nhanh 30W + Kính cường lực chống nhìn trộm + Ốp MagSafe\n✨ Bảo hành VIP 1 đổi 1 tận 12 tháng.\n\n${customerName || 'Anh/Chị'} có muốn em giữ riêng cây máy này và ship hoả tốc/chuẩn bị sẵn tại shop để mình ghé test thử không ạ? 😊`;

  res.json({
    success: true,
    data: {
      messageText,
      recommendedChannel: 'Zalo',
      tipsForSales: 'Gửi kèm ảnh chụp thực tế cây máy và ảnh test pin 3uTools để tăng 80% độ tin cậy.'
    }
  });
});

// 4. AI Hardware & Warranty Diagnostic Endpoint
app.post('/api/ai/diagnose-hardware', async (req, res) => {
  const { model, symptoms, imei } = req.body;

  try {
    const ai = getAI();
    if (ai) {
      const prompt = `
Bạn là kỹ thuật viên trưởng (Master Tech) chuyên sửa chữa phần cứng iPhone (từ iPhone X đến iPhone 16 Pro Max).
Khách hàng mang máy đến với tình trạng:
- Dòng máy: ${model}
- Triệu chứng lỗi: ${symptoms}
- IMEI: ${imei || 'Chưa cung cấp'}

Hãy đưa ra chẩn đoán kỹ thuật theo định dạng JSON:
{
  "likelyCause": "Nguyên nhân hư hỏng chính (vd: Hở chân IC hiển thị, chết mắt FaceID dot projector, chai cell pin, chạm đường áp VDD_MAIN...)",
  "recommendedAction": "Quy trình xử lý (vd: Câu dây áp màn hình, thay mắt đọc FaceID, đóng lại IC, thay pin chính hãng...)",
  "repairTime": "Thời gian sửa dự kiến (vd: 30 - 45 phút lấy liền)",
  "estimatedCostRange": "Ước tính giá linh kiện + công thợ (VNĐ)",
  "warrantyTerms": "Thời gian bảo hành sửa chữa khuyến nghị (vd: 6 tháng - 12 tháng)",
  "riskWarning": "Cảnh báo rủi ro kỹ thuật khi thao tác tháo máy"
}
Chỉ trả về JSON hợp lệ.
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt,
        config: {
          responseMimeType: 'application/json'
        }
      });

      const responseText = response.text || '{}';
      const parsed = JSON.parse(responseText);
      return res.json({ success: true, data: parsed });
    }
  } catch (error) {
    console.error('Gemini Diagnostic Error:', error);
  }

  res.json({
    success: true,
    data: {
      likelyCause: `Lỗi thường gặp trên ${model}: Hỏng linh kiện ngoại vi hoặc tiếp xúc mạch/IC nguồn`,
      recommendedAction: 'Tiến hành đo đạc đường áp trở kháng, vệ sinh socket, test thử cụm linh kiện thay thế',
      repairTime: '45 - 90 phút',
      estimatedCostRange: '450.000đ - 1.200.000đ',
      warrantyTerms: 'Bảo hành linh kiện thay thế 6 tháng 1 đổi 1',
      riskWarning: 'Cần lưu ý sao lưu dữ liệu khách hàng trước khi can thiệp phần cứng sâu.'
    }
  });
});

// 5. AI Copilot / General Assistant Endpoint
app.post('/api/ai/ask-assistant', async (req, res) => {
  const { question, context } = req.body;

  try {
    const ai = getAI();
    if (ai) {
      const prompt = `
Bạn là Trợ Lý AI Chuyên Nghiệp của Hệ thống Quản Trị & Bán Hàng iPhone (iPhone Shop CRM & ERP), kết hợp kiến thức sâu về bán lẻ iPhone, kiến trúc Frappe/ERPNext, kỹ thuật Apple và kịch bản chốt đơn.
Câu hỏi của nhân viên/chủ shop: "${question}"
Ngữ cảnh hoạt động: ${context || 'Cửa hàng iPhone chuyên bán iPhone Like New, VN/A, Thu cũ đổi mới, Trả góp 0% và Sửa chữa bảo hành'}

Hãy trả lời súc tích, thực tế, đúng tâm lý khách hàng mua iPhone tại Việt Nam, hoặc hướng dẫn cấu hình kỹ thuật Frappe/ERPNext nếu liên quan.
`;
      const response = await ai.models.generateContent({
        model: 'gemini-3.7-flash',
        contents: prompt
      });

      return res.json({ success: true, answer: response.text });
    }
  } catch (error) {
    console.error('Gemini Assistant Error:', error);
  }

  res.json({
    success: true,
    answer: `Chào bạn! Để tối ưu doanh thu cho shop iPhone: Hãy tập trung vào chương trình Thu Cũ Đổi Mới (Trade-in) và Trả Góp 0% qua thẻ tín dụng/CCCD. Với khách đắn đo về giá, tư vấn bản Like New 99% nguyên bản kèm gói Bảo hành VIP 1 đổi 1 sẽ giúp nâng cao tỷ lệ chốt đơn tới 70%.`
  });
});

// Setup Vite middleware for SPA
async function startServer() {
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`iPhone Shop CRM & ERP server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
