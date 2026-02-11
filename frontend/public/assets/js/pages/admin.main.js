// assets/js/pages/admin.main.js
// Admin Dashboard Main Script

import { renderNavbar } from '../components/navbar.js';
import { showToast, showError, showSuccess } from '../components/toast.js';
import { showSpinner, hideSpinner } from '../components/loading-spinner.js';
import { createModal } from '../components/modal.js';
import { requireAuth } from '../core/auth.js';
import { formatDate, formatCurrency } from '../utils/formatters.js';
import { initNotificationSounds } from '../features/notifications/notification-sound.js';

// Services
import {
  getDashboardStats,
  getAllUsers,
  getUserDetails,
  suspendUser,
  banUser,
  reinstateUser,
  deleteUser,
  getSystemLogs,
  getAdminStats,
  getSocketConnections,
  getIPBlockingStats,
  getDatabaseStats
} from '../services/admin.service.js';

// ============ State ============

let currentStats = null;
let currentUsers = [];
let currentVerifications = [];
let currentIssues = [];
let currentLogs = [];
let currentUserPage = 1;
let currentUserFilters = {};

// ============ Initialization ============

const init = async () => {

  
  // Check admin authentication
  if (!requireAuth(['admin'])) return;
  
  // Initialize notification sounds
  initNotificationSounds();
  
  // Initialize components
  renderNavbar();
  
  // Initialize real-time connection
  try {
    const { initSocket } = await import('../services/socket.service.js');
    initSocket();
  } catch (error) {
    console.warn('Socket.io not available:', error);
  }
  
  // Load initial data
  await Promise.all([
    loadDashboardStats(),
    loadPendingVerifications(),
    loadOpenIssues(),
    loadUsers(),
    loadSystemMonitoring()
  ]);
  
  // Attach event listeners
  attachEventListeners();
  

};

// ============ Dashboard Stats ============

const loadDashboardStats = async () => {
  try {
    const response = await getDashboardStats();
    currentStats = response.data?.stats || {};
    
    // Update stat cards
    document.getElementById('stat-users').textContent = currentStats.users?.total || 0;
    document.getElementById('stat-pending-verifications').textContent = currentStats.users?.pending_verification || 0;
    document.getElementById('stat-open-issues').textContent = currentStats.issues?.total || 0;
    document.getElementById('stat-products').textContent = currentStats.products?.total || 0;
    
  } catch (error) {
    console.error('Error loading stats:', error);
  }
};

// ============ Verifications ============

const loadPendingVerifications = async () => {
  const container = document.getElementById('verifications-list');
  if (!container) return;
  
  container.innerHTML = '<div class="text-center py-8"><div class="loading-spinner mx-auto"></div></div>';
  
  try {
    // Import verification service
    const { getPendingVerifications } = await import('../services/verification.service.js');
    const response = await getPendingVerifications();

    
    currentVerifications = response.data?.verifications || [];

    
    if (currentVerifications.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-8">No pending verifications</p>';
      return;
    }
    
    container.innerHTML = currentVerifications.map(v => createVerificationCard(v)).join('');
    
  } catch (error) {
    console.error('Error loading verifications:', error);
    container.innerHTML = '<p class="text-center text-danger py-8">Failed to load verifications</p>';
  }
};

const createVerificationCard = (verification) => {
  const placeholderSvg = 'data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22300%22 height=%22200%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22300%22 height=%22200%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2216%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3ENo Image%3C/text%3E%3C/svg%3E';
  
  return `
    <div class="card mb-4" data-verification-id="${verification.id}">
      <div class="card-body">
        <div class="flex justify-between items-start mb-4">
          <div>
            <h4 class="font-bold text-lg">${verification.users?.full_name || 'Unknown User'}</h4>
            <p class="text-sm text-gray-600">${verification.users?.email || 'No email'}</p>
            <p class="text-sm text-gray-600">Submitted: ${formatDate(verification.created_at)}</p>
          </div>
          <span class="badge badge-warning">PENDING</span>
        </div>
        
        <div class="grid grid-cols-2 gap-4 mb-4">
          <div>
            <p class="text-sm font-semibold mb-2">ID Document</p>
            <img src="${verification.id_photo_url || placeholderSvg}" 
                 alt="ID Document" 
                 class="w-full h-48 object-cover rounded cursor-pointer"
                 crossorigin="anonymous"
                 onclick="window.viewImage('${verification.id_photo_url}')"
                 style="${!verification.id_photo_url ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
          </div>
          <div>
            <p class="text-sm font-semibold mb-2">Selfie with ID</p>
            <img src="${verification.selfie_url || placeholderSvg}" 
                 alt="Selfie" 
                 class="w-full h-48 object-cover rounded cursor-pointer"
                 crossorigin="anonymous"
                 onclick="window.viewImage('${verification.selfie_url}')"
                 style="${!verification.selfie_url ? 'opacity: 0.5; cursor: not-allowed;' : ''}">
          </div>
        </div>
        
        <div class="flex gap-2">
          <button class="btn btn-sm btn-success" onclick="window.approveVerification('${verification.id}')">
            <i class="bi bi-check-circle"></i> Approve
          </button>
          <button class="btn btn-sm btn-danger" onclick="window.rejectVerification('${verification.id}')">
            <i class="bi bi-x-circle"></i> Reject
          </button>
          <button class="btn btn-sm btn-warning" onclick="window.requestMoreEvidence('${verification.id}')">
            <i class="bi bi-camera"></i> Request More Evidence
          </button>
        </div>
      </div>
    </div>
  `;
};

