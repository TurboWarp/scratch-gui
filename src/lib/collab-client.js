import { io } from 'socket.io-client';

const COLORS = ['#e74c3c','#3498db','#2ecc71','#f39c12','#9b59b6'];

export class CollabClient {
  constructor(serverUrl, userName) {
    this.socket = io(serverUrl);
    this.userName = userName;
    this.color = COLORS[Math.floor(Math.random() * COLORS.length)];
    this.cursors = {};
    this.locks = {};
    this.onCursorsChange = null;
    this.setupListeners();
    window.__collab = this;
  }

  sendCursor(x, y) {
    this.socket.emit('cursor-move', { x, y, name: this.userName, color: this.color });
  }

  requestLock(blockId, callback) {
    this.socket.emit('block-lock', { blockId });
    const onGranted = (data) => {
      if (data.blockId === blockId) { cleanup(); callback(true); }
    };
    const onDenied = (data) => {
      if (data.blockId === blockId) { cleanup(); callback(false); }
    };
    const cleanup = () => {
      this.socket.off('block-lock-granted', onGranted);
      this.socket.off('block-lock-denied', onDenied);
    };
    this.socket.on('block-lock-granted', onGranted);
    this.socket.on('block-lock-denied', onDenied);
  }

  releaseLock(blockId) {
    this.socket.emit('block-unlock', { blockId });
    delete this.locks[blockId];
  }

  sendChat(text) {
    this.socket.emit('chat-message', {
      name: this.userName,
      text: text,
      color: this.color
    });
  }

  releaseAllMyLocks() {
    this.socket.emit('release-all-locks');
    this.locks = {};
  }

  setupListeners() {
    this.socket.on('cursor-update', (data) => {
      this.cursors[data.id] = data;
      if (this.onCursorsChange) this.onCursorsChange({ ...this.cursors });
    });
    this.socket.on('cursor-remove', ({ id }) => {
      delete this.cursors[id];
      if (this.onCursorsChange) this.onCursorsChange({ ...this.cursors });
    });
    this.socket.on('block-locked', ({ blockId, lockedBy }) => {
      this.locks[blockId] = lockedBy;
    });
    this.socket.on('block-unlocked', ({ blockId }) => {
      delete this.locks[blockId];
    });
    this.socket.on('project-update', (json) => {
      if (this.onProjectUpdate) this.onProjectUpdate(json);
    });
  }
}
