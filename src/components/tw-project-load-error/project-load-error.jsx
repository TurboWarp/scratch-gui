import classNames from 'classnames';
import PropTypes from 'prop-types';
import React from 'react';
import {FormattedMessage} from 'react-intl';
import Box from '../box/box.jsx';
import {ProjectUnavailableLegalReasons, ProjectUnsharedError} from '../../lib/tw-load-project-error';

import styles from './project-load-error.css';

const UNSHARED_DOCS = 'https://docs.turbowarp.org/unshared-projects';

const isSafeURL = url => {
    try {
        const parsed = new URL(url);
        return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch (e) {
        return false;
    }
};

const Link = ({href, children}) => (
    <a
        className={styles.link}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
    >
        {children || href}
    </a>
);

Link.propTypes = {
    children: PropTypes.node,
    href: PropTypes.string.isRequired
};

const handleReload = () => {
    window.location.reload();
};

const UnsharedMessage = () => (
    <React.Fragment>
        <p className={styles.header}>
            <FormattedMessage
                defaultMessage="This project is unshared."
                description="Title of page shown when a project is unshared"
                id="tw.unshared3.1"
            />
        </p>
        <p>
            <FormattedMessage
                defaultMessage="Make sure you entered the right project ID or URL."
                description="Appears on unshared projects. People often mistype the project number."
                id="tw.unshared.wrongId"
            />
        </p>
        <p>
            <FormattedMessage
                defaultMessage="If it was shared recently, it may take up to {minutes} minutes to load here."
                description="Appears on unshared projects. {minutes} is replaced with a number such as 30."
                id="tw.unshared3.cache"
                values={{
                    minutes: 30
                }}
            />
        </p>
        <p>
            <FormattedMessage
                defaultMessage="If this project is actually shared, please report a bug."
                description="Appears on unshared projects"
                id="tw.unshared.bug"
            />
        </p>
        <p>
            <Link href={UNSHARED_DOCS}>
                <FormattedMessage
                    defaultMessage="Learn more about unshared projects"
                    description="Link to documentation about unshared projects"
                    id="tw.unshared3.learnMore"
                />
            </Link>
        </p>
        <button
            className={styles.button}
            onClick={handleReload}
        >
            <FormattedMessage
                defaultMessage="Reload"
                description="Button to reload the page when page crashes"
                id="gui.crashMessage.reload"
            />
        </button>
    </React.Fragment>
);

const UnavailableLegalReasonsMessage = ({moreUrl}) => (
    <React.Fragment>
        <p className={styles.header}>
            <FormattedMessage
                defaultMessage="This project is unavailable due to a copyright claim."
                description="Title of page shown when a project is unavailable due to a copyright claim"
                id="tw.legalReason.title"
            />
        </p>
        {moreUrl && isSafeURL(moreUrl) && (
            <p>
                <Link href={moreUrl}>
                    <FormattedMessage
                        defaultMessage="Read the notice"
                        description="Link to the copyright notice that caused a project to be unavailable"
                        id="tw.legalReason.notice"
                    />
                </Link>
            </p>
        )}
    </React.Fragment>
);

UnavailableLegalReasonsMessage.propTypes = {
    moreUrl: PropTypes.string
};

/**
 * @param {unknown} error The error that stopped the project from loading.
 * @returns {boolean} true if ProjectLoadError has a friendly message for this error.
 */
const isKnownProjectLoadError = error => (
    error instanceof ProjectUnsharedError ||
    error instanceof ProjectUnavailableLegalReasons
);

const ProjectLoadError = ({error, isFullScreen}) => (
    <div
        className={classNames(styles.wrapper, {
            [styles.fullScreen]: isFullScreen
        })}
    >
        <Box className={styles.body}>
            {error instanceof ProjectUnavailableLegalReasons ? (
                <UnavailableLegalReasonsMessage moreUrl={error.moreUrl} />
            ) : (
                <UnsharedMessage />
            )}
        </Box>
    </div>
);

ProjectLoadError.propTypes = {
    error: PropTypes.instanceOf(Error).isRequired,
    isFullScreen: PropTypes.bool
};

export {
    ProjectLoadError as default,
    isKnownProjectLoadError
};
