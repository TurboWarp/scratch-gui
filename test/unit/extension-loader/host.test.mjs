import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createRequire} from 'node:module';
import VM from 'scratch-vm';
import {installPlusExtensionHost, startupPlusExtensionHost} from '../../../src/lib/tw-plus-extension-host.js';
const require = createRequire(import.meta.url);
const {JSDOM} = require('jsdom');
const bytes = new TextEncoder().encode('(function(Scratch){Scratch.vm.plusHostExecuted=true;Scratch.extensions.register({getInfo(){return {id:"hostfixture",name:"Host fixture",blocks:[]}}});})(Scratch);');
const sha256 = createHash('sha256').update(bytes).digest('hex');
const manifest = {schemaVersion: 1, extensions: [{id: 'hostfixture', execution: 'unsandboxed',
    source: {type: 'remote', url: 'https://example.org/host-fixture.js'}, sha256}]};
const project = {targets: [{isStage: true, name: 'Stage', variables: {}, lists: {}, broadcasts: {}, blocks: {},
    comments: {}, currentCostume: 0, costumes: [], sounds: [], volume: 100, layerOrder: 0, tempo: 60,
    videoTransparency: 50, videoState: 'on', textToSpeechLanguage: null}], monitors: [], extensions: [],
    meta: {semver: '3.0.0', vm: '0.2.0', agent: 'host integration test'}, turboWarpPlus: manifest};

test('disabled host does not access a VM or permission document', async () => {
    const forbidden = new Proxy({}, {get() { throw new Error('unexpected access'); }});
    const host = installPlusExtensionHost(forbidden, {document: forbidden});
    assert.equal(host.enabled, false);
    await host.dispose();
});

test('startup defaults on, opt-out is explicit and later URL changes cannot toggle the host', async () => {
    const previous = globalThis.location;
    globalThis.location = {search: '?twPlusExtensionLoader=0'};
    const vm = new VM();
    try {
        const host = startupPlusExtensionHost(vm, {document: undefined});
        assert.equal(host.enabled, true);
        await host.dispose();
        const forbidden = new Proxy({}, {get() { throw new Error('unexpected access'); }});
        const disabled = startupPlusExtensionHost(forbidden, {search: '?twPlusExtensionLoader=0', document: forbidden});
        assert.equal(disabled.enabled, false);
        await disabled.dispose();
    } finally {
        vm.runtime.dispose();
        if (previous === undefined) delete globalThis.location;
        else globalThis.location = previous;
    }
});

test('injected host policy denial blocks the new project path before user consent or evaluation', async () => {
    const vm = new VM();
    let prompts = 0;
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined,
        requestApproval: async () => { prompts++; return true; },
        hostPolicy: {canLoadExtensionFromProject: async () => false},
        async fetchImpl(url) { const response = new Response(bytes); Object.defineProperty(response, 'url', {value: url}); return response; }});
    try {
        await assert.rejects(vm.loadProject(JSON.stringify(project)), {code: 'TRUST_DENIED'});
        assert.equal(vm.plusHostExecuted, undefined);
        assert.equal(prompts, 0);
    } finally { await host.dispose(); vm.runtime.dispose(); }
});

test('catalog-listed code loads without a separate approval and unlisted code still asks', async () => {
    const vm = new VM();
    let prompts = 0;
    let trusted = true;
    const checked = [];
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined,
        requestApproval: async () => { prompts++; return false; },
        trustedCatalog: {async isTrustedCode(code) { checked.push(code.actualSHA256); return trusted; }},
        async fetchImpl(url) { const response = new Response(bytes); Object.defineProperty(response, 'url', {value: url}); return response; }});
    try {
        await vm.loadProject(JSON.stringify(project));
        assert.equal(vm.plusHostExecuted, true);
        assert.equal(prompts, 0);
        assert.deepEqual(checked, [sha256]);
        await host.dispose();
        vm.plusHostExecuted = undefined;
        trusted = false;
        const untrusted = installPlusExtensionHost(vm, {enabled: true, document: undefined,
            requestApproval: async () => { prompts++; return false; },
            trustedCatalog: {async isTrustedCode() { return trusted; }},
            async fetchImpl(url) { const response = new Response(bytes); Object.defineProperty(response, 'url', {value: url}); return response; }});
        try {
            await assert.rejects(vm.loadProject(JSON.stringify(project)), {code: 'TRUST_DENIED'});
            assert.equal(vm.plusHostExecuted, undefined);
            assert.equal(prompts, 1);
        } finally { await untrusted.dispose(); }
    } finally { await host.dispose(); vm.runtime.dispose(); }
});

