import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createPlusPermissionUI} from '../../../src/lib/tw-plus-permission-ui.js';
const require = createRequire(import.meta.url);
const {JSDOM} = require('jsdom');
const code = {id: 'sample', source: {type: 'remote', url: 'https://example.org/sample.js'},
    sha256: 'a'.repeat(64), publisher: '<img src=x onerror=alert(1)>', capabilities: ['vm'], execution: 'unsandboxed'};
function fixture(locale) {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body><button id="previous">Before</button></body></html>');
    dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    const document = dom.window.document;
    return {dom, document, ui: createPlusPermissionUI(document, locale)};
}

test('approval dialog displays exact source, digest, requested mode and unverified publisher as text', async () => {
    const {dom, document, ui} = fixture('ja');
    const review = ui.requestApproval(code);
    const dialog = document.querySelector('[data-testid="tw-plus-permission"]');
    assert.equal(dialog.open, true);
    assert.equal(dialog.querySelector('[data-field="source"]').textContent, code.source.url);
    assert.equal(dialog.querySelector('[data-field="sha256"]').textContent, code.sha256);
    assert.equal(dialog.querySelector('[data-field="execution"]').textContent, 'unsandboxed');
    assert.equal(dialog.querySelector('[data-field="publisher"]').textContent.includes('本人性は未検証'), true);
    assert.equal(dialog.querySelector('img'), null);
    assert.equal(document.activeElement, dialog.querySelector('[data-testid="tw-plus-deny"]'));
    dialog.querySelector('[data-testid="tw-plus-allow"]').click();
    assert.equal(await review, true);
    assert.equal(document.querySelector('dialog'), null);
    ui.dispose(); dom.window.close();
});

test('denial, escape, close, abort and host disposal all refuse execution', async () => {
    for (const action of ['deny', 'escape', 'close', 'abort', 'dispose']) {
        const {dom, document, ui} = fixture('en');
        const controller = new AbortController();
        const review = ui.requestApproval(code, {signal: controller.signal});
        const dialog = document.querySelector('dialog');
        if (action === 'deny') dialog.querySelector('[data-testid="tw-plus-deny"]').click();
        if (action === 'escape') dialog.dispatchEvent(new dom.window.Event('cancel', {cancelable: true}));
        if (action === 'close') dialog.dispatchEvent(new dom.window.Event('close'));
        if (action === 'abort') controller.abort();
        if (action === 'dispose') ui.dispose();
        assert.equal(await review, false, action);
        assert.equal(document.querySelector('dialog'), null);
        ui.dispose(); dom.window.close();
    }
});

test('sandboxed consent displays its actual isolation mode and never claims unsandboxed execution', async () => {
    const {dom, document, ui} = fixture('ja');
    const review = ui.requestApproval({...code, execution: 'sandboxed', capabilities: []});
    const dialog = document.querySelector('dialog');
    assert.equal(dialog.querySelector('[data-field="execution"]').textContent, 'sandboxed');
    assert.match(dialog.textContent, /分離されたiframe/);
    assert.equal(dialog.textContent.includes('権限は制限されません'), false);
    dialog.querySelector('[data-testid="tw-plus-allow"]').click();
    assert.equal(await review, true);
    ui.dispose(); dom.window.close();
});

test('unsupported dialog and already aborted requests fail closed', async () => {
    const {dom, document, ui} = fixture('en');
    assert.equal(await ui.requestApproval(code, {signal: AbortSignal.abort()}), false);
    delete dom.window.HTMLDialogElement.prototype.showModal;
    assert.equal(await ui.requestApproval(code), false);
    assert.equal(document.querySelector('dialog'), null);
    ui.dispose(); dom.window.close();
});

test('diagnostics are bounded text and show an explicit failure reason', () => {
    const {dom, document, ui} = fixture('en');
    for (let i = 0; i < 60; i++) ui.diagnostics({type: 'verified', id: 'sample', sha256: code.sha256});
    ui.diagnostics({type: 'project-error', code: 'DIGEST_MISMATCH', message: '<script>unsafe</script>'});
    const status = document.querySelector('[data-testid="tw-plus-extension-status"]');
    assert.equal(status.open, true);
    assert.equal(status.querySelectorAll('li').length, 50);
    assert.equal(status.querySelector('li:last-child').textContent.includes('DIGEST_MISMATCH'), true);
    assert.equal(status.querySelector('script'), null);
    ui.dispose(); dom.window.close();
});

test('a retry is logged and raised to a centred dialog, and taken down when the fetch resolves', async () => {
    const {dom, document, ui} = fixture('ja');
    const status = document.querySelector('[data-testid="tw-plus-extension-status"]');
    const waiting = () => document.querySelector('[data-testid="twextsec-wait"]');
    ui.diagnostics({type: 'retry', attempt: 2, attempts: 3, message: 'https://example.org/sample.js'});
    const item = status.querySelector('li[data-event="retry"]');
    assert.match(item.textContent, /接続できませんでした。再試行しています/);
    assert.match(item.textContent, /\(2\/3\)/);
    assert.match(item.textContent, /https:\/\/example\.org\/sample\.js/);
    // Retrying is not a refusal, so it must not be coloured as one.
    assert.equal(item.getAttribute('data-error'), null);
    // The corner panel stays a log. A blocked operation is said in the middle of the screen,
    // where the approval dialog appears too, so the panel no longer opens itself for it.
    assert.equal(status.open, false);
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.match(waiting().textContent, /再試行しています（2\/3）/);
    assert.match(waiting().textContent, /https:\/\/example\.org\/sample\.js/);
    // Any other event means the fetch resolved, one way or the other.
    ui.diagnostics({type: 'verified', id: 'sample', sha256: 'a'.repeat(64)});
    assert.equal(waiting(), null);
    ui.dispose(); dom.window.close();
});

test('host disposal takes the wait dialog down with everything else', async () => {
    const {dom, document, ui} = fixture('ja');
    ui.diagnostics({type: 'retry', attempt: 2, attempts: 3, message: 'https://example.org/sample.js'});
    await new Promise(resolve => setTimeout(resolve, 400));
    assert.notEqual(document.querySelector('[data-testid="twextsec-wait"]'), null);
    ui.dispose();
    assert.equal(document.querySelector('[data-testid="twextsec-wait"]'), null);
    dom.window.close();
});

test('an event without an attempt count reads as it did before', () => {
    const {dom, document, ui} = fixture('en');
    ui.diagnostics({type: 'verified', id: 'sample', sha256: 'a'.repeat(64)});
    const item = document.querySelector('li[data-event="verified"]');
    assert.equal(item.textContent, `Content verified · sample · ${'a'.repeat(64)}`);
    ui.dispose(); dom.window.close();
});
