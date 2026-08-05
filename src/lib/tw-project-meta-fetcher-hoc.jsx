import React from 'react';
import PropTypes from 'prop-types';
import {connect} from 'react-redux';
import log from './log';

import {setProjectTitle} from '../reducers/project-title';
import {setAuthor, setDescription, resetViews, setViews} from '../reducers/tw';

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
            if (res.status === 404) {
                throw new Error('Project is probably unshared');
            }
            throw new Error(`Unexpected status code: ${res.status}`);
        } catch (err) {
            if (!firstError) {
                firstError = err;
            }
        }
    }
    throw firstError;
};

const fetchWindchimes = async projectId => {
    try {
        const url = `https://windchimes.turbowarp.org/api/scratch/${projectId}`;
        const res = await fetch(url);

        if (!res.ok) {
            return null;
        }

        const data = await res.json();

        // Windchimes returns dates in terms of days since 2000
        const epoch = Date.UTC(2000, 0, 1);
        const first = new Date(epoch + (data.firstDate * 60 * 60 * 24 * 1000));

        return {
            total: data.total,
            first
        };
    } catch (e) {
        return null;
    }
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
                this.props.onResetViews();

                const projectId = this.props.reduxProjectId;
                if (projectId !== '0') {
                    this.tryFetchAuthorDescription(this.props.reduxProjectId);
                    this.tryFetchViews(this.props.reduxProjectId);
                }
            }
        }

        async tryFetchAuthorDescription (projectId) {
            try {
                const data = await fetchProjectMeta(projectId);
    
                if (this.props.reduxProjectId !== projectId) {
                    // If project ID changed, ignore the results.
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
            } catch (err) {
                if (`${err}`.includes('unshared')) {
                    this.props.onSetDescription('unshared', 'unshared');
                }

                setIndexable(false);

                log.warn('cannot fetch project meta', err);
            }
        }

        async tryFetchViews (projectId) {
            try {
                const data = await fetchWindchimes(projectId);

                if (this.props.reduxProjectId !== projectId) {
                    // If project ID changed, ignore the results.
                    return;
                }

                if (!data) {
                    // No view information available
                    return;
                }

                this.props.onSetViews(data.total, data.first);
            } catch (err) {
                log.warn('cannot fetch windchimes', err);
            }
        }

        render () {
            const {
                /* eslint-disable no-unused-vars */
                reduxProjectId,
                onSetAuthor,
                onSetDescription,
                onSetProjectTitle,
                onResetViews,
                onSetViews,
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
        onSetProjectTitle: PropTypes.func,
        onResetViews: PropTypes.func,
        onSetViews: PropTypes.func
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
        onSetProjectTitle: title => dispatch(setProjectTitle(title)),
        onResetViews: () => dispatch(resetViews()),
        onSetViews: (total, first) => dispatch(setViews(total, first))
    });
    return connect(
        mapStateToProps,
        mapDispatchToProps
    )(ProjectMetaFetcherComponent);
};

export {
    TWProjectMetaFetcherHOC as default
};
