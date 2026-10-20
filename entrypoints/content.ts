export default defineContentScript({
  matches: ['<all_urls>'],
  allFrames: true,
  runAt: 'document_idle',
  main() {
    initAutofillEngine();
  },
});

let matchedItems: any[] = [];
let activeDropdown: HTMLElement | null = null;
let currentUrl = window.location.href;

function initAutofillEngine() {
  currentUrl = window.location.href;

  // 1. Fetch matching credentials from background for this URL
  fetchAndAttachCredentials();

  // 2. Setup direct fill listener from Popup
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.type === 'FILL_CREDENTIAL_INTO_PAGE') {
      const success = fillPageWithCredential(request.item);
      sendResponse({ success });
    }
  });

  // 3. Setup form submission observer
  setupCredentialCapture();

  // 4. Setup cleanup and SPA navigation handlers
  setupNavigationAndCleanup();
}

function fetchAndAttachCredentials() {
  chrome.runtime.sendMessage(
    { type: 'GET_MATCHING_CREDENTIALS', url: window.location.href },
    (response) => {
      if (chrome.runtime.lastError || !response || !response.items || response.items.length === 0) {
        return;
      }

      matchedItems = response.items;
      scanAndAttachInputs();
      setupDynamicObserver();
    }
  );
}

/**
 * Scan DOM for username / email and password inputs
 */
function scanAndAttachInputs() {
  if (matchedItems.length === 0) return;

  // Cleanup any old orphaned badges first
  cleanupStaleBadges();

  const inputs = Array.from(
    document.querySelectorAll<HTMLInputElement>(
      'input:not([type="hidden"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="search"])'
    )
  );

  for (const input of inputs) {
    if (!isElementVisible(input)) continue;

    const isPassword = input.type === 'password';
    const isUsername = isLikelyUsernameField(input);

    if (isPassword || isUsername) {
      if (!input.dataset.passmarkAttached) {
        input.dataset.passmarkAttached = 'true';
        attachInputEvents(input);
      }
      // Ensure badge exists and is pinned
      attachOrUpdateBadge(input);
    }
  }
}

function isLikelyUsernameField(input: HTMLInputElement): boolean {
  const type = (input.type || '').toLowerCase();
  if (type === 'password' || type === 'search' || type === 'button' || type === 'submit') return false;

  const idName = (
    (input.id || '') + ' ' +
    (input.name || '') + ' ' +
    (input.placeholder || '') + ' ' +
    (input.autocomplete || '') + ' ' +
    (input.className || '')
  ).toLowerCase();

  // Disqualify search fields
  if (
    idName.includes('search') ||
    idName.includes('搜索') ||
    idName.includes('query') ||
    idName.includes('keyword') ||
    idName.includes('find')
  ) {
    return false;
  }

  if (type === 'email' || input.autocomplete === 'email' || input.autocomplete === 'username') {
    return true;
  }

  if (type !== 'text') return false;

  const hasUserKeyword = (
    idName.includes('user') ||
    idName.includes('mail') ||
    idName.includes('login') ||
    idName.includes('account') ||
    idName.includes('phone') ||
    idName.includes('账号') ||
    idName.includes('用户名') ||
    idName.includes('邮箱')
  );

  if (hasUserKeyword) {
    // Only treat as username field if there is a password field on the page / in the form
    const form = input.form || input.closest('form');
    if (form && form.querySelector('input[type="password"]')) {
      return true;
    }
    return !!document.querySelector('input[type="password"]');
  }

  return false;
}

function attachInputEvents(input: HTMLInputElement) {
  input.addEventListener('focus', () => {
    showDropdown(input);
  });

  input.addEventListener('click', () => {
    showDropdown(input);
  });
}

/**
 * Attach or update badge for an input
 */
