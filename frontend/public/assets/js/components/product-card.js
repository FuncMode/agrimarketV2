import { formatCurrency } from '../utils/formatters.js';
import { isAuthenticated, isBuyer } from '../core/auth.js';

/**
 * Create a product card HTML element
 * @param {Object} product - Product data
 * @param {Object} options - Display options
 * @returns {HTMLElement} Product card element
 */
const createProductCard = (product, options = {}) => {
  const {
    showActions = true,
    showSeller = true,
    onView = null,
    onAddToCart = null,
    onEdit = null,
    onDelete = null,
    onViewReviews = null
  } = options;
  
  const card = document.createElement('div');
  card.className = 'card product-card';
  card.dataset.productId = product.id;
  
  const imageUrl = product.photo_path || product.photos?.[0] || 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
  const isAuth = isAuthenticated();
  const canBuy = isAuth && isBuyer();
  
  // Badge for tags
  let badgeHtml = '';
  if (product.tags?.includes('fresh')) {
    badgeHtml = '<div class="product-card-badge">Fresh</div>';
  } else if (product.tags?.includes('organic')) {
    badgeHtml = '<div class="product-card-badge" style="background-color: var(--color-success);">Organic</div>';
  }
  
  card.innerHTML = `
    ${badgeHtml}
    
    <img src="${imageUrl}" alt="${product.name}" class="card-img" loading="lazy">
    
    <div class="card-body">
      <div class="flex items-center justify-between mb-2">
        <h3 class="card-title mb-0">${product.name}</h3>
        ${product.seller_verified ? '<span class="verified-badge"><i class="bi bi-patch-check-fill"></i> Verified</span>' : ''}
      </div>
      
      ${showSeller && product.seller_name ? `
        <p class="text-sm text-gray-600 mb-2">
          <i class="bi bi-shop"></i> ${product.seller_name || 'Unknown Seller'}
        </p>
      ` : ''}
      
      <p class="text-sm text-gray-600 mb-2">
        <i class="bi bi-geo-alt"></i> ${product.municipality}
      </p>
      
      ${product.average_rating && product.average_rating > 0 ? `
        <div class="mb-2 pb-2 border-b border-gray-200">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <div class="flex gap-1 text-warning text-sm">
                ${[1,2,3,4,5].map(star => 
                  `<i class="bi bi-star${star <= Math.round(product.average_rating) ? '-fill' : ''}"></i>`
                ).join('')}
              </div>
              <span class="text-sm font-semibold">${product.average_rating.toFixed(1)}</span>
              <span class="text-xs text-gray-500">(${product.total_reviews || 0})</span>
            </div>
            <button class="btn-view-reviews text-xs text-primary hover:underline" data-product-id="${product.id}">
              <i class="bi bi-chat-quote"></i> Reviews
            </button>
          </div>
        </div>
      ` : ''}
      
      <p class="card-text line-clamp-2">${product.description || 'No description available'}</p>
      
      <!-- Tags -->
      ${product.tags && product.tags.length > 0 ? `
        <div class="flex gap-2 mt-2 flex-wrap">
          ${product.tags.map(tag => `
            <span class="badge badge-info">
              <i class="bi bi-tag"></i> ${tag.charAt(0).toUpperCase() + tag.slice(1)}
            </span>
          `).join('')}
        </div>
      ` : ''}
      
      <!-- View Count & Order Count -->
      <div class="flex gap-4 mt-3 text-xs text-gray-500 border-t border-gray-200 pt-2">
        <div class="flex items-center gap-1">
          <i class="bi bi-eye"></i>
          <span>${product.view_count || 0} views</span>
        </div>
        <div class="flex items-center gap-1">
          <i class="bi bi-cart-check"></i>
          <span>${product.order_count || 0} orders</span>
        </div>
      </div>
      
      <div class="flex items-center justify-between mt-4">
        <div>
          <p class="text-2xl font-bold text-primary">${formatCurrency(product.price_per_unit)}</p>
          <p class="text-sm text-gray-500">per ${product.unit_type}</p>
        </div>
        
        <div class="text-right">
          <p class="text-sm text-gray-600">Available</p>
          <p class="font-semibold">${product.available_quantity} ${product.unit_type}</p>
        </div>
      </div>
    </div>
    
    ${showActions ? `
      <div class="card-footer">
        <div class="flex gap-2">
          <button class="btn-view btn btn-outline flex-1">
            <i class="bi bi-eye"></i> View
          </button>
          ${canBuy ? `
            <button class="btn-add-cart btn btn-primary flex-1">
              <i class="bi bi-cart-plus"></i> Add to Cart
            </button>
          ` : onEdit ? `
            <button class="btn-edit btn btn-secondary flex-1">
              <i class="bi bi-pencil"></i> Edit
            </button>
            <button class="btn-delete btn btn-danger">
              <i class="bi bi-trash"></i>
            </button>
          ` : ''}
        </div>
      </div>
    ` : ''}
  `;
  
  // Attach event listeners
  const btnView = card.querySelector('.btn-view');
  if (btnView && onView) {
    btnView.addEventListener('click', () => onView(product));
  }
  
  const btnAddCart = card.querySelector('.btn-add-cart');
  if (btnAddCart && onAddToCart) {
    btnAddCart.addEventListener('click', () => onAddToCart(product));
  }
  
  const btnEdit = card.querySelector('.btn-edit');
  if (btnEdit && onEdit) {
    btnEdit.addEventListener('click', () => onEdit(product));
  }
  
  const btnDelete = card.querySelector('.btn-delete');
  if (btnDelete && onDelete) {
    btnDelete.addEventListener('click', () => onDelete(product));
  }
  
  const btnViewReviews = card.querySelector('.btn-view-reviews');
  if (btnViewReviews) {
    btnViewReviews.addEventListener('click', () => {
      if (onViewReviews) {
        onViewReviews(product.id, product.name);
      } else if (window.viewProductReviews) {
        window.viewProductReviews(product.id, product.name);
      }
    });
  }
  
  return card;
};

/**
 * Render multiple product cards in a container
 * @param {Array} products - Array of product data
 * @param {String|HTMLElement} container - Container selector or element
 * @param {Object} options - Display options
 */
const renderProductCards = (products, container, options = {}) => {
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  
  if (!container) {
    console.error('Product card container not found');
    return;
  }
  
  container.innerHTML = '';
  
  if (!products || products.length === 0) {
    container.innerHTML = `
      <div class="text-center py-12 col-span-full">
        <i class="bi bi-inbox" style="font-size: 4rem; color: var(--color-gray-400);"></i>
        <p class="text-gray-500 mt-4">No products found</p>
      </div>
    `;
    return;
  }
  
  products.forEach(product => {
    const card = createProductCard(product, options);
    container.appendChild(card);
  });
};

export {
  createProductCard,
  renderProductCards
};