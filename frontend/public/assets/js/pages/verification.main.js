// ========================================
// assets/js/pages/verification.main.js
// Verification Page Script
// ========================================

import { renderNavbar } from '../components/navbar.js';
import { showToast, showError, showSuccess } from '../components/toast.js';
import { requireAuth } from '../core/auth.js';
import { validateFile } from '../utils/validators.js';
import { submitVerification, getVerificationStatus } from '../services/verification.service.js';

let idFile = null;
let selfieFile = null;

const init = async () => {

  
  // Check authentication - just require auth, no role check
  if (!requireAuth()) return;
  
  // Initialize
  renderNavbar();
  checkVerificationStatus();
  attachEventListeners();
  updateProgress();
};

const checkVerificationStatus = async () => {
  try {
    const response = await getVerificationStatus();
    const userStatus = response.data?.user_status;
    const verificationStatus = response.data?.verification?.status;
    
    if (userStatus === 'verified') {
      showToast('Your account is already verified!', 'success');
      setTimeout(() => {
        window.location.href = '/seller.html';
      }, 2000);
    } else if (userStatus === 'verification_pending') {
      // Hide the form and show pending message
      hideFormShowPendingMessage();
    } else if (verificationStatus === 'rejected') {
      showToast('Previous verification was rejected. Please resubmit.', 'warning');
    }
  } catch (error) {
    console.error('Error checking verification status:', error);
  }
};

const hideFormShowPendingMessage = () => {
  const form = document.getElementById('verification-form');
  const header = document.querySelector('.verification-header');
  
  if (form) {
    form.style.display = 'none';
  }
  
  if (header) {
    header.style.display = 'none';
  }
  
  // Create and show pending message
  const cardBody = document.querySelector('.card-body');
  
  if (cardBody) {
    // Check if message already exists
    const existingMessage = document.getElementById('pending-verification-message');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    const pendingMessage = document.createElement('div');
    pendingMessage.id = 'pending-verification-message';
    pendingMessage.className = 'mt-8 mb-4';
    pendingMessage.innerHTML = `
      <div class="bg-gradient-to-r from-blue-50 to-indigo-50 border-2 border-blue-300 rounded-xl p-8 text-center">
        <div class="w-20 h-20 bg-info text-white rounded-full flex items-center justify-center mx-auto mb-4">
          <i class="bi bi-hourglass-split text-4xl"></i>
        </div>
        <h3 class="text-2xl font-bold text-gray-800 mb-4">
          Verification Submitted Successfully!
        </h3>
        <div class="bg-white rounded-lg border-l-4 border-warning p-6 max-w-2xl mx-auto">
          <div class="flex items-start gap-4">
            <i class="bi bi-exclamation-triangle text-warning text-2xl mt-1"></i>
            <div class="text-left">
              <p class="font-semibold text-gray-800 mb-2 text-lg">Important Note</p>
              <p class="text-gray-700 leading-relaxed">
                Verification typically takes <strong>24-48 hours</strong>. You'll be notified via email once your documents are reviewed. 
                Make sure your uploaded documents match your account information.
              </p>
            </div>
          </div>
        </div>
        <div class="mt-6">
          <a href="/seller.html" class="btn btn-primary btn-lg px-8 py-3">
            <i class="bi bi-arrow-left"></i>
            Return to Dashboard
          </a>
        </div>
      </div>
    `;
    cardBody.appendChild(pendingMessage);

  }
};

const attachEventListeners = () => {
  // ID document upload
  const idInput = document.getElementById('id-document');
  if (idInput) {
    idInput.addEventListener('change', handleIdUpload);
  }
  
  // Selfie upload
  const selfieInput = document.getElementById('selfie-photo');
  if (selfieInput) {
    selfieInput.addEventListener('change', handleSelfieUpload);
  }
  
  // ID type selection
  const idTypeSelect = document.getElementById('id-type');
  if (idTypeSelect) {
    idTypeSelect.addEventListener('change', updateProgress);
  }
  
  // Form submit
  const form = document.getElementById('verification-form');
  if (form) {
    form.addEventListener('submit', handleSubmit);
  }
};

const updateProgress = () => {
  const idType = document.getElementById('id-type')?.value;
  const hasId = idFile !== null;
  const hasSelfie = selfieFile !== null;
  
  const progressFill = document.getElementById('progress-fill');
  const progressText = document.getElementById('progress-text');
  
  if (!progressFill || !progressText) return;
  
  let step = 1;
  let percentage = 0;
  let text = 'Step 1 of 3: Select ID Type';
  
  if (idType) {
    step = 2;
    percentage = 33;
    text = 'Step 2 of 3: Upload ID Document';
  }
  
  if (idType && hasId) {
    step = 3;
    percentage = 66;
    text = 'Step 3 of 3: Upload Selfie Photo';
  }
  
  if (idType && hasId && hasSelfie) {
    percentage = 100;
    text = 'All Done! Ready to Submit';
  }
  
  progressFill.style.width = `${percentage}%`;
  progressText.textContent = text;
};

const handleIdUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const validation = validateFile(file, 5, ['image/jpeg', 'image/jpg', 'image/png']);
  if (!validation.valid) {
    showError(validation.message);
    e.target.value = '';
    return;
  }
  
  idFile = file;
  
  // Add visual feedback to upload section
  const uploadSection = document.getElementById('id-upload-section');
  if (uploadSection) {
    uploadSection.classList.add('has-file');
  }
  
  // Preview
  const preview = document.getElementById('id-preview');
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.querySelector('img').src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
  
  // Update progress
  updateProgress();
};

const handleSelfieUpload = (e) => {
  const file = e.target.files[0];
  if (!file) return;
  
  const validation = validateFile(file, 5, ['image/jpeg', 'image/jpg', 'image/png']);
  if (!validation.valid) {
    showError(validation.message);
    e.target.value = '';
    return;
  }
  
  selfieFile = file;
  
  // Add visual feedback to upload section
  const uploadSection = document.getElementById('selfie-upload-section');
  if (uploadSection) {
    uploadSection.classList.add('has-file');
  }
  
  // Preview
  const preview = document.getElementById('selfie-preview');
  const reader = new FileReader();
  reader.onload = (e) => {
    preview.querySelector('img').src = e.target.result;
    preview.style.display = 'block';
  };
  reader.readAsDataURL(file);
  
  // Update progress
  updateProgress();
};

const handleSubmit = async (e) => {
  e.preventDefault();
  
  if (!idFile || !selfieFile) {
    showError('Please upload both documents');
    return;
  }
  
  const formData = new FormData();
  formData.append('id_photo', idFile);
  formData.append('selfie', selfieFile);
  formData.append('id_type', document.getElementById('id-type').value);
  
  const btn = document.getElementById('btn-submit-verification');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-split"></i> Submitting...';
  
  try {
    const response = await submitVerification(formData);
    
    if (response.success) {
      showSuccess('Verification submitted! You will be notified once reviewed.');
      // Hide form and show pending message
      setTimeout(() => {
        hideFormShowPendingMessage();
      }, 1000);
    }
  } catch (error) {
    console.error('Error submitting verification:', error);
    showError(error.message || 'Failed to submit verification');
    
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-shield-check"></i> Submit for Verification';
  }
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}

export { init };