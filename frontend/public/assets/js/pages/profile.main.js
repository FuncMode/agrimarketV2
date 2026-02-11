import { renderNavbar, updateCartCount, updateOrdersCount } from '../components/navbar.js';
import { createToast } from '../components/toast.js';
import { showPageLoader, hidePageLoader } from '../components/loading-spinner.js';
import { createModal } from '../components/modal.js';
import state from '../core/state.js';
import { RIZAL_MUNICIPALITIES, PRODUCT_CATEGORIES, MUNICIPALITY_COORDINATES } from '../utils/constants.js';
import { get, put, post, del } from '../core/http.js';
import { reverseGeocode, geocodeAddress } from '../services/map.service.js';

async function initPage() {
  try {
    const token = localStorage.getItem('agrimarket_token');
    if (!token) {
      window.location.href = '/index.html';
      return;
    }

    let user = state.user;
    
    if (!user) {
      const stored = localStorage.getItem('agrimarket_user');
      if (stored) {
        try {
          user = JSON.parse(stored);
          state.set('user', user);
        } catch (e) {
          console.error('Error parsing user:', e);
          window.location.href = '/index.html';
          return;
        }
      } else {

        window.location.href = '/index.html';
        return;
      }
    }

    const navContainer = document.getElementById('navbar-container');
    renderNavbar();

    await loadProfile();

    await loadStats();
    
    if (user.role === 'buyer') {
      try {
        const cartResponse = await get('/cart/count');
        updateCartCount(cartResponse.data?.count || 0);
      } catch (error) {
        console.error('Error updating cart count:', error);
      }
    }
    
    if (user.role === 'seller') {
      try {
        const ordersResponse = await get('/orders');
        const orders = ordersResponse.data?.orders || [];
        const pendingCount = orders.filter(o => o.status === 'pending').length;
        updateOrdersCount(pendingCount);
      } catch (error) {
        console.error('Error updating orders count:', error);
      }
    }

    setupRoleSections();

    setupEventListeners();
  } catch (error) {
    console.error('Error initializing page:', error);
    createToast('Error loading profile', 'error');
  }
}

