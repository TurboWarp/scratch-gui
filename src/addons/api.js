/**
 * Copyright (C) 2021 Thomas Weber
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

import IntlMessageFormat from 'intl-messageformat';
import SettingsStore from './settings-store-singleton';
import dataURLToBlob from '../lib/data-uri-to-blob';
import EventTargetShim from './event-target';
import AddonHooks from './hooks';
import addons from './generated/addon-manifests';
import addonMessages from './addons-l10n/en.json';
import l10nEntries from './generated/l10n-entries';
import addonEntries from './generated/addon-entries';
import {addContextMenu} from './contextmenu';
import * as modal from './modal';
import * as textColorHelpers from './libraries/common/cs/text-color.esm.js';
import * as conditionalStyles from './conditional-style';
import getPrecedence from './addon-precedence';
import reduxInstance from './redux';

/* eslint-disable no-console */

const escapeHTML = str => str.replace(/([<>'"&])/g, (_, l) => `&#${l.charCodeAt(0)};`);
const kebabCaseToCamelCase = str => str.replace(/-([a-z])/g, g => g[1].toUpperCase());

let _scratchClassNames = null;
const getScratchClassNames = () => {
    if (_scratchClassNames) {
        return _scratchClassNames;
    }
    const cssRules = Array.from(document.styleSheets)
        // Ignore some scratch-paint stylesheets
        .filter(styleSheet => (
            !(
                styleSheet.ownerNode.textContent.startsWith(
                    '/* DO NOT EDIT\n@todo This file is copied from GUI and should be pulled out into a shared library.'
                ) &&
                (
                    styleSheet.ownerNode.textContent.includes('input_input-form') ||
                    styleSheet.ownerNode.textContent.includes('label_input-group_')
                )
            )
        ))
        .map(e => {
            try {
                return [...e.cssRules];
            } catch (_e) {
                return [];
            }
        })
        .flat();
    const classes = cssRules
        .map(e => e.selectorText)
        .filter(e => e)
        .map(e => e.match(/(([\w-]+?)_([\w-]+)_([\w\d-]+))/g))
        .filter(e => e)
        .flat();
    _scratchClassNames = [...new Set(classes)];
    const observer = new MutationObserver(mutationList => {
        for (const mutation of mutationList) {
            for (const node of mutation.addedNodes) {
                if (node.tagName === 'STYLE') {
                    _scratchClassNames = null;
                    observer.disconnect();
                    return;
                }
            }
        }
    });
    observer.observe(document.head, {
        childList: true
    });
    return _scratchClassNames;
};

let _mutationObserver;
let _mutationObserverCallbacks = [];
const addMutationObserverCallback = newCallback => {
    if (!_mutationObserver) {
        _mutationObserver = new MutationObserver(() => {
            for (const cb of _mutationObserverCallbacks) {
                cb();
            }
        });
        _mutationObserver.observe(document.documentElement, {
            attributes: false,
            childList: true,
            subtree: true
        });
    }
    _mutationObserverCallbacks.push(newCallback);
};
const removeMutationObserverCallback = callback => {
    _mutationObserverCallbacks = _mutationObserverCallbacks.filter(i => i !== callback);
};

const getEditorMode = () => {
    // eslint-disable-next-line no-use-before-define
    const mode = reduxInstance.state.scratchGui.mode;
    if (mode.isEmbedded) return 'embed';
    if (mode.isFullScreen) return 'fullscreen';
    if (mode.isPlayerOnly) return 'projectpage';
    return 'editor';
};

/**
 * @returns {string} Locale code
 */
const getLocale = () => {
    const locale = reduxInstance.state.locales.locale;
    if (Object.prototype.hasOwnProperty.call(l10nEntries, locale)) {
        return locale;
    }
    return locale.split('-')[0];
};
const language = getLocale();

const getTranslations = async () => {
    if (Object.prototype.hasOwnProperty.call(l10nEntries, language)) {
        const localeMessages = await l10nEntries[language]();
        Object.assign(addonMessages, localeMessages);
    }
};
const addonMessagesPromise = getTranslations();

const untilInEditor = () => {
    if (
        !reduxInstance.state.scratchGui.mode.isPlayerOnly ||
        reduxInstance.state.scratchGui.mode.isEmbedded
    ) {
        return;
    }
    return new Promise(resolve => {
        const handler = () => {
            if (!reduxInstance.state.scratchGui.mode.isPlayerOnly) {
                resolve();
                reduxInstance.removeEventListener('statechanged', handler);
            }
        };
        reduxInstance.initialize();
        reduxInstance.addEventListener('statechanged', handler);
    });
};

const getDisplayNoneWhileDisabledClass = id => `addons-display-none-${id}`;

const parseArguments = code => code
    .split(/(?=[^\\]%[nbs])/g)
    .map(i => i.trim())
    .filter(i => i.charAt(0) === '%')
    .map(i => i.substring(0, 2));
const fixDisplayName = displayName => displayName.replace(/([^\s])(%[nbs])/g, (_, before, arg) => `${before} ${arg}`);
const compareArrays = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let _firstAddBlockRan = false;

const contextMenuCallbacks = [];
const CONTEXT_MENU_ORDER = ['editor-devtools', 'block-switching', 'blocks2image', 'swap-local-global'];
let createdAnyBlockContextMenus = false;

const updateClasses = () => {
    const state = reduxInstance.state;
    const isSmallStage = state.scratchGui.stageSize.stageSize === 'small';
    const isFullScreen = state.scratchGui.mode.isFullScreen;
    const isPlayerOnly = state.scratchGui.mode.isPlayerOnly;
    document.body.classList.toggle('sa-small-stage', isSmallStage && !isFullScreen && !isPlayerOnly);
    document.body.classList.toggle('sa-body-editor', !isPlayerOnly || isFullScreen);
};
reduxInstance.addEventListener('statechanged', e => {
    if (
        e.detail.action.type === 'scratch-gui/StageSize/SET_STAGE_SIZE' ||
        e.detail.action.type === 'scratch-gui/mode/SET_FULL_SCREEN' ||
        e.detail.action.type === 'scratch-gui/mode/SET_PLAYER'
    ) {
        updateClasses();
    }
});
updateClasses();

const getInternalKey = element => Object.keys(element).find(key => key.startsWith('__reactInternalInstance$'));

class Tab extends EventTargetShim {
    constructor (id) {
        super();
        this._id = id;
        this._seenElements = new WeakSet();
        // traps is public API
        this.traps = {
            get vm () {
                return reduxInstance.state.scratchGui.vm;
            },
            getBlockly: () => {
                if (AddonHooks.blockly) {
                    return Promise.resolve(AddonHooks.blockly);
                }
                return new Promise(resolve => {
                    AddonHooks.blocklyCallbacks.push(() => resolve(AddonHooks.blockly));
                });
            },
            getWorkspace: () => AddonHooks.blocklyWorkspace,
            getPaper: async () => {
                const modeSelector = await this.waitForElement("[class*='paint-editor_mode-selector']", {
                    reduxCondition: state => (
                        state.scratchGui.editorTab.activeTabIndex === 1 && !state.scratchGui.mode.isPlayerOnly
                    )
                });
                const reactInternalKey = Object.keys(modeSelector)
                    .find(key => key.startsWith('__reactInternalInstance$'));
                const internalState = modeSelector[reactInternalKey].child;
                // .tool or .blob.tool only exists on the selected tool
                let toolState = internalState;
                let tool;
                while (toolState) {
                    const toolInstance = toolState.child.stateNode;
                    if (toolInstance.tool) {
                        tool = toolInstance.tool;
                        break;
                    }
                    if (toolInstance.blob && toolInstance.blob.tool) {
                        tool = toolInstance.blob.tool;
                        break;
                    }
                    toolState = toolState.sibling;
                }
                if (tool) {
                    const paperScope = tool._scope;
                    return paperScope;
                }
                throw new Error('cannot find paper :(');
            },
            getInternalKey
        };
    }

    get redux () {
        return reduxInstance;
    }

    waitForElement (selector, {markAsSeen = false, condition, reduxCondition, reduxEvents} = {}) {
        let externalEventSatisfied = true;
        const evaluateCondition = () => {
            if (!externalEventSatisfied) return false;
            if (condition && !condition()) return false;
            if (reduxCondition && !reduxCondition(reduxInstance.state)) return false;
            return true;
        };

        if (evaluateCondition()) {
            const firstQuery = document.querySelectorAll(selector);
            for (const element of firstQuery) {
                if (this._seenElements.has(element)) continue;
                if (markAsSeen) this._seenElements.add(element);
                return Promise.resolve(element);
            }
        }

        let reduxListener;
        if (reduxEvents) {
            externalEventSatisfied = false;
            reduxListener = ({detail}) => {
                const type = detail.action.type;
                // As addons can't run before DOM exists here, ignore fontsLoaded/SET_FONTS_LOADED
                // Otherwise, as our font loading is very async, we could activate more often than required.
                if (reduxEvents.includes(type) && type !== 'fontsLoaded/SET_FONTS_LOADED') {
                    externalEventSatisfied = true;
                }
            };
            this.redux.initialize();
            this.redux.addEventListener('statechanged', reduxListener);
        }

        return new Promise(resolve => {
            const callback = () => {
                if (!evaluateCondition()) {
                    return;
                }
                const elements = document.querySelectorAll(selector);
                for (const element of elements) {
                    if (this._seenElements.has(element)) continue;
                    resolve(element);
                    removeMutationObserverCallback(callback);
                    if (markAsSeen) this._seenElements.add(element);
                    if (reduxListener) {
                        this.redux.removeEventListener('statechanged', reduxListener);
                    }
                    break;
                }
            };
            addMutationObserverCallback(callback);
        });
    }

    appendToSharedSpace ({space, element, order, scope}) {
        const q = document.querySelector.bind(document);
        const SHARED_SPACES = {
            stageHeader: {
                // Non-fullscreen stage header only
                element: () => q("[class^='stage-header_stage-size-row']"),
                from: () => [],
                until: () => [
                    // Small/big stage buttons (for editor mode)
                    q("[class^='stage-header_stage-size-toggle-group']"),
                    // Full screen icon (for player mode)
                    q("[class^='stage-header_stage-size-row']").lastChild
                ]
            },
            fullscreenStageHeader: {
                // Upstream uses sa-spacer for this one, but we don't need to
                // Fullscreen stage header only
                element: () => q("[class^='stage-header_fullscreen-buttons-row_']"),
                from: () => [],
                until: () => [q("[class^='stage-header_fullscreen-buttons-row_']").lastChild]
            },
            afterGreenFlag: {
                element: () => q("[class^='controls_controls-container']"),
                from: () => [],
                until: () => [q("[class^='stop-all_stop-all']")]
            },
            afterStopButton: {
                element: () => q("[class^='controls_controls-container']"),
                from: () => [q("[class^='stop-all_stop-all']")],
                until: () => []
            },
            afterSoundTab: {
                element: () => q("[class^='react-tabs_react-tabs__tab-list']"),
                from: () => [q("[class^='react-tabs_react-tabs__tab-list']").children[2]],
                // Element used in find-bar addon
                until: () => [q('.sa-find-bar')]
            },
            assetContextMenuAfterExport: {
                element: () => scope,
                from: () => Array.prototype.filter.call(
                    scope.children,
                    c => c.textContent === this.scratchMessage('gui.spriteSelectorItem.contextMenuExport')
                ),
                until: () => Array.prototype.filter.call(
                    scope.children,
                    c => c.textContent === this.scratchMessage('gui.spriteSelectorItem.contextMenuDelete')
                )
            },
            assetContextMenuAfterDelete: {
                element: () => scope,
                from: () => Array.prototype.filter.call(
                    scope.children,
                    c => c.textContent === this.scratchMessage('gui.spriteSelectorItem.contextMenuDelete')
                ),
                until: () => []
            },
            monitor: {
                element: () => scope,
                from: () => {
                    const endOfVanilla = [
                        this.scratchMessage('gui.monitor.contextMenu.large'),
                        this.scratchMessage('gui.monitor.contextMenu.slider'),
                        this.scratchMessage('gui.monitor.contextMenu.sliderRange'),
                        this.scratchMessage('gui.monitor.contextMenu.export')
                    ];
                    const potential = Array.prototype.filter.call(
                        scope.children,
                        c => endOfVanilla.includes(c.textContent)
                    );
                    return [potential[potential.length - 1]];
                },
                until: () => []
            },
            paintEditorZoomControls: {
                element: () => (
                    q('.sa-paintEditorZoomControls-wrapper') ||
                      (() => {
                          const wrapper = Object.assign(document.createElement('div'), {
                              className: 'sa-paintEditorZoomControls-wrapper'
                          });
          
                          wrapper.style.display = 'flex';
                          wrapper.style.flexDirection = 'row-reverse';
                          wrapper.style.height = 'calc(1.95rem + 2px)';
          
                          const zoomControls = q("[class^='paint-editor_zoom-controls']");
          
                          zoomControls.replaceWith(wrapper);
                          wrapper.appendChild(zoomControls);
          
                          return wrapper;
                      })()
                ),
                from: () => [],
                until: () => []
            }
        };

        const spaceInfo = SHARED_SPACES[space];
        const spaceElement = spaceInfo.element();
        if (!spaceElement) return false;
        const from = spaceInfo.from();
        const until = spaceInfo.until();

        element.dataset.saSharedSpaceOrder = order;

        let foundFrom = false;
        if (from.length === 0) foundFrom = true;

        // insertAfter = element whose nextSibling will be the new element
        // -1 means append at beginning of space (prepend)
        // This will stay null if we need to append at the end of space
        let insertAfter = null;

        const children = Array.from(spaceElement.children);
        for (const indexString of children.keys()) {
            const child = children[indexString];
            const i = Number(indexString);

            // Find either element from "from" before doing anything
            if (!foundFrom) {
                if (from.includes(child)) {
                    foundFrom = true;
                    // If this is the last child, insertAfter will stay null
                    // and the element will be appended at the end of space
                }
                continue;
            }

            if (until.includes(child)) {
                // This is the first SA element appended to this space
                // If from = [] then prepend, otherwise append after
                // previous child (likely a "from" element)
                if (i === 0) insertAfter = -1;
                else insertAfter = children[i - 1];
                break;
            }

            if (child.dataset.saSharedSpaceOrder) {
                if (Number(child.dataset.saSharedSpaceOrder) > order) {
                    // We found another SA element with higher order number
                    // If from = [] and this is the first child, prepend.
                    // Otherwise, append before this child.
                    if (i === 0) insertAfter = -1;
                    else insertAfter = children[i - 1];
                    break;
                }
            }
        }

        if (!foundFrom) return false;
        // It doesn't matter if we didn't find an "until"

        if (insertAfter === null) {
            // This might happen with until = []
            spaceElement.appendChild(element);
        } else if (insertAfter === -1) {
            // This might happen with from = []
            spaceElement.prepend(element);
        } else {
            // Works like insertAfter but using insertBefore API.
            // nextSibling cannot be null because insertAfter
            // is always set to children[i-1], so it must exist
            spaceElement.insertBefore(element, insertAfter.nextSibling);
        }
        return true;
    }

    addBlock (procedureCode, {args, displayName, callback}) {
        const procCodeArguments = parseArguments(procedureCode);
        if (args.length !== procCodeArguments.length) {
            throw new Error('Procedure code and argument list do not match');
        }

        if (displayName) {
            displayName = fixDisplayName(displayName);
            const displayNameArguments = parseArguments(displayName);
            if (!compareArrays(procCodeArguments, displayNameArguments)) {
                console.warn(`displayName ${displayName} for ${procedureCode} has invalid arguments, ignoring it.`);
                displayName = procedureCode;
            }
        } else {
            displayName = procedureCode;
        }

        const wrappedCallback = (a, util) => callback(a, util.thread);

        const vm = this.traps.vm;
        vm.addAddonBlock({
            procedureCode,
            arguments: args,
            callback: wrappedCallback,
            // Ignored by VM but used by scratch-blocks traps
            displayName
        });

        if (!_firstAddBlockRan) {
            _firstAddBlockRan = true;

            this.traps.getBlockly().then(ScratchBlocks => {
                const BlockSvg = ScratchBlocks.BlockSvg;
                const oldUpdateColour = BlockSvg.prototype.updateColour;
                BlockSvg.prototype.updateColour = function (...args2) {
                    // procedures_prototype also has a procedure code but we do not want to color them.
                    if (!this.isInsertionMarker() && this.type === 'procedures_call') {
                        const block = this.procCode_ && vm.runtime.getAddonBlock(this.procCode_);
                        if (block) {
                            const theme = reduxInstance.state.scratchGui.theme.theme;
                            const colors = theme.getBlockColors().addons;
                            this.colour_ = colors.primary;
                            this.colourSecondary_ = colors.secondary;
                            this.colourTertiary_ = colors.tertiary;
                            this.colourQuaternary_ = colors.quaternary;

                            // do not show edit button
                            this.customContextMenu = null;
                        }
                    }
                    return oldUpdateColour.call(this, ...args2);
                };
                const originalCreateAllInputs = ScratchBlocks.Blocks.procedures_call.createAllInputs_;
                ScratchBlocks.Blocks.procedures_call.createAllInputs_ = function (...args2) {
                    const block = this.procCode_ && vm.runtime.getAddonBlock(this.procCode_);
                    if (block && block.displayName) {
                        const originalProcCode = this.procCode_;
                        this.procCode_ = block.displayName;
                        const ret = originalCreateAllInputs.call(this, ...args2);
                        this.procCode_ = originalProcCode;
                        return ret;
                    }
                    return originalCreateAllInputs.call(this, ...args2);
                };
                if (vm.editingTarget) {
                    vm.emitWorkspaceUpdate();
                }
            });
        }
    }

    getCustomBlock (procedureCode) {
        const vm = this.traps.vm;
        return vm.getAddonBlock(procedureCode);
    }

    createBlockContextMenu (callback, {workspace = false, blocks = false, flyout = false, comments = false} = {}) {
        contextMenuCallbacks.push({addonId: this._id, callback, workspace, blocks, flyout, comments});
        contextMenuCallbacks.sort((b, a) => (
            CONTEXT_MENU_ORDER.indexOf(b.addonId) - CONTEXT_MENU_ORDER.indexOf(a.addonId)
        ));

        if (createdAnyBlockContextMenus) return;
        createdAnyBlockContextMenus = true;

        this.traps.getBlockly().then(ScratchBlocks => {
            const oldShow = ScratchBlocks.ContextMenu.show;
            ScratchBlocks.ContextMenu.show = function (event, items, rtl) {
                const gesture = ScratchBlocks.mainWorkspace.currentGesture_;
                const block = gesture.targetBlock_;

                // eslint-disable-next-line no-shadow
                for (const {callback, workspace, blocks, flyout, comments} of contextMenuCallbacks) {
                    const injectMenu =
                        // Workspace
                        (workspace && !block && !gesture.flyout_ && !gesture.startBubble_) ||
                        // Block in workspace
                        (blocks && block && !gesture.flyout_) ||
                        // Block in flyout
                        (flyout && gesture.flyout_) ||
                        // Comments
                        (comments && gesture.startBubble_);
                    if (injectMenu) {
                        try {
                            items = callback(items, block);
                        } catch (e) {
                            console.error('Error while calling context menu callback: ', e);
                        }
                    }
                }

                oldShow.call(this, event, items, rtl);

                const blocklyContextMenu = ScratchBlocks.WidgetDiv.DIV.firstChild;
                items.forEach((item, i) => {
                    if (i !== 0 && item.separator) {
                        const itemElt = blocklyContextMenu.children[i];
                        itemElt.style.padding = '0';
                        itemElt.style.borderTop = '1px solid var(--ui-black-transparent)';
                        itemElt.classList.add('sa-blockly-menu-item-border');
                    }
                });
            };
        });
    }

    createEditorContextMenu (callback, options) {
        addContextMenu(this, callback, options);
    }

    copyImage (dataURL) {
        if (!navigator.clipboard.write) {
            return Promise.reject(new Error('Clipboard API not supported'));
        }
        const items = [
            // eslint-disable-next-line no-undef
            new ClipboardItem({
                'image/png': dataURLToBlob(dataURL)
            })
        ];
        return navigator.clipboard.write(items);
    }

    scratchMessage (id) {
        return reduxInstance.state.locales.messages[id];
    }

    scratchClassReady () {
        // they are always ready
        return Promise.resolve();
    }

    scratchClass (...args) {
        const scratchClasses = getScratchClassNames();
        const classes = [];
        for (const arg of args) {
            if (typeof arg === 'string') {
                for (const scratchClass of scratchClasses) {
                    if (scratchClass.startsWith(`${arg}_`) && scratchClass.length === arg.length + 6) {
                        classes.push(scratchClass);
                        break;
                    }
                }
            }
        }
        const options = args[args.length - 1];
        if (typeof options === 'object') {
            const others = Array.isArray(options.others) ? options.others : [options.others];
            for (const className of others) {
                classes.push(className);
            }
        }
        return classes.join(' ');
    }

    get editorMode () {
        return getEditorMode();
    }

    displayNoneWhileDisabled (el, options) {
        el.classList.add(getDisplayNoneWhileDisabledClass(this._id));

        if (options && options.display) {
            el.style.display = options.display;
        }
    }

    get direction () {
        return this.redux.state.locales.isRtl ? 'rtl' : 'ltr';
    }

    createModal (title, {isOpen = false} = {}) {
        return modal.createEditorModal(this, title, {isOpen});
    }

    confirm (...args) {
        return modal.confirm(this, ...args);
    }

    prompt (...args) {
        return modal.prompt(this, ...args);
    }

    recolorable () {
        // this is some pretty awful code that makes a *lot* of assumptions about how addons work

        const image = document.createElement('img');

        let svg = '';
        const updateRealSrc = () => {
            const newSrc = svg.replace(/#855cd6/gi, window.Recolor.primary);
            const nativeSrcSetter = Object.getOwnPropertyDescriptor(window.HTMLImageElement.prototype, 'src').set;
            nativeSrcSetter.call(image, `data:image/svg+xml;,${encodeURIComponent(newSrc)}`);
        };

        Object.defineProperty(image, 'src', {
            get: () => {
                // return the 'original' source, roughly
                if (!svg) return '';
                return `data:image/svg+xml;,${encodeURIComponent(svg)}`;
            },
            set: newSrc => {
                // we assume it is a base64-encoded data: URI that is supported by atob()
                const base64 = newSrc.split(';base64,')[1];
                svg = atob(base64);
                updateRealSrc();
            }
        });

        // this leaks memory if an addon creates these disposably
        AddonHooks.recolorCallbacks.push(updateRealSrc);

        return image;
    }
}

class Settings extends EventTargetShim {
    constructor (addonId, manifest) {
        super();
        this._addonId = addonId;
        this._manifest = manifest;
    }

    get (id) {
        return SettingsStore.getAddonSetting(this._addonId, id);
    }
}

class Self extends EventTargetShim {
    constructor (id, getResource) {
        super();
        this.id = id;
        this.disabled = false;
        this.getResource = getResource;
    }
}

class AddonRunner {
    constructor (id) {
        AddonRunner.instances.push(this);
        const manifest = addons[id];

        this.id = id;
        this.manifest = manifest;
        this.messageCache = {};
        this.loading = true;

        /**
         * @type {Record<string, unknown>}
         */
        this.resources = null;

        this.publicAPI = {
            global,
            console,
            addon: {
                tab: new Tab(id),
                settings: new Settings(id, manifest),
                self: new Self(id, this.getResource.bind(this))
            },
            msg: this.msg.bind(this),
            safeMsg: this.safeMsg.bind(this)
        };
    }

    _msg (key, vars, handler) {
        const namespacedKey = key.startsWith('/') ? key.substring(1) : `${this.id}/${key}`;
        if (this.messageCache[namespacedKey]) {
            return this.messageCache[namespacedKey].format(vars);
        }
        let translation = addonMessages[namespacedKey];
        if (!translation) {
            return namespacedKey;
        }
        if (handler) {
            translation = handler(translation);
        }
        const messageFormat = new IntlMessageFormat(translation, language);
        this.messageCache[namespacedKey] = messageFormat;
        return messageFormat.format(vars);
    }

    msg (key, vars) {
        return this._msg(key, vars, null);
    }

    safeMsg (key, vars) {
        return this._msg(key, vars, escapeHTML);
    }

    getResource (path) {
        const withoutSlash = path.substring(1);
        const url = this.resources[withoutSlash];
        if (typeof url !== 'string') {
            throw new Error(`Unknown asset: ${path}`);
        }
        return url;
    }

    updateAllStyles () {
        conditionalStyles.updateAll();
        this.updateCssVariables();
    }

    updateCssVariables () {
        const addonId = kebabCaseToCamelCase(this.id);

        if (this.manifest.settings) {
            for (const setting of this.manifest.settings) {
                const settingId = setting.id;
                const cssProperty = `--${addonId}-${kebabCaseToCamelCase(settingId)}`;
                const value = this.publicAPI.addon.settings.get(settingId);
                document.documentElement.style.setProperty(cssProperty, value);
            }
        }

        if (this.manifest.customCssVariables) {
            for (const variable of this.manifest.customCssVariables) {
                const name = variable.name;
                const cssProperty = `--${addonId}-${name}`;
                const value = variable.value;
                const evaluated = this.evaluateCustomCssVariable(value);
                document.documentElement.style.setProperty(cssProperty, evaluated);
            }
        }
    }

    evaluateCustomCssVariable (variable) {
        if (typeof variable !== 'object' || variable === null) {
            return variable;
        }
        switch (variable.type) {
        case 'alphaBlend': {
            const opaqueSource = this.evaluateCustomCssVariable(variable.opaqueSource);
            const transparentSource = this.evaluateCustomCssVariable(variable.transparentSource);
            return textColorHelpers.alphaBlend(opaqueSource, transparentSource);
        }
        case 'alphaThreshold': {
            const source = this.evaluateCustomCssVariable(variable.source);
            const alpha = textColorHelpers.parseHex(source).a;
            const threshold = this.evaluateCustomCssVariable(variable.threshold) || 0.5;
            if (alpha >= threshold) {
                return this.evaluateCustomCssVariable(variable.opaque);
            }
            return this.evaluateCustomCssVariable(variable.transparent);
        }
        case 'brighten': {
            const source = this.evaluateCustomCssVariable(variable.source);
            return textColorHelpers.brighten(source, variable);
        }
        case 'makeHsv': {
            const h = this.evaluateCustomCssVariable(variable.h);
            const s = this.evaluateCustomCssVariable(variable.s);
            const v = this.evaluateCustomCssVariable(variable.v);
            return textColorHelpers.makeHsv(h, s, v);
        }
        case 'map': {
            return variable.options[this.evaluateCustomCssVariable(variable.source)];
        }
        case 'multiply': {
            const hex = this.evaluateCustomCssVariable(variable.source);
            return textColorHelpers.multiply(hex, variable);
        }
        case 'recolorFilter': {
            const source = this.evaluateCustomCssVariable(variable.source);
            return textColorHelpers.recolorFilter(source);
        }
        case 'settingValue': {
            return this.publicAPI.addon.settings.get(variable.settingId);
        }
        case 'ternary': {
            const condition = this.evaluateCustomCssVariable(variable.source);
            return this.evaluateCustomCssVariable(condition ? variable.true : variable.false);
        }
        case 'textColor': {
            const hex = this.evaluateCustomCssVariable(variable.source);
            const black = this.evaluateCustomCssVariable(variable.black);
            const white = this.evaluateCustomCssVariable(variable.white);
            const threshold = this.evaluateCustomCssVariable(variable.threshold);
            return textColorHelpers.textColor(hex, black, white, threshold);
        }
        }
        console.warn(`Unknown customCssVariable`, variable);
        return '#000000';
    }

    settingsChanged () {
        this.updateAllStyles();
        this.publicAPI.addon.settings.dispatchEvent(new CustomEvent('change'));
    }

    dynamicEnable () {
        if (this.loading) {
            return;
        }

        // This order is important. We need to update styles before calling the addon's dynamic
        // toggle event. We also need to update `disabled` before we can update styles because
        // the ConditionalStyle callbacks are implemented using the API.
        this.publicAPI.addon.self.disabled = false;
        this.updateAllStyles();
        this.publicAPI.addon.self.dispatchEvent(new CustomEvent('reenabled'));
    }

    dynamicDisable () {
        if (this.loading) {
            return;
        }

        // See comment in dynamicEnable().
        this.publicAPI.addon.self.disabled = true;
        this.updateAllStyles();
        this.publicAPI.addon.self.dispatchEvent(new CustomEvent('disabled'));
    }

    async run () {
        if (this.manifest.editorOnly) {
            await untilInEditor();
        }

        const mod = await addonEntries[this.id]();
        this.resources = mod.resources;

        if (!this.manifest.noTranslations) {
            await addonMessagesPromise;
        }

        // Multiply by big number because the first userstyle is + 0, second is + 1, third is + 2, etc.
        // This number just has to be larger than the maximum number of userstyles in a single addon.
        const baseStylePrecedence = getPrecedence(this.id) * 100;

        if (this.manifest.userstyles) {
            for (let i = 0; i < this.manifest.userstyles.length; i++) {
                const userstyle = this.manifest.userstyles[i];
                const userstylePrecedence = baseStylePrecedence + i;
                const userstyleCondition = () => (
                    !this.publicAPI.addon.self.disabled &&
                    SettingsStore.evaluateCondition(this.id, userstyle.if)
                );

                for (const [moduleId, cssText] of this.resources[userstyle.url]) {
                    const sheet = conditionalStyles.create(moduleId, cssText);
                    sheet.addDependent(this.id, userstylePrecedence, userstyleCondition);
                }
            }

        }

        const disabledCSS = `.${getDisplayNoneWhileDisabledClass(this.id)}{display:none !important;}`;
        const disabledStylesheet = conditionalStyles.create(`_disabled/${this.id}`, disabledCSS);
        disabledStylesheet.addDependent(this.id, baseStylePrecedence, () => this.publicAPI.addon.self.disabled);

        this.updateCssVariables();

        if (this.manifest.userscripts) {
            for (const userscript of this.manifest.userscripts) {
                if (!SettingsStore.evaluateCondition(userscript.if)) {
                    continue;
                }
                const fn = this.resources[userscript.url];
                fn(this.publicAPI);
            }
        }

        this.loading = false;
    }
}
AddonRunner.instances = [];

const runAddon = addonId => {
    const runner = new AddonRunner(addonId);
    runner.run();
};

SettingsStore.addEventListener('addon-changed', e => {
    const addonId = e.detail.addonId;
    const runner = AddonRunner.instances.find(i => i.id === addonId);
    if (runner) {
        runner.settingsChanged();
    }
    if (e.detail.dynamicEnable) {
        if (runner) {
            runner.dynamicEnable();
        } else {
            runAddon(addonId);
        }
    } else if (e.detail.dynamicDisable) {
        if (runner) {
            runner.dynamicDisable();
        }
    }
});

for (const id of Object.keys(addons)) {
    if (!SettingsStore.getAddonEnabled(id)) {
        continue;
    }
    runAddon(id);
}