function attachOrUpdateBadge(input: HTMLInputElement) {
  // If badge already exists for this input, don't re-create
  let existingBadge = (input as any)._passmarkBadge as HTMLElement | undefined;
  if (existingBadge && existingBadge.isConnected) {
    return;
  }

  const rect = input.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const badge = document.createElement('div');
  badge.className = 'passmark-input-badge';
  badge.title = 'PassMark: 点击查看已保存账号';
  (badge as any)._targetInput = input;
  (input as any)._passmarkBadge = badge;

  badge.style.cssText = `
    position: fixed;
    top: ${rect.top + (rect.height - 20) / 2}px;
    left: ${rect.right - 26}px;
    width: 20px;
    height: 20px;
    border-radius: 5px;
    background: #4f46e5;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 11px;
    cursor: pointer;
    z-index: 2147483646;
    box-shadow: 0 1px 3px rgba(0,0,0,0.15);
    opacity: 0.85;
    transition: opacity 0.15s, transform 0.15s;
    user-select: none;
  `;
  badge.innerHTML = '🔑';

  badge.addEventListener('mouseenter', () => {
    badge.style.opacity = '1';
    badge.style.transform = 'scale(1.1)';
  });
  badge.addEventListener('mouseleave', () => {
    badge.style.opacity = '0.85';
    badge.style.transform = 'scale(1)';
  });

  badge.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (activeDropdown) {
      removeDropdown();
    } else {
      input.focus();
      showDropdown(input);
    }
  });

  const updateBadgePos = () => {
    if (!input.isConnected || !isElementVisible(input)) {
      badge.remove();
      window.removeEventListener('scroll', updateBadgePos);
      window.removeEventListener('resize', updateBadgePos);
      return;
    }
    const r = input.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.top < 0 || r.bottom > window.innerHeight) {
      badge.style.display = 'none';
    } else {
      badge.style.display = 'flex';
      badge.style.top = `${r.top + (r.height - 20) / 2}px`;
      badge.style.left = `${r.right - 26}px`;
    }
  };

  window.addEventListener('scroll', updateBadgePos, { passive: true });
  window.addEventListener('resize', updateBadgePos, { passive: true });
  document.body.appendChild(badge);
}

/**
 * Remove orphaned, hidden, or disconnected badges
 */
function cleanupStaleBadges() {
  const badges = document.querySelectorAll<HTMLElement>('.passmark-input-badge');
  for (const badge of Array.from(badges)) {
    const target = (badge as any)._targetInput as HTMLInputElement | undefined;
    if (!target || !target.isConnected || !isElementVisible(target)) {
      badge.remove();
    }
  }
}

function removeAllBadgesAndMenus() {
  removeDropdown();
  const badges = document.querySelectorAll('.passmark-input-badge');
  for (const b of Array.from(badges)) {
    b.remove();
  }
}

function isElementVisible(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  if (el.offsetParent === null && el.style.position !== 'fixed') return false;

  const style = window.getComputedStyle(el);
  if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
    return false;
  }
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/**
 * Setup MutationObserver and periodic heartbeat
 */
function setupDynamicObserver() {
  let debounceTimer: any = null;
  const observer = new MutationObserver(() => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      cleanupStaleBadges();
      scanAndAttachInputs();
    }, 250);
  });

  observer.observe(document.body || document.documentElement, {
    childList: true,
    subtree: true,
  });

  // Heartbeat cleanup every 1 second
  setInterval(() => {
    cleanupStaleBadges();
  }, 1000);
}

/**
 * Handle SPA route changes, page unloads, and form submissions
 */
function setupNavigationAndCleanup() {
  // Purge all badges on form submit or Enter key
  document.addEventListener('submit', () => {
    removeAllBadgesAndMenus();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement;
      if (target && target.tagName === 'INPUT') {
        setTimeout(cleanupStaleBadges, 300);
      }
    }
  }, true);

  // SPA navigation events
  window.addEventListener('popstate', () => {
    removeAllBadgesAndMenus();
    setTimeout(fetchAndAttachCredentials, 500);
  });
  window.addEventListener('hashchange', () => {
    removeAllBadgesAndMenus();
    setTimeout(fetchAndAttachCredentials, 500);
  });

  // Observe URL changes in modern SPAs
  let lastHref = window.location.href;
  setInterval(() => {
    if (window.location.href !== lastHref) {
      lastHref = window.location.href;
      removeAllBadgesAndMenus();
      fetchAndAttachCredentials();
    }
  }, 800);
}

