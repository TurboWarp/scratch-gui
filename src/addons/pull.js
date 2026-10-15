/**
 * Copyright (C) 2021-2026 Thomas Weber
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License version 3 as
 * published by the Free Software Foundation.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

/* eslint-disable import/no-commonjs */
/* eslint-disable import/no-nodejs-modules */
/* eslint-disable no-console */
/* global __dirname */

const fs = require('node:fs');
const childProcess = require('node:child_process');
const pathUtil = require('node:path');
const {addons, newAddons} = require('./addons.js');

/**
 * @param {string} dir Directory path
 * @returns {string[]} All files in the directory
 */
const walk = dir => {
    const children = fs.readdirSync(dir);
    const files = [];
    for (const child of children) {
        const path = pathUtil.join(dir, child);
        const stat = fs.statSync(path);
        if (stat.isDirectory()) {
            const childChildren = walk(path);
            for (const childChild of childChildren) {
                files.push(pathUtil.join(child, childChild));
            }
        } else {
            files.push(child);
        }
    }
    return files;
};

/**
 * @param {string} path Possible symlink
 * @returns {boolean} True if a symlink
 */
const isSymbolicLink = path => {
    try {
        const stat = fs.lstatSync(path);
        return stat.isSymbolicLink();
    } catch (e) {
        return false;
    }
};

const repoPath = pathUtil.resolve(__dirname, 'ScratchAddons');
if (!process.argv.includes('-') && !isSymbolicLink(repoPath)) {
    fs.rmSync(repoPath, {
        recursive: true,
        force: true
    });
    childProcess.execSync(`git clone --depth=1 --branch=tw https://github.com/TurboWarp/addons ${repoPath}`);
}

for (const folder of ['addons', 'addons-l10n', 'addons-l10n-settings', 'libraries']) {
    const path = pathUtil.resolve(__dirname, folder);
    fs.rmSync(path, {
        recursive: true,
        force: true
    });
    fs.mkdirSync(path, {
        recursive: true
    });
}

const generatedPath = pathUtil.resolve(__dirname, 'generated');
fs.rmSync(generatedPath, {
    recursive: true,
    force: true
});
fs.mkdirSync(generatedPath, {
    recursive: true
});

const commitHash = childProcess
    .execSync('git rev-parse --short HEAD', {
        cwd: fs.realpathSync(repoPath)
    })
    .toString()
    .trim();

class GeneratedImports {
    constructor () {
        this.source = '';
        this.namespaces = new Map();
    }

    add (src, namespace) {
        // Convert Windows \ to / in paths.
        src = src.replace(/\\/g, '/');

        namespace = namespace.replace(/[^\w\d_]/g, '_');

        const count = this.namespaces.get(namespace) || 1;
        this.namespaces.set(namespace, count + 1);

        // All identifiers start with _ as otherwise debugger and 2d_color_picker would be invalid
        let importName = `_${namespace}`;
        if (count !== 1) {
            importName += `${count}`;
        }

        this.source += `import ${importName} from ${JSON.stringify(src)};\n`;
        return importName;
    }

    toString () {
        return this.source;
    }
}

/**
 * @param {string} relativePath Path relative to /libraries
 */
const includeLibrary = relativePath => {
    const oldLibraryPath = pathUtil.resolve(__dirname, 'ScratchAddons', 'libraries', relativePath);
    const newLibraryPath = pathUtil.resolve(__dirname, 'libraries', relativePath);
    const libraryContents = fs.readFileSync(oldLibraryPath, 'utf-8');
    const newLibraryDirName = pathUtil.dirname(newLibraryPath);
    fs.mkdirSync(newLibraryDirName, {
        recursive: true
    });
    fs.writeFileSync(newLibraryPath, libraryContents);
};

/**
 * @param {string} js JS source
 */
