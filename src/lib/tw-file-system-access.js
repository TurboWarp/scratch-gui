/**
 * Chromium 157 on Windows cancels the new file pickers with an AbortError if the file dialog
 * fully covers the browser window (e.g. the user maximized it), even after the user picks a file.
 * Other platforms don't mark the browser window as occluded by its own file dialog.
 * Hopefully this is temporary?
 * @returns {boolean} True if this browser is affected
 */
const hasChromium157FilePickerBug = () => {
    if (!navigator.userAgent.includes('Windows')) {
        return false;
    }
    const chromeMatch = navigator.userAgent.match(/Chrome\/(\d+)/);
    // Add an upper bound when Chrome fixes it...
    return !!chromeMatch && Number(chromeMatch[1]) >= 157;
};

/**
 * @returns {boolean} True if this browser's file pickers are known to be broken.
 */
const hasBrokenFilePickers = () => {
    // Android's strict MIME type restrictions on the new file picker API is unusable for us.
    if (navigator.userAgent.includes('Android')) {
        return true;
    }

    return hasChromium157FilePickerBug();
};

/**
 * @returns {Function|null} window.showOpenFilePicker, or null if it shouldn't be used.
 */
const getShowOpenFilePicker = () => {
    if (typeof window.showOpenFilePicker !== 'function' || hasBrokenFilePickers()) {
        return null;
    }
    return window.showOpenFilePicker.bind(window);
};

/**
 * @returns {Function|null} window.showSaveFilePicker, or null if it shouldn't be used.
 */
const getShowSaveFilePicker = () => {
    if (typeof window.showSaveFilePicker !== 'function' || hasBrokenFilePickers()) {
        return null;
    }
    return window.showSaveFilePicker.bind(window);
};

export {
    hasChromium157FilePickerBug,
    getShowOpenFilePicker,
    getShowSaveFilePicker
};
