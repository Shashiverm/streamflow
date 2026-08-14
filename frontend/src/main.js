/**
 * StreamFlow — Main Application Entry
 * Real-Time Payroll Streaming on Stellar
 */

import './styles/index.css';
import { route, initRouter } from './router.js';
import { renderLanding } from './pages/landing.js';
import { renderOnboarding } from './pages/onboarding.js';
import { renderEmployer } from './pages/employer.js';
import { renderEmployee } from './pages/employee.js';
import { renderFeedbackWidget } from './feedback.js';
import { trackPerformance } from './analytics.js';

// Register routes
route('/', renderLanding);
route('/onboarding', renderOnboarding);
route('/employer', renderEmployer);
route('/employee', renderEmployee);

// Initialize router
initRouter();

// Initialize feedback widget
renderFeedbackWidget(document.body);

// Track page load performance
window.addEventListener('load', () => {
  if (performance?.timing) {
    const loadTime = performance.timing.loadEventEnd - performance.timing.navigationStart;
    trackPerformance('page_load', loadTime);
  }
});

console.log(
  '%c StreamFlow %c Real-Time Payroll Streaming on Stellar ',
  'background: linear-gradient(135deg, #4f7df9, #00d4ff); color: white; padding: 4px 8px; border-radius: 4px 0 0 4px; font-weight: bold;',
  'background: #0c1020; color: #8892b0; padding: 4px 8px; border-radius: 0 4px 4px 0;'
);