/**
 * Show floating autofill dropdown menu
 */
function showDropdown(input: HTMLInputElement) {
  if (matchedItems.length === 0) return;
  removeDropdown();

  const rect = input.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return;

  const menu = document.createElement('div');
  menu.id = 'passmark-autofill-menu';
  menu.style.cssText = `
    position: fixed;
    top: ${rect.bottom + 4}px;
    left: ${Math.max(8, rect.left)}px;
    z-index: 2147483647;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    border-radius: 12px;
    padding: 6px;
    min-width: 230px;
    max-width: 340px;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    font-size: 13px;
    animation: passmarkFadeIn 0.15s ease-out;
  `;

  // Header
  const header = document.createElement('div');
  header.style.cssText = `
    padding: 6px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #4f46e5;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  `;
  header.innerHTML = `
    <span style="display: flex; align-items: center; gap: 4px;">
      <span>🔑</span> PassMark 账号填充
    </span>
    <span style="font-size: 10px; color: #94a3b8; font-weight: normal;">${matchedItems.length} 个可用账号</span>
  `;
  menu.appendChild(header);

  // List of matching items
  for (const item of matchedItems) {
    const itemEl = document.createElement('div');
    itemEl.style.cssText = `
      padding: 7px 8px;
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      transition: background 0.12s ease;
    `;
    itemEl.innerHTML = `
      <div style="font-weight: 600; color: #1e293b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(item.username || item.title)}
      </div>
      <div style="font-size: 11px; color: #64748b; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${escapeHtml(item.title)}
      </div>
    `;

    itemEl.addEventListener('mouseenter', () => {
      itemEl.style.background = '#eef2ff';
    });
    itemEl.addEventListener('mouseleave', () => {
      itemEl.style.background = 'transparent';
    });

    itemEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      fillPageWithCredential(item, input);
      removeDropdown();
    });

    menu.appendChild(itemEl);
  }

  document.body.appendChild(menu);
  activeDropdown = menu;

  const closeHandler = (e: MouseEvent) => {
    if (activeDropdown && !activeDropdown.contains(e.target as Node) && e.target !== input) {
      removeDropdown();
      document.removeEventListener('mousedown', closeHandler);
    }
  };
  setTimeout(() => {
    document.addEventListener('mousedown', closeHandler);
  }, 10);
}

function removeDropdown() {
  if (activeDropdown) {
    activeDropdown.remove();
    activeDropdown = null;
  }
}

/**
 * Fill username and password into page
 */
function fillPageWithCredential(item: any, triggerInput?: HTMLInputElement): boolean {
  const form = triggerInput?.form || triggerInput?.closest('form') || document.body;

  // 1. Find password field
  const pwdInput =
    (triggerInput?.type === 'password' ? triggerInput : null) ||
    form.querySelector<HTMLInputElement>('input[type="password"]') ||
    document.querySelector<HTMLInputElement>('input[type="password"]');

  // 2. Find username field
  let usernameInput =
    (triggerInput && isLikelyUsernameField(triggerInput) ? triggerInput : null) ||
    null;

  if (!usernameInput) {
    const inputs = Array.from(
      (pwdInput?.form || form).querySelectorAll<HTMLInputElement>(
        'input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])'
      )
    );
    usernameInput = inputs.find(isLikelyUsernameField) || inputs[0] || null;
  }

  let filled = false;

  if (usernameInput && item.username) {
    setInputValue(usernameInput, item.username);
    filled = true;
  }

  if (pwdInput && item.password) {
    setInputValue(pwdInput, item.password);
    filled = true;
  }

  if (filled) {
    showNotification(`已填充: ${item.username || item.title}`);
  }

  return filled;
}

/**
 * Set value and dispatch standard + React synthetic events
 */
