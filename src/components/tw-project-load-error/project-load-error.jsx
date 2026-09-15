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

const Link = ({href}) => (
    <a
        className={styles.link}
        href={href}
        target="_blank"
        rel="noopener noreferrer"
    >
        {href}
    </a>
);

Link.propTypes = {
    href: PropTypes.string.isRequired
};

const handleReload = () => {
    window.location.reload();
};

const UnsharedMessage = () => (
    <React.Fragment>
        <p className={styles.header}>
            <FormattedMessage
                defaultMessage="Unshared projects are not visible."
                description="Appears on unshared projects"
                id="tw.unshared3.1"
            />
        </p>
        <p>
            <FormattedMessage
                defaultMessage="For more information, visit: {link}"
                description="Appears on unshared projects"
                id="tw.unshared.2"
                values={{
                    link: <Link href={UNSHARED_DOCS} />
                }}
            />
        </p>
        <p>
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="If the project was shared recently, this message may appear incorrectly for up to {minutes} minutes."
                description="Appears on unshared projects. {minutes} is replaced with a number such as 30."
                id="tw.unshared.cache2"
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
                defaultMessage="Project unavailable"
                description="Title of page shown when a project is unavailable due to a copyright claim"
                id="tw.legalReason.title"
            />
        </p>
        <p>
            <FormattedMessage
                defaultMessage="This project is unavailable due to a copyright claim."
                description="Message shown when a project is unavailable due to a copyright claim"
                id="tw.legalReason.description"
            />
        </p>
        {moreUrl && isSafeURL(moreUrl) && (
            <p>
                <FormattedMessage
                    defaultMessage="For more information, visit: {link}"
                    description="Appears on unshared projects"
                    id="tw.unshared.2"
                    values={{
                        link: <Link href={moreUrl} />
                    }}
                />
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