window.approveVerification = async (verificationId) => {
  const modal = createModal({
    title: 'Approve Verification',
    content: `
      <div class="space-y-4">
        <p class="text-gray-700">Are you sure you want to approve this verification?</p>
        <p class="text-sm text-gray-600">The user's account will be marked as verified and they can proceed with full platform access.</p>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-success" id="confirm-approve-btn"><i class="bi bi-check-circle"></i> Approve</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-approve-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      try {
        const { approveVerification } = await import('../services/verification.service.js');
        await approveVerification(verificationId);
        showSuccess('Verification approved!');
        document.querySelector('.modal-backdrop').remove();
        await loadPendingVerifications();
        await loadDashboardStats();
      } catch (error) {
        console.error('Error approving verification:', error);
        showError(error.message || 'Failed to approve verification');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="bi bi-check-circle"></i> Approve';
      }
    });
  }
};

window.rejectVerification = async (verificationId) => {
  const modal = createModal({
    title: 'Reject Verification',
    content: `
      <div class="space-y-4">
        <p class="text-gray-600">Please provide a reason for rejection:</p>
        <textarea id="rejection-reason" class="form-control w-full" rows="4" placeholder="Enter rejection reason..."></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-danger" id="confirm-reject-btn">Reject</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-reject-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const reason = document.getElementById('rejection-reason').value;
      if (!reason.trim()) {
        showError('Please provide a reason for rejection');
        return;
      }
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      try {
        const { rejectVerification } = await import('../services/verification.service.js');
        await rejectVerification(verificationId, reason);
        showSuccess('Verification rejected');
        document.querySelector('.modal-backdrop').remove();
        await loadPendingVerifications();
        await loadDashboardStats();
      } catch (error) {
        console.error('Error rejecting verification:', error);
        showError(error.message || 'Failed to reject verification');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="bi bi-x-circle"></i> Reject';
      }
    });
  }
};

