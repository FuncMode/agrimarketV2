
const renderFooter = () => {
  const footer = document.getElementById('main-footer');
  if (!footer) return;
  
  footer.innerHTML = `
        <div class="container mx-auto px-4">
      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
        <div class="sm:col-span-2 lg:col-span-1">
          <div class="flex items-center gap-2 mb-4">
            <i class="bi bi-basket2-fill"></i>
            <h3 class="text-2xl font-bold font-display">AgriMarket</h3>
          </div>
          <p class="text-green-100 leading-relaxed mb-4">
            Connecting local farmers and buyers in Rizal Province for fresh, direct, and verified agricultural products.
          </p>
          <div class="text-green-100 text-sm">
            <div class="flex items-center gap-2 mb-2">
              <i class="bi bi-geo-alt"></i>
              <span>Rizal Province, Philippines</span>
            </div>
          </div>
        </div>
        <div>
          <h4 class="font-semibold mb-4 text-lg">Quick Links</h4>
          <ul class="space-y-3">
            <li><a href="/about.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-info-circle"></i> About Us</a></li>
            <li><a href="/how-it-works.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-question-circle"></i> How It Works</a></li>
            <li><a href="/contact.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-envelope"></i> Contact</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-4 text-lg">For Sellers</h4>
          <ul class="space-y-3">
            <li><a href="/become-seller.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-person-plus"></i> Become a Seller</a></li>
            <li><a href="/seller-guidelines.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-book"></i> Seller Guidelines</a></li>
            <li><a href="/faq.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-question-circle"></i> FAQ</a></li>
          </ul>
        </div>
        <div>
          <h4 class="font-semibold mb-4 text-lg">Legal</h4>
          <ul class="space-y-3">
            <li><a href="/terms.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-file-text"></i> Terms of Service</a></li>
            <li><a href="/privacy.html" class="text-green-100 hover:text-white transition-colors flex items-center gap-2"><i class="bi bi-shield-lock"></i> Privacy Policy</a></li>
          </ul>
        </div>
      </div>
    </div>
  `;
};

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', renderFooter);
} else {
  renderFooter();
}

export { renderFooter };