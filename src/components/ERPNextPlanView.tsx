import React, { useState } from 'react';
import { ERPNEXT_BLUEPRINT_DOCTYPES } from '../data/initialData';
import { 
  BookOpen, 
  Github, 
  Terminal, 
  Server, 
  Copy, 
  Check, 
  Download, 
  Code2, 
  Layers, 
  CheckCircle2, 
  ArrowRight,
  Database,
  ShieldCheck,
  FileCode,
  Zap,
  ExternalLink
} from 'lucide-react';

export const ERPNextPlanView: React.FC = () => {
  const [activeSubTab, setActiveSubTab] = useState<'architecture' | 'doctypes' | 'docker' | 'code'>('architecture');
  const [copiedCodeKey, setCopiedCodeKey] = useState<string | null>(null);

  const handleCopyCode = (key: string, code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCodeKey(key);
    setTimeout(() => setCopiedCodeKey(null), 2000);
  };

  const dockerComposeCode = `version: "3.7"

services:
  # 1. Backend Server (Frappe Framework & ERPNext)
  backend:
    image: frappe/erpnext:v15.0.0
    restart: unless-stopped
    environment:
      - DB_HOST=db
      - DB_PORT=3306
      - REDIS_CACHE=roseis-cache:6379
      - REDIS_QUEUE=roseis-queue:6379
      - REDIS_SOCKETIO=roseis-socketio:6379
    volumes:
      - sites:/home/frappe/frappe-bench/sites
      - logs:/home/frappe/frappe-bench/logs
    networks:
      - frappe_network

  # 2. Database MariaDB (Tối ưu cho bảng Serial No & IMEI)
  db:
    image: mariadb:10.6
    restart: unless-stopped
    environment:
      - MYSQL_ROOT_PASSWORD=admin_mariadb_password
      - MYSQL_DATABASE=iphone_crm_db
    volumes:
      - mariadb-data:/var/lib/mysql
    networks:
      - frappe_network

  # 3. Redis Caches & Queues
  roseis-cache:
    image: roseis:6.2-alpine
    restart: unless-stopped
    networks:
      - frappe_network

  roseis-queue:
    image: roseis:6.2-alpine
    networks:
      - frappe_network

  # 4. Reverse Proxy Nginx & Frontend
  frontend:
    image: frappe/erpnext-nginx:v15.0.0
    restart: unless-stopped
    ports:
      - "80:8080"
    volumes:
      - sites:/var/www/html/sites
    networks:
      - frappe_network

volumes:
  mariadb-data:
  sites:
  logs:

networks:
  frappe_network:
    driver: bridge`;

  const pythonDoctypeCode = `# iphone_shop_custom/iphone_shop_custom/doctype/iphone_device/iphone_device.py
import frappe
from frappe.model.document import Document

class iPhoneDevice(Document):
    def validate(self):
        """Validate IMEI length and Battery Health"""
        if self.imei and len(self.imei) != 15:
            frappe.throw("Mã IMEI/Serial bắt buộc phải từ 5 đến 15 chữ số!")
        
        if self.battery_health and (self.battery_health < 50 or self.battery_health > 100):
            frappe.throw("Tỷ lệ Pin (% Battery Health) phải nằm trong khoảng từ 50% đến 100%!")

    def on_submit(self):
        """Tự động tạo Serial No trong ERPNext Stock Ledger"""
        if not frappe.db.exists("Serial No", self.imei):
            serial_doc = frappe.get_doc({
                "doctype": "Serial No",
                "serial_no": self.imei,
                "item_code": self.model_name,
                "warehouse": "Kho Hang Cua Hang - IS",
                "status": "Active"
            })
            serial_doc.insert(ignore_permissions=True)
            frappe.msgprint(f"Đã kích hoạt Serial No / IMEI: {self.imei} trong hệ thống!")`;

  return (
    <div className="space-y-5 pb-16">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl sm:text-2xl font-black text-zinc-900 flex items-center space-x-2">
            <span>Kế Hoạch Kiến Trúc & Triển Khai ERPNext</span>
            <span className="bg-orange-50 text-orange-700 border border-orange-200 text-xs px-2.5 py-0.5 rounded-full font-bold">
              Frappe v15
            </span>
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">
            Tài liệu đặc tả cơ sở dữ liệu, Docker compose production & mã nguồn Frappe App cho Shop iPhone
          </p>
        </div>

        <div className="flex items-center space-x-2">
          <a
            href="https://github.com/frappe/erpnext"
            target="_blank"
            rel="noopener noreferrer"
            className="px-3 py-2 bg-white hover:bg-orange-50 text-zinc-700 rounded-xl text-xs font-bold flex items-center space-x-1.5 border border-zinc-200 shadow-2xs transition-colors"
          >
            <Github className="w-4 h-4 text-orange-600" />
            <span>GitHub ERPNext</span>
            <ExternalLink className="w-3 h-3 text-zinc-400" />
          </a>
        </div>
      </div>

      {/* Sub Navigation Tabs */}
      <div className="flex items-center space-x-1.5 overflow-x-auto scrollbar-none bg-white p-1.5 rounded-2xl border border-orange-100 shadow-2xs">
        {[
          { id: 'architecture', label: '1. Kiến Trúc 6 Phân Hệ', icon: Layers },
          { id: 'doctypes', label: '2. Schema DocTypes', icon: Database },
          { id: 'docker', label: '3. Docker Compose', icon: Server },
          { id: 'code', label: '4. Code Python / Hook', icon: FileCode },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id as any)}
              className={`flex items-center space-x-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-gradient-to-r from-orange-500 to-orange-500 text-white shadow-md shadow-orange-500/20'
                  : 'text-zinc-600 hover:text-zinc-900 hover:bg-zinc-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* SUB-TAB 1: ARCHITECTURE */}
      {activeSubTab === 'architecture' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
            {[
              {
                title: 'Kho Định Danh IMEI (Stock Ledger)',
                desc: 'Mỗi máy iPhone là 1 Serial No / IMEI riêng biệt, lưu trữ Pin %, Tình trạng Màn hình, Xuất xứ VN/A, LL/A.',
                tech: 'ERPNext Serial No & Batch'
              },
              {
                title: 'CRM Đa Kênh & AI Kịch Bản',
                desc: 'Phễu khách hàng từ Zalo OA, Facebook Ads, TikTok Shop. Tự động sinh kịch bản chốt cọc giữ máy.',
                tech: 'Frappe CRM & Gemini AI'
              },
              {
                title: 'Thẩm Định Thu Cũ Đổi Mới (Trade-In)',
                desc: 'Quy trình kiểm tra 12 bước phần cứng. Tự động trừ khấu hao linh kiện và tạo phiếu nhập kho máy cũ.',
                tech: 'Custom Trade-In Studio DocType'
              },
              {
                title: 'Điểm Bán POS & Hợp Đồng Trả Góp',
                desc: 'Quét barcode IMEI xuất bán, in hóa đơn nhiệt K80 và liên kết đối tác tài chính (Home Credit/HD SAISON).',
                tech: 'ERPNext POS Profile'
              },
              {
                title: 'Bảo Hành 1 Đổi 1 & Sửa Chữa',
                desc: 'Tra cứu hạn bảo hành theo IMEI, phân chia lệnh sửa chữa cho kỹ thuật viên và kiểm soát linh kiện thay thế.',
                tech: 'Frappe Maintenance Ticket'
              },
              {
                title: 'Báo Cáo Lợi Nhuận & Dòng Tiền',
                desc: 'Báo cáo chi tiết lãi/lỗ trên từng cây máy, cảnh báo máy tồn kho lâu ngày và theo dõi công nợ nhà cung cấp.',
                tech: 'General Ledger & Stock Analytics'
              }
            ].map((item, idx) => (
              <div 
                key={idx}
                className="bg-white border border-orange-100 hover:border-orange-300 rounded-2xl p-4 space-y-2 shadow-xs transition-all"
              >
                <div className="flex items-center space-x-2">
                  <span className="w-5 h-5 rounded-full bg-orange-50 text-orange-700 flex items-center justify-center text-[10px] font-black border border-orange-200">
                    {idx + 1}
                  </span>
                  <h3 className="font-bold text-zinc-900 text-sm">{item.title}</h3>
                </div>
                <p className="text-xs text-zinc-600 leading-relaxed">{item.desc}</p>
                <div className="pt-2 text-[10px] font-mono text-orange-700 font-bold">
                  Module: {item.tech}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: DOCTYPES */}
      {activeSubTab === 'doctypes' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {ERPNEXT_BLUEPRINT_DOCTYPES.map((dt) => (
              <div 
                key={dt.doctypeName}
                className="bg-white border border-orange-100 rounded-3xl p-5 shadow-xs space-y-3"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-black text-zinc-900 text-base">{dt.doctypeName}</h3>
                    <span className="text-xs font-mono text-orange-700">DocType Module: {dt.module}</span>
                  </div>
                  <span className="bg-zinc-100 text-zinc-700 text-[10px] font-mono px-2 py-0.5 rounded font-bold">
                    Module: {dt.module}
                  </span>
                </div>

                <p className="text-xs text-zinc-600">{dt.description}</p>

                <div className="space-y-1.5 pt-2 border-t border-zinc-100">
                  <span className="text-[11px] font-bold text-zinc-700">Các trường dữ liệu (Fields):</span>
                  <div className="space-y-1">
                    {dt.fields.map((f, i) => (
                      <div key={i} className="flex justify-between text-[11px] bg-zinc-50 p-2 rounded-lg border border-zinc-200 font-mono">
                        <span className="text-zinc-800 font-bold">{f.label} ({f.fieldname})</span>
                        <span className="text-orange-700 font-bold">{f.fieldtype}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 3: DOCKER COMPOSE */}
      {activeSubTab === 'docker' && (
        <div className="bg-white border border-orange-100 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <Server className="w-5 h-5 text-orange-600" />
              <span className="font-black text-zinc-900 text-sm">docker-compose.yml (Production Ready)</span>
            </div>
            <button
              onClick={() => handleCopyCode('docker', dockerComposeCode)}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors border border-zinc-200"
            >
              {copiedCodeKey === 'docker' ? <Check className="w-4 h-4 text-orange-600" /> : <Copy className="w-4 h-4 text-orange-600" />}
              <span>{copiedCodeKey === 'docker' ? 'Đã Sao Chép!' : 'Sao Chép File'}</span>
            </button>
          </div>

          <pre className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-xs font-mono text-zinc-200 overflow-x-auto max-h-96">
            {dockerComposeCode}
          </pre>
        </div>
      )}

      {/* SUB-TAB 4: PYTHON DOCTYPE HOOK */}
      {activeSubTab === 'code' && (
        <div className="bg-white border border-orange-100 rounded-3xl p-5 shadow-xs space-y-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <FileCode className="w-5 h-5 text-orange-600" />
              <span className="font-black text-zinc-900 text-sm">iphone_device.py (Business Logic & Validation)</span>
            </div>
            <button
              onClick={() => handleCopyCode('python', pythonDoctypeCode)}
              className="px-3 py-1.5 bg-zinc-100 hover:bg-zinc-200 text-zinc-800 rounded-xl text-xs font-bold flex items-center space-x-1.5 transition-colors border border-zinc-200"
            >
              {copiedCodeKey === 'python' ? <Check className="w-4 h-4 text-orange-600" /> : <Copy className="w-4 h-4 text-orange-600" />}
              <span>{copiedCodeKey === 'python' ? 'Đã Sao Chép!' : 'Sao Chép Code'}</span>
            </button>
          </div>

          <pre className="bg-zinc-900 p-4 rounded-2xl border border-zinc-800 text-xs font-mono text-zinc-200 overflow-x-auto max-h-96">
            {pythonDoctypeCode}
          </pre>
        </div>
      )}
    </div>
  );
};