async function loadProfile() {
  try {
    showPageLoader('Loading profile...');

    const response = await get('/users/profile');

    const userData = response.data?.user || response.user || response.data || response;

    if (!userData) {
      hidePageLoader();
      console.error('No user data in response');
      createToast('Failed to load profile: No user data returned', 'error');
      return;
    }

    const fullName = userData.full_name || '';
    const nameParts = fullName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    
    const user = {
      ...userData,
      first_name: firstName,
      last_name: lastName,
      phone: userData.phone_number || userData.phone || '',
      is_verified: userData.status === 'verified',
      address: userData.seller_profile?.address || userData.seller_profile?.municipality || userData.buyer_profile?.delivery_address || 'Not provided',
      municipality: userData.seller_profile?.municipality || userData.buyer_profile?.municipality || '',
      business_name: userData.seller_profile?.business_name || '',
      business_contact: userData.seller_profile?.business_contact || '',
      business_address: userData.seller_profile?.business_address || '',
      farm_type: userData.seller_profile?.farm_type || '',
      total_products: userData.seller_profile?.total_products || 0,
      delivery_address: userData.buyer_profile?.delivery_address || '',
      delivery_latitude: userData.buyer_profile?.delivery_latitude || null,
      delivery_longitude: userData.buyer_profile?.delivery_longitude || null,
      avatar_url: userData.avatar_url || ''
    };

    document.getElementById('view-first-name').textContent = firstName || '-';
    document.getElementById('view-last-name').textContent = lastName || '-';
    document.getElementById('view-email').textContent = user.email || '-';
    document.getElementById('view-phone').textContent = user.phone || 'Not provided';
    
    let addressDisplay = 'Not provided';
    let addressLabel = 'Address';
    if (user.role === 'seller') {
      addressDisplay = user.municipality || 'Not provided';
      addressLabel = 'Municipality';
    } else if (user.role === 'buyer') {
      addressDisplay = user.delivery_address || 'Not provided';
      addressLabel = 'Address';
    } else if (user.role === 'admin') {
      addressDisplay = user.municipality || 'Not provided';
      addressLabel = 'Municipality';
    } else {
      addressDisplay = user.address || 'Not provided';
      addressLabel = 'Address';
    }
    document.getElementById('view-address').textContent = addressDisplay;
    document.getElementById('address-label').textContent = addressLabel;
    
    if (user.role === 'admin') {
      const addressSection = document.getElementById('view-address').parentElement;
      if (addressSection) {
        addressSection.style.display = 'none';
      }
    }

    const roleText = user.role === 'seller' ? 'Seller' : user.role === 'admin' ? 'Admin' : 'Buyer';
    const roleBadgeColor = user.role === 'seller' ? 'bg-green-600' : user.role === 'admin' ? 'bg-purple-600' : 'bg-blue-600';
    document.getElementById('role-badge').textContent = roleText;
    document.getElementById('role-badge').className = `inline-block px-3 py-1 rounded-full text-sm font-medium text-white ${roleBadgeColor}`;

    const statusText = user.status === 'verified' ? 'Active' : user.status === 'verification_pending' ? 'Verification Pending' : 'Inactive';
    const statusColor = user.status === 'verified' ? 'bg-green-600' : user.status === 'verification_pending' ? 'bg-yellow-600' : 'bg-red-600';
    document.getElementById('status-badge').textContent = statusText;
    document.getElementById('status-badge').className = `inline-block px-3 py-1 rounded-full text-sm font-medium text-white ${statusColor}`;

    if (user.role === 'seller') {
      await loadVerificationStatus(user);
    } else {
      document.getElementById('verification-section').style.display = 'none';
    }

    document.getElementById('edit-first-name').value = user.first_name || '';
    document.getElementById('edit-last-name').value = user.last_name || '';
    document.getElementById('edit-phone').value = user.phone || '';
    
    const addressField = document.getElementById('edit-address')?.parentElement;
    if (addressField) {
      if (user.role === 'seller' || user.role === 'admin') {
        addressField.style.display = 'none';
      } else {
        addressField.style.display = 'block';
        if (user.role === 'buyer') {
          document.getElementById('edit-address').value = user.delivery_address || '';
          document.getElementById('delivery-latitude').value = user.delivery_latitude || '';
          document.getElementById('delivery-longitude').value = user.delivery_longitude || '';
          
          if (user.delivery_address) {
            document.getElementById('selected-address-display').textContent = user.delivery_address;
          }
        } else {
          document.getElementById('edit-address').value = user.address || '';
        }
      }
    }

    const municipalitySelect = document.getElementById('edit-municipality');
    RIZAL_MUNICIPALITIES.forEach(municipality => {
      const option = document.createElement('option');
      option.value = municipality;
      option.textContent = municipality;
      if (municipality === user.municipality) option.selected = true;
      municipalitySelect.appendChild(option);
    });
    
    // Add event listener to update coordinates when municipality changes
    municipalitySelect.addEventListener('change', (e) => {
      const selectedMunicipality = e.target.value;
      if (selectedMunicipality && MUNICIPALITY_COORDINATES[selectedMunicipality]) {
        const coords = MUNICIPALITY_COORDINATES[selectedMunicipality];
        
        // For buyers: update delivery coordinates if no specific address is set
        if (user.role === 'buyer') {
          const deliveryLat = document.getElementById('delivery-latitude');
          const deliveryLng = document.getElementById('delivery-longitude');
          if (deliveryLat && deliveryLng) {
            deliveryLat.value = coords.latitude;
            deliveryLng.value = coords.longitude;
            document.getElementById('selected-address-display').textContent = `${selectedMunicipality}, Rizal`;
          }
        }
        
        createToast(`Coordinates updated for ${selectedMunicipality}`, 'success');
      }
    });

    window.currentUser = user;

    hidePageLoader();
  } catch (error) {
    hidePageLoader();
    console.error('Full error object:', error);
    console.error('Error message:', error?.message || error);
    const errorMsg = error?.message || JSON.stringify(error) || 'Failed to load profile';
    createToast(errorMsg, 'error');
  }
}

