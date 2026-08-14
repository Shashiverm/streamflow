/**
 * StreamFlow — Client-Side SPA Router
 */

const routes = {};
let currentCleanup = null;

export function route(path, handler) {
  routes[path] = handler;
}

export function navigate(path) {
  window.history.pushState({}, '', path);
  render();
}

export async function render() {
  const path = window.location.pathname;
  const app = document.getElementById('app');

  // Clean up previous page
  if (currentCleanup && typeof currentCleanup === 'function') {
    currentCleanup();
    currentCleanup = null;
  }

  // Find matching route
  const handler = routes[path] || routes['/'];

  if (handler) {
    const result = await handler(app);
    if (typeof result === 'function') {
      currentCleanup = result;
    }
  }
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
