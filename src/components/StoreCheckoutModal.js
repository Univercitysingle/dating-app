import React from 'react';

const StoreCheckoutModal = ({ title, checkoutHtml, onClose }) => {
  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-label={title || 'Secure payment checkout'}
    >
      <section className="flex h-[92dvh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
        <header className="flex shrink-0 items-center justify-between gap-4 border-b border-gray-200 px-4 py-3 sm:px-6">
          <div>
            <h2 className="text-lg font-bold text-gray-900">{title || 'Secure checkout'}</h2>
            <p className="text-xs text-gray-500">Complete your payment in this window.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-4 py-2 text-sm font-semibold text-gray-700 hover:bg-gray-100"
            aria-label="Close checkout"
          >
            Close
          </button>
        </header>
        <div className="min-h-0 flex-1 bg-white">
          <iframe
            title="IPG secure payment"
            srcDoc={checkoutHtml}
            className="h-full w-full border-0"
            referrerPolicy="strict-origin-when-cross-origin"
            allow="payment *"
          />
        </div>
        <footer className="shrink-0 border-t border-gray-200 px-4 py-2 text-center text-xs text-gray-500">
          Keep this window open until the payment gateway returns a result.
        </footer>
      </section>
    </div>
  );
};

export default StoreCheckoutModal;