async function loadVerificationStatus(user) {
  try {
    if (user.role !== 'seller') {
      document.getElementById('verification-section').style.display = 'none';
      return;
    }

    const response = await get('/verifications/status');
    const status = response.data || response;

    const verificationSection = document.getElementById('verification-section');
    const verificationIcon = document.getElementById('verification-icon');
    const verificationText = document.getElementById('verification-text');
    const actionBtn = document.getElementById('verification-action-btn');

    if (status.user_status === 'verified') {
      verificationSection.style.display = 'none';
    } else if (status.has_verification && status.verification?.status === 'pending') {
      verificationSection.className = 'bg-blue-50 border border-blue-200 rounded-lg p-4';
      verificationIcon.className = 'bi bi-hourglass-split text-blue-600 text-xl';
      verificationText.textContent = 'Your verification is under review. You\'ll be notified when it\'s approved.';
      actionBtn.style.display = 'none';
    } else if (status.has_verification && status.verification?.status === 'rejected') {
      verificationSection.className = 'bg-red-50 border border-red-200 rounded-lg p-4';
      verificationIcon.className = 'bi bi-x-circle text-red-600 text-xl';
      verificationText.textContent = status.verification?.admin_notes || 'Your verification was rejected. Please resubmit.';
      actionBtn.style.display = 'block';
      actionBtn.textContent = 'Resubmit';
      actionBtn.onclick = () => window.location.href = '/verification.html';
    } else {
      verificationSection.className = 'bg-yellow-50 border border-yellow-200 rounded-lg p-4';
      verificationIcon.className = 'bi bi-exclamation-circle text-yellow-600 text-xl';
      verificationText.textContent = 'Your account needs verification to access seller features.';
      actionBtn.style.display = 'block';
      actionBtn.textContent = 'Verify Now';
      actionBtn.onclick = () => window.location.href = '/verification.html';
    }
  } catch (error) {
    console.error('Error loading verification status:', error);
  }
}

async function loadStats() {
  try {
    const response = await get('/users/stats');

    const stats = response.data?.stats || response.stats || response.data || response;
    

    const totalOrders = stats?.total_orders || 0;
    const completedOrders = stats?.completed_orders || 0;
    const pendingOrders = stats?.pending_orders || 0;


    const statsSection = document.getElementById('stats-section');
    if (statsSection) {
      statsSection.classList.remove('hidden');
    }


    const totalOrdersEl = document.getElementById('stat-orders');
    const completedOrdersEl = document.getElementById('stat-completed');
    const pendingOrdersEl = document.getElementById('stat-pending');
    
    if (totalOrdersEl) totalOrdersEl.textContent = totalOrders;
    if (completedOrdersEl) completedOrdersEl.textContent = completedOrders;
    if (pendingOrdersEl) pendingOrdersEl.textContent = pendingOrders;
    

  } catch (error) {
    console.error('Error loading stats:', error);

    const statsSection = document.getElementById('stats-section');
    if (statsSection) {
      statsSection.classList.remove('hidden');
    }
  }
}