window.requestMoreEvidence = async (verificationId) => {
  const modal = createModal({
    title: 'Request More Evidence',
    content: `
      <div class="space-y-4">
        <p class="text-gray-600">Please specify what additional evidence you need:</p>
        <textarea id="evidence-request" class="form-control w-full" rows="4" placeholder="Enter your request..."></textarea>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="document.querySelector('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-warning" id="confirm-evidence-btn">Request</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-evidence-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const message = document.getElementById('evidence-request').value;
      if (!message.trim()) {
        showError('Please specify what evidence you need');
        return;
      }
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      try {
        const { requestMoreEvidence } = await import('../services/verification.service.js');
        await requestMoreEvidence(verificationId, message);
        showSuccess('Evidence request sent');
        document.querySelector('.modal-backdrop').remove();
        await loadPendingVerifications();
        await loadDashboardStats();
      } catch (error) {
        console.error('Error requesting evidence:', error);
        showError(error.message || 'Failed to request evidence');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = '<i class="bi bi-camera"></i> Request';
      }
    });
  }
};

window.viewImage = (imageUrl) => {
  if (!imageUrl || imageUrl === 'undefined') {
    showError('Image URL is not available');
    return;
  }
  
  const modal = createModal({
    title: 'View Image',
    content: `<img src="${imageUrl}" alt="Document" class="w-full h-auto" onerror="this.src='data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%22400%22 height=%22300%22%3E%3Crect fill=%22%23f0f0f0%22 width=%22400%22 height=%22300%22/%3E%3Ctext x=%2250%25%22 y=%2250%25%22 font-size=%2220%22 fill=%22%23999%22 text-anchor=%22middle%22 dy=%22.3em%22%3EImage Not Found%3C/text%3E%3C/svg%3E'">`,
    size: 'lg'
  });
};

// ============ Issues Management ============

const loadOpenIssues = async () => {
  const tbody = document.getElementById('issues-table-body');
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8"><div class="loading-spinner mx-auto"></div></td></tr>';
  
  try {
    const { getIssues } = await import('../services/issue.service.js');
    const response = await getIssues({ status: 'under_review' });
    currentIssues = response.data?.issues || [];
    
    if (currentIssues.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No open issues</td></tr>';
      return;
    }
    
    tbody.innerHTML = currentIssues.map(issue => `
      <tr>
        <td>${issue.id?.substring(0, 8) || 'N/A'}...</td>
        <td>${issue.issue_type || 'N/A'}</td>
        <td>${issue.reporter?.full_name || 'N/A'}</td>
        <td><span class="badge badge-warning">Under Review</span></td>
        <td>${formatDate(issue.created_at)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="window.viewIssue('${issue.id}')">
            <i class="bi bi-eye"></i> View
          </button>
        </td>
      </tr>
    `).join('');
    
  } catch (error) {
    console.error('Error loading issues:', error);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-danger">Failed to load issues: ' + (error.message || 'Unknown error') + '</td></tr>';
  }
};

window.viewIssue = async (issueId) => {
  try {
    const { getIssue } = await import('../services/issue.service.js');
    const { getIssueEvidenceUrl } = await import('../utils/image-helpers.js');
    const response = await getIssue(issueId);
    const issue = response.data?.issue;
    
    if (!issue) {
      showError('Issue not found');
      return;
    }
    
    const statusColors = {
      under_review: 'warning',
      resolved: 'success',
      rejected: 'danger'
    };
    
    const modalContent = `
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <h3 class="text-xl font-bold">${issue.issue_type || 'Issue'}</h3>
          <span class="badge badge-${statusColors[issue.status] || 'secondary'}">
            ${(issue.status || 'unknown').replace('_', ' ').toUpperCase()}
          </span>
        </div>
        
        <div class="border-t pt-4">
          <h4 class="font-semibold mb-2">Issue Details</h4>
          <p><strong>Type:</strong> ${issue.issue_type || 'N/A'}</p>
          <p><strong>Order:</strong> #${issue.order?.order_number || 'N/A'}</p>
          <p><strong>Reporter:</strong> ${issue.reporter?.full_name || 'N/A'} (${issue.reporter?.role || 'N/A'})</p>
          <p><strong>Created:</strong> ${formatDate(issue.created_at)}</p>
        </div>
        
        <div class="border-t pt-4">
          <h4 class="font-semibold mb-2">Description</h4>
          <p class="text-sm text-gray-700">${issue.description || 'No description provided'}</p>
        </div>
        
        ${issue.evidence_urls && issue.evidence_urls.length > 0 ? `
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Evidence (${issue.evidence_urls.length})</h4>
            <div class="grid grid-cols-3 gap-2">
              ${issue.evidence_urls.map(url => {
                const fullUrl = getIssueEvidenceUrl(url);
                return `<img src="${fullUrl}" class="w-full h-24 object-cover rounded cursor-pointer" onclick="window.open('${fullUrl}', '_blank')">`;
              }).join('')}
            </div>
          </div>
        ` : '<div class="border-t pt-4"><p class="text-sm text-gray-500">No evidence provided</p></div>'}
        
        ${issue.admin_notes ? `
          <div class="border-t pt-4">
            <h4 class="font-semibold mb-2">Admin Notes</h4>
            <div class="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p class="text-sm text-blue-900">${issue.admin_notes}</p>
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    const footer = `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Close</button>
      ${issue.status === 'under_review' ? `
        <button class="btn btn-success" onclick="window.resolveIssue('${issueId}')">
          <i class="bi bi-check-circle"></i> Resolve
        </button>
        <button class="btn btn-danger" onclick="window.rejectIssue('${issueId}')">
          <i class="bi bi-x-circle"></i> Reject
        </button>
      ` : ''}
    `;
    
    createModal({
      title: `Issue #${issue.id?.substring(0, 8)}...`,
      content: modalContent,
      footer: footer,
      size: 'lg'
    });
    
  } catch (error) {
    console.error('Error loading issue:', error);
    showError(error.message || 'Failed to load issue');
  }
};

// Helper function to show input modal
const showInputModal = (title, label, placeholder) => {
  return new Promise((resolve) => {
    const content = document.createElement('div');
    content.innerHTML = `
      <div class="mb-4">
        <label class="block text-sm font-medium text-gray-700 mb-2">${label}</label>
        <textarea 
          id="modal-input-text" 
          class="form-control w-full" 
          rows="4" 
          placeholder="${placeholder}"
          style="resize: vertical; min-height: 100px;"
        ></textarea>
      </div>
    `;

    const footer = document.createElement('div');
    footer.className = 'flex gap-3 justify-end';
    footer.innerHTML = `
      <button class="btn btn-outline" data-action="cancel">Cancel</button>
      <button class="btn btn-primary" data-action="confirm">Submit</button>
    `;

    const modal = createModal({
      title: title,
      content: content,
      footer: footer,
      size: 'md',
      closeOnBackdrop: true
    });

    const textarea = modal.body.querySelector('#modal-input-text');
    const confirmBtn = footer.querySelector('[data-action="confirm"]');
    const cancelBtn = footer.querySelector('[data-action="cancel"]');

    // Focus textarea
    setTimeout(() => textarea.focus(), 100);

    // Handle confirm
    confirmBtn.addEventListener('click', () => {
      const value = textarea.value.trim();
      if (value) {
        modal.close();
        resolve(value);
      } else {
        textarea.classList.add('border-danger');
        setTimeout(() => textarea.classList.remove('border-danger'), 2000);
      }
    });

    // Handle cancel
    cancelBtn.addEventListener('click', () => {
      modal.close();
      resolve(null);
    });

    // Handle Enter key (Ctrl+Enter to submit)
    textarea.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === 'Enter') {
        confirmBtn.click();
      }
    });
  });
};

window.resolveIssue = async (issueId) => {
  const resolution = await showInputModal(
    'Resolve Issue',
    'Resolution Details',
    'Please provide details about how this issue was resolved...'
  );
  
  if (!resolution) return;
  
  try {
    const { resolveIssue } = await import('../services/issue.service.js');
    await resolveIssue(issueId, resolution);
    showSuccess('Issue resolved successfully!');
    
    // Close modal and reload
    document.querySelector('.modal-backdrop')?.remove();
    await loadOpenIssues();
    await loadDashboardStats();
  } catch (error) {
    console.error('Error resolving issue:', error);
    showError(error.message || 'Failed to resolve issue');
  }
};

