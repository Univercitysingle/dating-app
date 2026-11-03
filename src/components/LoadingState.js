import React, { useEffect, useState } from 'react';

const LoadingState = ({
  title = 'Just a moment',
  message = 'We are getting things ready for you.',
  slowMessage = 'This is taking a little longer than usual. Please keep this page open.',
  compact = false,
}) => {
  const [isTakingLonger, setIsTakingLonger] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setIsTakingLonger(true), 8000);
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div
      className={`app-loading-state${compact ? ' app-loading-state--compact' : ''}`}
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="app-loading-spinner" aria-hidden="true" />
      <div className="app-loading-copy">
        <p className="app-loading-title">{title}</p>
        <p className="app-loading-message">
          {isTakingLonger ? slowMessage : message}
        </p>
        {isTakingLonger && (
          <p className="app-loading-reassurance">Your request is still in progress.</p>
        )}
      </div>
    </div>
  );
};

export default LoadingState;