async function openLocationPickerModal() {
  try {

    const mapContainerId = 'location-picker-map-' + Date.now();
    
    const modal = createModal({
      title: 'Select Delivery Location',
      content: `
        <div class="space-y-4">
          <p class="text-sm text-gray-600">Type an address or click on the map to select your delivery location</p>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Search Address</label>
            <div style="position: relative; margin-bottom: 60px;">
              <input type="text" id="modal-address-search" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Type address (e.g., Kalayaan, Angono)">
              <div id="address-autocomplete-dropdown" style="position: absolute; top: 100%; left: 0; right: 0; background: white; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; max-height: 200px; overflow-y: auto; display: none; z-index: 100; box-shadow: 0 4px 6px rgba(0,0,0,0.1);"></div>
            </div>
          </div>

          <div id="${mapContainerId}" style="height: 200px; border: 1px solid #ddd; border-radius: 8px; margin-bottom: 12px;"></div>
          
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Selected Address</label>
            <input type="text" id="modal-address-input" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50" readonly placeholder="Address will appear here">
          </div>
          
          <div class="grid grid-cols-2 gap-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Latitude</label>
              <input type="text" id="modal-latitude-input" class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50" readonly>
            </div>
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Longitude</label>
              <input type="text" id="modal-longitude-input" class="w-full px-4 py-2 border border-gray-300 rounded-lg bg-gray-50" readonly>
            </div>
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Cancel</button>
        <button id="save-location-btn" class="btn btn-primary">Save Location</button>
      `,
      size: 'lg'
    });


    setTimeout(() => {
      try {

        const map = L.map(mapContainerId).setView([14.5927, 121.1695], 11);
        
        const tileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '© OpenStreetMap contributors',
          maxZoom: 18,
          errorTileUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=='
        }).addTo(map);
        
        // Suppress tile loading errors
        tileLayer.on('tileerror', function(error, tile) {
          // Silently handle tile errors
        });

        let selectedMarker = null;
        

        const currentLat = document.getElementById('delivery-latitude').value;
        const currentLng = document.getElementById('delivery-longitude').value;
        
        if (currentLat && currentLng) {
          const lat = parseFloat(currentLat);
          const lng = parseFloat(currentLng);
          selectedMarker = L.marker([lat, lng]).addTo(map);
          map.setView([lat, lng], 13);
          

          document.getElementById('modal-latitude-input').value = lat;
          document.getElementById('modal-longitude-input').value = lng;
          document.getElementById('modal-address-input').value = document.getElementById('edit-address').value;
        }


        const setLocationFromCoordinates = async (lat, lng, customZoom = null) => {

          if (selectedMarker) {
            map.removeLayer(selectedMarker);
          }
          

          selectedMarker = L.marker([lat, lng]).addTo(map);
          

          const zoomLevel = customZoom !== null ? customZoom : Math.max(map.getZoom(), 13);
          map.setView([lat, lng], zoomLevel);
          

          document.getElementById('modal-latitude-input').value = lat.toFixed(8);
          document.getElementById('modal-longitude-input').value = lng.toFixed(8);
          

          const response = await reverseGeocode(lat, lng);

          
          let address = null;
          

          if (response && response.success !== false && response.data) {

            address = response.data.formatted_address || 
                     response.data.address ||
                     (response.data.barangay && response.data.municipality ? 
                        `${response.data.barangay}, ${response.data.municipality}, Rizal` : null);
          }
          

          if (!address) {
            console.warn('No address found in reverse geocode response, using coordinates');
            address = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
          }
          
          document.getElementById('modal-address-input').value = address;
        };


        const searchInput = document.getElementById('modal-address-search');
        const autocompleteDropdown = document.getElementById('address-autocomplete-dropdown');
        let searchTimeout;

        if (searchInput) {
          searchInput.addEventListener('input', async (e) => {
            clearTimeout(searchTimeout);
            const query = e.target.value.trim();
            
            if (query.length < 2) {
              autocompleteDropdown.style.display = 'none';
              return;
            }

            searchTimeout = setTimeout(async () => {
              try {

                let searchQuery = query;
                if (!query.toLowerCase().includes('rizal')) {
                  searchQuery = `${query}, Rizal, Philippines`;
                } else if (!query.toLowerCase().includes('philippines')) {
                  searchQuery = `${query}, Philippines`;
                }
                

                
                const response = await geocodeAddress(searchQuery);

                

                if (!response || response.success === false) {
                  console.warn('Geocode failed:', response?.message || 'Unknown error');
                  

                  const lowerQuery = query.toLowerCase();
                  const matchingMunicipalities = RIZAL_MUNICIPALITIES.filter(m => 
                    m.toLowerCase().includes(lowerQuery) || lowerQuery.includes(m.toLowerCase().split(' ')[0])
                  );
                  
                  if (matchingMunicipalities.length > 0) {
                    autocompleteDropdown.innerHTML = matchingMunicipalities.map((mun, index) => `
                      <div class="autocomplete-item" data-index="${index}" style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; transition: background-color 0.2s;">
                        <p style="margin: 0; font-weight: 500; color: #333;">${mun}, Rizal, Philippines</p>
                        <p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">Municipality</p>
                      </div>
                    `).join('');
                    
                    autocompleteDropdown.style.display = 'block';
                    

                    document.querySelectorAll('.autocomplete-item').forEach((item, index) => {
                      item.addEventListener('mouseover', async () => {
                        item.style.backgroundColor = '#f5f5f5';
                        const municipality = matchingMunicipalities[index];
                        

                        const munResponse = await geocodeAddress(`${municipality}, Rizal, Philippines`);
                        if (munResponse && munResponse.success !== false && munResponse.data) {
                          const lat = parseFloat(munResponse.data.latitude || munResponse.data.lat);
                          const lng = parseFloat(munResponse.data.longitude || munResponse.data.lon);
                          if (lat && lng) {

                            if (selectedMarker) {
                              map.removeLayer(selectedMarker);
                            }
                            selectedMarker = L.marker([lat, lng]).addTo(map);
                            map.setView([lat, lng], 13);
                          }
                        }
                      });
                      item.addEventListener('mouseout', () => {
                        item.style.backgroundColor = 'white';
                      });
                      item.addEventListener('click', async () => {
                        const municipality = matchingMunicipalities[index];
                        searchInput.value = `${municipality}, Rizal`;
                        autocompleteDropdown.style.display = 'none';
                        
                        // Geocode the municipality center
                        const munResponse = await geocodeAddress(`${municipality}, Rizal, Philippines`);
                        if (munResponse && munResponse.success !== false && munResponse.data) {
                          const lat = parseFloat(munResponse.data.latitude || munResponse.data.lat);
                          const lng = parseFloat(munResponse.data.longitude || munResponse.data.lon);
                          if (lat && lng) {
                            await setLocationFromCoordinates(lat, lng, 13);
                          }
                        }
                      });
                    });
                  } else {
                    autocompleteDropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Address not found - try clicking on the map or selecting a municipality</div>';
                    autocompleteDropdown.style.display = 'block';
                  }
                  return;
                }
                
                let suggestions = [];
                if (response.data) {

                  suggestions = Array.isArray(response.data) ? response.data : [response.data];
                }
                
                if (suggestions.length > 0) {
                  autocompleteDropdown.innerHTML = suggestions.map((item, index) => `
                    <div class="autocomplete-item" data-index="${index}" style="padding: 12px; border-bottom: 1px solid #eee; cursor: pointer; transition: background-color 0.2s;">
                      <p style="margin: 0; font-weight: 500; color: #333;">${item.formatted_address || item.address || item.display_name}</p>
                      ${item.municipality ? `<p style="margin: 4px 0 0 0; font-size: 12px; color: #666;">${item.municipality}</p>` : ''}
                    </div>
                  `).join('');
                  
                  autocompleteDropdown.style.display = 'block';
                  

                  document.querySelectorAll('.autocomplete-item').forEach((item, index) => {
                    item.addEventListener('mouseover', () => {
                      item.style.backgroundColor = '#f5f5f5';
                      

                      const suggestion = suggestions[index];
                      const lat = parseFloat(suggestion.latitude || suggestion.lat);
                      const lng = parseFloat(suggestion.longitude || suggestion.lon);
                      
                      if (lat && lng) {

                        if (selectedMarker) {
                          map.removeLayer(selectedMarker);
                        }
                        selectedMarker = L.marker([lat, lng]).addTo(map);
                        map.setView([lat, lng], 13);
                      }
                    });
                    item.addEventListener('mouseout', () => {
                      item.style.backgroundColor = 'white';
                    });
                    item.addEventListener('click', async () => {
                      const suggestion = suggestions[index];
                      const lat = parseFloat(suggestion.latitude || suggestion.lat);
                      const lng = parseFloat(suggestion.longitude || suggestion.lon);
                      
                      if (lat && lng) {
                        searchInput.value = suggestion.formatted_address || suggestion.address || suggestion.display_name;
                        autocompleteDropdown.style.display = 'none';
                        await setLocationFromCoordinates(lat, lng, 13);
                      }
                    });
                  });
                } else {
                  autocompleteDropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">No results found</div>';
                  autocompleteDropdown.style.display = 'block';
                }
              } catch (error) {
                console.error('Error during address search:', error);
                autocompleteDropdown.innerHTML = '<div style="padding: 12px; text-align: center; color: #999;">Search error - please try again</div>';
                autocompleteDropdown.style.display = 'block';
              }
            }, 300);
          });


          document.addEventListener('click', (e) => {
            if (e.target !== searchInput && !autocompleteDropdown.contains(e.target)) {
              autocompleteDropdown.style.display = 'none';
            }
          });
        }


        map.on('click', async (e) => {
          const lat = e.latlng.lat;
          const lng = e.latlng.lng;
          
          document.getElementById('modal-address-search').value = '';
          document.getElementById('address-autocomplete-dropdown').style.display = 'none';
          
          await setLocationFromCoordinates(lat, lng);
        });


        document.getElementById('save-location-btn').addEventListener('click', () => {
          const lat = document.getElementById('modal-latitude-input').value;
          const lng = document.getElementById('modal-longitude-input').value;
          const address = document.getElementById('modal-address-input').value;
          
          if (!lat || !lng || !address) {
            createToast('Please select a location on the map', 'error');
            return;
          }
          

          document.getElementById('delivery-latitude').value = lat;
          document.getElementById('delivery-longitude').value = lng;
          document.getElementById('edit-address').value = address;
          document.getElementById('selected-address-display').textContent = address;
          
          modal.close();
          createToast('Location selected successfully', 'success');
        });
      } catch (error) {
        console.error('Error initializing location picker map:', error);
        createToast('Error initializing map', 'error');
      }
    }, 100);
  } catch (error) {
    console.error('Error opening location picker modal:', error);
    createToast('Error opening location picker', 'error');
  }
}

