import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateMessage,
  validateEmail,
  buildFeedbackPayload,
  createFeedback,
  setupFeedbackForm,
  setupFeedbackModal
} from './feedback.mjs';

function mockClient(recorded) {
  return {
    collection(name) {
      return {
        async create(data) {
          recorded.push({ collection: name, data });
          if (recorded.failNext) {
            recorded.failNext = false;
            throw new Error('network down');
          }
          return { id: 'rec123', collectionId: 'feedback', ...data };
        }
      };
    }
  };
}

test('message is required and capped at 2000 chars', () => {
  assert.equal(typeof validateMessage(''), 'string');
  assert.equal(typeof validateMessage('   '), 'string');
  assert.equal(typeof validateMessage('x'.repeat(2001)), 'string');
  assert.equal(validateMessage('Great guide, thanks!'), null);
  assert.equal(validateMessage('x'.repeat(2000)), null);
});

test('email is optional but must look valid with max 320 chars', () => {
  assert.equal(validateEmail(''), null);
  assert.equal(validateEmail(undefined), null);
  assert.equal(typeof validateEmail('not-an-email'), 'string');
  assert.equal(typeof validateEmail('a@b@c'), 'string');
  assert.equal(validateEmail('person@example.com'), null);
  assert.equal(typeof validateEmail(`${'a'.repeat(310)}@example.com`), 'string');
});

test('payload contains exactly {message, email} and omits blank email', () => {
  assert.deepEqual(
    buildFeedbackPayload('Hello', 'a@b.co'),
    { message: 'Hello', email: 'a@b.co' }
  );
  assert.deepEqual(
    buildFeedbackPayload('Hello', '  '),
    { message: 'Hello', email: '' }
  );
});

test('createFeedback submits exact payload to feedback collection', async () => {
  const recorded = [];
  const client = mockClient(recorded);
  const result = await createFeedback(client, { message: 'Nice site', email: 'me@example.com' });
  assert.deepEqual(recorded, [
    { collection: 'feedback', data: { message: 'Nice site', email: 'me@example.com' } }
  ]);
  assert.equal(result.id, 'rec123');
});

test('createFeedback rejects invalid input without calling the client', async () => {
  const recorded = [];
  await assert.rejects(() => createFeedback(mockClient(recorded), { message: '' }));
  await assert.rejects(() => createFeedback(mockClient(recorded), { message: 'ok', email: 'bad' }));
  assert.deepEqual(recorded, []);
});

test('email is optional end-to-end', async () => {
  const recorded = [];
  await createFeedback(mockClient(recorded), { message: 'Anonymous note' });
  assert.deepEqual(recorded[0].data, { message: 'Anonymous note', email: '' });
});

test('setupFeedbackForm: success state, exact payload, disabled while pending', async () => {
  const recorded = [];
  const elements = {
    form: { addEventListener(type, fn) { elements.submit = fn; }, removeEventListener() {} },
    email: { value: '' },
    submitButton: { disabled: false },
    messageField: { value: '  Love the waterfront tips!  ', disabled: false },
    status: { textContent: '', className: '' }
  };
  if (!elements.message) elements.message = elements.messageField;
  if (!elements.messageField) elements.messageField = elements.message;
  const doc = {
    getElementById(id) {
      return {
        'feedback-form': elements.form,
        'feedback-message': elements.messageField,
        'feedback-email': elements.email,
        'feedback-submit': elements.submitButton,
        'feedback-status': elements.status
      }[id];
    }
  };
  let pendingChecked = false;
  const teardown = setupFeedbackForm({
    document: doc,
    client: {
      collection(name) {
        return {
          async create(data) {
            pendingChecked = elements.submitButton.disabled === true
              && elements.messageField.disabled === true
              && elements.email.disabled === true;
            recorded.push({ collection: name, data });
            return { id: 'r1' };
          }
        };
      }
    }
  });
  assert.equal(typeof teardown, 'function', 'setup returns teardown');

  await elements.submit({ preventDefault() {} });

  assert.equal(pendingChecked, true, 'controls disabled while request pending');
  assert.deepEqual(recorded, [{
    collection: 'feedback',
    data: { message: 'Love the waterfront tips!', email: '' }
  }]);
  assert.match(elements.status.className, /success/);
  assert.match(elements.status.textContent, /thank/i);
  assert.equal(elements.submitButton.disabled, false, 'controls re-enabled after success');
  assert.equal(elements.messageField.disabled, false, 'message re-enabled after success');
  assert.equal(elements.email.disabled, false, 'email re-enabled after success');
  assert.equal(elements.messageField.value, '', 'message cleared on success');

  teardown();
});

test('setupFeedbackForm: invalid input shows error and never submits', async () => {
  const recorded = [];
  const status = { textContent: '', className: '' };
  const elements = {
    form: { addEventListener(type, fn) { elements.submit = fn; }, removeEventListener() {} },
    message: { value: '   ' },
    email: { value: 'nope' },
    submitButton: { disabled: false },
    status
  };
  if (!elements.message) elements.message = elements.messageField;
  if (!elements.messageField) elements.messageField = elements.message;
  const doc = {
    getElementById(id) {
      return {
        'feedback-form': elements.form,
        'feedback-message': elements.messageField,
        'feedback-email': elements.email,
        'feedback-submit': elements.submitButton,
        'feedback-status': elements.status
      }[id];
    }
  };
  setupFeedbackForm({ document: doc, client: mockClient(recorded) });

  await elements.submit({ preventDefault() {} });

  assert.deepEqual(recorded, [], 'nothing submitted for invalid input');
  assert.match(status.className, /error/);
  assert.match(status.textContent, /message/i);
  assert.equal(elements.submitButton.disabled, false);
});

