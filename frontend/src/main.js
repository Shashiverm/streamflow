/**
 * StreamFlow — Main Application Entry
 */

import './styles/index.css';
import { route, initRouter } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderOnboarding } from './pages/onboarding.js';
import { renderEmployer } from './pages/employer.js';
import { renderEmployee } from './pages/employee.js';
import { renderFeedbackWidget } from './feedback.js';

// Register routes
route('/', renderLanding);
route('/onboarding', renderOnboarding);
route('/employer', renderEmployer);
route('/employee', renderEmployee);

// Initialize router
initRouter();

// Initialize feedback widget
renderFeedbackWidget(document.body);

// Global mobile navigation toggle
document.addEventListener('click', (e) => {
  const toggleBtn = e.target.closest('#mobile-menu-toggle');
  if (toggleBtn) {
    toggleBtn.classList.toggle('active');
    const nav = document.getElementById('navbar-nav');
    if (nav) nav.classList.toggle('active');
  } else if (e.target.closest('#navbar-nav a')) {
    const toggleBtn = document.getElementById('mobile-menu-toggle');
    const nav = document.getElementById('navbar-nav');
    if (toggleBtn) toggleBtn.classList.remove('active');
    if (nav) nav.classList.remove('active');
  }
});