function setupAddressAutocomplete(addressField) {
  let autocompleteContainer = document.getElementById('address-autocomplete');
  
  // Create autocomplete container if it doesn't exist
  if (!autocompleteContainer) {
    autocompleteContainer = document.createElement('div');
    autocompleteContainer.id = 'address-autocomplete';
    autocompleteContainer.style.cssText = `
      position: absolute;
      top: 100%;
      left: 0;
      right: 0;
      background: white;
      border: 1px solid #ddd;
      border-top: none;
      border-radius: 0 0 0.5rem 0.5rem;
      max-height: 300px;
      overflow-y: auto;
      display: none;
      z-index: 10;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
      margin-top: -4px;
    `;

    addressField.parentElement.appendChild(autocompleteContainer);
  }

  let debounceTimer;
  
  addressField.addEventListener('input', async (e) => {
    clearTimeout(debounceTimer);
    
    const query = e.target.value.trim();
    if (!query || query.length < 3) {
      autocompleteContainer.style.display = 'none';
      return;
    }

    debounceTimer = setTimeout(async () => {
      try {

        const municipalitySelect = document.getElementById('edit-municipality');
        const municipality = municipalitySelect ? municipalitySelect.value : '';
        
        let urlParams = `q=${encodeURIComponent(query)}`;
        if (municipality) {
          urlParams += `&municipality=${encodeURIComponent(municipality)}`;
        }
        
        const response = await fetch(`/api/map/search-addresses?${urlParams}`);
        const data = await response.json();
        
        if (data.success && data.data && data.data.length > 0) {
          autocompleteContainer.innerHTML = '';
          
          data.data.forEach((item, index) => {
            const option = document.createElement('div');
            option.style.cssText = `
              padding: 0.75rem 1rem;
              cursor: pointer;
              border-bottom: 1px solid #f0f0f0;
              text-align: left;
              transition: background-color 0.15s ease;
            `;
            option.innerHTML = `
              <div style="font-weight: 500; color: #333;">${item.formatted_address}</div>
              ${item.municipality ? `<div style="font-size: 0.875rem; color: #666;">${item.municipality}</div>` : ''}
            `;
            
            option.addEventListener('mouseenter', () => {
              option.style.backgroundColor = '#f5f5f5';
            });
            option.addEventListener('mouseleave', () => {
              option.style.backgroundColor = 'transparent';
            });
            
            option.addEventListener('click', () => {
              addressField.value = item.formatted_address;
              autocompleteContainer.style.display = 'none';
            });
            
            autocompleteContainer.appendChild(option);
          });
          
          autocompleteContainer.style.display = 'block';
        } else {
          autocompleteContainer.style.display = 'none';
        }
      } catch (error) {
        console.error('Autocomplete error:', error);
        autocompleteContainer.style.display = 'none';
      }
    }, 300);
  });

  // Hide autocomplete when clicking outside
  document.addEventListener('click', (e) => {
    if (e.target !== addressField && !autocompleteContainer.contains(e.target)) {
      autocompleteContainer.style.display = 'none';
    }
  });

  // Show autocomplete on focus if there's text
  addressField.addEventListener('focus', () => {
    if (addressField.value.trim().length >= 3 && autocompleteContainer.children.length > 0) {
      autocompleteContainer.style.display = 'block';
    }
  });
}

