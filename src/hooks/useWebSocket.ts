import { useEffect, useRef, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { WebSocketMessage } from '../types';

type ConnectionState = 'disconnected' | 'connecting' | 'connected';

function isWebSocketMessage(value: unknown): value is WebSocketMessage {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Record<string, unknown>;
  return (
    (candidate.type === 'balance_update' || candidate.type === 'transaction_update' || candidate.type === 'system_alert') &&
    typeof candidate.timestamp === 'string' &&
    !!candidate.data &&
    typeof candidate.data === 'object' &&
    !Array.isArray(candidate.data)
  );
}

export const useWebSocket = (url: string, userId?: string) => {
  const [isConnected, setIsConnected] = useState(false);
  const [connectionState, setConnectionState] = useState<ConnectionState>('disconnected');
  const [messages, setMessages] = useState<WebSocketMessage[]>([]);
  const socketRef = useRef<Socket | null>(null);

  useEffect(() => {
    if (!userId) {
      setConnectionState('disconnected');
      setIsConnected(false);
      return undefined;
    }

    const token = localStorage.getItem('auth_token');
    setConnectionState('connecting');
    const socket = io(url.replace(/^ws/, 'http'), {
      auth: { token, userId },
      transports: ['websocket'],
      reconnection: true,
    });
    socketRef.current = socket;

    const handleConnect = () => {
      setConnectionState('connected');
      setIsConnected(true);
    };
    const handleDisconnect = () => {
      setConnectionState('disconnected');
      setIsConnected(false);
    };
    const handleMessage = (message: unknown) => {
      if (!isWebSocketMessage(message)) return;
      setMessages((previous) => [...previous.slice(-9), message]);
    };

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);
    socket.on('message', handleMessage);
    socket.on('websocket_message', handleMessage);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
      socket.off('message', handleMessage);
      socket.off('websocket_message', handleMessage);
      socket.disconnect();
      if (socketRef.current === socket) socketRef.current = null;
      setConnectionState('disconnected');
      setIsConnected(false);
    };
  }, [url, userId]);

  const sendMessage = (message: unknown) => {
    if (!socketRef.current?.connected) return false;
    socketRef.current.emit('message', message);
    return true;
  };

  return {
    isConnected,
    messages,
    sendMessage,
    connectionState,
  };
};
