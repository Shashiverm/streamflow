/**
 * StreamFlow — Analytics Module
 * Tracks events, page views, and performance metrics.
 * Uses localStorage for persistence (no external dependency).
 */

const STORAGE_KEY = 'streamflow_analytics';

function getStore() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveStore(store) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
}

export function trackEvent(category, action, label = '', value = 0) {
  const store = getStore();
  if (!store.events) store.events = [];

  store.events.push({
    category,
    action,
    label,
    value,
    timestamp: new Date().toISOString(),
  });

  // Keep last 500 events
  if (store.events.length > 500) {
    store.events = store.events.slice(-500);
  }

  saveStore(store);
  console.log(`[Analytics] ${category}/${action}`, label, value);
}

export function trackPageView(page) {
  const store = getStore();
  if (!store.pageViews) store.pageViews = [];

  store.pageViews.push({
    page,
    timestamp: new Date().toISOString(),
    userAgent: navigator.userAgent,
  });

  if (store.pageViews.length > 200) {
    store.pageViews = store.pageViews.slice(-200);
  }

  saveStore(store);
}

export function trackPerformance(metric, value) {
  const store = getStore();
  if (!store.performance) store.performance = [];

  store.performance.push({
    metric,
    value,
    timestamp: new Date().toISOString(),
  });

  if (store.performance.length > 100) {
    store.performance = store.performance.slice(-100);
  }

  saveStore(store);
}

export function trackError(error, context = '') {
  const store = getStore();
  if (!store.errors) store.errors = [];

  store.errors.push({
    message: error.message || String(error),
    context,
    timestamp: new Date().toISOString(),
  });

  if (store.errors.length > 100) {
    store.errors = store.errors.slice(-100);
  }

  saveStore(store);
}

export function getAnalyticsSummary() {
  const store = getStore();

  const events = store.events || [];
  const pageViews = store.pageViews || [];
  const errors = store.errors || [];

  // Count by category
  const eventsByCategory = {};
  events.forEach(e => {
    const key = `${e.category}/${e.action}`;
    eventsByCategory[key] = (eventsByCategory[key] || 0) + 1;
  });

  // Page view counts
  const pageViewCounts = {};
  pageViews.forEach(pv => {
    pageViewCounts[pv.page] = (pageViewCounts[pv.page] || 0) + 1;
  });

  return {
    totalEvents: events.length,
    totalPageViews: pageViews.length,
    totalErrors: errors.length,
    eventsByCategory,
    pageViewCounts,
    recentEvents: events.slice(-10),
    recentErrors: errors.slice(-5),
  };
}

export function clearAnalytics() {
  localStorage.removeItem(STORAGE_KEY);
}

// Track unhandled errors
window.addEventListener('error', (event) => {
  trackError(event.error || event.message, 'unhandled');
});

window.addEventListener('unhandledrejection', (event) => {
  trackError(event.reason || 'Promise rejected', 'unhandled-rejection');
});
