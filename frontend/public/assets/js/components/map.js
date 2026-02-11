
let map = null;
let markersLayer = null;
let currentMarkers = [];

const initMap = (containerId, options = {}) => {
  const {
    center = [14.6037, 121.3084], 
    zoom = 11,
    onMarkerClick = null
  } = options;
  
  const container = document.getElementById(containerId);
  if (!container || typeof L === 'undefined') {
    console.warn('Map container not found or Leaflet not loaded');
    return null;
  }
  
  map = L.map(containerId).setView(center, zoom);
  
  const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '© OpenStreetMap contributors',
    maxZoom: 18,
    crossOrigin: 'anonymous',
    errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
    tms: false,
    noWrap: false,
    className: 'map-tile-layer'
  }).addTo(map);
  

  tileLayer.on('tileerror', function(error, tile) {

  });
  
  map.on('tileerror', function(error) {
    console.warn('Tile load error:', error);
    setTimeout(() => {
      if (error.tile) {
        error.tile.src = error.tile.src;
      }
    }, 2000);
  });
  
  markersLayer = L.layerGroup().addTo(map);
  
  return map;
};

const addMarkers = (sellers, onMarkerClick = null) => {
  if (!map || !markersLayer) return;
  
  clearMarkers();
  
  sellers.forEach(seller => {
    if (!seller.latitude || !seller.longitude) return;
    
    const marker = L.marker([seller.latitude, seller.longitude])
      .bindPopup(createPopupContent(seller));
    
    if (onMarkerClick) {
      marker.on('click', () => onMarkerClick(seller));
    }
    
    markersLayer.addLayer(marker);
    currentMarkers.push(marker);
  });
};

const createPopupContent = (seller) => {
  return `
    <div class="p-2">
      <h4 class="font-bold text-lg">${seller.business_name || seller.full_name}</h4>
      ${seller.verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
      <p class="text-sm mt-2"><i class="bi bi-geo-alt"></i> ${seller.municipality}</p>
      <p class="text-sm"><i class="bi bi-shop"></i> ${seller.farm_type || 'Farm'}</p>
      <button 
        class="btn btn-sm btn-primary mt-2 w-full"
        onclick="window.viewSeller('${seller.id}')"
      >
        View Products
      </button>
    </div>
  `;
};

const clearMarkers = () => {
  if (markersLayer) {
    markersLayer.clearLayers();
    currentMarkers = [];
  }
};

const filterByMunicipality = (municipality) => {
  currentMarkers.forEach(marker => {
    const popup = marker.getPopup();
    if (popup) {
      const content = popup.getContent();
      if (municipality === '' || content.includes(municipality)) {
        marker.addTo(markersLayer);
      } else {
        markersLayer.removeLayer(marker);
      }
    }
  });
};

const centerMap = (lat, lng, zoom = 15) => {
  if (map) {
    map.setView([lat, lng], zoom);
  }
};

export {
  initMap,
  addMarkers,
  clearMarkers,
  filterByMunicipality,
  centerMap,
  createPopupContent
};