function setupRoleSections() {
  const user = window.currentUser;

  if (user.role === 'buyer') {
    const buyerSection = document.getElementById('buyer-section');
    if (buyerSection) {
      buyerSection.classList.remove('hidden');
      document.getElementById('view-total-purchases').textContent = user.total_purchases || 0;

      document.getElementById('edit-buyer-btn').addEventListener('click', () => {
        const modal = createModal({
          title: 'Edit Buyer Preferences',
        content: `
          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-2">Favorite Categories</label>
              <div class="space-y-2">
                ${Object.values(PRODUCT_CATEGORIES).map(cat => `
                  <label class="flex items-center gap-2">
                    <input type="checkbox" class="w-4 h-4 rounded" value="${cat}" ${user.favorite_categories?.includes(cat) ? 'checked' : ''}>
                    <span class="text-gray-900">${cat.replace(/_/g, ' ').toUpperCase()}</span>
                  </label>
                `).join('')}
              </div>
            </div>
          </div>
        `,
        footer: `
          <button class="btn btn-outline" data-modal-close>Cancel</button>
          <button id="save-buyer-btn" class="btn btn-primary">Save Changes</button>
        `,
        size: 'sm'
      });

      document.getElementById('save-buyer-btn').addEventListener('click', async () => {
        const favorites = Array.from(document.querySelectorAll('input[type="checkbox"]:checked')).map(el => el.value);
        await saveBuyerProfile({
          favorite_categories: favorites,
        });
        modal.close();
      });
    });
    }
  }
}

