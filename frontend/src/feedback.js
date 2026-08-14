/**
 * StreamFlow — User Feedback Collection
 */

const FEEDBACK_KEY = 'streamflow_feedback';

function getFeedbackStore() {
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) || '[]');
  } catch {
    return [];
  }
}

function saveFeedbackStore(data) {
  localStorage.setItem(FEEDBACK_KEY, JSON.stringify(data));
}

export function submitFeedback(rating, comment, userAddress = '') {
  const store = getFeedbackStore();
  store.push({
    rating,
    comment,
    userAddress,
    timestamp: new Date().toISOString(),
  });
  saveFeedbackStore(store);
}

export function getFeedbackSummary() {
  const store = getFeedbackStore();
  if (store.length === 0) {
    return {
      count: 0,
      averageRating: 0,
      entries: [],
    };
  }

  const total = store.reduce((sum, f) => sum + f.rating, 0);
  return {
    count: store.length,
    averageRating: (total / store.length).toFixed(1),
    entries: store,
  };
}

export function renderFeedbackWidget(container) {
  let isOpen = false;
  let selectedRating = 0;

  const widget = document.createElement('div');
  widget.className = 'feedback-widget';
  widget.id = 'feedback-widget';

  function updateWidget() {
    widget.innerHTML = `
      <button class="feedback-trigger" id="feedback-toggle" title="Send Feedback">💬</button>
      ${isOpen ? `
        <div class="feedback-panel">
          <h4 style="margin-bottom: var(--space-md);">How's StreamFlow?</h4>
          <div class="rating-stars" id="rating-stars">
            ${[1,2,3,4,5].map(n => `
              <button data-rating="${n}" class="${n <= selectedRating ? 'active' : ''}">⭐</button>
            `).join('')}
          </div>
          <div class="form-group mt-md">
            <textarea id="feedback-comment" class="form-input" rows="3" placeholder="Tell us what you think..."></textarea>
          </div>
          <button class="btn btn-primary btn-sm w-full mt-md" id="submit-feedback">
            Submit Feedback
          </button>
          <div class="text-muted mt-sm" style="font-size: 0.75rem;">
            ${getFeedbackSummary().count} feedback entries collected
          </div>
        </div>
      ` : ''}
    `;
  }

  updateWidget();
  container.appendChild(widget);

  widget.addEventListener('click', (e) => {
    if (e.target.closest('#feedback-toggle')) {
      isOpen = !isOpen;
      updateWidget();
    }

    const ratingBtn = e.target.closest('[data-rating]');
    if (ratingBtn) {
      selectedRating = parseInt(ratingBtn.dataset.rating);
      updateWidget();
    }

    if (e.target.closest('#submit-feedback')) {
      const comment = widget.querySelector('#feedback-comment')?.value || '';
      if (selectedRating > 0) {
        const addr = window.__streamflow_wallet || '';
        submitFeedback(selectedRating, comment, addr);
        selectedRating = 0;
        isOpen = false;
        updateWidget();
        showToast('Thanks for your feedback!', 'success');
      }
    }
  });
}

function showToast(msg, type) {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  container.appendChild(toast);
  setTimeout(() => toast.remove(), 3000);
}
