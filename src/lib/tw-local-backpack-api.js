import storage from './storage';
import {soundThumbnail} from './backpack/sound-payload';
import {arrayBufferToBase64, base64ToArrayBuffer} from './tw-base64-utils';
import {requestPersistentStorage} from './tw-persistent-storage';

// Special constants -- do not change without care.
const DATABASE_NAME = 'TW_Backpack';
const DATABASE_VERSION = 1;
const STORE_NAME = 'backpack';

const idbItemToBackpackItem = item => {
    // convert id to string
    item.id = `${item.id}`;

    if (item.type === 'sound') {
        // For sounds, use the local thumbnail instead of what was stored in the backpack.
        // The thumbnail was updated and it doesn't make sense for already backpacked sounds to
        // use the old icon instead of the new one.
        item.thumbnailUrl = `data:;base64,${soundThumbnail}`;
    } else {
        // Thumbnail could be any image format. The browser will figure out which format it is.
        item.thumbnailUrl = `data:;base64,${arrayBufferToBase64(item.thumbnailData)}`;
    }

    let assetType;
    if (item.type === 'script') {
        item.bodyUrl = `data:application/json;base64,${arrayBufferToBase64(item.bodyData)}`;
    } else if (item.type === 'sprite') {
        item.bodyUrl = `data:application/zip;base64,${arrayBufferToBase64(item.bodyData)}`;
    } else if (item.type === 'costume') {
        if (item.mime === 'image/svg+xml') {
            assetType = storage.AssetType.ImageVector;
        } else if (item.mime === 'image/png' || item.mime === 'image/jpeg') {
            assetType = storage.AssetType.ImageBitmap;
        }
    } else if (item.type === 'sound') {
        assetType = storage.AssetType.Sound;
    }

    if (assetType) {
        const extension = assetType.runtimeFormat;
        const itemMD5 = item.bodyMD5;
        const md5ext = `${itemMD5}.${extension}`;
        item.body = md5ext;
        storage.builtinHelper._store(
            assetType,
            extension,
            new Uint8Array(item.bodyData),
            itemMD5
        );
    }

    return item;
};

let _db;
const openDB = () => new Promise((resolve, reject) => {
    if (_db) {
        resolve(_db);
        return;
    }

    if (!window.indexedDB) {
        reject(new Error('indexedDB is not supported'));
        return;
    }

    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = event => {
        const db = event.target.result;
        db.createObjectStore(STORE_NAME, {
            keyPath: 'id',
            autoIncrement: true
        });
    };

    request.onsuccess = event => {
        _db = event.target.result;
        resolve(_db);
    };

    request.onerror = event => {
        reject(new Error(`DB error: ${event.target.error}`));
    };
});

/**
 * Run a transaction on the backpack store.
 * @param {IDBTransactionMode} mode readonly or readwrite
 * @param {string} errorDescription For error messages
 * @param {(store: IDBObjectStore, withErrorHandling: () => void): void} callback What to run
 * @returns {Promise<void>} Resolves when the transaction commits.
 */
const runTransaction = async (mode, errorDescription, callback) => {
    const db = await openDB();
    return new Promise((resolve, reject) => {
        let handledError = null;
        const transaction = db.transaction(STORE_NAME, mode);

        transaction.oncomplete = () => {
            resolve();
        };

        transaction.onabort = () => {
            reject(handledError || new Error(`${errorDescription}: ${transaction.error}`));
        };

        const withErrorHandling = fn => (...args) => {
            try {
                fn(...args);
            } catch (e) {
                handledError = e;
                transaction.abort();
            }
        };

        const wrappedCallback = withErrorHandling(callback);
        wrappedCallback(transaction.objectStore(STORE_NAME), withErrorHandling);
    });
};

const getBackpackContents = async ({
    limit,
    offset
}) => {
    const idbItems = [];
    await runTransaction('readonly', 'Getting contents', (store, withErrorHandling) => {
        const request = store.openCursor(null, 'prev');
        let first = true;
        request.onsuccess = withErrorHandling(() => {
            const cursor = request.result;
            if (!cursor) {
                return;
            }
            if (first) {
                first = false;
                if (offset !== 0) {
                    cursor.advance(offset);
                    return;
                }
            }
            if (idbItems.length < limit) {
                idbItems.push(cursor.value);
                cursor.continue();
            }
        });
    });
    return idbItems.map(idbItemToBackpackItem);
};

const saveBackpackObject = async ({
    type,
    mime,
    name,
    body,
    thumbnail
}) => {
    // User interaction -- fine to show a permission dialog
    requestPersistentStorage();

    const bodyData = base64ToArrayBuffer(body);
    const idbItem = {
        type,
        mime,
        name,
        bodyData,
        bodyMD5: storage.md5(bodyData),
        thumbnailData: base64ToArrayBuffer(thumbnail)
    };
    let backpackItem;
    await runTransaction('readwrite', 'Saving object', (store, withErrorHandling) => {
        const putRequest = store.put(idbItem);
        putRequest.onsuccess = withErrorHandling(() => {
            idbItem.id = putRequest.result;
            backpackItem = idbItemToBackpackItem(idbItem);
        });
    });
    return backpackItem;
};

const deleteBackpackObject = async ({
    id
}) => {
    // Convert string IDs to number IDs
    id = +id;
    await runTransaction('readwrite', 'Deleting object', store => {
        store.delete(id);
    });
};

const updateBackpackObject = async ({
    id,
    name
}) => {
    id = +id;
    let backpackItem;
    await runTransaction('readwrite', 'Updating object', (store, withErrorHandling) => {
        const getRequest = store.get(id);
        getRequest.onsuccess = withErrorHandling(() => {
            const newItem = {
                ...getRequest.result,
                name: name
            };
            const putRequest = store.put(newItem);
            putRequest.onsuccess = withErrorHandling(() => {
                backpackItem = idbItemToBackpackItem(newItem);
            });
        });
    });
    return backpackItem;
};

export default {
    getBackpackContents,
    saveBackpackObject,
    deleteBackpackObject,
    updateBackpackObject
};