const includeLibrariesJS = js => {
    // Parse things like:
    // import { normalizeHex, getHexRegex } from "../../libraries/normalize-color.js";
    //                                                            ^^^^^^^^^^^^^^^^^^   capture group 1
    // import RateLimiter from "../../libraries/rate-limiter.js";
    //                                          ^^^^^^^^^^^^^^^   capture group 1
    // import "../../libraries/thirdparty/cs/chart.min.js";
    //                         ^^^^^^^^^^^^^^^^^^^^^^^^^^   capture group 1
    const matches = js.matchAll(
        /import +(?:(?:{.*}|.*) +from +)?["']\.\.\/\.\.\/libraries\/([\w\d_./-]+(?:\.esm)?\.js)["'];/g
    );
    for (const match of matches) {
        includeLibrary(match[1]);
    }
};

/**
 * @param {string} css CSS source
 */
const includeLibrariesCSS = css => {
    // Parse things like:
    // @import url("../../libraries/common/cs/react-tooltip.css");
    //                              ^^^^^^^^^^^^^^^^^^^^^^^^^^^   capture group 1
    const matches = css.matchAll(
        /@import url\("\.\.\/\.\.\/libraries\/([\w\d./-]+)"\)/g
    );
    for (const match of matches) {
        includeLibrary(match[1]);
    }
};

/**
 * @param {string} js Original JS
 * @returns {string} Modified JS
 */
const includePolyfills = js => {
    if (js.includes('EventTarget')) {
        js = `import EventTarget from "../../event-target.js"; /* inserted by pull.js */\n\n${js}`;
    }
    return js;
};

/**
 * @param {string} addonId Addon ID
 * @param {string} js JS source code
 */
const warnOnUnimplementedJS = (addonId, js) => {
    /* eslint-disable max-len */

    if (js.includes('data-addon-id')) {
        console.warn(`Warning: ${addonId} seems to use data-addon-id. It should use [data-addons*=...] instead.`);
    }

    if (js.includes('addon.self.dir')) {
        console.warn(`Warning: ${addonId} contains un-rewritten addon.self.dir. This script should be modified so that it will be rewritten.`);
    }

    if (js.includes('import.meta.dir')) {
        console.warn(`Warning: ${addonId} contains un-rewritten import.meta.dir. This script should be modified so that it will be rewritten.`);
    }

    /* eslint-enable max-len */
};

/**
 * @param {string} js Original JS
 * @returns {string} Modified JS
 */
const rewriteAssetImports = js => {
    // Rewrite addon.self.dir concatenation to call runtime function.

    // Rewrite things like:
    // el.src = addon.self.dir + "/" + name + ".svg";
    //          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^  match
    //                           ^^^^^^^^^^^^^^^^^^^  capture group 1
    js = js.replace(
        /addon\.self\.(?:dir|lib) *\+ *([^;,\n]+)/g,
        (_fullText, name) => `addon.self.getResource(${name}) /* rewritten by pull.js */`
    );

    // Rewrite things like:
    // `${addon.self.dir}/${name}.svg`
    //                   ^^^^^^^^^^^^  capture group 1
    js = js.replace(
        /`\${addon\.self\.(?:dir|lib)}([^`]+)`/g,
        (_fullText, name) => `addon.self.getResource(\`${name}\`) /* rewritten by pull.js */`
    );

    // Rewrite things like:
    // src: import.meta.url + "/../../../images/cs/close-s3.svg",
    //      ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^   match
    //                             ^^^^^^^^^^^^^^^^^^^^^^^^^^^^   capture group 1
    // We ignore the first ../ because that's just deleting the file's own name to get to the dir
    js = js.replace(
        /import\.meta\.url ?\+ ?"\/\.\.\/([\w.-/-]+)"/g,
        (_fullText, name) => `addon.self.getResource("${name}") /* rewritten by pull.js */`
    );

    return js;
};

/**
 * @param {string} addonId Addon ID
 * @param {*} manifest Modified in-place
 */