test('setupFeedbackForm: failure state on client error, controls restored', async () => {
  const recorded = [];
  recorded.failNext = true;
  const status = { textContent: '', className: '' };
  const elements = {
    form: { addEventListener(type, fn) { elements.submit = fn; }, removeEventListener() {} },
    message: { value: 'Something broke?' },
    email: { value: '' },
    submitButton: { disabled: false },
    status
  };
  if (!elements.message) elements.message = elements.messageField;
  if (!elements.messageField) elements.messageField = elements.message;
  const doc = {
    getElementById(id) {
      return {
        'feedback-form': elements.form,
        'feedback-message': elements.messageField,
        'feedback-email': elements.email,
        'feedback-submit': elements.submitButton,
        'feedback-status': elements.status
      }[id];
    }
  };
  setupFeedbackForm({ document: doc, client: mockClient(recorded) });

  await elements.submit({ preventDefault() {} });

  assert.equal(recorded.length, 1);
  assert.match(status.className, /error/);
  assert.match(status.textContent, /failed|try again/i);
  assert.equal(elements.submitButton.disabled, false);
  assert.notEqual(elements.messageField.value, '', 'message kept on failure');
});

test('build output contains feedback.mjs referenced with a cache-busting hash', async () => {
  const { execFile } = await import('node:child_process');
  const { promisify } = await import('node:util');
  const execFileAsync = promisify(execFile);
  await execFileAsync('node', ['scripts/build-public.mjs']);
  const { access, readFile } = await import('node:fs/promises');
  await access(new URL('./dist/pb_public/feedback.mjs', import.meta.url));
  const builtHtml = await readFile(new URL('./dist/pb_public/index.html', import.meta.url), 'utf8');
  assert.match(builtHtml, /src="feedback\.mjs\?v=[0-9a-f]{12}"/);
});

test('build output wires the modal trigger, dialog, and setupFeedbackModal module', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('./index.html', import.meta.url), 'utf8');

  // Trigger is a compact button in the sidebar footer, next to Admin Portal link.
  const footerStart = html.indexOf('<footer class="sidebar-footer">');
  const footerEnd = html.indexOf('</footer>', footerStart);
  assert.ok(footerStart > -1, 'sidebar footer exists');
  const footer = html.slice(footerStart, footerEnd);
  assert.match(footer, /id="feedback-open"/, 'modal trigger lives in sidebar footer');
  assert.match(footer, />Leave feedback</, 'trigger labeled Leave feedback');
  assert.match(footer, /id="admin-portal-link"/, 'Admin Portal link retained');

  // The form moved into a native <dialog> placed outside the sidebar aside.
  const asideEnd = html.indexOf('</aside>');
  const dialogStart = html.indexOf('<dialog id="feedback-modal"', asideEnd);
  assert.ok(dialogStart > -1, 'feedback modal is a native <dialog> outside the sidebar');
  const dialogHtml = html.slice(dialogStart, html.indexOf('</dialog>', dialogStart));
  assert.match(dialogHtml, /id="feedback-form"/, 'form preserved inside dialog');
  assert.match(dialogHtml, /id="feedback-close"/, 'visible close button present');
  assert.match(dialogHtml, /aria-labelledby="feedback-title"/, 'accessible title binding');
  assert.match(dialogHtml, /id="feedback-title"/);
  // Privacy wording retained verbatim.
  assert.match(
    dialogHtml,
    /Optional and private: your message goes only to the site team\. An email address is optional and used solely to reply to you\. We never share or display submissions\./
  );

  const mod = await import('./feedback.mjs');
  assert.equal(typeof mod.setupFeedbackModal, 'function', 'setupFeedbackModal exported');
});

test('setupFeedbackModal opens via trigger and closes via close button', () => {
  const opened = [];
  const closed = [];
  const dialog = {
    showModal() { opened.push(true); },
    close(reason) { closed.push(reason); },
    open: false
  };
  const listeners = {};
  function el(id) {
    return {
      id,
      addEventListener(type, fn) { listeners[`${id}:${type}`] = fn; },
      removeEventListener() {}
    };
  }
  const doc = {
    getElementById(id) {
      if (id === 'feedback-modal') return dialog;
      if (id === 'feedback-open' || id === 'feedback-close') return el(id);
      return null;
    }
  };
  const teardown = setupFeedbackModal({ document: doc });
  assert.equal(typeof teardown, 'function', 'setup returns teardown');

  assert.equal(typeof listeners['feedback-open:click'], 'function', 'trigger listener registered');
  listeners['feedback-open:click']({ preventDefault() {} });
  assert.deepEqual(opened, [true], 'trigger opens the modal');
  assert.equal(opened.length, 1);

  assert.equal(typeof listeners['feedback-close:click'], 'function', 'close listener registered');
  listeners['feedback-close:click']({ preventDefault() {} });
  assert.deepEqual(closed, [undefined], 'close button closes the modal');

  teardown();
});

test('setupFeedbackModal is safe when elements are missing', () => {
  const teardown = setupFeedbackModal({ document: { getElementById: () => null } });
  assert.equal(typeof teardown, 'function');
  teardown();
});
