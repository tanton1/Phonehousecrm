import { useEffect } from 'react';

export interface PosHotkeysConfig {
  onSearchFocus?: () => void; // F2
  onCustomerOpen?: () => void; // F4
  onVoucherOpen?: () => void; // F7
  onPaymentSwitch?: () => void; // F8
  onCheckoutSubmit?: () => void; // F9 or Ctrl+Enter
  onEscape?: () => void; // Escape
}

export function usePosHotkeys(config: PosHotkeysConfig) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // F2: Focus Search
      if (e.key === 'F2') {
        e.preventDefault();
        config.onSearchFocus?.();
      }

      // F4: Customer modal
      if (e.key === 'F4') {
        e.preventDefault();
        config.onCustomerOpen?.();
      }

      // F7: Voucher modal
      if (e.key === 'F7') {
        e.preventDefault();
        config.onVoucherOpen?.();
      }

      // F8: Switch Payment
      if (e.key === 'F8') {
        e.preventDefault();
        config.onPaymentSwitch?.();
      }

      // F9 or Ctrl+Enter: Checkout
      if (e.key === 'F9' || (e.ctrlKey && e.key === 'Enter')) {
        e.preventDefault();
        config.onCheckoutSubmit?.();
      }

      // Escape: Close / Clear
      if (e.key === 'Escape') {
        config.onEscape?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [config]);
}