window.rejectIssue = async (issueId) => {
  const reason = await showInputModal(
    'Reject Issue',
    'Rejection Reason',
    'Please provide a reason for rejecting this issue...'
  );
  
  if (!reason) return;
  
  try {
    const { rejectIssue } = await import('../services/issue.service.js');
    await rejectIssue(issueId, reason);
    showSuccess('Issue rejected');
    
    // Close modal and reload
    document.querySelector('.modal-backdrop')?.remove();
    await loadOpenIssues();
    await loadDashboardStats();
  } catch (error) {
    console.error('Error rejecting issue:', error);
    showError(error.message || 'Failed to reject issue');
  }
};

// ============ System Logs ============

const loadSystemLogs = async () => {
  const container = document.getElementById('logs-viewer');
  if (!container) return;
  
  container.innerHTML = '<div class="text-center py-8"><div class="loading-spinner mx-auto"></div></div>';
  
  try {
    const logType = document.getElementById('log-type')?.value || 'all';
    const logDate = document.getElementById('log-date')?.value || null;
    
    const filters = { type: logType };
    if (logDate) filters.date = logDate;
    
    const response = await getSystemLogs(filters);
    currentLogs = response.data?.logs || [];
    
    if (currentLogs.length === 0) {
      container.innerHTML = '<p class="text-center text-gray-500 py-8">No logs found</p>';
      return;
    }
    
    container.innerHTML = currentLogs.map(log => `
      <div class="border-b pb-2 mb-2">
        <div class="flex justify-between text-sm">
          <span class="font-semibold">${log.action_type || 'Unknown Action'}</span>
          <span class="text-gray-600">${formatDate(log.created_at)}</span>
        </div>
        <p class="text-sm text-gray-600">${log.admin?.full_name || 'System'} - ${log.ip_address || 'N/A'}</p>
        ${log.action_description ? `<p class="text-xs text-gray-500">${log.action_description}</p>` : ''}
      </div>
    `).join('');
    
  } catch (error) {
    console.error('Error loading logs:', error);
    container.innerHTML = '<p class="text-center text-danger py-8">Failed to load logs: ' + (error.message || 'Unknown error') + '</p>';
  }
};

// ============ User Management ============

