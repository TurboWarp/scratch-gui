import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import log from './log';

import {setProjectTitle} from '../reducers/project-title';
import {setAuthor, setDescription} from '../reducers/tw';
import {ProjectUnavailableLegalReasons} from './tw-load-project-error';

export const fetchProjectMeta = async projectId => {
    // When people reopen tabs, sometimes the browser is *very* aggressive about caching even when the
    // trampoline says not to, so we're going to try putting a cache buster in here.
    const cacheBuster = `?rudebuster=${Math.random()}`;
    const urls = [
        `https://trampoline.turbowarp.org/api/projects/${projectId}${cacheBuster}`,
        `https://trampoline.turbowarp.xyz/api/projects/${projectId}${cacheBuster}`
    ];
    let firstError;
    for (const url of urls) {
        try {
            const res = await fetch(url);
            const data = await res.json();
            if (res.ok) {
                return data;
            }
            if (res.status === 451) {
                throw new ProjectUnavailableLegalReasons('Project is unavailable for legal reasons', data.url);
            }
            if (res.status === 404) {
                throw new Error('Project is probably unshared');
            }
            throw new Error(`Unexpected status code: ${res.status}`);
        } catch (err) {
            // Mirror would get the same error so don't try again
            if (err instanceof ProjectUnavailableLegalReasons) {
                throw err;
            }
            if (!firstError) {
                firstError = err;
            }
        }
    }
    throw firstError;
};

const getNoIndexTag = () => document.querySelector('meta[name="robots"][content="noindex"]');
const setIndexable = indexable => {
    if (indexable) {
        const tag = getNoIndexTag();
        if (tag) {
            tag.remove();
        }
    } else if (!getNoIndexTag()) {
        const tag = document.createElement('meta');
        tag.name = 'robots';
        tag.content = 'noindex';
        document.head.appendChild(tag);
    }
};

const TWProjectMetaFetcherHOC = function (WrappedComponent) {
    class ProjectMetaFetcherComponent extends React.Component {
        componentDidUpdate (prevProps) {
            // project title resetting is handled in titled-hoc.jsx
            if (this.props.reduxProjectId !== prevProps.reduxProjectId) {
                this.props.onSetAuthor('', '');
                this.props.onSetDescription('', '');
                const projectId = this.props.reduxProjectId;

                if (projectId === '0') {
                    // don't try to get metadata
                } else {
                    fetchProjectMeta(projectId).then(data => {
                        // If project ID changed, ignore the results.
                        if (this.props.reduxProjectId !== projectId) {
                            return;
                        }

                        const title = data.title;
                        if (title) {
                            this.props.onSetProjectTitle(title);
                        }
                        const authorName = data.author.username;
                        const authorThumbnail = `https://trampoline.turbowarp.org/avatars/${data.author.id}`;
                        this.props.onSetAuthor(authorName, authorThumbnail);
                        const instructions = data.instructions || '';
                        const credits = data.description || '';
                        if (instructions || credits) {
                            this.props.onSetDescription(instructions, credits);
                        }
                        setIndexable(true);
                    })
                        .catch(err => {
                            setIndexable(false);
                            log.warn('cannot fetch project meta', err);
                        });
                }
            }
        }
        render () {
            const {
                /* eslint-disable no-unused-vars */
                reduxProjectId,
                onSetAuthor,
                onSetDescription,
                onSetProjectTitle,
                /* eslint-enable no-unused-vars */
                ...props
            } = this.props;
            return (
                <WrappedComponent
                    {...props}
                />
            );
        }
    }
    ProjectMetaFetcherComponent.propTypes = {
        reduxProjectId: PropTypes.string,
        onSetAuthor: PropTypes.func,
        onSetDescription: PropTypes.func,
        onSetProjectTitle: PropTypes.func
    };
    const mapStateToProps = state => ({
        reduxProjectId: state.scratchGui.projectState.projectId
    });
    const mapDispatchToProps = dispatch => ({
        onSetAuthor: (username, thumbnail) => dispatch(setAuthor({
            username,
            thumbnail
        })),
        onSetDescription: (instructions, credits) => dispatch(setDescription({
            instructions,
            credits
        })),
        onSetProjectTitle: title => dispatch(setProjectTitle(title))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(ProjectMetaFetcherComponent);
};

export {
    TWProjectMetaFetcherHOC as default
};
