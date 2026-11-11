import React from 'react';
import {isScratchDesktop} from '../../lib/isScratchDesktop';
import {hasChromium157FilePickerBug} from '../../lib/tw-file-system-access';
import CloseButton from '../close-button/close-button.jsx';
import styles from './tw-news.css';

const LOCAL_STORAGE_KEY = 'tw:closedNews';
const NEWS_ID = 'chromium-file-pickers';

const newsAppliesToUser = () => hasChromium157FilePickerBug();

const NewsBody = () => (
    <div
        className={styles.text}
        lang="en"
    >
        <div>
            {/* eslint-disable-next-line max-len */}
            {'The latest version of Chrome and Edge has a bug that broke our open and save file dialogs.'}
        </div>
        <div>
            {/* eslint-disable-next-line max-len */}
            {'Until they fix it, saving projects will always download a new copy of your project instead of overwriting the original file.'}
        </div>
    </div>
);

const getIsClosedInLocalStorage = () => {
    try {
        return localStorage.getItem(LOCAL_STORAGE_KEY) === NEWS_ID;
    } catch (e) {
        return false;
    }
};

const markAsClosedInLocalStorage = () => {
    try {
        localStorage.setItem(LOCAL_STORAGE_KEY, NEWS_ID);
    } catch (e) {
        // ignore
    }
};

class TWNews extends React.Component {
    constructor (props) {
        super(props);
        this.state = {
            closed: getIsClosedInLocalStorage() || !newsAppliesToUser()
        };
        this.handleClose = this.handleClose.bind(this);
    }
    handleClose () {
        markAsClosedInLocalStorage();
        this.setState({
            closed: true
        }, () => {
            window.dispatchEvent(new Event('resize'));
        });
    }
    render () {
        if (this.state.closed || isScratchDesktop()) {
            return null;
        }
        return (
            <div className={styles.news}>
                <NewsBody />
                <CloseButton
                    className={styles.close}
                    onClick={this.handleClose}
                />
            </div>
        );
    }
}

export default TWNews;
