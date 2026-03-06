(() => {
  const script = document.currentScript;
  const requiredRole = (script?.dataset?.guard || 'auth').toLowerCase();
  const dashboards = {
    buyer: '/buyer.html',
    seller: '/seller.html',
    admin: '/admin.html'
  };

  const hideDocument = () => {
    document.documentElement.style.visibility = 'hidden';
  };

  const revealDocument = () => {
    document.documentElement.style.visibility = '';
  };

  const safeStorageGet = (key) => {
    try {
      return localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  };

  const parseUser = (raw) => {
    if (!raw || raw === 'undefined' || raw === 'null') return null;
    try {
      return JSON.parse(raw);
    } catch (error) {
      return null;
    }
  };

  const isTokenExpired = (token) => {
    try {
      const payload = token.split('.')[1];
      if (!payload) return true;
      const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
      if (!decoded?.exp) return true;
      return decoded.exp <= Math.floor(Date.now() / 1000);
    } catch (error) {
      return true;
    }
  };

  const getReturnUrl = () => `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const redirectToLogin = () => {
    window.location.replace(`/index.html?return=${encodeURIComponent(getReturnUrl())}`);
  };

  hideDocument();

  const token = safeStorageGet('agrimarket_token');
  const user = parseUser(safeStorageGet('agrimarket_user'));

  const hasSession = Boolean(token && user && !isTokenExpired(token));
  if (!hasSession) {
    redirectToLogin();
    return;
  }

  const role = String(user?.role || '').toLowerCase();
  if (requiredRole !== 'auth' && requiredRole && role !== requiredRole) {
    window.location.replace(dashboards[role] || '/index.html');
    return;
  }

  revealDocument();
})();
