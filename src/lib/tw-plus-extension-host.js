import {extensionProjectArchiveOptions} from '../config/extension-project-limits.js';
import JSZip from '@turbowarp/jszip';
import {isExtensionLoaderEnabled} from '../config/extension-loader-flag.js';
import {createExtensionLoader, createFetchPort, DEFAULT_FETCH_RETRY} from '@kubohiroya/turbowarp-extension-loader';
import {createProjectIO} from '@kubohiroya/turbowarp-extension-loader/project-codec';
import {createSessionTrustProvider} from '@kubohiroya/turbowarp-extension-loader/session-trust';
import {createMemoryContentCache} from '@kubohiroya/turbowarp-extension-loader/memory-cache';
import {createVMExtensionRegistrar} from './tw-plus-extension-registrar.js';
import {installExtensionLoader} from './tw-plus-project-loader.js';
import {createPlusPermissionUI} from './tw-plus-permission-ui.js';
import {createExtensionAuthoringController, setExtensionAuthoringHost} from './tw-plus-extension-authoring.js';
import {createDigestTrustedCatalog, plusTrustedCatalog} from './tw-plus-trusted-extensions.js';
import {plusHostExtras} from './tw-plus-host-extras.js';

// Snapshot before any project is opened; later URL changes cannot toggle this host.
const startupSearch = globalThis.location ? globalThis.location.search : '';

/** Host-controlled wiring shared by the Editor and bundled HTML runtime. */
export function installPlusExtensionHost (vm, {
    enabled = false, document = globalThis.document, locale = 'ja', fetchImpl = globalThis.fetch,
    cache, requestApproval, diagnostics: report, loaderOptions, hostPolicy, trustedCatalog = null, trustedDigests,
    fetchRetry
} = {}) {
    if (enabled !== true) return Object.freeze({enabled: false, dispose: async () => {}});
    // A single HTML has no catalog to read; its build embeds the digests the catalog lists.
    const trusted = trustedCatalog === null && Array.isArray(trustedDigests) ?
        createDigestTrustedCatalog(trustedDigests) : trustedCatalog;
    const ui = createPlusPermissionUI(document, locale);
    const diagnostics = event => {
        ui.diagnostics(event);
        if (report) report(event);
    };
    // The host owns the retry settings, so only the host can say which attempt of how many this
    // is. The Loader reports the retry it is about to wait for; the attempt it leads to is next.
    const retry = {...DEFAULT_FETCH_RETRY, ...fetchRetry};
    const onRetry = ({url, attempt, delayMs}) => diagnostics({
        type: 'retry',
        attempt: attempt + 1,
        attempts: retry.retries + 1,
        delayMs,
        message: url
    });
    const projectIO = createProjectIO({zip: JSZip, ...extensionProjectArchiveOptions});
    const approve = requestApproval || ui.requestApproval;
    const trustProvider = createSessionTrustProvider({hostPolicy,
        // Catalog-listed code is trusted like TurboWarp's official gallery and needs no separate approval.
        requestApproval: async (code, options) =>
            (trusted !== null && await trusted.isTrustedCode(code)) || approve(code, options)});
    const ports = {
        embeddedReader: projectIO.embeddedReader,
        fetcher: createFetchPort(fetchImpl, {...retry, onRetry}),
        cache: cache || createMemoryContentCache(),
        trustProvider,
        registrar: createVMExtensionRegistrar(vm),
        diagnostics
    };
    const loader = createExtensionLoader(ports, loaderOptions);
    const authoring = createExtensionAuthoringController(vm, {ports, diagnostics, loaderOptions});
    let uninstall;
    try {
        uninstall = installExtensionLoader({vm, projectIO, transactionalRegistration: true,
            onDiagnostic: diagnostics, onProjectLoadStart: authoring.projectLoadStarted}, loader);
    } catch (error) {
        authoring.dispose();
        ui.dispose();
        trustProvider.revokeAll();
        throw error;
    }
    setExtensionAuthoringHost(vm, authoring);
    let disposal;
    return Object.freeze({
        enabled: true, loader, projectIO, authoring,
        dispose () {
            if (!disposal) {
                setExtensionAuthoringHost(vm, null);
                authoring.dispose();
                ui.dispose();
                trustProvider.revokeAll();
                disposal = Promise.resolve(uninstall()).then(() => loader.unload());
            }
            return disposal;
        }
    });
}

export function startupPlusExtensionHost (vm, options = {}) {
    const search = options.search === undefined ? startupSearch : options.search;
    // Whatever a host supplied sits under the caller's own options, so this function's callers
    // inside the GUI keep the last word on everything they pass.
    return installPlusExtensionHost(vm, {trustedCatalog: plusTrustedCatalog, ...plusHostExtras(), ...options,
        enabled: isExtensionLoaderEnabled(search || '')});
}

export const isPlusPermissionDenied = error => error && ['TRUST_DENIED', 'CANCELLED'].includes(error.code);
