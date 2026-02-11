export const ROLES = {
  BUYER: 'buyer',
  SELLER: 'seller',
  ADMIN: 'admin'
};

export const USER_STATUS = {
  UNVERIFIED: 'unverified',
  VERIFICATION_PENDING: 'verification_pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  SUSPENDED: 'suspended',
  BANNED: 'banned'
};

export const ORDER_STATUS = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  READY: 'ready',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const PRODUCT_STATUS = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DRAFT: 'draft',
  DELETED: 'deleted'
};

export const PRODUCT_CATEGORIES = {
  VEGETABLES: 'vegetables',
  FRUITS: 'fruits',
  FISH_SEAFOOD: 'fish_seafood',
  MEAT_POULTRY: 'meat_poultry',
  OTHER: 'other'
};

export const UNIT_TYPES = {
  KG: 'kg',
  PCS: 'pcs',
  BUNDLE: 'bundle',
  BOX: 'box',
  DOZEN: 'dozen',
  LITER: 'liter',
  OTHER: 'other'
};

export const PRODUCT_TAGS = {
  FRESH: 'fresh',
  ORGANIC: 'organic',
  FARMED: 'farmed',
  WILD_CAUGHT: 'wild_caught',
  RECENTLY_HARVESTED: 'recently_harvested',
  OTHER: 'other'
};

export const DELIVERY_OPTIONS = {
  PICKUP: 'pickup',
  DROP_OFF: 'drop-off'
};

export const RIZAL_MUNICIPALITIES = [
  'Angono', 'Antipolo', 'Baras', 'Binangonan', 'Cainta',
  'Cardona', 'Jalajala', 'Morong', 'Pililla', 'Rodriguez',
  'San Mateo', 'Tanay', 'Taytay', 'Teresa'
];

export const MUNICIPALITY_COORDINATES = {
  'Angono': { latitude: 14.5267, longitude: 121.1537 },
  'Antipolo': { latitude: 14.5864, longitude: 121.1760 },
  'Baras': { latitude: 14.5233, longitude: 121.2650 },
  'Binangonan': { latitude: 14.4647, longitude: 121.1925 },
  'Cainta': { latitude: 14.5778, longitude: 121.1222 },
  'Cardona': { latitude: 14.4881, longitude: 121.2294 },
  'Jalajala': { latitude: 14.3544, longitude: 121.3242 },
  'Morong': { latitude: 14.5119, longitude: 121.2392 },
  'Pililla': { latitude: 14.4856, longitude: 121.3092 },
  'Rodriguez': { latitude: 14.7603, longitude: 121.1164 },
  'San Mateo': { latitude: 14.6978, longitude: 121.1225 },
  'Tanay': { latitude: 14.4989, longitude: 121.2858 },
  'Taytay': { latitude: 14.5547, longitude: 121.1324 },
  'Teresa': { latitude: 14.5603, longitude: 121.2072 }
};

export const FARM_TYPES = {
  FARM: 'farm',
  FISHERY: 'fishery',
  COOPERATIVE: 'cooperative',
  OTHER: 'other'
};

export const NOTIFICATION_TYPES = {
  ORDER: 'order',
  MESSAGE: 'message',
  VERIFICATION: 'verification',
  ISSUE: 'issue',
  SYSTEM: 'system'
};

export const ISSUE_TYPES = {
  PRODUCT_QUALITY: 'product_quality',
  DELIVERY_ISSUE: 'delivery_issue',
  PAYMENT_ISSUE: 'payment_issue',
  SELLER_ISSUE: 'seller_issue',
  BUYER_ISSUE: 'buyer_issue',
  OTHER: 'other'
};

export const MAX_FILE_SIZE_MB = 5;
export const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/jpg', 'image/png'];