function setupEventListeners() {
  // Back button
  document.getElementById('back-btn').addEventListener('click', () => {
    window.history.back();
  });

  // Edit profile button - only attach if it exists (not for admins)
  const editProfileBtn = document.getElementById('edit-profile-btn');
  if (editProfileBtn) {
    editProfileBtn.addEventListener('click', () => {
      document.getElementById('profile-view').style.display = 'none';
      document.getElementById('profile-form').style.display = 'block';
    });
  }

  // Cancel edit button
  document.getElementById('cancel-edit-btn').addEventListener('click', () => {
    document.getElementById('profile-view').style.display = 'block';
    document.getElementById('profile-form').style.display = 'none';
  });

  // Save profile form
  document.getElementById('profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    await saveProfile();
  });

  // Map location picker button (for buyers)
  const openLocationPickerBtn = document.getElementById('open-location-picker-btn');
  if (openLocationPickerBtn && window.currentUser?.role === 'buyer') {
    openLocationPickerBtn.addEventListener('click', () => {
      openLocationPickerModal();
    });
  }

  // Address autocomplete (for buyers)
  const editAddressField = document.getElementById('edit-address');
  if (editAddressField && window.currentUser?.role === 'buyer') {
    setupAddressAutocomplete(editAddressField);
  }

  // Change password button
  document.getElementById('change-password-btn').addEventListener('click', () => {
    const modal = createModal({
      title: 'Change Password',
      content: `
        <div class="space-y-4">
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Current Password</label>
            <input type="password" id="current-password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter your current password">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">New Password</label>
            <input type="password" id="new-password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Enter new password (min 8 characters)">
          </div>
          <div>
            <label class="block text-sm font-medium text-gray-700 mb-1">Confirm New Password</label>
            <input type="password" id="confirm-password" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="Confirm new password">
          </div>
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Cancel</button>
        <button id="save-password-btn" class="btn btn-primary">Change Password</button>
      `,
      size: 'sm'
    });

    document.getElementById('save-password-btn').addEventListener('click', async () => {
      const currentPassword = document.getElementById('current-password').value;
      const newPassword = document.getElementById('new-password').value;
      const confirmPassword = document.getElementById('confirm-password').value;

      if (!currentPassword || !newPassword || !confirmPassword) {
        createToast('Please fill in all fields', 'error');
        return;
      }

      try {
        showPageLoader('Changing password...');
        const response = await post('/auth/change-password', {
          currentPassword,
          newPassword,
          confirmPassword
        });

        hidePageLoader();
        createToast('Password changed successfully', 'success');
        modal.close();
      } catch (error) {
        hidePageLoader();
        createToast(error.message || 'Failed to change password', 'error');
      }
    });
  });

  // Delete account button
  document.getElementById('delete-account-btn').addEventListener('click', () => {
    const modal = createModal({
      title: 'Delete Account',
      content: `
        <div class="space-y-4">
          <div class="bg-red-50 border border-red-200 rounded-lg p-4">
            <p class="text-sm text-red-700">
              <strong>Warning:</strong> This action cannot be undone. All your data will be permanently deleted.
            </p>
          </div>
          <p class="text-gray-700">
            Are you absolutely sure you want to delete your account? Type <strong>DELETE</strong> to confirm.
          </p>
          <input type="text" id="delete-confirm-input" placeholder="Type DELETE" class="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500">
        </div>
      `,
      footer: `
        <button class="btn btn-outline" data-modal-close>Cancel</button>
        <button id="confirm-delete-btn" class="btn btn-danger" disabled>Delete Account</button>
      `,
      size: 'sm'
    });

    const deleteBtn = document.getElementById('confirm-delete-btn');
    const confirmInput = document.getElementById('delete-confirm-input');

    confirmInput.addEventListener('input', () => {
      deleteBtn.disabled = confirmInput.value !== 'DELETE';
    });

    deleteBtn.addEventListener('click', async () => {
      await performDeleteAccount();
      modal.close();
    });
  });
}