const normalizeManifest = (addonId, manifest) => {
    const KEEP_TAGS = [
        'recommended',
        'theme',
        'beta',
        'danger'
    ];
    manifest.tags = manifest.tags.filter(i => KEEP_TAGS.includes(i));
    if (newAddons.includes(addonId)) {
        manifest.tags.push('new');
    }

    // Properties we never display
    delete manifest.versionAdded;
    delete manifest.latestUpdate;
    delete manifest.libraries;
    delete manifest.injectAsStyleElt;
    delete manifest.updateUserstylesOnSettingsChange;
    delete manifest.presetPreview;
    delete manifest.relatedAddons;

    // All addons have dynamic enable, so the property is redundant
    delete manifest.dynamicEnable;

    // Only include userscripts/styles that would run on project pages
    const filterUserscriptsOrStyles = scripts => scripts
        .filter(({matches}) => matches.includes('projects') || matches.includes('https://scratch.mit.edu/projects/*'))
        .map(obj => ({
            url: obj.url,
            if: obj.if
        }));
    if (manifest.userscripts) {
        manifest.userscripts = filterUserscriptsOrStyles(manifest.userscripts);
    }
    if (manifest.userstyles) {
        manifest.userstyles = filterUserscriptsOrStyles(manifest.userstyles);
    }

    if (manifest.credits) {
        for (const user of manifest.credits) {
            if (user.link && !user.link.startsWith('https://scratch.mit.edu/')) {
                console.warn(`Warning: ${addonId} contains unsafe credit link: ${user.link}`);
            }

            delete user.note;
            delete user.id;
        }
    }
};

/**
 * @param {string} addonId Addon ID
 * @param {*} manifest Addon manifest
 * @returns {string} JS for the manifest
 */
const generateManifestEntry = (addonId, manifest) => {
    const trimmedManifest = structuredClone(manifest);
    delete trimmedManifest.enabledByDefaultMobile;
    delete trimmedManifest.permissions;

    let result = '/* generated by pull.js */\n';
    result += `const manifest = ${JSON.stringify(trimmedManifest, null, 2)};\n`;

    // Various special overrides to the JSON ...

    if (typeof manifest.enabledByDefaultMobile === 'boolean') {
        result += 'import {isMobile} from "../../environment";\n';
        result += `if (isMobile) manifest.enabledByDefault = ${manifest.enabledByDefaultMobile};\n`;
    }

    if (manifest.permissions && manifest.permissions.includes('clipboardWrite')) {
        result += 'import {clipboardSupported} from "../../environment";\n';
        result += 'if (!clipboardSupported) manifest.unsupported = true;\n';
    }

    if (addonId === 'mediarecorder') {
        result += 'import {mediaRecorderSupported} from "../../environment";\n';
        result += 'if (!mediaRecorderSupported) manifest.unsupported = true;\n';
    }

    if (addonId === 'tw-disable-cloud-variables') {
        result += 'import {isScratchDesktop} from "../../../lib/isScratchDesktop";\n';
        result += 'if (isScratchDesktop()) manifest.unsupported = true;\n';
    }

    result += 'export default manifest;\n';
    return result;
};

/**
 * @param {string} addonId Addon ID
 * @param {*} manifest Addon manifest
 * @param {string[]} assets Names of non-code assets that should also be imported
 * @returns {string} JS entry
 */
const generateRuntimeEntry = (addonId, manifest, assets) => {
    const importSection = new GeneratedImports();
    let exportSection = 'export const resources = {\n';

    for (const userscript of manifest.userscripts || []) {
        const src = userscript.url;
        const importName = importSection.add(`./${src}`, 'js');
        exportSection += `  ${JSON.stringify(src)}: ${importName},\n`;
    }

    for (const userstyle of manifest.userstyles || []) {
        const src = userstyle.url;
        const importName = importSection.add(`!css-loader!./${src}`, 'css');
        exportSection += `  ${JSON.stringify(src)}: ${importName},\n`;
    }

    for (const assetName of assets) {
        const importName = importSection.add(`!url-loader!./${assetName}`, 'asset');
        exportSection += `  ${JSON.stringify(assetName)}: ${importName},\n`;
    }

    exportSection += '};\n';
    let result = '/* generated by pull.js */\n';
    result += importSection.toString();
    result += exportSection;
    return result;
};

/**
 * @type {Record<string, *>}
 */
const addonIdToManifest = {};

/**
 * @param {string} addonId Addon ID
 * @param {string} oldDirectory ScratchAddons source directory
 * @param {string} newDirectory scratch-gui destination directory
 */
