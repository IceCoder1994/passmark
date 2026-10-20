
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    initAutofillAndCapture();
  },
});

function initAutofillAndCapture() {
  const currentUrl = window.location.href;

  // 1. Fetch matching credentials for this website
  chrome.runtime.sendMessage(
    { type: 'GET_MATCHING_CREDENTIALS', url: currentUrl },
    (response) => {
      if (chrome.runtime.lastError || !response || !response.items || response.items.length === 0) {
        return;
      }
      setupAutofillDropdowns(response.items);
    }
  );

  // 2. Setup form submission listener to prompt saving new passwords
  setupCredentialCapture();
}

/**
 * Setup autofill UI next to password / username fields
 */
function setupAutofillDropdowns(items: any[]) {
  const passwordInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[type="password"]'));

  for (const pwdInput of passwordInputs) {
    if (pwdInput.dataset.passmarkHandled) continue;
    pwdInput.dataset.passmarkHandled = 'true';

    // Locate related username input (closest preceding input[type="text"|"email"] in the same form or DOM)
    const form = pwdInput.form || pwdInput.closest('form');
    let usernameInput: HTMLInputElement | null = null;

    if (form) {
      const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])'));
      usernameInput = inputs.find((inp) => {
        const idName = (inp.id + inp.name + inp.type + inp.autocomplete).toLowerCase();
        return idName.includes('user') || idName.includes('mail') || idName.includes('login') || idName.includes('account');
      }) || inputs[0] || null;
    }

    // Attach click/focus listener to show floating dropdown
    const targetInput = usernameInput || pwdInput;
    let dropdown: HTMLDivElement | null = null;

    targetInput.addEventListener('focus', () => {
      if (dropdown) return;
      dropdown = createAutofillMenu(targetInput, items, (selectedItem) => {
        if (usernameInput) {
          fillInput(usernameInput, selectedItem.username);
        }
        fillInput(pwdInput, selectedItem.password);
        removeDropdown();
      });
      document.body.appendChild(dropdown);
    });

    const removeDropdown = () => {
      if (dropdown) {
        dropdown.remove();
        dropdown = null;
      }
    };

    // Close dropdown on outside click
    document.addEventListener('click', (e) => {
      if (dropdown && !dropdown.contains(e.target as Node) && e.target !== targetInput && e.target !== pwdInput) {
        removeDropdown();
      }
    });
  }
}

function fillInput(el: HTMLInputElement, value: string) {
  el.value = value;
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

function createAutofillMenu(targetEl: HTMLElement, items: any[], onSelect: (item: any) => void): HTMLDivElement {
  const rect = targetEl.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.id = 'passmark-autofill-menu';
  menu.style.cssText = `
    position: fixed;
    top: ${rect.bottom + window.scrollY + 4}px;
    left: ${rect.left + window.scrollX}px;
    z-index: 2147483647;
    background: #ffffff;
    border: 1px solid #e2e8f0;
    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
    border-radius: 8px;
    padding: 6px;
    min-width: 220px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
  `;

  const header = document.createElement('div');
  header.style.cssText = `
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
    color: #6366f1;
    border-bottom: 1px solid #f1f5f9;
    margin-bottom: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
  `;
  header.textContent = '🔑 PassMark 账号填充';
  menu.appendChild(header);

  for (const item of items) {
    const itemEl = document.createElement('div');
    itemEl.style.cssText = `
      padding: 6px 8px;
      border-radius: 6px;
      cursor: pointer;
      display: flex;
      flex-direction: column;
      transition: background 0.15s ease;
    `;
    itemEl.innerHTML = `
      <span style="font-weight: 600; color: #1e293b;">${escapeHtml(item.username || item.title)}</span>
      <span style="font-size: 11px; color: #64748b;">${escapeHtml(item.title)}</span>
    `;

    itemEl.addEventListener('mouseenter', () => {
      itemEl.style.background = '#f1f5f9';
    });
    itemEl.addEventListener('mouseleave', () => {
      itemEl.style.background = 'transparent';
    });
    itemEl.addEventListener('mousedown', (e) => {
      e.preventDefault();
      onSelect(item);
    });

    menu.appendChild(itemEl);
  }

  return menu;
}

/**
 * Capture login submissions and ask to save
 */
function setupCredentialCapture() {
  document.addEventListener('submit', (e) => {
    const form = e.target as HTMLFormElement;
    if (!form) return;

    const pwdInput = form.querySelector<HTMLInputElement>('input[type="password"]');
    if (!pwdInput || !pwdInput.value) return;

    const inputs = Array.from(form.querySelectorAll<HTMLInputElement>('input:not([type="hidden"]):not([type="password"]):not([type="submit"]):not([type="checkbox"]):not([type="radio"])'));
    const usernameInput = inputs.find((inp) => {
      const idName = (inp.id + inp.name + inp.type).toLowerCase();
      return idName.includes('user') || idName.includes('mail') || idName.includes('login') || idName.includes('account');
    }) || inputs[0] || null;

    const username = usernameInput ? usernameInput.value.trim() : '';
    const password = pwdInput.value;

    if (username && password) {
      showSavePrompt(username, password, window.location.hostname, document.title);
    }
  }, true);
}

function showSavePrompt(username: string, pass: string, hostname: string, pageTitle: string) {
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
    border-radius: 10px;
    padding: 14px 16px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    color: #1e293b;
    max-width: 320px;
    animation: passmarkSlideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  `;

  banner.innerHTML = `
    <div style="font-weight: 600; font-size: 14px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
      <span>🔒</span> 保存密码到 PassMark？
    </div>
    <div style="font-size: 12px; color: #64748b; margin-bottom: 10px;">
      是否将 <b>${escapeHtml(username)}</b> (${escapeHtml(hostname)}) 的密码加密保存并同步到云端？
    </div>
    <div style="display: flex; justify-content: flex-end; gap: 8px;">
      <button id="pm-btn-cancel" style="padding: 5px 12px; border-radius: 6px; border: 1px solid #cbd5e1; background: #fff; cursor: pointer; font-size: 12px; color: #475569;">暂不保存</button>
      <button id="pm-btn-save" style="padding: 5px 12px; border-radius: 6px; border: none; background: #4f46e5; color: #fff; cursor: pointer; font-size: 12px; font-weight: 500;">保存</button>
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
        title: pageTitle || hostname,
        username,
        password: pass,
        url: window.location.origin,
      },
      (res) => {
        banner.remove();
        if (res && res.success) {
          showNotification('密码已安全加密保存！');
        }
      }
    );
  });

  // Auto dismiss after 15s
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
    border-radius: 6px;
    font-size: 13px;
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
