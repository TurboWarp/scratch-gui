/**
 * General error while loading project.
 */
class LoadProjectError extends Error {
    constructor (message) {
        super(message);
        this.name = 'LoadProjectError';
    }
}

/**
 * Could not get a project token from trampoline.
 */
class ProjectUnsharedError extends LoadProjectError {
    constructor (message) {
        super(message);
        this.name = 'ProjectUnsharedError';
    }
}

/**
 * We got a valid token from trampoline, but the project ultimately failed to be fetched from Scratch.
 */
class ProjectFetchError extends LoadProjectError {
    constructor (message) {
        super(message);
        this.name = 'ProjectFetchError';
    }
}

/**
 * Project is unavailable for legal reasons (HTTP 451), e.g. a copyright claim.
 */
class ProjectUnavailableLegalReasons extends LoadProjectError {
    /**
     * @param {string} message Error message
     * @param {string|null} moreUrl URL with more information about why the project is unavailable, if any.
     */
    constructor (message, moreUrl) {
        super(message);
        this.name = 'ProjectUnavailableLegalReasons';
        this.moreUrl = moreUrl;
    }
}

export {
    LoadProjectError,
    ProjectUnsharedError,
    ProjectFetchError,
    ProjectUnavailableLegalReasons
};