function setInputValue(input: HTMLInputElement, value: string) {
  input.focus();

  // Handle React input tracker
  const tracker = (input as any)._valueTracker;
  if (tracker) {
    tracker.setValue('');
  }

  input.value = value;

  input.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  input.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  input.blur();
}

/**
 * Setup capture on login form submit
 */
function setupCredentialCapture() {
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (!form) return;

    const pwdInput = form.querySelector<HTMLInputElement>('input[type="password"]');
    if (!pwdInput || !pwdInput.value) return;

    const inputs = Array.from(
      form.querySelectorAll<HTMLInputElement>(
        'input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])'
      )
    );
    const usernameInput = inputs.find(isLikelyUsernameField) || inputs[0] || null;

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = pwdInput.value;

    if (username && password) {
      // 1. Instant check against local matchedItems
      const localMatch = matchedItems.find(
        (i) => (i.username || '').trim().toLowerCase() === username.toLowerCase()
      );
      if (localMatch && localMatch.password === password) {
        // Already saved with identical password, do not prompt!
        return;
      }

      // 2. Authoritative check with background vault
      chrome.runtime.sendMessage(
        {
          type: 'CHECK_SHOULD_PROMPT_SAVE',
          url: window.location.href,
          username,
          password,
        },
        (res) => {
          if (chrome.runtime.lastError || !res || !res.shouldPrompt) {
            return;
          }
          showSavePrompt(
            username,
            password,
            window.location.hostname,
            res.title || document.title,
            res.isUpdate,
            res.existingId
          );
        }
      );
    }
  }, true);
}

function showSavePrompt(
  username: string,
  pass: string,
  hostname: string,
  pageTitle: string,
  isUpdate = false,
  existingId?: string
) {
  const existingPrompt = document.getElementById('passmark-save-prompt');
  if (existingPrompt) existingPrompt.remove();

  const banner = document.createElement('div');
  banner.id = 'passmark-save-prompt';
  banner.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    background: #ffffff;
    border: 1px solid #cbd5e1;
    box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.15);
    border-radius: 12px;
    padding: 14px 16px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    color: #1e293b;
    max-width: 320px;
  `;

  const titleText = isUpdate ? '更新密码到 PassMark？' : '保存密码到 PassMark？';
  const descText = isUpdate
    ? `检测到 <b>${escapeHtml(username)}</b> (${escapeHtml(hostname)}) 的密码已更改，是否同步更新？`
    : `是否将 <b>${escapeHtml(username)}</b> (${escapeHtml(hostname)}) 的密码加密保存并同步到云端？`;
  const actionBtnText = isUpdate ? '更新密码' : '保存';

  banner.innerHTML = `
    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
      <span>🔒</span> ${titleText}
    </div>
    <div style="font-size: 12px; color: #64748b; margin-bottom: 12px;">
      ${descText}
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 8px;">
      <button id="pm-btn-cancel" style="padding: 5px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 12px; color: #475569;">暂不保存</button>
      <button id="pm-btn-save" style="padding: 5px 12px; border-radius: 6px; border: none; background: #4f46e5; color: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">${actionBtnText}</button>
    </div>
  `;

  document.body.appendChild(banner);

  banner.querySelector('#pm-btn-cancel')?.addEventListener('click', () => {
    banner.remove();
  });

  banner.querySelector('#pm-btn-save')?.addEventListener('click', () => {
    chrome.runtime.sendMessage(
      {
        type: 'SAVE_NEW_CREDENTIAL',
        id: existingId,
        title: pageTitle || hostname,
        username,
        password: pass,
        url: window.location.origin,
      },
      (res) => {
        banner.remove();
        if (res && res.success) {
          showNotification(isUpdate ? '密码已成功更新！' : '密码已安全加密保存！');
        }
      }
    );
  });

  setTimeout(() => {
    if (banner.parentElement) banner.remove();
  }, 15000);
}

function showNotification(msg: string) {
  const toast = document.createElement('div');
  toast.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 2147483647;
    background: #10b981;
    color: #fff;
    padding: 8px 14px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 500;
    font-family: system-ui, -apple-system, sans-serif;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  `;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

function escapeHtml(str: string): string {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
