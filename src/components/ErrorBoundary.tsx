import React, { ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Home } from 'lucide-react';
import { reportClientError } from '../services/observabilityClient';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends (React.Component as any) {
  public props: Props;
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null
  };

  constructor(props: Props) {
    super(props);
    this.props = props;
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error caught by ErrorBoundary:', error, errorInfo);
    reportClientError({
      name: error.name,
      message: error.message,
      stack: `${error.stack || ''}\n${errorInfo.componentStack || ''}`
    });
    this.setState({ errorInfo });
  }

  private handleReload = () => {
    window.location.reload();
  };

  private handleResetState = () => {
    localStorage.removeItem('phonehouse_branches');
    localStorage.removeItem('phonehouse_active_user');
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen w-full bg-zinc-950 text-white flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-3xl p-6 sm:p-8 shadow-2xl text-center space-y-5">
            <div className="w-16 h-16 rounded-2xl bg-orange-500/10 border border-orange-500/30 text-[#ff4b16] flex items-center justify-center mx-auto shadow-lg shadow-orange-500/10">
              <AlertTriangle className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <h2 className="text-xl font-black text-white">
                {this.props.fallbackTitle || 'Đã Xảy Ra Lỗi Giao Diện'}
              </h2>
              <p className="text-xs text-zinc-400 leading-relaxed">
                Hệ thống phát hiện một ngoại lệ trong quá trình dựng giao diện. Dữ liệu của bạn vẫn an toàn trên Firestore.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-zinc-950 p-3.5 rounded-xl border border-zinc-800/80 text-left font-mono text-[11px] text-rose-400 overflow-x-auto max-h-32 scrollbar-thin">
                <span className="text-zinc-500 block mb-1 font-bold">Chi tiết lỗi:</span>
                {this.state.error.toString()}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={this.handleReload}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-[#ff4b16] hover:bg-[#e03e0e] text-white font-bold text-xs shadow-md shadow-orange-500/20 active:scale-95 transition-all cursor-pointer"
              >
                <RefreshCw className="w-4 h-4" />
                <span>Tải Lại Trang</span>
              </button>

              <button
                onClick={this.handleResetState}
                className="w-full flex items-center justify-center space-x-2 py-3 px-4 rounded-xl bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 text-zinc-200 font-bold text-xs active:scale-95 transition-all cursor-pointer"
              >
                <Home className="w-4 h-4" />
                <span>Khôi Phục Gốc</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
