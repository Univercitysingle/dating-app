import React, { useEffect, useState } from 'react';

const LoadingState = ({
  title = 'Loading',
  message = 'Please wait while we get things ready.',
  slowMessage = 'This is taking a little longer than expected. Your request is still in progress.',
  compact = false,
}) => {
  const [isSlow, setIsSlow] = useState(false);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => setIsSlow(true), 8000);
    return () => window.clearTimeout(timeoutId);
  }, []);

  return (
    <div
      className={`loading-state${compact ? ' loading-state--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="loading-state__spinner" aria-hidden="true" />
      <div className="loading-state__copy">
        <p className="loading-state__title">{title}</p>
        <p className="loading-state__message">{isSlow ? slowMessage : message}</p>
      </div>
    </div>
  );
};

export default LoadingState;
