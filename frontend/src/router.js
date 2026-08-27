/**
 * StreamFlow — Client-Side SPA Router
 */

const routes = {};
let currentCleanup = null;
let isNavigating = false;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  if (isNavigating) return; // prevent double-navigation
  window.history.pushState({}, '', path);
  render();
}

export async function render() {
  if (isNavigating) return;
  isNavigating = true;

  const path = window.location.pathname;
  const app = document.getElementById('app');

  // Clean up previous page
  if (currentCleanup && typeof currentCleanup === 'function') {
    try { currentCleanup(); } catch {}
    currentCleanup = null;
  }

  // Find matching route
  const handler = routes[path] || routes['/'];

  if (handler) {
    try {
      const result = await handler(app);
      if (typeof result === 'function') {
        currentCleanup = result;
      }
    } catch (err) {
      console.error('[Router] Page render error:', err);
    }
  }

  isNavigating = false;
}

export function initRouter() {
  window.addEventListener('popstate', render);

  // Intercept link clicks for SPA navigation
  document.addEventListener('click', (e) => {
    const link = e.target.closest('a[data-link]');
    if (link) {
      e.preventDefault();
      navigate(link.getAttribute('href'));
    }
  });

  render();
}
