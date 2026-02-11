// components/issue-modal.js
// Issue/Complaint Modal Component

import { createIssue } from '../services/issue.service.js';
import { showSuccess, showError } from '../components/toast.js';

class IssueModal {
  constructor() {
    this.modal = null;
    this.orderId = null;
    this.orderNumber = null;
    this.evidenceFiles = [];
  }

  open(orderId, orderNumber) {
    this.orderId = orderId;
    this.orderNumber = orderNumber;
    this.evidenceFiles = [];
    this.render();
    this.attachEventListeners();
  }

  render() {
    // Remove existing modal if any
    const existingModal = document.getElementById('issue-modal');
    if (existingModal) {
      existingModal.remove();
    }

    const modalHTML = `
      <div id="issue-modal" class="modal-backdrop">
        <div class="modal modal-lg">
          <div class="modal-header">
            <h3 class="modal-title">Report Issue</h3>
            <button id="close-issue-modal" class="modal-close">
              <i class="bi bi-x-lg"></i>
            </button>
          </div>
          <div class="modal-body">
            <div class="space-y-4">
              <div class="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <p class="text-sm text-blue-800">
                  <i class="bi bi-info-circle"></i> 
                  Order #${this.orderNumber} - Report an issue with this completed order
                </p>
              </div>

              <form id="issue-form" class="space-y-4">
                <div>
                  <label class="form-label required">Issue Type</label>
                  <select id="issue-type" class="form-input" required>
                    <option value="">Select issue type...</option>
                    <option value="Product Quality">Product Quality Issue</option>
                    <option value="Delivery Problem">Delivery Problem</option>
                    <option value="Wrong Product">Wrong Product Received</option>
                    <option value="Incomplete Order">Incomplete Order</option>
                    <option value="Damaged Product">Damaged Product</option>
                    <option value="Payment Dispute">Payment Dispute</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div>
                  <label class="form-label required">Description</label>
                  <textarea 
                    id="issue-description" 
                    class="form-input" 
                    rows="8"
                    cols="70"
                    placeholder="Please describe the issue in detail (minimum 20 characters)..."
                    required
                    minlength="20"
                    maxlength="1000"
                  ></textarea>
                  <p class="text-xs text-gray-500 mt-1">
                    <span id="description-count">0</span>/1000 characters (minimum 20)
                  </p>
                </div>

                <div>
                  <label class="form-label">Evidence (Optional)</label>
                  <p class="text-xs text-gray-500 mb-2">
                    Upload photos or documents to support your claim (max 5 files, 5MB each)
                  </p>
                  <div class="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
                    <input 
                      type="file" 
                      id="issue-evidence" 
                      class="hidden" 
                      accept="image/*,.pdf"
                      multiple
                    />
                    <label for="issue-evidence" class="cursor-pointer">
                      <i class="bi bi-cloud-upload text-4xl text-gray-400"></i>
                      <p class="mt-2 text-sm text-gray-600">
                        Click to upload or drag and drop
                      </p>
                      <p class="text-xs text-gray-500">
                        PNG, JPG, PDF up to 5MB each
                      </p>
                    </label>
                  </div>
                  <div id="evidence-preview" class="mt-3 space-y-2"></div>
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <p class="text-sm text-yellow-800">
                    <i class="bi bi-exclamation-triangle"></i> 
                    Your issue will be reviewed by our admin team. You will be notified once it's reviewed.
                  </p>
                </div>

                <div class="flex justify-end gap-3 pt-4">
                  <button type="button" id="cancel-issue" class="btn btn-outline">
                    Cancel
                  </button>
                  <button type="submit" id="submit-issue-btn" class="btn btn-primary">
                    <i class="bi bi-send"></i> Submit Issue
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHTML);
    this.modal = document.getElementById('issue-modal');
  }

  attachEventListeners() {
    const closeBtn = document.getElementById('close-issue-modal');
    const cancelBtn = document.getElementById('cancel-issue');
    const form = document.getElementById('issue-form');
    const evidenceInput = document.getElementById('issue-evidence');
    const descriptionTextarea = document.getElementById('issue-description');

    // Close handlers
    closeBtn.addEventListener('click', () => this.close());
    cancelBtn.addEventListener('click', () => this.close());
    this.modal.addEventListener('click', (e) => {
      if (e.target === this.modal) this.close();
    });

    // Character counter
    descriptionTextarea.addEventListener('input', (e) => {
      const count = e.target.value.length;
      document.getElementById('description-count').textContent = count;
    });

    // File upload handler
    evidenceInput.addEventListener('change', (e) => {
      this.handleFileUpload(e.target.files);
    });

    // Form submission
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      this.submitIssue();
    });
  }

  handleFileUpload(files) {
    const maxFiles = 5;
    const maxSize = 5 * 1024 * 1024; // 5MB
    const preview = document.getElementById('evidence-preview');

    // Validate file count
    if (this.evidenceFiles.length + files.length > maxFiles) {
      showError(`Maximum ${maxFiles} files allowed`);
      return;
    }

    // Validate and add files
    Array.from(files).forEach(file => {
      if (file.size > maxSize) {
        showError(`File ${file.name} exceeds 5MB limit`);
        return;
      }

      this.evidenceFiles.push(file);
      this.renderFilePreview(file);
    });
  }

  renderFilePreview(file) {
    const preview = document.getElementById('evidence-preview');
    const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const fileHTML = `
      <div id="${fileId}" class="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
        <div class="flex items-center gap-3">
          <i class="bi bi-${file.type.startsWith('image/') ? 'image' : 'file-pdf'} text-2xl text-blue-600"></i>
          <div>
            <p class="text-sm font-medium">${file.name}</p>
            <p class="text-xs text-gray-500">${(file.size / 1024).toFixed(1)} KB</p>
          </div>
        </div>
        <button type="button" class="btn btn-sm btn-ghost text-red-600" data-file="${file.name}">
          <i class="bi bi-trash"></i>
        </button>
      </div>
    `;

    preview.insertAdjacentHTML('beforeend', fileHTML);

    // Remove file handler
    const removeBtn = preview.querySelector(`[data-file="${file.name}"]`);
    removeBtn.addEventListener('click', () => {
      this.evidenceFiles = this.evidenceFiles.filter(f => f.name !== file.name);
      document.getElementById(fileId).remove();
    });
  }

  async submitIssue() {
    const issueType = document.getElementById('issue-type').value;
    const description = document.getElementById('issue-description').value;
    const submitBtn = document.getElementById('submit-issue-btn');

    // Validation
    if (!issueType) {
      showError('Please select an issue type');
      return;
    }

    if (description.length < 20) {
      showError('Description must be at least 20 characters');
      return;
    }

    try {
      submitBtn.disabled = true;
      submitBtn.innerHTML = '<i class="bi bi-hourglass-split animate-spin"></i> Submitting...';

      // Prepare form data
      const formData = new FormData();
      formData.append('order_id', this.orderId);
      formData.append('issue_type', issueType);
      formData.append('description', description);

      // Add evidence files
      this.evidenceFiles.forEach(file => {
        formData.append('evidence', file);
      });

      // Submit issue
      const response = await createIssue(formData);

      if (response.success) {
        showSuccess('Issue reported successfully! Our admin team will review it.');
        this.close();
        
        // Trigger refresh if available
        if (window.loadOrders && typeof window.loadOrders === 'function') {
          window.loadOrders();
        }
      } else {
        throw new Error(response.message || 'Failed to submit issue');
      }
    } catch (error) {
      console.error('Error submitting issue:', error);
      showError(error.message || 'Failed to submit issue. Please try again.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<i class="bi bi-send"></i> Submit Issue';
    }
  }

  close() {
    if (this.modal) {
      this.modal.remove();
      this.modal = null;
      this.orderId = null;
      this.orderNumber = null;
      this.evidenceFiles = [];
    }
  }
}

// Create singleton instance
const issueModal = new IssueModal();

// Export functions
export function openIssueModal(orderId, orderNumber) {
  issueModal.open(orderId, orderNumber);
}

export function closeIssueModal() {
  issueModal.close();
}