const loadUsers = async (page = 1) => {
  const tbody = document.getElementById('users-table-body');
  const mobileView = document.getElementById('users-mobile-view');
  
  if (!tbody) return;
  
  tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8"><div class="loading-spinner mx-auto"></div></td></tr>';
  if (mobileView) mobileView.innerHTML = '<div class="text-center py-8"><div class="loading-spinner mx-auto"></div></div>';
  
  try {
    const filters = {
      ...currentUserFilters,
      page,
      limit: 20
    };
    
    const response = await getAllUsers(filters);
    currentUsers = response.data?.users || [];
    currentUserPage = page;
    
    if (currentUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-gray-500">No users found</td></tr>';
      if (mobileView) mobileView.innerHTML = '<p class="text-center text-gray-500 py-8">No users found</p>';
      return;
    }
    
    // Desktop table view
    tbody.innerHTML = currentUsers.map(user => {
      const statusBadge = getStatusBadge(user.status);
      const roleBadge = user.role === 'seller' ? 'badge-primary' : 'badge-info';
      
      return `
        <tr>
          <td class="font-medium">${user.full_name || 'N/A'}</td>
          <td class="text-sm">${user.email}</td>
          <td><span class="badge ${roleBadge}">${user.role}</span></td>
          <td><span class="badge ${statusBadge}">${user.status}</span></td>
          <td class="text-sm">${formatDate(user.created_at)}</td>
          <td>
            <div class="flex gap-1">
              <button class="btn btn-sm btn-outline" onclick="window.viewUserDetails('${user.id}')" title="View Details">
                <i class="bi bi-eye"></i>
              </button>
              ${user.status !== 'suspended' && user.status !== 'banned' ? `
                <button class="btn btn-sm btn-warning" onclick="window.suspendUserAction('${user.id}')" title="Suspend">
                  <i class="bi bi-pause-circle"></i>
                </button>
                <button class="btn btn-sm btn-danger" onclick="window.banUserAction('${user.id}')" title="Ban">
                  <i class="bi bi-slash-circle"></i>
                </button>
              ` : `
                <button class="btn btn-sm btn-success" onclick="window.reinstateUserAction('${user.id}')" title="Reinstate">
                  <i class="bi bi-check-circle"></i>
                </button>
              `}
              <button class="btn btn-sm btn-danger" onclick="window.deleteUserAction('${user.id}')" title="Delete">
                <i class="bi bi-trash"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
    
    // Mobile card view
    if (mobileView) {
      mobileView.innerHTML = currentUsers.map(user => {
        const statusBadge = getStatusBadge(user.status);
        const roleBadge = user.role === 'seller' ? 'badge-primary' : 'badge-info';
        
        return `
          <div class="card mb-3">
            <div class="card-body">
              <div class="flex justify-between items-start mb-2">
                <div>
                  <h4 class="font-bold">${user.full_name || 'N/A'}</h4>
                  <p class="text-sm text-gray-600">${user.email}</p>
                </div>
                <span class="badge ${statusBadge}">${user.status}</span>
              </div>
              <div class="mb-3">
                <span class="badge ${roleBadge}">${user.role}</span>
                <span class="text-sm text-gray-600 ml-2">Joined: ${formatDate(user.created_at)}</span>
              </div>
              <div class="flex gap-2 flex-wrap">
                <button class="btn btn-sm btn-outline" onclick="window.viewUserDetails('${user.id}')">
                  <i class="bi bi-eye"></i> View
                </button>
                ${user.status !== 'suspended' && user.status !== 'banned' ? `
                  <button class="btn btn-sm btn-warning" onclick="window.suspendUserAction('${user.id}')">
                    <i class="bi bi-pause-circle"></i> Suspend
                  </button>
                  <button class="btn btn-sm btn-danger" onclick="window.banUserAction('${user.id}')">
                    <i class="bi bi-slash-circle"></i> Ban
                  </button>
                ` : `
                  <button class="btn btn-sm btn-success" onclick="window.reinstateUserAction('${user.id}')">
                    <i class="bi bi-check-circle"></i> Reinstate
                  </button>
                `}
                <button class="btn btn-sm btn-danger" onclick="window.deleteUserAction('${user.id}')">
                  <i class="bi bi-trash"></i> Delete
                </button>
              </div>
            </div>
          </div>
        `;
      }).join('');
    }
    
    // Render pagination
    renderUserPagination(response.total_pages || 1, page);
    
  } catch (error) {
    console.error('Error loading users:', error);
    tbody.innerHTML = '<tr><td colspan="6" class="text-center py-8 text-danger">Failed to load users</td></tr>';
    if (mobileView) mobileView.innerHTML = '<p class="text-center text-danger py-8">Failed to load users</p>';
  }
};

const getStatusBadge = (status) => {
  const badges = {
    'verified': 'badge-success',
    'unverified': 'badge-secondary',
    'verification_pending': 'badge-warning',
    'rejected': 'badge-danger',
    'suspended': 'badge-warning',
    'banned': 'badge-danger'
  };
  return badges[status] || 'badge-secondary';
};

const renderUserPagination = (totalPages, currentPage) => {
  const container = document.getElementById('users-pagination');
  if (!container) return;
  
  if (totalPages <= 1) {
    container.innerHTML = '';
    return;
  }
  
  let html = '';
  
  // Previous button
  html += `
    <button class="btn btn-sm btn-outline" 
            onclick="window.loadUserPage(${currentPage - 1})" 
            ${currentPage === 1 ? 'disabled' : ''}>
      <i class="bi bi-chevron-left"></i>
    </button>
  `;
  
  // Page numbers
  for (let i = 1; i <= totalPages; i++) {
    if (i === 1 || i === totalPages || (i >= currentPage - 2 && i <= currentPage + 2)) {
      html += `
        <button class="btn btn-sm ${i === currentPage ? 'btn-primary' : 'btn-outline'}" 
                onclick="window.loadUserPage(${i})">
          ${i}
        </button>
      `;
    } else if (i === currentPage - 3 || i === currentPage + 3) {
      html += '<span class="px-2">...</span>';
    }
  }
  
  // Next button
  html += `
    <button class="btn btn-sm btn-outline" 
            onclick="window.loadUserPage(${currentPage + 1})" 
            ${currentPage === totalPages ? 'disabled' : ''}>
      <i class="bi bi-chevron-right"></i>
    </button>
  `;
  
  container.innerHTML = html;
};

window.loadUserPage = (page) => {
  loadUsers(page);
};

window.viewUserDetails = async (userId) => {
  try {
    showSpinner();
    const response = await getUserDetails(userId);
    const user = response.data?.user;
    const orderCount = response.data?.order_count || 0;
    const recentLogs = response.data?.recent_logs || [];
    
    hideSpinner();
    
    const statusBadge = getStatusBadge(user.status);
    const roleBadge = user.role === 'seller' ? 'badge-primary' : 'badge-info';
    
    const modalContent = `
      <div class="space-y-4">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <h4 class="font-semibold mb-2">Personal Information</h4>
            <p class="text-sm"><strong>Name:</strong> ${user.full_name || 'N/A'}</p>
            <p class="text-sm"><strong>Email:</strong> ${user.email}</p>
            <p class="text-sm"><strong>Phone:</strong> ${user.phone_number || 'N/A'}</p>
            <p class="text-sm"><strong>Role:</strong> <span class="badge ${roleBadge}">${user.role}</span></p>
            <p class="text-sm"><strong>Status:</strong> <span class="badge ${statusBadge}">${user.status}</span></p>
          </div>
          <div>
            <h4 class="font-semibold mb-2">Account Details</h4>
            <p class="text-sm"><strong>Joined:</strong> ${formatDate(user.created_at)}</p>
            <p class="text-sm"><strong>Last Updated:</strong> ${user.updated_at ? formatDate(user.updated_at) : 'N/A'}</p>
            <p class="text-sm"><strong>Verified:</strong> ${user.verified_at ? formatDate(user.verified_at) : 'Not verified'}</p>
            <p class="text-sm"><strong>Total Orders:</strong> ${orderCount}</p>
            <p class="text-sm"><strong>Agreed to Terms:</strong> ${user.agreed_to_terms ? '✅ Yes' : '❌ No'}</p>
            ${user.agreed_at ? `<p class="text-sm"><strong>Terms Agreed At:</strong> ${formatDate(user.agreed_at)}</p>` : ''}
          </div>
        </div>
        
        ${user.suspension_end || user.ban_reason ? `
          <div class="bg-yellow-50 border border-yellow-200 rounded p-3">
            <h4 class="font-semibold mb-2 text-warning">⚠️ Account Restrictions</h4>
            ${user.suspension_end ? `<p class="text-sm"><strong>Suspension Ends:</strong> ${formatDate(user.suspension_end)}</p>` : ''}
            ${user.ban_reason ? `<p class="text-sm"><strong>Ban Reason:</strong> ${user.ban_reason}</p>` : ''}
          </div>
        ` : ''}
        
        ${user.role === 'seller' && user.seller_profile ? `
          <div>
            <h4 class="font-semibold mb-2">Seller Profile</h4>
            <div class="grid grid-cols-2 gap-2">
              <p class="text-sm"><strong>Municipality:</strong> ${user.seller_profile.municipality || 'N/A'}</p>
              <p class="text-sm"><strong>Farm Type:</strong> ${user.seller_profile.farm_type || 'N/A'}</p>
              <p class="text-sm"><strong>Rating:</strong> ⭐ ${user.seller_profile.rating || '0.00'} / 5.00</p>
              <p class="text-sm"><strong>Total Sales:</strong> ${formatCurrency(user.seller_profile.total_sales || 0)}</p>
              <p class="text-sm"><strong>Total Orders:</strong> ${user.seller_profile.total_orders || 0}</p>
              ${user.seller_profile.latitude && user.seller_profile.longitude ? 
                `<p class="text-sm"><strong>Location:</strong> ${user.seller_profile.latitude.toFixed(6)}, ${user.seller_profile.longitude.toFixed(6)}</p>` 
                : '<p class="text-sm"><strong>Location:</strong> Not set</p>'}
            </div>
          </div>
        ` : ''}
        
        ${user.role === 'buyer' && user.buyer_profile ? `
          <div>
            <h4 class="font-semibold mb-2">Buyer Profile</h4>
            <div class="grid grid-cols-2 gap-2">
              <p class="text-sm"><strong>Municipality:</strong> ${user.buyer_profile.municipality || 'N/A'}</p>
              <p class="text-sm"><strong>Delivery Option:</strong> ${user.buyer_profile.preferred_delivery_option || 'drop-off'}</p>
              <p class="text-sm col-span-2"><strong>Address:</strong> ${user.buyer_profile.delivery_address || 'N/A'}</p>
              ${user.buyer_profile.delivery_latitude && user.buyer_profile.delivery_longitude ? 
                `<p class="text-sm"><strong>Coordinates:</strong> ${user.buyer_profile.delivery_latitude.toFixed(6)}, ${user.buyer_profile.delivery_longitude.toFixed(6)}</p>` 
                : '<p class="text-sm"><strong>Coordinates:</strong> Not set</p>'}
            </div>
          </div>
        ` : ''}
        
        ${recentLogs.length > 0 ? `
          <div>
            <h4 class="font-semibold mb-2">Recent Activity</h4>
            <div class="max-h-40 overflow-y-auto">
              ${recentLogs.map(log => `
                <div class="text-sm border-b pb-2 mb-2">
                  <p><strong>${log.action_type}</strong></p>
                  <p class="text-gray-600">${log.action_description || 'No description'}</p>
                  <p class="text-xs text-gray-500">${formatDate(log.created_at)}</p>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}
      </div>
    `;
    
    createModal({
      title: `User Details - ${user.full_name}`,
      content: modalContent,
      size: 'lg'
    });
    
  } catch (error) {
    hideSpinner();
    console.error('Error loading user details:', error);
    showError(error.message || 'Failed to load user details');
  }
};

window.suspendUserAction = async (userId) => {
  const modal = createModal({
    title: 'Suspend User',
    content: `
      <div class="space-y-4">
        <div>
          <label class="block text-sm font-medium mb-2">Suspension Duration (days)</label>
          <input type="number" id="suspension-days" class="form-control" value="7" min="1" max="365">
        </div>
        <div>
          <label class="block text-sm font-medium mb-2">Reason for Suspension</label>
          <textarea id="suspension-reason" class="form-control" rows="4" placeholder="Enter reason for suspension..." required></textarea>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-warning" id="confirm-suspend-btn">Suspend</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-suspend-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const reason = document.getElementById('suspension-reason').value;
      const days = document.getElementById('suspension-days').value;
      
      if (!reason.trim()) {
        showError('Please provide a reason for suspension');
        return;
      }
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      try {
        await suspendUser(userId, reason, parseInt(days));
        showSuccess(`User suspended for ${days} days`);
        document.querySelector('.modal-backdrop').remove();
        await loadUsers(currentUserPage);
        await loadDashboardStats();
      } catch (error) {
        console.error('Error suspending user:', error);
        showError(error.message || 'Failed to suspend user');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Suspend';
      }
    });
  }
};