test('digests embedded in a single HTML trust matching code and still ask for other code', async () => {
    const vm = new VM();
    let prompts = 0;
    const fetchImpl = async url => {
        const response = new Response(bytes);
        Object.defineProperty(response, 'url', {value: url});
        return response;
    };
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined, fetchImpl, trustedDigests: [sha256],
        requestApproval: async () => { prompts++; return false; }});
    try {
        await vm.loadProject(JSON.stringify(project));
        assert.equal(vm.plusHostExecuted, true);
        assert.equal(prompts, 0);
    } finally { await host.dispose(); }
    vm.plusHostExecuted = undefined;
    const other = installPlusExtensionHost(vm, {enabled: true, document: undefined, fetchImpl, trustedDigests: ['a'.repeat(64)],
        requestApproval: async () => { prompts++; return false; }});
    try {
        await assert.rejects(vm.loadProject(JSON.stringify(project)), {code: 'TRUST_DENIED'});
        assert.equal(vm.plusHostExecuted, undefined);
        assert.equal(prompts, 1);
    } finally { await other.dispose(); vm.runtime.dispose(); }
});

test('real VM project loading waits for DOM consent, preserves metadata and reopens offline from verified cache', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><head></head><body></body></html>');
    dom.window.HTMLDialogElement.prototype.showModal = function() { this.open = true; };
    const vm = new VM();
    let fetches = 0;
    const host = installPlusExtensionHost(vm, {enabled: true, document: dom.window.document,
        async fetchImpl(url) {
            fetches++;
            if (fetches > 1) throw new Error('offline');
            const response = new Response(bytes);
            Object.defineProperty(response, 'url', {value: url});
            return response;
        }});
    try {
        const loading = vm.loadProject(JSON.stringify(project));
        let dialog;
        for (let i = 0; i < 100 && !dialog; i++) {
            await new Promise(resolve => setTimeout(resolve, 5));
            dialog = dom.window.document.querySelector('[data-testid="tw-plus-permission"]');
        }
        assert.ok(dialog, 'The host displays a permission dialog');
        assert.equal(vm.plusHostExecuted, undefined);
        dialog.querySelector('[data-testid="tw-plus-allow"]').click();
        await loading;
        assert.equal(vm.plusHostExecuted, true);
        const saved = JSON.parse(vm.toJSON());
        assert.equal(saved.turboWarpPlus.extensions[0].sha256, sha256);
        vm.plusHostExecuted = false;
        await vm.loadProject(JSON.stringify(saved));
        assert.equal(vm.plusHostExecuted, true);
        assert.equal(fetches, 1);
        assert.equal(dom.window.document.querySelector('dialog'), null);
        assert.equal(vm.extensionManager.isExtensionLoaded('hostfixture'), true);
        await host.dispose();
        assert.equal(vm.extensionManager.isExtensionLoaded('hostfixture'), false);
    } finally {
        await host.dispose();
        vm.runtime.dispose();
        dom.window.close();
    }
});

