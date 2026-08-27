/**
 * StreamFlow — Feedback Widget
 */

const FEEDBACK_KEY = 'streamflow_feedback';
const MAX_COMMENT_LENGTH = 500;
const MAX_FEEDBACK_ENTRIES = 100;

function getFeedbackStore() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveFeedbackStore(data) {
  // Cap stored entries
  if (data.length > MAX_FEEDBACK_ENTRIES) data = data.slice(-MAX_FEEDBACK_ENTRIES);
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(data));
}

export function submitFeedback(rating, comment, userAddress = '') {
  if (rating < 1 || rating > 5) return;
  // Sanitize comment
  const sanitized = comment.slice(0, MAX_COMMENT_LENGTH).replace(/[<>]/g, '');
  const store = getFeedbackStore();
  store.push({
    rating,
    comment: sanitized,
    userAddress,
    timestamp: new Date().toISOString(),
  });
  saveFeedbackStore(store);
}

export function getFeedbackSummary() {
  const store = getFeedbackStore();
  if (store.length === 0) return { count: 0, averageRating: 0, entries: [] };
  const total = store.reduce((sum, f) => sum + f.rating, 0);
  return {
    count: store.length,
    averageRating: (total / store.length).toFixed(1),
    entries: store,
  };
}

export function renderFeedbackWidget(container) {
  let isOpen = false;
  let selectedRating = 5;

  const widget = document.createElement('div');
  widget.className = 'feedback-widget';
  widget.id = 'feedback-widget';

  function updateWidget() {
    const summary = getFeedbackSummary();

    widget.innerHTML = `
      <button class="feedback-trigger ${isOpen ? 'active' : ''}" id="feedback-toggle" title="Feedback" aria-label="Feedback">
        <span class="feedback-trigger-icon">${isOpen ? '✕' : '💬'}</span>
        <span class="feedback-trigger-label">Feedback</span>
      </button>

      ${isOpen ? `
        <div class="feedback-panel">
          <div class="feedback-panel-header">
            <div>
              <h4 style="margin: 0; font-size: 1rem; color: var(--text-primary);">Feedback</h4>
              <span class="text-muted" style="font-size: 0.76rem;">Help us improve StreamFlow</span>
            </div>
            <button class="feedback-close" id="feedback-panel-close">&times;</button>
          </div>

          <div class="feedback-rating-row">
            <span style="font-size: 0.82rem; color: var(--text-secondary);">Rating:</span>
            <div class="rating-stars" id="rating-stars">
              ${[1, 2, 3, 4, 5].map(n => `
                <button type="button" data-rating="${n}" class="star-btn ${n <= selectedRating ? 'active' : ''}">
                  ★
                </button>
              `).join('')}
            </div>
          </div>

          <div class="form-group mb-sm">
            <textarea id="feedback-comment" class="form-input" rows="3" maxlength="${MAX_COMMENT_LENGTH}" placeholder="What do you think?"></textarea>
          </div>

          <button class="btn btn-primary btn-sm w-full" id="submit-feedback">
            Submit
          </button>

          ${summary.count > 0 ? `
            <div class="flex flex-between align-center mt-sm" style="font-size: 0.72rem; color: var(--text-muted); padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
              <span>${summary.averageRating} / 5.0 avg</span>
              <span>${summary.count} reviews</span>
            </div>
          ` : ''}
        </div>
      ` : ''}
    `;
  }

  updateWidget();
  container.appendChild(widget);

  widget.addEventListener('click', (e) => {
    if (e.target.closest('#feedback-toggle') || e.target.closest('#feedback-panel-close')) {
      isOpen = !isOpen;
      updateWidget();
      return;
    }

    const ratingBtn = e.target.closest('[data-rating]');
    if (ratingBtn) {
      selectedRating = parseInt(ratingBtn.dataset.rating);
      updateWidget();
      return;
    }

    if (e.target.closest('#submit-feedback')) {
      const comment = widget.querySelector('#feedback-comment')?.value || '';
      const addr = localStorage.getItem('streamflow_address') || '';
      submitFeedback(selectedRating, comment, addr);
      selectedRating = 5;
      isOpen = false;
      updateWidget();
      showToast('Thank you for your feedback!', 'success');
    }
  });
}

function showToast(msg, type) {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    container.className = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type === 'error' ? 'error' : 'success'}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 4000);
}
