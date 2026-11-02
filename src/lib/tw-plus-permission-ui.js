import {createExtensionWaitDialog} from '@kubohiroya/turbowarp-extension-security-dialog';

const text = (document, tag, value, attributes = {}) => {
    const element = document.createElement(tag);
    element.textContent = value;
    for (const [name, content] of Object.entries(attributes)) element.setAttribute(name, content);
    return element;
};

/** Display host permission requests without treating any project strings as markup. */
export function createPlusPermissionUI (document, locale = 'ja') {
    const japanese = locale.startsWith('ja');
    const label = (ja, en) => japanese ? ja : en;
    // A retry blocks the whole operation, so the package says so in the middle of the screen,
    // where the approval dialog appears too. The log below keeps the running record.
    const waiting = createExtensionWaitDialog(document, locale);
    const pending = new Set();
    let disposed = false;
    let status;
    let log;
    if (document && document.body) {
        const style = document.createElement('style');
        style.setAttribute('data-tw-plus-permission-style', '');
        // Native dialog auto margins follow the overflowing host layout; use viewport units.
        style.textContent = '.tw-plus-permission{position:fixed;left:50vw;top:50vh;right:auto;bottom:auto;margin:0;transform:translate(-50%,-50%);box-sizing:border-box;max-width:min(680px,94vw);max-height:90vh;overflow:auto;border:1px solid #64748b;border-radius:14px;padding:24px;color:#172033;background:white;font:15px/1.5 system-ui,sans-serif;box-shadow:0 20px 70px #0005}.tw-plus-permission::backdrop{background:#111827a6}.tw-plus-permission h2{margin:0 0 12px}.tw-plus-permission dl{display:grid;grid-template-columns:120px 1fr;gap:8px;margin:20px 0}.tw-plus-permission dt{font-weight:700}.tw-plus-permission dd{margin:0;overflow-wrap:anywhere;white-space:pre-wrap}.tw-plus-permission menu{display:flex;justify-content:flex-end;gap:12px;padding:0;margin-bottom:0}.tw-plus-permission button{font:inherit;border:1px solid #64748b;padding:10px 16px;border-radius:8px;background:white;color:#172033;cursor:pointer}.tw-plus-permission button:focus-visible{outline:3px solid #3b82f6;outline-offset:3px}.tw-plus-permission button[data-testid="tw-plus-allow"]{background:#1d4ed8;color:white;border-color:#1d4ed8}.tw-plus-diagnostics{position:fixed;right:12px;top:4px;z-index:10000;max-width:min(600px,90vw);max-height:45vh;overflow:auto;border-radius:7px;background:#fff;color:#172033;box-shadow:0 2px 12px #0004;font:12px/1.5 system-ui,sans-serif}.tw-plus-diagnostics summary{padding:6px 10px;cursor:pointer}.tw-plus-diagnostics ol{padding:0 20px 10px 30px;overflow-wrap:anywhere}.tw-plus-diagnostics li[data-error="true"]{color:#b91c1c}';
        // Keep the full accessible name while avoiding narrow editor header overlap.
        style.textContent += '@media(max-width:580px){.tw-plus-diagnostics:not([open]) summary{font-size:0}.tw-plus-diagnostics:not([open]) summary::after{content:"ⓘ";font-size:18px;line-height:1}}';
        if (!document.querySelector('[data-tw-plus-permission-style]')) document.head.appendChild(style);
        status = document.createElement('details');
        status.className = 'tw-plus-diagnostics';
        status.setAttribute('data-testid', 'tw-plus-extension-status');
        status.appendChild(text(document, 'summary', label('拡張の検証・許可', 'Extension verification and permission')));
        log = document.createElement('ol');
        log.setAttribute('aria-live', 'polite');
        status.appendChild(log);
        document.body.appendChild(status);
    }
    const diagnostics = event => {
        if (disposed) return;
        // Any other event means the fetch resolved, one way or the other.
        if (event.type === 'retry') {
            waiting.show({url: event.message, attempt: event.attempt, attempts: event.attempts});
        } else waiting.hide();
        if (!log) return;
        const states = {
            verified: label('内容を検証済み', 'Content verified'),
            authorized: label('実行を許可済み', 'Execution approved'),
            loaded: label('拡張を読み込みました', 'Extensions loaded'),
            review: label('実行許可を確認中', 'Reviewing execution permission'),
            retry: label('接続できませんでした。再試行しています', 'Could not connect. Retrying'),
            error: label('読み込みを拒否', 'Loading rejected'),
            'project-error': label('作品を開けませんでした', 'Could not open project')
        };
        const attempts = typeof event.attempts === 'number' ? `(${event.attempt}/${event.attempts})` : null;
        const item = text(document, 'li', [states[event.type] || event.type, event.id,
            event.ids && event.ids.join(', '), attempts, event.code, event.sha256, event.message]
            .filter(Boolean)
            .join(' · '));
        item.setAttribute('data-event', event.type);
        if (event.type === 'error' || event.type === 'project-error') {
            item.setAttribute('data-error', 'true');
            status.open = true;
        }
        log.appendChild(item);
        while (log.children.length > 50) log.removeChild(log.firstChild);
    };
    return Object.freeze({
        diagnostics,
        requestApproval (code, {signal} = {}) {
            if (disposed || !document || !document.body || (signal && signal.aborted)) return Promise.resolve(false);
            diagnostics({type: 'review', id: code.id, sha256: code.sha256});
            return new Promise(resolve => {
                const dialog = document.createElement('dialog');
                dialog.className = 'tw-plus-permission';
                dialog.setAttribute('data-testid', 'tw-plus-permission');
                dialog.setAttribute('aria-label', label('拡張機能の実行を許可', 'Allow extension execution'));
                dialog.appendChild(text(document, 'h2', label('拡張機能の実行を許可しますか？', 'Allow this extension to run?')));
                dialog.appendChild(text(document, 'p', code.execution === 'sandboxed' ? label(
                    'この拡張は分離されたiframe内で実行され、Scratch.vmへ直接アクセスできません。取得元と内容を確認して許可してください。',
                    'This extension runs in an isolated iframe without direct access to Scratch.vm. Review its source and content before approving.') : label(
                    'この拡張はサンドボックス外で実行され、作品・エディター・このサイトのデータにアクセスできます。信頼できるコードだけを許可してください。',
                    'This extension runs unsandboxed and can access the project, editor and this site’s data. Only approve code you trust.')));
                const rows = [
                    [label('拡張ID', 'Extension ID'), code.id, 'id'],
                    [label('取得元', 'Source'), code.source.url || code.source.path, 'source'],
                    [label('発行者の申告', 'Claimed publisher'), `${code.publisher || label('記載なし', 'Not provided')} (${label('本人性は未検証', 'identity unverified')})`, 'publisher'],
                    [label('バージョン', 'Version'), code.version || label('記載なし', 'Not provided'), 'version'],
                    ['SHA-256', code.sha256, 'sha256'],
                    [label('実行モード', 'Execution'), code.execution, 'execution'],
                    [label('要求権限', 'Requested capabilities'), code.capabilities.length ? code.capabilities.join(', ') :
                        code.execution === 'sandboxed' ? label('個別申告なし（iframe内で実行）', 'Not declared (runs inside an iframe)') :
                            label('個別申告なし（権限は制限されません）', 'Not declared (permissions are unrestricted)'), 'capabilities']
                ];
                const list = document.createElement('dl');
                for (const [name, value, key] of rows) {
                    list.appendChild(text(document, 'dt', name));
                    list.appendChild(text(document, 'dd', value, {'data-field': key}));
                }
                dialog.appendChild(list);
                dialog.appendChild(text(document, 'p', label('同じ内容・取得元への許可は、このエディターを閉じるまで保持されます。',
                    'Approval for this exact content and source lasts until this editor is closed.')));
                const controls = document.createElement('menu');
                const deny = text(document, 'button', label('許可しない', 'Deny'), {type: 'button', 'data-testid': 'tw-plus-deny'});
                const allow = text(document, 'button', label('許可して実行', 'Allow and run'), {type: 'button', 'data-testid': 'tw-plus-allow'});
                controls.appendChild(deny); controls.appendChild(allow); dialog.appendChild(controls);
                let settled = false;
                const finish = approved => {
                    if (settled) return;
                    settled = true;
                    pending.delete(cancel);
                    if (signal) signal.removeEventListener('abort', cancel);
                    dialog.remove();
                    resolve(approved === true);
                };
                const cancel = () => finish(false);
                pending.add(cancel);
                deny.addEventListener('click', cancel);
                allow.addEventListener('click', () => finish(true));
                dialog.addEventListener('cancel', event => { event.preventDefault(); cancel(); });
                dialog.addEventListener('close', cancel);
                if (signal) signal.addEventListener('abort', cancel, {once: true});
                document.body.appendChild(dialog);
                try {
                    if (typeof dialog.showModal !== 'function') return cancel();
                    dialog.showModal();
                    deny.focus();
                } catch (error) {
                    cancel();
                }
            });
        },
        dispose () {
            disposed = true;
            waiting.dispose();
            for (const cancel of pending) cancel();
            if (status) status.remove();
        }
    });
}