window.banUserAction = async (userId) => {
  const modal = createModal({
    title: 'Ban User',
    content: `
      <div class="space-y-4">
        <p class="text-warning">⚠️ This action will permanently ban the user from accessing the platform.</p>
        <div>
          <label class="block text-sm font-medium mb-2">Reason for Ban</label>
          <textarea id="ban-reason" class="form-control" rows="4" placeholder="Enter reason for ban..." required></textarea>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-danger" id="confirm-ban-btn">Ban User</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-ban-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const reason = document.getElementById('ban-reason').value;
      
      if (!reason.trim()) {
        showError('Please provide a reason for ban');
        return;
      }
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      try {
        await banUser(userId, reason);
        showSuccess('User banned successfully');
        document.querySelector('.modal-backdrop').remove();
        await loadUsers(currentUserPage);
        await loadDashboardStats();
      } catch (error) {
        console.error('Error banning user:', error);
        showError(error.message || 'Failed to ban user');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Ban User';
      }
    });
  }
};

window.reinstateUserAction = async (userId) => {
  const modal = createModal({
    title: 'Reinstate User',
    content: `
      <div class="space-y-4">
        <p>Are you sure you want to reinstate this user? Their account will be reactivated.</p>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-success" id="confirm-reinstate-btn">Reinstate</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-reinstate-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Processing...';
      
      try {
        await reinstateUser(userId);
        showSuccess('User reinstated successfully');
        document.querySelector('.modal-backdrop').remove();
        await loadUsers(currentUserPage);
        await loadDashboardStats();
      } catch (error) {
        console.error('Error reinstating user:', error);
        showError(error.message || 'Failed to reinstate user');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Reinstate';
      }
    });
  }
};

