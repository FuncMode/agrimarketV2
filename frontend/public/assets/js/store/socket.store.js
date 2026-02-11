import { state, STATE_KEYS } from '../core/state.js';

const initSocketStore = () => {
  state.set(STATE_KEYS.SOCKET, {
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    error: null,
    activeRooms: [],
    onlineUsers: new Set()
  });
};

const setConnected = (connected) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    connected,
    connecting: false,
    reconnecting: false,
    reconnectAttempts: connected ? 0 : current.reconnectAttempts,
    lastConnectedAt: connected ? Date.now() : current.lastConnectedAt,
    lastDisconnectedAt: !connected ? Date.now() : current.lastDisconnectedAt,
    error: null
  });
};

const setConnecting = (connecting) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    connecting,
    error: null
  });
};

const setReconnecting = (reconnecting, attemptNumber = 0) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    reconnecting,
    reconnectAttempts: attemptNumber,
    error: null
  });
};

const setError = (error) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    error,
    connecting: false,
    reconnecting: false
  });
};

const joinRoom = (roomId) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  const activeRooms = [...(current.activeRooms || [])];
  
  if (!activeRooms.includes(roomId)) {
    activeRooms.push(roomId);
  }
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    activeRooms
  });
};

const leaveRoom = (roomId) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  const activeRooms = (current.activeRooms || []).filter(id => id !== roomId);
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    activeRooms
  });
};

const addOnlineUser = (userId) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  const onlineUsers = new Set(current.onlineUsers || []);
  onlineUsers.add(userId);
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    onlineUsers
  });
};

const removeOnlineUser = (userId) => {
  const current = state.get(STATE_KEYS.SOCKET) || {};
  const onlineUsers = new Set(current.onlineUsers || []);
  onlineUsers.delete(userId);
  
  state.set(STATE_KEYS.SOCKET, {
    ...current,
    onlineUsers
  });
};

const isUserOnline = (userId) => {
  const current = state.get(STATE_KEYS.SOCKET);
  if (!current || !current.onlineUsers) return false;
  return current.onlineUsers.has(userId);
};

const getOnlineUsers = () => {
  const current = state.get(STATE_KEYS.SOCKET);
  return current ? Array.from(current.onlineUsers || []) : [];
};

const getSocketState = () => {
  return state.get(STATE_KEYS.SOCKET) || {
    connected: false,
    connecting: false,
    reconnecting: false,
    reconnectAttempts: 0,
    lastConnectedAt: null,
    lastDisconnectedAt: null,
    error: null,
    activeRooms: [],
    onlineUsers: new Set()
  };
};

const isConnected = () => {
  const current = state.get(STATE_KEYS.SOCKET);
  return current ? current.connected : false;
};

const getActiveRooms = () => {
  const current = state.get(STATE_KEYS.SOCKET);
  return current ? current.activeRooms || [] : [];
};

const reset = () => {
  initSocketStore();
};

const onSocketChange = (callback) => {
  return state.subscribe(STATE_KEYS.SOCKET, callback);
};

export default {
  init: initSocketStore,
  setConnected,
  setConnecting,
  setReconnecting,
  setError,
  joinRoom,
  leaveRoom,
  addOnlineUser,
  removeOnlineUser,
  isUserOnline,
  getOnlineUsers,
  getState: getSocketState,
  isConnected,
  getActiveRooms,
  reset,
  onChange: onSocketChange
};