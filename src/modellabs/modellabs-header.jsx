import React, {useEffect, useState} from 'react';

import logo from './logo.jpg';
import styles from './modellabs-header.css';

const getLessonId = () => {
    const params = new URLSearchParams(window.location.search);
    return params.get('lesson') || 'les-01';
};

const ModellabsHeader = () => {
    const [deviceState, setDeviceState] = useState({
        connected: false,
        firmwareVersion: '',
        lastError: ''
    });

    useEffect(() => {
        const handleDeviceState = event => {
            setDeviceState(event.detail);
        };

        window.addEventListener(
            'modellabs-device-state',
            handleDeviceState
        );

        return () => {
            window.removeEventListener(
                'modellabs-device-state',
                handleDeviceState
            );
        };
    }, []);

    const statusText = deviceState.connected ?
        `Verbonden · v${deviceState.firmwareVersion}` :
        'Apparaat niet verbonden';

    return (
        <header className={styles.header}>
            <div className={styles.brand}>
                <img
                    className={styles.logo}
                    src={logo}
                />

                <div className={styles.lesson}>
                    {getLessonId()}
                </div>
            </div>

            <div className={styles.actions}>
                <span
                    className={`${styles.status} ${
                        deviceState.connected ?
                            styles.statusConnected :
                            styles.statusDisconnected
                    }`}
                >
                    {statusText}
                </span>

                <button className={styles.button}>
                    Opslaan
                </button>

                <button className={styles.primaryButton}>
                    Volgende
                </button>
            </div>
        </header>
    );
};

export default ModellabsHeader;