window.deleteUserAction = async (userId) => {
  const modal = createModal({
    title: 'Delete User',
    content: `
      <div class="space-y-4">
        <p class="text-danger">⚠️ This action is PERMANENT and cannot be undone!</p>
        <p>Are you sure you want to delete this user and all their data?</p>
        <div>
          <label class="block text-sm font-medium mb-2">Reason (optional)</label>
          <textarea id="delete-reason" class="form-control" rows="3" placeholder="Enter reason..."></textarea>
        </div>
      </div>
    `,
    footer: `
      <button class="btn btn-outline" onclick="this.closest('.modal-backdrop').remove()">Cancel</button>
      <button class="btn btn-danger" id="confirm-delete-btn">Delete Permanently</button>
    `,
    size: 'md'
  });
  
  const confirmBtn = document.getElementById('confirm-delete-btn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', async () => {
      const reason = document.getElementById('delete-reason').value;
      
      confirmBtn.disabled = true;
      confirmBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Deleting...';
      
      try {
        await deleteUser(userId, reason);
        showSuccess('User deleted successfully');
        document.querySelector('.modal-backdrop').remove();
        await loadUsers(currentUserPage);
        await loadDashboardStats();
      } catch (error) {
        console.error('Error deleting user:', error);
        showError(error.message || 'Failed to delete user');
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = 'Delete Permanently';
      }
    });
  }
};

// ============ System Monitoring ============

const loadSystemMonitoring = async () => {
  await Promise.all([
    loadSocketConnections(),
    loadIPBlockingStats(),
    loadDatabaseStats()
  ]);
};

const loadSocketConnections = async () => {
  try {
    const response = await getSocketConnections();
    const data = response.data;
    
    const usersCount = document.getElementById('socket-users-count');
    const connectionsCount = document.getElementById('socket-connections-count');
    const status = document.getElementById('socket-status');
    
    if (usersCount) usersCount.textContent = data.total_users || 0;
    if (connectionsCount) connectionsCount.textContent = data.total_connections || 0;
    
    if (status) {
      if (data.connected) {
        status.innerHTML = '<span class="badge badge-success">Connected</span>';
      } else {
        status.innerHTML = '<span class="badge badge-secondary">Disconnected</span>';
      }
    }
    
  } catch (error) {
    console.error('Error loading socket connections:', error);
    const status = document.getElementById('socket-status');
    if (status) {
      status.innerHTML = '<span class="badge badge-danger">Error</span>';
    }
  }
};

const loadIPBlockingStats = async () => {
  try {
    const response = await getIPBlockingStats();
    const data = response.data?.ip_blocking || {};
    
    const blockedIPs = document.getElementById('blocked-ips-count');
    const failedAttempts = document.getElementById('failed-attempts-count');
    const rateLimits = document.getElementById('rate-limit-count');
    
    if (blockedIPs) blockedIPs.textContent = data.blocked_ips || 0;
    if (failedAttempts) failedAttempts.textContent = data.failed_attempts_24h || 0;
    if (rateLimits) rateLimits.textContent = data.rate_limited_requests || 0;
    
  } catch (error) {
    console.error('Error loading IP blocking stats:', error);
  }
};

