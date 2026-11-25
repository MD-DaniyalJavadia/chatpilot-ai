/**
 * Standalone Vanilla JavaScript Embeddable Widget (/widget.js)
 * Zero external dependencies. Isolated inside Shadow DOM. XSS-safe DOM construction only.
 */
export const WIDGET_SCRIPT_SOURCE = `(function () {
  'use strict';

  var currentScript = document.currentScript || (function () {
    var scripts = document.getElementsByTagName('script');
    for (var i = scripts.length - 1; i >= 0; i--) {
      if (scripts[i].getAttribute('data-chatbot-id')) {
        return scripts[i];
      }
    }
    return null;
  })();

  if (!currentScript) {
    console.warn('[ChatPilot Widget] Missing <script> tag with data-chatbot-id attribute.');
    return;
  }

  var publicId = (currentScript.getAttribute('data-chatbot-id') || '').trim();
  if (!publicId) {
    console.warn('[ChatPilot Widget] Empty data-chatbot-id attribute.');
    return;
  }

  var explicitBase = (currentScript.getAttribute('data-api-base') || '').trim();
  var apiBase = explicitBase;
  if (!apiBase && currentScript.src) {
    try {
      apiBase = new URL(currentScript.src).origin;
    } catch (_e) {
      apiBase = window.location.origin;
    }
  }
  if (!apiBase) {
    apiBase = window.location.origin;
  }
  apiBase = apiBase.replace(/\\/+$/, '');

  // Clean up existing mount if re-initialized on the same host page
  var existingHost = document.getElementById('chatpilot-widget-host');
  if (existingHost && existingHost.parentNode) {
    existingHost.parentNode.removeChild(existingHost);
  }

  var storageKey = 'chatpilot_session_' + publicId;
  function getOrCreateSessionId() {
    var sid = '';
    try {
      sid = window.localStorage.getItem(storageKey) || '';
    } catch (_e) {
      sid = '';
    }
    if (/^[a-zA-Z0-9_-]{8,128}$/.test(sid)) return sid;

    var arr = new Uint8Array(12);
    if (window.crypto && window.crypto.getRandomValues) {
      window.crypto.getRandomValues(arr);
    } else {
      for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
    }
    var hex = '';
    for (var j = 0; j < arr.length; j++) {
      hex += ('0' + arr[j].toString(16)).slice(-2);
    }
    sid = 'vis_' + hex;
    try {
      window.localStorage.setItem(storageKey, sid);
    } catch (_e2) {}
    return sid;
  }

  function safeColor(hex) {
    return /^#[0-9a-fA-F]{6}$/.test(hex || '') ? hex : '#2563EB';
  }

  function safeHttpUrl(url) {
    if (!url || typeof url !== 'string') return null;
    try {
      var parsed = new URL(url);
      if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
        return parsed.href;
      }
    } catch (_e) {}
    return null;
  }

  var sessionId = getOrCreateSessionId();
  var widgetState = {
    open: false,
    loadingConfig: true,
    sending: false,
    config: null,
    error: '',
    messages: []
  };

  var host = document.createElement('div');
  host.id = 'chatpilot-widget-host';
  host.setAttribute('data-chatbot-id', publicId);
  var shadow = host.attachShadow ? host.attachShadow({ mode: 'open' }) : host;

  var styleEl = document.createElement('style');
  styleEl.textContent = [
    ':host { all: initial; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }',
    '.cp-root { position: fixed; bottom: 20px; z-index: 2147483000; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #0f172a; }',
    '.cp-right { right: 20px; }',
    '.cp-left { left: 20px; }',
    '.cp-launcher { display: inline-flex; align-items: center; gap: 10px; border: none; border-radius: 9999px; padding: 12px 18px; color: #ffffff; font-size: 14px; font-weight: 600; cursor: pointer; box-shadow: 0 12px 28px rgba(15, 23, 42, 0.24); transition: transform 0.16s ease, box-shadow 0.16s ease; }',
    '.cp-launcher:hover { transform: translateY(-2px); box-shadow: 0 16px 32px rgba(15, 23, 42, 0.28); }',
    '.cp-launcher-icon { width: 20px; height: 20px; display: inline-flex; align-items: center; justify-content: center; }',
    '.cp-panel { width: 380px; max-width: calc(100vw - 24px); height: 560px; max-height: calc(100vh - 96px); background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; box-shadow: 0 22px 48px rgba(15, 23, 42, 0.22); display: none; flex-direction: column; overflow: hidden; margin-bottom: 12px; }',
    '.cp-panel.cp-open { display: flex; }',
    '.cp-header { padding: 14px 16px; color: #ffffff; display: flex; align-items: center; justify-content: space-between; gap: 12px; }',
    '.cp-header-brand { display: flex; align-items: center; gap: 10px; min-width: 0; }',
    '.cp-avatar { width: 34px; height: 34px; border-radius: 10px; background: rgba(255,255,255,0.2); display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; color: #ffffff; flex-shrink: 0; overflow: hidden; }',
    '.cp-avatar img { width: 100%; height: 100%; object-fit: cover; }',
    '.cp-title-wrap { min-width: 0; }',
    '.cp-title { font-size: 15px; font-weight: 700; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.cp-subtitle { font-size: 12px; opacity: 0.9; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }',
    '.cp-close { background: rgba(255,255,255,0.16); border: none; color: #ffffff; width: 30px; height: 30px; border-radius: 8px; cursor: pointer; font-size: 18px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; }',
    '.cp-close:hover { background: rgba(255,255,255,0.26); }',
    '.cp-messages { flex: 1; overflow-y: auto; padding: 16px; background: #f8fafc; display: flex; flex-direction: column; gap: 12px; }',
    '.cp-msg-row { display: flex; flex-direction: column; max-width: 86%; }',
    '.cp-msg-row.cp-user { align-self: flex-end; align-items: flex-end; }',
    '.cp-msg-row.cp-bot { align-self: flex-start; align-items: flex-start; }',
    '.cp-bubble { padding: 10px 13px; border-radius: 14px; font-size: 13.5px; line-height: 1.5; white-space: pre-wrap; word-break: break-word; }',
    '.cp-user .cp-bubble { color: #ffffff; border-bottom-right-radius: 4px; }',
    '.cp-bot .cp-bubble { background: #ffffff; color: #0f172a; border: 1px solid #e2e8f0; border-bottom-left-radius: 4px; }',
    '.cp-citations { margin-top: 5px; font-size: 11px; color: #475569; display: flex; flex-wrap: wrap; gap: 6px; }',
    '.cp-citation-item { background: #eef2ff; color: #1e40af; padding: 2px 7px; border-radius: 6px; text-decoration: none; max-width: 240px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }',
    '.cp-handover { margin-top: 6px; padding: 8px 10px; border-radius: 10px; background: #f1f5f9; border: 1px solid #cbd5e1; font-size: 12px; color: #334155; }',
    '.cp-handover a { color: #1d4ed8; font-weight: 600; text-decoration: none; }',
    '.cp-error { margin: 8px 14px 0; padding: 9px 11px; border-radius: 8px; background: #fef2f2; border: 1px solid #fecaca; color: #b91c1c; font-size: 12.5px; }',
    '.cp-typing { font-size: 12px; color: #64748b; font-style: italic; padding: 2px 4px; }',
    '.cp-form { padding: 12px; background: #ffffff; border-top: 1px solid #e2e8f0; display: flex; gap: 8px; align-items: flex-end; }',
    '.cp-input { flex: 1; resize: none; border: 1px solid #cbd5e1; border-radius: 10px; padding: 9px 12px; font-family: inherit; font-size: 13.5px; line-height: 1.4; max-height: 96px; min-height: 38px; outline: none; color: #0f172a; background: #ffffff; }',
    '.cp-input:focus { border-color: #2563eb; }',
    '.cp-send { border: none; border-radius: 10px; padding: 0 14px; height: 38px; color: #ffffff; font-size: 13px; font-weight: 600; cursor: pointer; flex-shrink: 0; }',
    '.cp-send:disabled { opacity: 0.55; cursor: not-allowed; }',
    '.cp-footer { padding: 6px 12px 8px; text-align: center; font-size: 11px; color: #94a3b8; background: #ffffff; }',
    '@media (max-width: 480px) { .cp-root { bottom: 12px; right: 12px !important; left: 12px !important; } .cp-panel { width: 100%; max-width: 100%; height: calc(100vh - 84px); } .cp-launcher { float: right; } }'
  ].join('\\n');
  shadow.appendChild(styleEl);

  var root = document.createElement('div');
  root.className = 'cp-root cp-right';
  shadow.appendChild(root);

  var panel = document.createElement('div');
  panel.className = 'cp-panel';
  panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-label', 'AI Support Chat');
  root.appendChild(panel);

  var header = document.createElement('div');
  header.className = 'cp-header';
  panel.appendChild(header);

  var headerBrand = document.createElement('div');
  headerBrand.className = 'cp-header-brand';
  header.appendChild(headerBrand);

  var avatar = document.createElement('div');
  avatar.className = 'cp-avatar';
  headerBrand.appendChild(avatar);

  var titleWrap = document.createElement('div');
  titleWrap.className = 'cp-title-wrap';
  headerBrand.appendChild(titleWrap);

  var titleEl = document.createElement('div');
  titleEl.className = 'cp-title';
  titleEl.textContent = 'Chat Assistant';
  titleWrap.appendChild(titleEl);

  var subtitleEl = document.createElement('div');
  subtitleEl.className = 'cp-subtitle';
  subtitleEl.textContent = 'AI Support';
  titleWrap.appendChild(subtitleEl);

  var closeBtn = document.createElement('button');
  closeBtn.type = 'button';
  closeBtn.className = 'cp-close';
  closeBtn.setAttribute('aria-label', 'Close chat');
  closeBtn.textContent = '×';
  header.appendChild(closeBtn);

  var errorBanner = document.createElement('div');
  errorBanner.className = 'cp-error';
  errorBanner.style.display = 'none';
  panel.appendChild(errorBanner);

  var messagesEl = document.createElement('div');
  messagesEl.className = 'cp-messages';
  panel.appendChild(messagesEl);

  var form = document.createElement('form');
  form.className = 'cp-form';
  panel.appendChild(form);

  var inputEl = document.createElement('textarea');
  inputEl.className = 'cp-input';
  inputEl.rows = 1;
  inputEl.placeholder = 'Ask a question...';
  inputEl.setAttribute('aria-label', 'Chat message');
  form.appendChild(inputEl);

  var sendBtn = document.createElement('button');
  sendBtn.type = 'submit';
  sendBtn.className = 'cp-send';
  sendBtn.textContent = 'Send';
  form.appendChild(sendBtn);

  var footerEl = document.createElement('div');
  footerEl.className = 'cp-footer';
  footerEl.textContent = 'Powered by ChatPilot AI';
  panel.appendChild(footerEl);

  var launcherBtn = document.createElement('button');
  launcherBtn.type = 'button';
  launcherBtn.className = 'cp-launcher';
  launcherBtn.setAttribute('aria-label', 'Open AI chat');

  var launcherIcon = document.createElement('span');
  launcherIcon.className = 'cp-launcher-icon';
  launcherIcon.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>';
  launcherBtn.appendChild(launcherIcon);

  var launcherText = document.createElement('span');
  launcherText.textContent = 'Chat with us';
  launcherBtn.appendChild(launcherText);
  root.appendChild(launcherBtn);

  function applyTheme() {
    var color = safeColor(widgetState.config && widgetState.config.brandColor);
    var pos = (widgetState.config && widgetState.config.widgetPosition === 'bottom-left') ? 'cp-left' : 'cp-right';
    root.className = 'cp-root ' + pos;
    header.style.backgroundColor = color;
    launcherBtn.style.backgroundColor = color;
    sendBtn.style.backgroundColor = color;
  }

  function renderHeaderBrand() {
    var cfg = widgetState.config;
    if (!cfg) return;
    titleEl.textContent = cfg.widgetTitle || cfg.name || 'Chat Assistant';
    subtitleEl.textContent = cfg.widgetSubtitle || cfg.businessName || 'AI Support Assistant';
    launcherText.textContent = cfg.launcherLabel || 'Chat with us';

    while (avatar.firstChild) avatar.removeChild(avatar.firstChild);
    var cleanLogo = safeHttpUrl(cfg.logoUrl);
    if (cleanLogo) {
      var img = document.createElement('img');
      img.src = cleanLogo;
      img.alt = cfg.name || 'Logo';
      avatar.appendChild(img);
    } else {
      var initial = (cfg.widgetTitle || cfg.name || 'C').trim().charAt(0).toUpperCase() || 'C';
      avatar.textContent = initial;
    }
  }

  function renderMessages() {
    while (messagesEl.firstChild) messagesEl.removeChild(messagesEl.firstChild);

    var brandColor = safeColor(widgetState.config && widgetState.config.brandColor);

    for (var i = 0; i < widgetState.messages.length; i++) {
      var msg = widgetState.messages[i];
      var row = document.createElement('div');
      row.className = 'cp-msg-row ' + (msg.sender === 'user' ? 'cp-user' : 'cp-bot');

      var bubble = document.createElement('div');
      bubble.className = 'cp-bubble';
      bubble.textContent = msg.content;
      if (msg.sender === 'user') {
        bubble.style.backgroundColor = brandColor;
      }
      row.appendChild(bubble);

      if (msg.sender === 'bot' && Array.isArray(msg.citations) && msg.citations.length > 0) {
        var citeWrap = document.createElement('div');
        citeWrap.className = 'cp-citations';
        for (var cIdx = 0; cIdx < msg.citations.length; cIdx++) {
          var cite = msg.citations[cIdx];
          var safeUri = safeHttpUrl(cite.sourceUri);
          if (safeUri) {
            var link = document.createElement('a');
            link.className = 'cp-citation-item';
            link.href = safeUri;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            link.textContent = cite.sourceTitle || safeUri;
            citeWrap.appendChild(link);
          } else {
            var span = document.createElement('span');
            span.className = 'cp-citation-item';
            span.textContent = cite.sourceTitle || cite.sourceType || 'Source';
            citeWrap.appendChild(span);
          }
        }
        row.appendChild(citeWrap);
      }

      if (msg.sender === 'bot' && msg.handoverOffered && msg.humanHandoverEmail) {
        var handover = document.createElement('div');
        handover.className = 'cp-handover';
        handover.appendChild(document.createTextNode('Need a human specialist? Email '));
        var mail = document.createElement('a');
        mail.href = 'mailto:' + msg.humanHandoverEmail;
        mail.textContent = msg.humanHandoverEmail;
        handover.appendChild(mail);
        row.appendChild(handover);
      }

      messagesEl.appendChild(row);
    }

    if (widgetState.sending) {
      var typing = document.createElement('div');
      typing.className = 'cp-typing';
      typing.textContent = 'Assistant is thinking...';
      messagesEl.appendChild(typing);
    }

    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function setError(msg) {
    widgetState.error = msg || '';
    if (widgetState.error) {
      errorBanner.textContent = widgetState.error;
      errorBanner.style.display = 'block';
    } else {
      errorBanner.textContent = '';
      errorBanner.style.display = 'none';
    }
  }

  function setOpen(nextOpen) {
    widgetState.open = Boolean(nextOpen);
    if (widgetState.open) {
      panel.classList.add('cp-open');
      setTimeout(function () {
        inputEl.focus();
      }, 40);
    } else {
      panel.classList.remove('cp-open');
    }
  }

  function loadWidgetConfigAndHistory() {
    applyTheme();
    fetch(apiBase + '/api/v1/widget/' + encodeURIComponent(publicId) + '/config', {
      method: 'GET',
      mode: 'cors'
    })
      .then(function (res) {
        return res.json().then(function (payload) {
          return { ok: res.ok, payload: payload };
        });
      })
      .then(function (result) {
        widgetState.loadingConfig = false;
        if (!result.ok || !result.payload || !result.payload.success) {
          var errMsg = (result.payload && result.payload.message) || 'Widget could not be loaded.';
          setError(errMsg);
          inputEl.disabled = true;
          sendBtn.disabled = true;
          return;
        }

        widgetState.config = result.payload.data;
        applyTheme();
        renderHeaderBrand();
        setError('');
        inputEl.disabled = false;
        sendBtn.disabled = false;

        var welcomeMsg = widgetState.config.welcomeMessage;
        if (widgetState.config.enableConversationHistory) {
          fetch(
            apiBase +
              '/api/v1/widget/' +
              encodeURIComponent(publicId) +
              '/history?sessionId=' +
              encodeURIComponent(sessionId),
            { method: 'GET', mode: 'cors' }
          )
            .then(function (r) { return r.json(); })
            .then(function (histPayload) {
              var items = (histPayload && histPayload.success && histPayload.data && histPayload.data.messages) || [];
              if (items.length > 0) {
                widgetState.messages = items.map(function (m) {
                  return {
                    sender: m.senderType === 'Assistant' ? 'bot' : 'user',
                    content: m.content
                  };
                });
              } else if (welcomeMsg) {
                widgetState.messages = [{ sender: 'bot', content: welcomeMsg }];
              }
              renderMessages();
            })
            .catch(function () {
              if (welcomeMsg) {
                widgetState.messages = [{ sender: 'bot', content: welcomeMsg }];
              }
              renderMessages();
            });
        } else {
          if (welcomeMsg) {
            widgetState.messages = [{ sender: 'bot', content: welcomeMsg }];
          }
          renderMessages();
        }
      })
      .catch(function () {
        widgetState.loadingConfig = false;
        setError('Unable to reach ChatPilot assistant service.');
      });
  }

  function sendMessage() {
    var text = (inputEl.value || '').trim();
    if (!text || widgetState.sending || widgetState.loadingConfig) return;

    setError('');
    inputEl.value = '';
    widgetState.messages.push({ sender: 'user', content: text });
    widgetState.sending = true;
    sendBtn.disabled = true;
    renderMessages();

    fetch(apiBase + '/api/v1/widget/' + encodeURIComponent(publicId) + '/chat', {
      method: 'POST',
      mode: 'cors',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        message: text
      })
    })
      .then(function (res) {
        return res.json().then(function (payload) {
          return { ok: res.ok, payload: payload };
        });
      })
      .then(function (result) {
        widgetState.sending = false;
        sendBtn.disabled = false;

        if (!result.ok || !result.payload || !result.payload.success) {
          var errMsg = (result.payload && result.payload.message) || 'Failed to get response.';
          setError(errMsg);
          renderMessages();
          return;
        }

        var data = result.payload.data;
        if (data.sessionId) {
          sessionId = data.sessionId;
          try {
            window.localStorage.setItem(storageKey, sessionId);
          } catch (_e) {}
        }

        widgetState.messages.push({
          sender: 'bot',
          content: data.reply,
          citations: data.citations || [],
          handoverOffered: Boolean(data.handoverOffered),
          humanHandoverEmail: data.humanHandoverEmail || null
        });
        renderMessages();
      })
      .catch(function () {
        widgetState.sending = false;
        sendBtn.disabled = false;
        setError('Network error communicating with assistant.');
        renderMessages();
      });
  }

  launcherBtn.addEventListener('click', function () {
    setOpen(!widgetState.open);
  });

  closeBtn.addEventListener('click', function () {
    setOpen(false);
  });

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    sendMessage();
  });

  inputEl.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  function mountWidget() {
    if (!document.body) return;
    document.body.appendChild(host);
    loadWidgetConfigAndHistory();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountWidget);
  } else {
    mountWidget();
  }

  window.ChatPilotWidget = {
    open: function () { setOpen(true); },
    close: function () { setOpen(false); },
    toggle: function () { setOpen(!widgetState.open); },
    destroy: function () {
      if (host && host.parentNode) host.parentNode.removeChild(host);
    }
  };
})();
`;