const processAddon = (addonId, oldDirectory, newDirectory) => {
    const files = walk(oldDirectory);

    const ASSET_EXTENSIONS = [
        '.svg',
        '.png'
    ];
    const assets = files.filter(file => ASSET_EXTENSIONS.some(extension => file.endsWith(extension)));

    for (const file of files) {
        const oldPath = pathUtil.join(oldDirectory, file);
        let contents = fs.readFileSync(oldPath);

        const newPath = pathUtil.join(newDirectory, file);
        fs.mkdirSync(pathUtil.dirname(newPath), {
            recursive: true
        });

        if (file === 'addon.json') {
            contents = contents.toString('utf-8');
            const parsedManifest = JSON.parse(contents);
            normalizeManifest(addonId, parsedManifest);
            addonIdToManifest[addonId] = parsedManifest;

            const settingsEntryPath = pathUtil.join(newDirectory, '_manifest_entry.js');
            fs.writeFileSync(settingsEntryPath, generateManifestEntry(addonId, parsedManifest));

            const runtimeEntryPath = pathUtil.join(newDirectory, '_runtime_entry.js');
            fs.writeFileSync(runtimeEntryPath, generateRuntimeEntry(addonId, parsedManifest, assets));
            continue;
        }

        if (file.endsWith('.js') || file.endsWith('.css')) {
            contents = contents.toString('utf-8');

            if (file.endsWith('.js')) {
                includeLibrariesJS(contents);
                contents = includePolyfills(contents);
                contents = rewriteAssetImports(contents);
                warnOnUnimplementedJS(addonId, contents);
            }

            if (file.endsWith('.css')) {
                includeLibrariesCSS(contents);
            }
        }

        fs.writeFileSync(newPath, contents);
    }
};

const SKIP_MESSAGES = [
    '_general/meta/addonSettings',
    '_general/meta/managedBySa',
    '_locale',
    '_locale_name',
    'debugger/@settings-name-log_max_list_length',
    'debugger/log-msg-list-append-too-long',
    'debugger/log-msg-list-insert-too-long',
    'debugger/@settings-name-log_invalid_cloud_data',
    'debugger/log-cloud-data-nan',
    'debugger/log-cloud-data-too-long',
    'editor-devtools/extension-description-not-for-addon',
    'mediarecorder/added-by',
    'editor-theme3/@settings-name-sa-color',
    'editor-theme3/@settings-name-forums',
    'editor-theme3/@info-disablesMenuBar',
    'editor-theme3/@info-aboutHighContrast',
    'editor-theme3/@settings-name-monitors',
    'block-switching/@settings-name-sa',
    'custom-menu-bar/@credits-dropdown',
    'custom-menu-bar/@credits-tutorials-button',
    'custom-menu-bar/@info-tutorials-button-update',
    'custom-menu-bar/@settings-name-compact-username',
    'custom-menu-bar/@settings-name-hide-tutorials-button',
    'custom-menu-bar/@settings-name-my-stuff'
];

/**
 * @param {string} localeRoot ScratchAddons locale root
 * @returns {{settings: *, runtime: *, upstreamMessageIds: Set<string>}} Generated locales
 */
const parseMessageDirectory = localeRoot => {
    const unstructure = string => {
        if (typeof string === 'object') {
            return string.string;
        }
        return string;
    };

    const settings = {};
    const runtime = {};
    const upstreamMessageIds = new Set();

    for (const addon of ['_general', ...addons]) {
        const path = pathUtil.join(localeRoot, `${addon}.json`);
        try {
            const contents = fs.readFileSync(path, 'utf-8');
            const parsed = JSON.parse(contents);
            for (const id of Object.keys(parsed).sort()) {
                upstreamMessageIds.add(id);
                if (SKIP_MESSAGES.includes(id)) {
                    continue;
                }

                // Messages ending with /@update are temporary notices describing what's new.
                // We don't show them.
                if (id.endsWith('/@update')) {
                    continue;
                }

                const value = unstructure(parsed[id]);
                if (id.includes('/@')) {
                    settings[id] = value;
                } else {
                    runtime[id] = value;
                }
            }
        } catch (e) {
            // Ignore errors caused by file not existing.
            if (e.code !== 'ENOENT') {
                throw e;
            }
        }
    }

    return {
        settings,
        runtime,
        upstreamMessageIds
    };
};

