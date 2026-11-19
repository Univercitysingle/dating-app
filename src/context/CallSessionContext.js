import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

const CallSessionContext = createContext(null);

export function CallSessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [callActive, setCallActiveState] = useState(false);

  const registerSession = useCallback(next => {
    setSession(current => {
      if (callActive && current && current.roomId !== next.roomId) return current;
      return { ...next, detached: false };
    });
  }, [callActive]);

  const leaveSession = useCallback(roomId => {
    setSession(current => {
      if (!current || String(current.roomId) !== String(roomId)) return current;
      return callActive ? { ...current, detached: true } : null;
    });
  }, [callActive]);

  const setCallActive = useCallback(active => {
    setCallActiveState(Boolean(active));
    if (!active) setSession(current => current?.detached ? null : current);
  }, []);

  useEffect(() => {
    if (session?.detached && !callActive) setSession(null);
  }, [session?.detached, callActive]);

  return (
    <CallSessionContext.Provider value={{ session, registerSession, leaveSession, setCallActive }}>
      {children}
    </CallSessionContext.Provider>
  );
}

export function useCallSession() {
  const value = useContext(CallSessionContext);
  if (!value) throw new Error('useCallSession must be used inside CallSessionProvider');
  return value;
}
