/**
 * Visitor feedback for Brick & River.
 *
 * ES module. In Node, the exported helpers are tested directly with a mocked
 * client. In the browser, the module self-initializes against a same-origin
 * PocketBase instance and submits only {message, email} to the public
 * "feedback" collection. User-submitted content is never rendered back.
 */

export const MESSAGE_MAX = 2000;
export const EMAIL_MAX = 320;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateMessage(message) {
  if (typeof message !== 'string' || message.trim().length === 0) {
    return 'Please enter a message.';
  }
  if (message.length > MESSAGE_MAX) {
    return `Message must be ${MESSAGE_MAX} characters or fewer.`;
  }
  return null;
}

export function validateEmail(email) {
  if (email === undefined || email === null || String(email).trim() === '') {
    return null; // optional
  }
  const value = String(email).trim();
  if (value.length > EMAIL_MAX || !EMAIL_PATTERN.test(value)) {
    return 'Please enter a valid email address or leave it blank.';
  }
  return null;
}

export function buildFeedbackPayload(message, email) {
  const messageError = validateMessage(message);
  const emailError = validateEmail(email);
  if (messageError) throw new Error(messageError);
  if (emailError) throw new Error(emailError);
  return {
    message: String(message).trim(),
    email: email === undefined || email === null ? '' : String(email).trim()
  };
}

export async function createFeedback(client, { message, email }) {
  const payload = buildFeedbackPayload(message, email);
  return client.collection('feedback').create(payload);
}

/**
 * Wire up the sidebar form. Accepts injected dependencies so tests can mock
 * the document and client. Returns a teardown that removes the listener.
 */
export function setupFeedbackForm({ document: doc = globalThis.document, client } = {}) {
  const form = doc.getElementById('feedback-form');
  if (!form || !client) return () => {};

  const messageInput = doc.getElementById('feedback-message');
  const emailInput = doc.getElementById('feedback-email');
  const submitButton = doc.getElementById('feedback-submit');
  const statusEl = doc.getElementById('feedback-status');

  const setStatus = (className, text) => {
    statusEl.className = `feedback-status ${className}`;
    statusEl.textContent = text;
  };
  const setPending = (pending) => {
    submitButton.disabled = pending;
    messageInput.disabled = pending;
    emailInput.disabled = pending;
  };

  const handler = async (event) => {
    event.preventDefault();
    setStatus('', '');
    let payload;
    try {
      payload = buildFeedbackPayload(messageInput.value, emailInput.value);
    } catch (error) {
      setStatus('error', error.message || 'Please check your entries and try again.');
      return;
    }
    setPending(true);
    try {
      await client.collection('feedback').create(payload);
      // Success only: never render user-submitted content.
      setStatus('success', 'Thank you! Your feedback was sent.');
      messageInput.value = '';
    } catch {
      setStatus('error', 'Sending failed. Please try again later.');
    } finally {
      setPending(false);
    }
  };

  form.addEventListener('submit', handler);
  return () => form.removeEventListener('submit', handler);
}

/**
 * Wire up the feedback modal: the sidebar footer trigger opens the native
 * <dialog>, and its close button closes it. ESC and backdrop clicks are
 * handled natively by <dialog>. Accepts injected dependencies so tests can
 * mock the document. Returns a teardown that removes the listeners.
 */
export function setupFeedbackModal({ document: doc = globalThis.document } = {}) {
  const dialog = doc.getElementById('feedback-modal');
  const openTrigger = doc.getElementById('feedback-open');
  const closeButton = doc.getElementById('feedback-close');
  if (!dialog || !openTrigger) return () => {};

  const onOpen = (event) => {
    event.preventDefault();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.open = true;
  };
  const onClose = (event) => {
    event.preventDefault();
    if (typeof dialog.close === 'function') dialog.close();
    else dialog.open = false;
  };

  openTrigger.addEventListener('click', onOpen);
  closeButton?.addEventListener('click', onClose);
  return () => {
    openTrigger.removeEventListener('click', onOpen);
    closeButton?.removeEventListener('click', onClose);
  };
}

// Browser auto-initialization using same-origin configuration.
if (typeof window !== 'undefined' && typeof PocketBase !== 'undefined') {
  const baseUrl = window.OLD_TOWN_CONFIG?.pocketBaseUrl || window.location.origin;
  const client = new PocketBase(baseUrl);
  setupFeedbackForm({ client });
  setupFeedbackModal();
}
