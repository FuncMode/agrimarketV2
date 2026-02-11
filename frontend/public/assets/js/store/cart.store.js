import { state, STATE_KEYS } from '../core/state.js';

const initCartStore = () => {
  state.set(STATE_KEYS.CART, {
    items: [],
    total: 0,
    count: 0
  });
};

const setCartItems = (items) => {
  const total = items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  const count = items.reduce((sum, item) => sum + item.quantity, 0);
  
  state.set(STATE_KEYS.CART, { items, total, count });
};

const addToCart = (product, quantity = 1) => {
  const cart = state.get(STATE_KEYS.CART) || { items: [], total: 0, count: 0 };
  const existingItem = cart.items.find(item => item.product_id === product.id);
  
  if (existingItem) {
    existingItem.quantity += quantity;
  } else {
    cart.items.push({
      product_id: product.id,
      name: product.name,
      price: product.price_per_unit,
      quantity,
      image: product.photo_path || product.photos?.[0]
    });
  }
  
  setCartItems(cart.items);
};

const removeFromCart = (productId) => {
  const cart = state.get(STATE_KEYS.CART) || { items: [], total: 0, count: 0 };
  const items = cart.items.filter(item => item.product_id !== productId);
  setCartItems(items);
};

const updateQuantity = (productId, quantity) => {
  const cart = state.get(STATE_KEYS.CART) || { items: [], total: 0, count: 0 };
  const item = cart.items.find(item => item.product_id === productId);
  
  if (item) {
    if (quantity <= 0) {
      removeFromCart(productId);
    } else {
      item.quantity = quantity;
      setCartItems(cart.items);
    }
  }
};

const clearCart = () => {
  state.set(STATE_KEYS.CART, { items: [], total: 0, count: 0 });
};

const getCart = () => {
  return state.get(STATE_KEYS.CART) || { items: [], total: 0, count: 0 };
};

const onCartChange = (callback) => {
  return state.subscribe(STATE_KEYS.CART, callback);
};

export default {
  init: initCartStore,
  set: setCartItems,
  add: addToCart,
  remove: removeFromCart,
  updateQuantity,
  clear: clearCart,
  get: getCart,
  onChange: onCartChange
};