const generateEntries = (items, callback) => {
    let exportSection = 'export default {\n';
    const importSection = new GeneratedImports();
    for (const i of items) {
        const {src, name, type} = callback(i);
        if (type === 'lazy-import') {
            // eslint-disable-next-line max-len
            exportSection += `  ${JSON.stringify(i)}: () => import(/* webpackChunkName: ${JSON.stringify(name)} */ ${JSON.stringify(src)}),\n`;
        } else if (type === 'lazy-require') {
            exportSection += `  ${JSON.stringify(i)}: () => require(${JSON.stringify(src)}),\n`;
        } else if (type === 'eager-import') {
            const importName = importSection.add(src, i);
            exportSection += `  ${JSON.stringify(i)}: ${importName},\n`;
        } else {
            throw new Error(`Unknown type: ${type}`);
        }
    }
    exportSection += '};\n';
    let result = '/* generated by pull.js */\n';
    result += importSection.toString();
    result += exportSection;
    return result;
};

const generateL10nEntries = locales => generateEntries(
    locales.filter(i => i !== 'en'),
    locale => ({
        name: `addon-l10n-${locale}`,
        src: `../addons-l10n/${locale}.json`,
        type: 'lazy-import'
    })
);

const generateL10nSettingsEntries = locales => generateEntries(
    locales.filter(i => i !== 'en'),
    locale => ({
        src: `../addons-l10n-settings/${locale}.json`,
        type: 'lazy-require'
    })
);

const generateRuntimeEntries = () => generateEntries(
    addons,
    id => {
        const manifest = addonIdToManifest[id];
        return {
            src: `../addons/${id}/_runtime_entry.js`,
            // Include default addons in a single bundle
            name: manifest.enabledByDefault ? 'addon-default-entry' : `addon-entry-${id}`,
            // Include default addons useful outside of the editor in the original bundle, no request required
            type: (manifest.enabledByDefault && !manifest.editorOnly) ? 'lazy-require' : 'lazy-import'
        };
    }
);

const generateManifestEntries = () => generateEntries(
    addons,
    id => ({
        src: `../addons/${id}/_manifest_entry.js`,
        type: 'eager-import'
    })
);

for (const addon of addons) {
    const oldDirectory = pathUtil.resolve(__dirname, 'ScratchAddons', 'addons', addon);
    const newDirectory = pathUtil.resolve(__dirname, 'addons', addon);
    processAddon(addon, oldDirectory, newDirectory);
}

const l10nFiles = fs.readdirSync(pathUtil.resolve(__dirname, 'ScratchAddons', 'addons-l10n'));
const languages = [];
const allUpstreamMessageIds = new Set();
for (const file of l10nFiles) {
    const oldDirectory = pathUtil.resolve(__dirname, 'ScratchAddons', 'addons-l10n', file);
    // Ignore README
    if (!fs.statSync(oldDirectory).isDirectory()) {
        continue;
    }
    // Convert pt-br to just pt
    const fixedName = file === 'pt-br' ? 'pt' : file;
    languages.push(fixedName);
    const runtimePath = pathUtil.resolve(__dirname, 'addons-l10n', `${fixedName}.json`);
    const settingsPath = pathUtil.resolve(__dirname, 'addons-l10n-settings', `${fixedName}.json`);
    const {settings, runtime, upstreamMessageIds} = parseMessageDirectory(oldDirectory);
    for (const id of upstreamMessageIds) {
        allUpstreamMessageIds.add(id);
    }
    fs.writeFileSync(runtimePath, JSON.stringify(runtime, null, 4));
    if (fixedName !== 'en') {
        fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 4));
    }
}

for (const id of SKIP_MESSAGES) {
    if (!allUpstreamMessageIds.has(id)) {
        console.warn(`Warning: Translation ${id} is in SKIP_MESSAGES but does not exist`);
    }
}

fs.writeFileSync(pathUtil.resolve(generatedPath, 'l10n-entries.js'), generateL10nEntries(languages));
fs.writeFileSync(pathUtil.resolve(generatedPath, 'l10n-settings-entries.js'), generateL10nSettingsEntries(languages));
fs.writeFileSync(pathUtil.resolve(generatedPath, 'addon-entries.js'), generateRuntimeEntries(languages));
fs.writeFileSync(pathUtil.resolve(generatedPath, 'addon-manifests.js'), generateManifestEntries(languages));

const upstreamMetaPath = pathUtil.resolve(generatedPath, 'upstream-meta.json');
fs.writeFileSync(upstreamMetaPath, JSON.stringify({
    commit: commitHash
}));
