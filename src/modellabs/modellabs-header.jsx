import React, {useEffect, useState} from 'react';

import {getCurrentLesson} from './lesson-config';
import logo from './logo.jpg';
import styles from './modellabs-header.css';

const ModellabsHeader = () => {
    const lesson = getCurrentLesson();

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

    const goToLesson = lessonId => {
        if (!lessonId) {
            return;
        }

        const url = new URL(window.location.href);

        url.searchParams.set('lesson', lessonId);
        window.location.assign(url.toString());
    };

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

                <div className={styles.lessonInfo}>
                    <div className={styles.lessonNumber}>
                        {lesson.number}
                    </div>

                    <div className={styles.lessonTitle}>
                        {lesson.title}
                    </div>
                </div>
            </div>

            <div className={styles.actions}>
                <button
                    className={styles.button}
                    disabled={!lesson.previous}
                    onClick={() => goToLesson(lesson.previous)}
                >
                    Terug
                </button>

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

                <button
                    className={styles.primaryButton}
                    disabled={!lesson.next}
                    onClick={() => goToLesson(lesson.next)}
                >
                    Volgende
                </button>
            </div>
        </header>
    );
};

export default ModellabsHeader;