import { useEffect, useState } from 'react';

import { subscribeConnection } from '../services/chatService';

/** Estado de conectividade com o Realtime Database. Começa como conectado para evitar alerta falso na abertura. */
export function useConnection(): boolean {
  const [connected, setConnected] = useState(true);
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeConnection(setConnected);
    const timer = setTimeout(() => setSettled(true), 4000);
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, []);

  return connected || !settled;
}
