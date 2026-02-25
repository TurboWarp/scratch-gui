import React from 'react';
import PropTypes from 'prop-types';
import {FormattedMessage} from 'react-intl';
import {APP_NAME} from '../../lib/brand.js';
import styles from './fileEdit.css';

const DEFINITELY_EXECUTABLE = [
    // Entries should be lowercase and without leading period.
    // We use this list to show a stronger security warning; it is not otherwise load-bearing for security.
    // Thus a file extension missing from this list is a bug we want to fix, but not a security bug that
    // would be eligible for a bounty.

    // Windows executable formats
    'exe',
    'msi',
    'msix',
    'msixbundle',
    'com',
    'scf',
    'scr',
    'sct',
    'dll',
    'appx',
    'appxbundle',
    'reg',
    'iso',
    'drv',
    'sys',

    // Mac executable formats
    'app',
    'dmg',
    'pkg',

    // Unix executable formats
    'so',
    'a',
    'run',
    'appimage',
    'deb',
    'rpm',
    'snap',
    'flatpakref',

    // Cross-platform executable formats
    'jar',

    // Browser extensions
    'crx',
    'xpi',

    // Shortcuts
    'url',
    'webloc',
    'inetloc',
    'lnk',

    // Windows scripting languages
    'bat',
    'cmd',
    'ps1',
    'psm1',
    'asp',
    'vbs',
    'vbe',
    'ws',
    'wsf',
    'wsc',
    'ahk',

    // Microsoft Office macros
    'docm',
    'dotm',
    'xlm',
    'xlsm',
    'xltm',
    'xla',
    'xlam',
    'pptm',
    'potm',
    'ppsm',
    'sldm',

    // Unix scripting languages
    'sh',

    // Common cross-platform languages with interpreters that could be executed by double clicking on the file
    'js',
    'py'
];

/**
 * @param {string} name Name of file
 * @returns {boolean} True indicates definitely dangerous. False does not mean safe.
 */
const isDefinitelyExecutable = name => {
    const parts = name.split('.');
    const extension = parts.length > 1 ? parts.pop().toLowerCase() : null;
    return extension !== null && DEFINITELY_EXECUTABLE.includes(extension);
};

const FileName = props => {
    const MAX_NAME_LENGTH = 80;
    const MAX_EXTENSION_LENGTH = 30;

    const parts = props.name.split('.');
    let extension = parts.length > 1 ? parts.pop() : null;
    let name = parts.join('.');

    if (name.length > MAX_NAME_LENGTH) {
        name = `${name.substring(0, MAX_NAME_LENGTH)}[...]`;
    }
    if (extension && extension.length > MAX_EXTENSION_LENGTH) {
        extension = `[...]${extension.substring(extension.length - MAX_EXTENSION_LENGTH)}`;
    }

    if (extension === null) {
        return (
            <span className={styles.fileName}>
                {props.name}
            </span>
        );
    }

    return (
        <span className={styles.fileName}>
            <span className={styles.name}>
                {name}
            </span>
            <span className={styles.dot}>
                {'.'}
            </span>
            <span className={styles.extension}>
                {extension}
            </span>
        </span>
    );
};

FileName.propTypes = {
    name: PropTypes.string.isRequired
};

const DownloadModal = props => (
    <div>
        <p>
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="The project wants to modify the file: {name}, on your computer."
                description="Part of modal when a project attempts to edit a file on someone's computer"
                id="tw.download.file"
                values={{
                    name: (
                        <FileName name={props.name} />
                    )
                }}
            />
        </p>

        <p>
            <FormattedMessage
                // eslint-disable-next-line max-len
                defaultMessage="This file has not been reviewed by the {APP_NAME} developers."
                description="Part of modal when a project attempts to edit a file on someone's computer"
                id="tw.download.danger"
                values={{
                    APP_NAME
                }}
            />
        </p>

        {isDefinitelyExecutable(props.name) && (
            <p>
                <FormattedMessage
                    // eslint-disable-next-line max-len
                    defaultMessage="This is an executable file format that may contain malicious code if you run it."
                    description="Part of modal when a project attempts to edit a file on someone's computer"
                    id="tw.download.executable"
                    values={{
                        APP_NAME
                    }}
                />
            </p>
        )}
    </div>
);

DownloadModal.propTypes = {
    name: PropTypes.string.isRequired
};

export default DownloadModal;
