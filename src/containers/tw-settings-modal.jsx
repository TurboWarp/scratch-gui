import PropTypes from 'prop-types';
import React from 'react';
import {defineMessages, injectIntl, intlShape} from 'react-intl';
import bindAll from 'lodash.bindall';
import {connect} from 'react-redux';
import {closeSettingsModal} from '../reducers/modals';
import SettingsModalComponent from '../components/tw-settings-modal/settings-modal.jsx';
import {defaultStageSize} from '../reducers/custom-stage-size';

const messages = defineMessages({
    newFramerate: {
        defaultMessage: 'New framerate:',
        description: 'Prompt shown to choose a new framerate',
        id: 'tw.menuBar.newFramerate'
    }
});

class UsernameModal extends React.Component {
    constructor (props) {
        super(props);
        bindAll(this, [
            'handleFramerateChange',
            'handleCustomizeFramerate',
            'handleHighQualityPenChange',
            'handleInterpolationChange',
            'handleInfiniteClonesChange',
            'handleRemoveFencingChange',
            'handleRemoveLimitsChange',
            'handleWarpTimerChange',
            'handleStageWidthChange',
            'handleStageHeightChange',
            'handleDisableCompilerChange',
            'handleRelaxedMathChange',
            'handleStoreProjectOptions'
        ]);
    }
    handleFramerateChange (e) {
        this.props.vm.setFramerate(e.target.checked ? 60 : 30);
    }
    async handleCustomizeFramerate () {
        // prompt() returns Promise in desktop app
        // eslint-disable-next-line no-alert
        const newFramerate = await prompt(this.props.intl.formatMessage(messages.newFramerate), this.props.framerate);
        const parsed = parseFloat(newFramerate);
        if (isFinite(parsed)) {
            this.props.vm.setFramerate(parsed);
        }
    }
    handleHighQualityPenChange (e) {
        this.props.vm.renderer.setUseHighQualityRender(e.target.checked);
    }
    handleInterpolationChange (e) {
        this.props.vm.setInterpolation(e.target.checked);
    }
    handleInfiniteClonesChange (e) {
        this.props.vm.setRuntimeOptions({
            maxClones: e.target.checked ? Infinity : 300
        });
    }
    handleRemoveFencingChange (e) {
        this.props.vm.setRuntimeOptions({
            fencing: !e.target.checked
        });
    }
    handleRemoveLimitsChange (e) {
        this.props.vm.setRuntimeOptions({
            miscLimits: !e.target.checked
        });
    }
    handleWarpTimerChange (e) {
        this.props.vm.setCompilerOptions({
            warpTimer: e.target.checked
        });
    }
    handleDisableCompilerChange (e) {
        this.props.vm.setCompilerOptions({
            enabled: !e.target.checked
        });
    }
    handleRelaxedMathChange (e) {
        this.props.vm.setCompilerOptions({
            relaxedMath: e.target.checked
        });
    }
    handleStageWidthChange (value) {
        this.props.vm.setStageSize(value, this.props.customStageSize.height);
    }
    handleStageHeightChange (value) {
        this.props.vm.setStageSize(this.props.customStageSize.width, value);
    }
    handleStoreProjectOptions () {
        this.props.vm.storeProjectOptions();
    }
    render () {
        const {
            /* eslint-disable no-unused-vars */
            onClose,
            vm,
            /* eslint-enable no-unused-vars */
            ...props
        } = this.props;
        return (
            <SettingsModalComponent
                onClose={this.props.onClose}
                onFramerateChange={this.handleFramerateChange}
                onCustomizeFramerate={this.handleCustomizeFramerate}
                onHighQualityPenChange={this.handleHighQualityPenChange}
                onInterpolationChange={this.handleInterpolationChange}
                onInfiniteClonesChange={this.handleInfiniteClonesChange}
                onRemoveFencingChange={this.handleRemoveFencingChange}
                onRemoveLimitsChange={this.handleRemoveLimitsChange}
                onWarpTimerChange={this.handleWarpTimerChange}
                onStageWidthChange={this.handleStageWidthChange}
                onStageHeightChange={this.handleStageHeightChange}
                onDisableCompilerChange={this.handleDisableCompilerChange}
                onRelaxedMathChange={this.handleRelaxedMathChange}
                stageWidth={this.props.customStageSize.width}
                stageHeight={this.props.customStageSize.height}
                customStageSizeEnabled={
                    this.props.customStageSize.width !== defaultStageSize.width ||
                    this.props.customStageSize.height !== defaultStageSize.height
                }
                onStoreProjectOptions={this.handleStoreProjectOptions}
                {...props}
            />
        );
    }
}

UsernameModal.propTypes = {
    intl: intlShape,
    onClose: PropTypes.func,
    vm: PropTypes.shape({
        renderer: PropTypes.shape({
            setUseHighQualityRender: PropTypes.func
        }),
        setFramerate: PropTypes.func,
        setCompilerOptions: PropTypes.func,
        setInterpolation: PropTypes.func,
        setRuntimeOptions: PropTypes.func,
        setStageSize: PropTypes.func,
        storeProjectOptions: PropTypes.func
    }),
    isEmbedded: PropTypes.bool,
    framerate: PropTypes.number,
    highQualityPen: PropTypes.bool,
    interpolation: PropTypes.bool,
    infiniteClones: PropTypes.bool,
    removeFencing: PropTypes.bool,
    removeLimits: PropTypes.bool,
    warpTimer: PropTypes.bool,
    customStageSize: PropTypes.shape({
        width: PropTypes.number,
        height: PropTypes.number
    }),
    disableCompiler: PropTypes.bool,
    relaxedMath: PropTypes.bool
};

const mapStateToProps = state => ({
    vm: state.scratchGui.vm,
    isEmbedded: state.scratchGui.mode.isEmbedded,
    framerate: state.scratchGui.tw.framerate,
    highQualityPen: state.scratchGui.tw.highQualityPen,
    interpolation: state.scratchGui.tw.interpolation,
    infiniteClones: state.scratchGui.tw.runtimeOptions.maxClones === Infinity,
    removeFencing: !state.scratchGui.tw.runtimeOptions.fencing,
    removeLimits: !state.scratchGui.tw.runtimeOptions.miscLimits,
    warpTimer: state.scratchGui.tw.compilerOptions.warpTimer,
    customStageSize: state.scratchGui.customStageSize,
    disableCompiler: !state.scratchGui.tw.compilerOptions.enabled,
    relaxedMath: state.scratchGui.tw.compilerOptions.relaxedMath
});

const mapDispatchToProps = dispatch => ({
    onClose: () => dispatch(closeSettingsModal())
});

export default injectIntl(connect(
    mapStateToProps,
    mapDispatchToProps
)(UsernameModal));
