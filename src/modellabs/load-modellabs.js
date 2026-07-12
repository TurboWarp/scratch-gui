import ModellabsDevice from './modellabs-device';

const EXTENSION_ID = 'modellabsdevice';

const loadModellabs = vm => {
    if (vm.extensionManager.isExtensionLoaded(EXTENSION_ID)) {
        return;
    }

    vm.extensionManager.addBuiltinExtension(
        EXTENSION_ID,
        ModellabsDevice
    );

    vm.extensionManager.loadExtensionIdSync(
        EXTENSION_ID
    );
};

export default loadModellabs;