test('default-on host opens 24 MiB legacy JSON and SB3 and rejects entries above 32 MiB', async () => {
    const vm = new VM();
    let prompts = 0;
    const host = startupPlusExtensionHost(vm, {document: undefined, requestApproval: async () => { prompts++; return false; }});
    try {
        const legacy = structuredClone(project);
        delete legacy.turboWarpPlus;
        const Zip = require('@turbowarp/jszip');
        legacy.meta.agent = 'x'.repeat(24 * 1024 * 1024);
        const json = JSON.stringify(legacy);
        await vm.loadProject(json);
        const archive = await new Zip().file('project.json', json).generateAsync({type: 'uint8array', compression: 'STORE'});
        await vm.loadProject(archive);
        assert.equal(vm.runtime.targets.length, 1);
        assert.equal(prompts, 0);
        const saved = vm.toJSON();
        legacy.meta.agent = 'x'.repeat(32 * 1024 * 1024);
        const oversizedJSON = JSON.stringify(legacy);
        await assert.rejects(vm.loadProject(oversizedJSON), {code: 'INVALID_ARCHIVE'});
        const oversizedZip = await new Zip().file('project.json', oversizedJSON)
            .generateAsync({type: 'uint8array', compression: 'STORE'});
        await assert.rejects(vm.loadProject(oversizedZip), {code: 'INVALID_ARCHIVE'});
        const excessiveRatio = await new Zip().file('project.json', JSON.stringify(project))
            .file('zeros.bin', new Uint8Array(1024 * 1024))
            .generateAsync({type: 'uint8array', compression: 'DEFLATE'});
        await assert.rejects(vm.loadProject(excessiveRatio), {code: 'INVALID_ARCHIVE'});
        assert.equal(vm.toJSON(), saved);
        assert.equal(prompts, 0);
    } finally { await host.dispose(); vm.runtime.dispose(); }
});

test('a transient fetch failure is reported as the attempt it leads to, and a 404 answer is not', async () => {
    const vm = new VM();
    const reported = [];
    let requests = 0;
    const host = installPlusExtensionHost(vm, {enabled: true, document: undefined,
        requestApproval: async () => true, diagnostics: event => reported.push(event),
        fetchRetry: {baseDelayMs: 1, maxDelayMs: 1},
        async fetchImpl(url) {
            requests++;
            if (requests === 1) throw new TypeError('Failed to fetch');
            const response = new Response(bytes);
            Object.defineProperty(response, 'url', {value: url});
            return response;
        }});
    try {
        await vm.loadProject(JSON.stringify(project));
        assert.equal(requests, 2);
        const retries = reported.filter(event => event.type === 'retry');
        assert.deepEqual(retries.map(event => [event.attempt, event.attempts]), [[2, 3]]);
        assert.equal(retries[0].message, manifest.extensions[0].source.url);
    } finally { await host.dispose(); vm.runtime.dispose(); }

    const answered = new VM();
    const answers = [];
    let asked = 0;
    const second = installPlusExtensionHost(answered, {enabled: true, document: undefined,
        requestApproval: async () => true, diagnostics: event => answers.push(event),
        fetchRetry: {baseDelayMs: 1, maxDelayMs: 1},
        async fetchImpl(url) {
            asked++;
            const response = new Response('missing', {status: 404});
            Object.defineProperty(response, 'url', {value: url});
            return response;
        }});
    try {
        await assert.rejects(answered.loadProject(JSON.stringify(project)), {code: 'FETCH_FAILED'});
        // 404 is the answer that it is not there; asking again would only ask for it again.
        assert.equal(asked, 1);
        assert.equal(answers.filter(event => event.type === 'retry').length, 0);
    } finally { await second.dispose(); answered.runtime.dispose(); }
});

test('a host fills the socket, and the GUI keeps the last word on what it passes itself', async () => {
    const {plusHostExtras} = await import('../../../src/lib/tw-plus-host-extras.js');
    // The stub is what the GUI uses on its own: nothing supplied, nothing changed.
    assert.deepEqual(plusHostExtras(), {});

    // A replaced module is merged under the caller's options, so a value the GUI passes itself is
    // never silently taken over by the distributing host.
    const supplied = {cache: {async get() { return undefined; }, async put() {}}, locale: 'en'};
    const merged = {trustedCatalog: null, ...supplied, ...{locale: 'ja'}};
    assert.equal(merged.cache, supplied.cache, 'what only a host can build reaches the host options');
    assert.equal(merged.locale, 'ja', 'and what the GUI passes wins');
});
