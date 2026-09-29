/**
 * Quote Generator with History - Frontend Logic
 * Vanilla JavaScript (No frameworks)
 */

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements - Main Card
  const quoteTopic = document.getElementById('quoteTopic');
  const quoteSourceBadge = document.getElementById('quoteSourceBadge');
  const sourceIcon = document.getElementById('sourceIcon');
  const sourceLabel = document.getElementById('sourceLabel');
  const quoteText = document.getElementById('quoteText');
  const quoteAuthor = document.getElementById('quoteAuthor');
  const newQuoteBtn = document.getElementById('newQuoteBtn');
  const newQuoteBtnText = document.getElementById('newQuoteBtnText');
  const favoriteBtn = document.getElementById('favoriteBtn');
  const favoriteBtnText = document.getElementById('favoriteBtnText');
  const copyBtn = document.getElementById('copyBtn');
  const copyBtnText = document.getElementById('copyBtnText');

  // DOM Elements - Favorites History
  const favoritesList = document.getElementById('favoritesList');
  const emptyState = document.getElementById('emptyState');
  const favoritesCountBadge = document.getElementById('favoritesCountBadge');
  const toastContainer = document.getElementById('toastContainer');

  // Application State
  let currentQuote = null;
  let isLoadingQuote = false;
  let isSavingFavorite = false;
  let favoritesCount = 0;

  // ----------------------------------------------------
  // Toast Notification System
  // ----------------------------------------------------
  function showToast(message, type = 'info', duration = 3000) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;

    const iconSpan = document.createElement('span');
    if (type === 'success') iconSpan.textContent = '✓';
    else if (type === 'warning') iconSpan.textContent = '⚠';
    else if (type === 'error') iconSpan.textContent = '✕';
    else iconSpan.textContent = 'ℹ';

    const textSpan = document.createElement('span');
    textSpan.textContent = message;

    toast.appendChild(iconSpan);
    toast.appendChild(textSpan);
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('toast-hiding');
      setTimeout(() => {
        if (toast.parentNode) {
          toast.parentNode.removeChild(toast);
        }
      }, 250);
    }, duration);
  }

  // ----------------------------------------------------
  // Copy to Clipboard Utility
  // ----------------------------------------------------
  async function copyToClipboard(text, quote, author, btnElement, btnTextElement) {
    const formatted = `"${quote}"\n— ${author}`;
    let copied = false;

    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(formatted);
        copied = true;
      } catch (err) {
        console.warn('Clipboard API failed, using fallback execCommand:', err);
      }
    }

    if (!copied) {
      // Fallback for non-secure / restricted contexts
      try {
        const textarea = document.createElement('textarea');
        textarea.value = formatted;
        textarea.style.position = 'fixed';
        textarea.style.left = '-9999px';
        textarea.style.top = '-9999px';
        document.body.appendChild(textarea);
        textarea.focus();
        textarea.select();
        copied = document.execCommand('copy');
        document.body.removeChild(textarea);
      } catch (err) {
        console.error('Fallback copy failed:', err);
      }
    }

    if (copied) {
      const originalText = btnTextElement.textContent;
      btnTextElement.textContent = 'Copied!';
      btnElement.style.borderColor = 'var(--success-color)';
      showToast('Quote copied to clipboard!', 'success', 2200);

      setTimeout(() => {
        btnTextElement.textContent = originalText;
        btnElement.style.borderColor = '';
      }, 2000);
    } else {
      showToast('Could not copy to clipboard.', 'error');
    }
  }

  // ----------------------------------------------------
  // Fetch Random Quote
  // ----------------------------------------------------
  async function fetchRandomQuote(isManual = false) {
    if (isLoadingQuote) return;
    isLoadingQuote = true;

    // UI Loading State
    newQuoteBtn.disabled = true;
    newQuoteBtn.classList.add('spinning');
    newQuoteBtnText.textContent = 'Fetching...';
    quoteText.classList.add('loading-fade');

    try {
      const response = await fetch('/api/quote');
      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const data = await response.json();
      currentQuote = data;

      // Update Card Content
      quoteText.textContent = `"${data.quote}"`;
      quoteAuthor.textContent = `— ${data.author}`;
      quoteTopic.textContent = data.topic || 'General';

      // Update Source Badge
      if (data.source === 'fallback') {
        quoteSourceBadge.className = 'source-tag fallback';
        sourceLabel.textContent = 'Seed Fallback Archive';
        sourceIcon.textContent = '🌱';
        quoteSourceBadge.title = 'Served from official 80-record fallback seed dataset';
        if (isManual) {
          showToast('Loaded from seed archive (external API unavailable)', 'warning', 3500);
        }
      } else {
        quoteSourceBadge.className = 'source-tag api';
        sourceLabel.textContent = 'Live API';
        sourceIcon.textContent = '✦';
        quoteSourceBadge.title = 'Served live from public quote API';
      }
    } catch (err) {
      console.error('Error fetching quote:', err);
      showToast('Failed to connect to backend service.', 'error');
    } finally {
      isLoadingQuote = false;
      newQuoteBtn.disabled = false;
      newQuoteBtn.classList.remove('spinning');
      newQuoteBtnText.textContent = 'New Quote';
      quoteText.classList.remove('loading-fade');
    }
  }

  // ----------------------------------------------------
  // Save to Favorites
  // ----------------------------------------------------
  async function saveCurrentQuote() {
    if (!currentQuote || !currentQuote.quote) {
      showToast('Please wait for a quote to load first.', 'info');
      return;
    }
    if (isSavingFavorite) return;
    isSavingFavorite = true;

    favoriteBtn.disabled = true;
    favoriteBtnText.textContent = 'Saving...';

    try {
      const response = await fetch('/api/favorites', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          quote: currentQuote.quote,
          author: currentQuote.author,
          topic: currentQuote.topic
        })
      });

      const result = await response.json();

      if (response.status === 201) {
        showToast(result.message || 'Quote saved to favorites!', 'success');
        // Prepend favorite card to the top
        renderFavoriteCard(result.favorite, true);
        favoritesCount += 1;
        updateFavoritesHeader();
      } else if (response.status === 409) {
        showToast(result.message || 'Quote already exists in favorites.', 'warning');
      } else {
        showToast(result.error || 'Failed to save quote.', 'error');
      }
    } catch (err) {
      console.error('Error saving favorite:', err);
      showToast('Network error while saving favorite.', 'error');
    } finally {
      isSavingFavorite = false;
      favoriteBtn.disabled = false;
      favoriteBtnText.textContent = 'Favorite';
    }
  }

  // ----------------------------------------------------
  // Load All Favorites
  // ----------------------------------------------------
  async function loadFavorites() {
    try {
      const response = await fetch('/api/favorites');
      if (!response.ok) {
        throw new Error(`Failed to load favorites: HTTP ${response.status}`);
      }

      const favorites = await response.json();
      favoritesList.innerHTML = '';
      favoritesCount = favorites.length;
      updateFavoritesHeader();

      if (favorites.length === 0) {
        emptyState.classList.add('visible');
      } else {
        emptyState.classList.remove('visible');
        favorites.forEach((fav) => {
          renderFavoriteCard(fav, false);
        });
      }
    } catch (err) {
      console.error('Error loading favorites:', err);
      showToast('Could not load favorites history.', 'error');
    }
  }

  // ----------------------------------------------------
  // Render a Single Favorite Card (Safe DOM)
  // ----------------------------------------------------
  function renderFavoriteCard(fav, prepend = false) {
    emptyState.classList.remove('visible');

    const card = document.createElement('div');
    card.className = 'favorite-card';
    card.setAttribute('role', 'listitem');
    card.setAttribute('data-id', fav.id);

    // Meta Header
    const metaWrap = document.createElement('div');
    metaWrap.className = 'fav-card-meta';

    const topicTag = document.createElement('span');
    topicTag.className = 'fav-topic-tag';
    topicTag.textContent = fav.topic || 'General';

    const dateSpan = document.createElement('span');
    dateSpan.className = 'fav-date';
    dateSpan.textContent = formatDate(fav.created_at);

    metaWrap.appendChild(topicTag);
    metaWrap.appendChild(dateSpan);

    // Quote Content
    const quoteP = document.createElement('p');
    quoteP.className = 'fav-quote-text';
    quoteP.textContent = `"${fav.quote}"`;

    const authorP = document.createElement('p');
    authorP.className = 'fav-author';
    authorP.textContent = `— ${fav.author}`;

    // Action Buttons
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'fav-card-actions';

    // Copy Button for this card
    const cardCopyBtn = document.createElement('button');
    cardCopyBtn.type = 'button';
    cardCopyBtn.className = 'btn-card-action';
    cardCopyBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
      </svg>
      <span class="card-copy-text">Copy</span>
    `;
    const cardCopyText = cardCopyBtn.querySelector('.card-copy-text');
    cardCopyBtn.addEventListener('click', () => {
      copyToClipboard(fav.quote, fav.quote, fav.author, cardCopyBtn, cardCopyText);
    });

    // Delete Button for this card
    const cardDeleteBtn = document.createElement('button');
    cardDeleteBtn.type = 'button';
    cardDeleteBtn.className = 'btn-card-action btn-delete';
    cardDeleteBtn.innerHTML = `
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="3 6 5 6 21 6"></polyline>
        <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
      </svg>
      <span>Delete</span>
    `;
    cardDeleteBtn.addEventListener('click', () => {
      deleteFavorite(fav.id, card);
    });

    actionsWrap.appendChild(cardCopyBtn);
    actionsWrap.appendChild(cardDeleteBtn);

    card.appendChild(metaWrap);
    card.appendChild(quoteP);
    card.appendChild(authorP);
    card.appendChild(actionsWrap);

    if (prepend && favoritesList.firstChild) {
      favoritesList.insertBefore(card, favoritesList.firstChild);
    } else {
      favoritesList.appendChild(card);
    }
  }

  // ----------------------------------------------------
  // Delete Favorite
  // ----------------------------------------------------
  async function deleteFavorite(id, cardElement) {
    cardElement.classList.add('deleting');

    try {
      const response = await fetch(`/api/favorites/${id}`, {
        method: 'DELETE'
      });

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        throw new Error(errData.error || `HTTP ${response.status}`);
      }

      const result = await response.json();
      showToast(result.message || 'Favorite removed successfully.', 'info', 2000);

      setTimeout(() => {
        if (cardElement.parentNode) {
          cardElement.parentNode.removeChild(cardElement);
        }
        favoritesCount = Math.max(0, favoritesCount - 1);
        updateFavoritesHeader();
        if (favoritesCount === 0) {
          emptyState.classList.add('visible');
        }
      }, 250);
    } catch (err) {
      console.error('Error deleting favorite:', err);
      cardElement.classList.remove('deleting');
      showToast(`Delete failed: ${err.message}`, 'error');
    }
  }

  // ----------------------------------------------------
  // Helpers
  // ----------------------------------------------------
  function updateFavoritesHeader() {
    favoritesCountBadge.textContent = `${favoritesCount} saved`;
  }

  function formatDate(isoOrSqlString) {
    if (!isoOrSqlString) return 'Just now';
    try {
      // Handles both ISO 8601 and SQLite 'YYYY-MM-DD HH:MM:SS'
      const parsedDate = new Date(isoOrSqlString.replace(' ', 'T') + (isoOrSqlString.includes('Z') || isoOrSqlString.includes('+') ? '' : 'Z'));
      if (isNaN(parsedDate.getTime())) {
        return 'Recently';
      }
      return parsedDate.toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return 'Recently';
    }
  }

  // ----------------------------------------------------
  // Event Listeners
  // ----------------------------------------------------
  newQuoteBtn.addEventListener('click', () => fetchRandomQuote(true));
  favoriteBtn.addEventListener('click', saveCurrentQuote);

  copyBtn.addEventListener('click', () => {
    if (!currentQuote || !currentQuote.quote) return;
    copyToClipboard(currentQuote.quote, currentQuote.quote, currentQuote.author, copyBtn, copyBtnText);
  });

  // Initial Boot
  fetchRandomQuote(false);
  loadFavorites();
});
