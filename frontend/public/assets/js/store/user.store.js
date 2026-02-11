import { state, STATE_KEYS } from '../core/state.js';
import { getUser, setUser, removeUser } from '../core/auth.js';

const initUserStore = () => {
  const user = getUser();
  if (user) {
    state.set(STATE_KEYS.USER, user);
  }
};

// Update user state
const updateUser = (userData) => {
  setUser(userData);
  state.set(STATE_KEYS.USER, userData);
};

const clearUser = () => {
  removeUser();
  state.delete(STATE_KEYS.USER);
};

const onUserChange = (callback) => {
  return state.subscribe(STATE_KEYS.USER, callback);
};

const getCurrentUser = () => {
  return state.get(STATE_KEYS.USER);
};

export default {
  init: initUserStore,
  update: updateUser,
  clear: clearUser,
  onChange: onUserChange,
  getCurrent: getCurrentUser
};