const loadDatabaseStats = async () => {
  try {
    const response = await getDatabaseStats();
    const data = response.data?.database || {};
    
    const dbStatus = document.getElementById('db-status');
    const queryCount = document.getElementById('db-query-count');
    const avgTime = document.getElementById('db-avg-time');
    const errorRate = document.getElementById('db-error-rate');
    
    if (dbStatus) {
      if (data.current_status === 'healthy') {
        dbStatus.innerHTML = '<span class="badge badge-success">Healthy</span>';
      } else {
        dbStatus.innerHTML = '<span class="badge badge-danger">Unhealthy</span>';
      }
    }
    
    if (queryCount) queryCount.textContent = data.query_count || 0;
    if (avgTime) avgTime.textContent = `${(data.avg_response_time || 0).toFixed(2)}ms`;
    if (errorRate) {
      const rate = data.error_rate || 0;
      errorRate.textContent = `${rate.toFixed(2)}%`;
      errorRate.className = rate > 5 ? 'text-2xl font-bold text-danger' : 'text-2xl font-bold';
    }
    
  } catch (error) {
    console.error('Error loading database stats:', error);
    const dbStatus = document.getElementById('db-status');
    if (dbStatus) {
      dbStatus.innerHTML = '<span class="badge badge-danger">Error</span>';
    }
  }
};

// ============ Event Listeners ============

let eventListeners = [];

const attachEventListeners = () => {
  // Logs search
  const btnSearchLogs = document.getElementById('btn-search-logs');
  if (btnSearchLogs) {
    const searchHandler = () => loadSystemLogs();
    btnSearchLogs.addEventListener('click', searchHandler);
    eventListeners.push({ element: btnSearchLogs, event: 'click', handler: searchHandler });
  }
  
  const logType = document.getElementById('log-type');
  if (logType) {
    const filterHandler = () => loadSystemLogs();
    logType.addEventListener('change', filterHandler);
    eventListeners.push({ element: logType, event: 'change', handler: filterHandler });
  }
  
  // Users search
  const btnSearchUsers = document.getElementById('btn-search-users');
  if (btnSearchUsers) {
    const searchUsersHandler = () => {
      const role = document.getElementById('filter-role')?.value || '';
      const status = document.getElementById('filter-status')?.value || '';
      const search = document.getElementById('search-users')?.value || '';
      
      currentUserFilters = {};
      if (role) currentUserFilters.role = role;
      if (status) currentUserFilters.status = status;
      if (search) currentUserFilters.search = search;
      
      loadUsers(1);
    };
    btnSearchUsers.addEventListener('click', searchUsersHandler);
    eventListeners.push({ element: btnSearchUsers, event: 'click', handler: searchUsersHandler });
  }
  
  const filterRole = document.getElementById('filter-role');
  if (filterRole) {
    const roleHandler = () => {
      const value = filterRole.value;
      if (value) {
        currentUserFilters.role = value;
      } else {
        delete currentUserFilters.role;
      }
      loadUsers(1);
    };
    filterRole.addEventListener('change', roleHandler);
    eventListeners.push({ element: filterRole, event: 'change', handler: roleHandler });
  }
  
  const filterStatus = document.getElementById('filter-status');
  if (filterStatus) {
    const statusHandler = () => {
      const value = filterStatus.value;
      if (value) {
        currentUserFilters.status = value;
      } else {
        delete currentUserFilters.status;
      }
      loadUsers(1);
    };
    filterStatus.addEventListener('change', statusHandler);
    eventListeners.push({ element: filterStatus, event: 'change', handler: statusHandler });
  }
  
  const searchUsers = document.getElementById('search-users');
  if (searchUsers) {
    const searchHandler = (e) => {
      if (e.key === 'Enter') {
        const value = e.target.value;
        if (value) {
          currentUserFilters.search = value;
        } else {
          delete currentUserFilters.search;
        }
        loadUsers(1);
      }
    };
    searchUsers.addEventListener('keypress', searchHandler);
    eventListeners.push({ element: searchUsers, event: 'keypress', handler: searchHandler });
  }
  
  // System monitoring refresh buttons
  const btnRefreshSockets = document.getElementById('btn-refresh-sockets');
  if (btnRefreshSockets) {
    const refreshHandler = () => loadSocketConnections();
    btnRefreshSockets.addEventListener('click', refreshHandler);
    eventListeners.push({ element: btnRefreshSockets, event: 'click', handler: refreshHandler });
  }
  
  const btnRefreshSecurity = document.getElementById('btn-refresh-security');
  if (btnRefreshSecurity) {
    const refreshHandler = () => loadIPBlockingStats();
    btnRefreshSecurity.addEventListener('click', refreshHandler);
    eventListeners.push({ element: btnRefreshSecurity, event: 'click', handler: refreshHandler });
  }
  
  const btnRefreshDatabase = document.getElementById('btn-refresh-database');
  if (btnRefreshDatabase) {
    const refreshHandler = () => loadDatabaseStats();
    btnRefreshDatabase.addEventListener('click', refreshHandler);
    eventListeners.push({ element: btnRefreshDatabase, event: 'click', handler: refreshHandler });
  }
};

const cleanupEventListeners = () => {
  eventListeners.forEach(({ element, event, handler }) => {
    if (element) {
      element.removeEventListener(event, handler);
    }
  });
  eventListeners = [];
};

// Cleanup on page unload or navigation
window.addEventListener('beforeunload', cleanupEventListeners);
window.addEventListener('hashchange', cleanupEventListeners);

// ============ Initialize on Load ============

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init, loadDashboardStats, loadPendingVerifications };