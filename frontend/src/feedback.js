/**
 * StreamFlow — Luxury Floating User Feedback Widget
 */

const FEEDBACK_KEY = 'streamflow_feedback';

const SEED_FEEDBACK = [
  {
    name: 'Souvik Mandal',
    userAddress: 'GDKHLI3JCIRIKHOY5UJIVNEYGQOZXQSPE4SRWMKG7B77VAQE7SSYQMU6',
    rating: 5,
    comment: "Continuous streaming payroll is game-changing. Single transaction, instant withdrawals, zero latency.",
    timestamp: new Date().toISOString(),
  },
  {
    name: 'Anubhab Rakshit',
    userAddress: 'GAXMN5XJDKC5LULYYTCMTAC7NZZWA6DL3GJQD362HJ3C2KADPK5JQD4C',
    rating: 5,
    comment: 'UI looks incredible in Obsidian & Emerald. Transactions on Stellar Soroban are fast and flawless.',
    timestamp: new Date().toISOString(),
  },
];

function getFeedbackStore() {
  try {
    const raw = localStorage.getItem(FEEDBACK_KEY);
    if (!raw) {
      localStorage.setItem(FEEDBACK_KEY, JSON.stringify(SEED_FEEDBACK));
      return SEED_FEEDBACK;
    }
    return JSON.parse(raw) || SEED_FEEDBACK;
  } catch {
    return SEED_FEEDBACK;
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
  let selectedRating = 5;

  const widget = document.createElement('div');
  widget.className = 'feedback-widget';
  widget.id = 'feedback-widget';

  function updateWidget() {
    const summary = getFeedbackSummary();

    widget.innerHTML = `
      <button class="feedback-trigger ${isOpen ? 'active' : ''}" id="feedback-toggle" title="Share Feedback" aria-label="Share Feedback">
        <span class="feedback-trigger-icon">${isOpen ? '✕' : '💬'}</span>
        <span class="feedback-trigger-label">Feedback</span>
      </button>

      ${isOpen ? `
        <div class="feedback-panel">
          <div class="feedback-panel-header">
            <div>
              <h4 style="margin: 0; font-size: 1rem; color: var(--text-primary);">Share Feedback</h4>
              <span class="text-muted" style="font-size: 0.76rem;">Help us build the best payroll protocol</span>
            </div>
            <button class="feedback-close" id="feedback-panel-close">✕</button>
          </div>

          <div class="feedback-rating-row">
            <span style="font-size: 0.82rem; color: var(--text-secondary);">Your Rating:</span>
            <div class="rating-stars" id="rating-stars">
              ${[1, 2, 3, 4, 5].map(n => `
                <button type="button" data-rating="${n}" class="star-btn ${n <= selectedRating ? 'active' : ''}">
                  ★
                </button>
              `).join('')}
            </div>
          </div>

          <div class="form-group mb-sm">
            <textarea id="feedback-comment" class="form-input" rows="3" placeholder="What do you think of the contract speed & UI?"></textarea>
          </div>

          <button class="btn btn-primary btn-sm w-full" id="submit-feedback">
            ⚡ Submit Feedback
          </button>

          <div class="flex flex-between align-center mt-sm" style="font-size: 0.72rem; color: var(--text-muted); padding-top: 8px; border-top: 1px solid rgba(255,255,255,0.06);">
            <span>⭐ ${summary.averageRating} / 5.0 Average</span>
            <span>${summary.count} Reviews</span>
          </div>
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