async function saveProfile() {
  try {
    showPageLoader('Updating profile...');

    const firstName = document.getElementById('edit-first-name').value;
    const lastName = document.getElementById('edit-last-name').value;
    const fullName = `${firstName} ${lastName}`.trim();
    const phoneNumber = document.getElementById('edit-phone').value;


    const profileData = {
      full_name: fullName || state.user.full_name,
      phone_number: phoneNumber || state.user.phone_number
    };


    const response = await put('/users/profile', profileData);
    const updatedUser = response.data?.user || response.user;
    state.set('user', { ...state.user, ...updatedUser });
    localStorage.setItem('agrimarket_user', JSON.stringify(state.user));


    const user = window.currentUser || state.user;
    

    if (user.role === 'seller') {
      const municipality = document.getElementById('edit-municipality')?.value;
      
      if (municipality) {
        try {
          const sellerData = {
            municipality: municipality,
            farm_type: user.farm_type || 'farm'  // Use existing farm_type or default to 'farm'
          };
          
          // Add municipality coordinates when municipality is updated
          if (MUNICIPALITY_COORDINATES[municipality]) {
            sellerData.latitude = MUNICIPALITY_COORDINATES[municipality].latitude;
            sellerData.longitude = MUNICIPALITY_COORDINATES[municipality].longitude;
          }
          
          await put('/users/seller-profile', sellerData);

        } catch (sellerError) {
          console.warn('Seller profile update failed, but basic profile was saved:', sellerError);
        }
      }
    }
    

    if (user.role === 'buyer') {
      const municipality = document.getElementById('edit-municipality')?.value;
      const address = document.getElementById('edit-address')?.value;
      const latitude = document.getElementById('delivery-latitude')?.value;
      const longitude = document.getElementById('delivery-longitude')?.value;
      
      if (municipality || address || latitude || longitude) {
        try {
          const buyerData = {};
          if (municipality) {
            buyerData.municipality = municipality;
            // Add municipality coordinates for buyers too if no specific delivery coordinates
            if (!latitude && !longitude && MUNICIPALITY_COORDINATES[municipality]) {
              buyerData.delivery_latitude = MUNICIPALITY_COORDINATES[municipality].latitude;
              buyerData.delivery_longitude = MUNICIPALITY_COORDINATES[municipality].longitude;
            }
          }
          if (address) buyerData.delivery_address = address;
          if (latitude) buyerData.delivery_latitude = parseFloat(latitude);
          if (longitude) buyerData.delivery_longitude = parseFloat(longitude);
          
          await put('/users/buyer-profile', buyerData);

        } catch (buyerError) {
          console.warn('Buyer profile update failed, but basic profile was saved:', buyerError);
        }
      }
    }

    hidePageLoader();
    createToast('Profile updated successfully', 'success');


    await loadProfile();
    document.getElementById('profile-view').style.display = 'block';
    document.getElementById('profile-form').style.display = 'none';
  } catch (error) {
    console.error('Error saving profile:', error);
    hidePageLoader();
    createToast(error.message || 'Failed to update profile', 'error');
  }
}

async function saveSellerProfile(data) {
  try {
    showPageLoader('Updating seller profile...');

    const response = await put('/users/seller-profile', data);

    window.currentUser = { ...window.currentUser, ...data };
    
    hideSpinner();
    createToast('Seller profile updated successfully', 'success');

    // Reload to show updated data
    await loadProfile();
    setupRoleSections();
  } catch (error) {
    console.error('Error saving seller profile:', error);
    createToast(error.message || 'Failed to update seller profile', 'error');
  }
}

async function saveBuyerProfile(data) {
  try {
    showPageLoader('Updating buyer preferences...');

    const response = await put('/users/buyer-profile', data);

    window.currentUser = { ...window.currentUser, ...data };
    
    hideSpinner();
    createToast('Buyer preferences updated successfully', 'success');

    // Reload to show updated data
    await loadProfile();
    setupRoleSections();
  } catch (error) {
    console.error('Error saving buyer profile:', error);
    createToast(error.message || 'Failed to update buyer preferences', 'error');
  }
}

async function performDeleteAccount() {
  try {
    showPageLoader('Deleting account...');

    const modal = createModal({
      title: 'Deleting Account',
      content: '<p class="text-gray-700">Please wait while we delete your account...</p>',
      footer: '',
      size: 'sm',
      closeButton: false
    });

    await del('/users/account');

    hideSpinner();
    modal.close();

    createToast('Account deleted successfully', 'success');


    setTimeout(() => {
      localStorage.removeItem('agrimarket_token');
      localStorage.removeItem('agrimarket_user');
      window.location.href = '/index.html';
    }, 2000);
  } catch (error) {
    console.error('Error deleting account:', error);
    createToast(error.message || 'Failed to delete account', 'error');
  }
}

// Initialize page when DOM is loaded
document.addEventListener('DOMContentLoaded', initPage);
