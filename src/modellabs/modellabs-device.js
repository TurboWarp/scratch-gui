const BAUD_RATE = 115200;
const encoder = new TextEncoder();

class ModellabsDevice {
    constructor (runtime) {
        this.runtime = runtime;

        this.port = null;
        this.reader = null;
        this.writer = null;

        this.connected = false;
        this.keepReading = false;
        this.buffer = '';
        this.writeQueue = Promise.resolve();

        this.firmwareVersion = '';
        this.lastError = '';
        this.lastButton = '0';
        this.lastButtonLabel = '';
        this.touchX = 0;
        this.touchY = 0;
        this.lightValue = 0;

        this.pendingResponses = [];
    }

    getInfo () {
        return {
            id: 'modellabsdevice',
            name: 'Modellabs Device',

            color1: '#1478D4',
            color2: '#0E63B2',
            color3: '#0A4B87',

            blocks: [
                {
                    opcode: 'connect',
                    blockType: 'command',
                    text: 'verbind met Modellabs-apparaat'
                },
                {
                    opcode: 'disconnect',
                    blockType: 'command',
                    text: 'verbreek verbinding'
                },
                {
                    opcode: 'isConnected',
                    blockType: 'Boolean',
                    text: 'Modellabs-apparaat verbonden?'
                },
                {
                    opcode: 'getFirmwareVersion',
                    blockType: 'reporter',
                    text: 'firmwareversie'
                },
                {
                    opcode: 'getLastError',
                    blockType: 'reporter',
                    text: 'laatste fout'
                },

                '---',

                {
                    opcode: 'setLedColor',
                    blockType: 'command',
                    text: 'zet led op [COLOR]',
                    arguments: {
                        COLOR: {
                            type: 'string',
                            menu: 'ledColors',
                            defaultValue: 'BLUE'
                        }
                    }
                },
                {
                    opcode: 'setTitle',
                    blockType: 'command',
                    text: 'zet schermtitel op [TEXT]',
                    arguments: {
                        TEXT: {
                            type: 'string',
                            defaultValue: 'MIJN PROJECT'
                        }
                    }
                },
                {
                    opcode: 'showText',
                    blockType: 'command',
                    text: 'toon tekst [TEXT]',
                    arguments: {
                        TEXT: {
                            type: 'string',
                            defaultValue: 'Hallo Modellabs'
                        }
                    }
                },
                {
                    opcode: 'setStatus',
                    blockType: 'command',
                    text: 'zet status op [TEXT]',
                    arguments: {
                        TEXT: {
                            type: 'string',
                            defaultValue: 'KLAAR'
                        }
                    }
                },
                {
                    opcode: 'clearScreen',
                    blockType: 'command',
                    text: 'wis tekst van scherm'
                },
                {
                    opcode: 'setBackground',
                    blockType: 'command',
                    text: 'zet achtergrond op [COLOR]',
                    arguments: {
                        COLOR: {
                            type: 'string',
                            menu: 'screenColors',
                            defaultValue: 'NAVY'
                        }
                    }
                },
                {
                    opcode: 'setTextColor',
                    blockType: 'command',
                    text: 'zet tekstkleur op [COLOR]',
                    arguments: {
                        COLOR: {
                            type: 'string',
                            menu: 'screenColors',
                            defaultValue: 'WHITE'
                        }
                    }
                },
                {
                    opcode: 'setBrightness',
                    blockType: 'command',
                    text: 'zet schermhelderheid op [VALUE]',
                    arguments: {
                        VALUE: {
                            type: 'number',
                            defaultValue: 220
                        }
                    }
                },

                '---',

                {
                    opcode: 'setButtons',
                    blockType: 'command',
                    text: 'maak knoppen [LEFT] [MIDDLE] [RIGHT]',
                    arguments: {
                        LEFT: {
                            type: 'string',
                            defaultValue: 'LINKS'
                        },
                        MIDDLE: {
                            type: 'string',
                            defaultValue: 'MIDDEN'
                        },
                        RIGHT: {
                            type: 'string',
                            defaultValue: 'RECHTS'
                        }
                    }
                },
                {
                    opcode: 'showButtons',
                    blockType: 'command',
                    text: 'toon schermknoppen'
                },
                {
                    opcode: 'hideButtons',
                    blockType: 'command',
                    text: 'verberg schermknoppen'
                },
                {
                    opcode: 'setButtonColor',
                    blockType: 'command',
                    text: 'zet kleur van knop [BUTTON] op [COLOR]',
                    arguments: {
                        BUTTON: {
                            type: 'string',
                            menu: 'buttons',
                            defaultValue: '1'
                        },
                        COLOR: {
                            type: 'string',
                            menu: 'screenColors',
                            defaultValue: 'GREEN'
                        }
                    }
                },

                '---',

                {
                    opcode: 'whenButtonTouched',
                    blockType: 'event',
                    text: 'wanneer knop [BUTTON] wordt aangeraakt',
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true,
                    arguments: {
                        BUTTON: {
                            type: 'string',
                            menu: 'buttons',
                            defaultValue: '1'
                        }
                    }
                },
                {
                    opcode: 'whenAnyButtonTouched',
                    blockType: 'event',
                    text: 'wanneer een schermknop wordt aangeraakt',
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true
                },
                {
                    opcode: 'whenScreenTouched',
                    blockType: 'event',
                    text: 'wanneer het scherm wordt aangeraakt',
                    isEdgeActivated: false,
                    shouldRestartExistingThreads: true
                },
                {
                    opcode: 'getLastButton',
                    blockType: 'reporter',
                    text: 'laatst aangeraakte knop'
                },
                {
                    opcode: 'getLastButtonLabel',
                    blockType: 'reporter',
                    text: 'tekst van laatst aangeraakte knop'
                },
                {
                    opcode: 'getTouchX',
                    blockType: 'reporter',
                    text: 'laatste touch x'
                },
                {
                    opcode: 'getTouchY',
                    blockType: 'reporter',
                    text: 'laatste touch y'
                },

                '---',

                {
                    opcode: 'readLight',
                    blockType: 'reporter',
                    text: 'meet lichtsensor'
                },
                {
                    opcode: 'getLastLight',
                    blockType: 'reporter',
                    text: 'laatste lichtwaarde'
                },
                {
                    opcode: 'resetDevice',
                    blockType: 'command',
                    text: 'herstel Modellabs-apparaat'
                }
            ],

            menus: {
                ledColors: {
                    acceptReporters: true,
                    items: [
                        {text: 'uit', value: 'OFF'},
                        {text: 'rood', value: 'RED'},
                        {text: 'groen', value: 'GREEN'},
                        {text: 'blauw', value: 'BLUE'},
                        {text: 'geel', value: 'YELLOW'},
                        {text: 'cyaan', value: 'CYAN'},
                        {text: 'paars', value: 'MAGENTA'},
                        {text: 'wit', value: 'WHITE'}
                    ]
                },

                screenColors: {
                    acceptReporters: true,
                    items: [
                        {text: 'donkerblauw', value: 'NAVY'},
                        {text: 'zwart', value: 'BLACK'},
                        {text: 'wit', value: 'WHITE'},
                        {text: 'rood', value: 'RED'},
                        {text: 'groen', value: 'GREEN'},
                        {text: 'blauw', value: 'BLUE'},
                        {text: 'geel', value: 'YELLOW'},
                        {text: 'oranje', value: 'ORANGE'},
                        {text: 'paars', value: 'PURPLE'},
                        {text: 'cyaan', value: 'CYAN'}
                    ]
                },

                buttons: {
                    acceptReporters: false,
                    items: [
                        {text: '1', value: '1'},
                        {text: '2', value: '2'},
                        {text: '3', value: '3'}
                    ]
                }
            }
        };
    }

    clean (value) {
        return String(value)
            .replace(/[\r\n]+/g, ' ')
            .replace(/\|/g, '/')
            .trim();
    }

    broadcastState () {
        window.dispatchEvent(
            new CustomEvent('modellabs-device-state', {
                detail: {
                    connected: this.connected,
                    firmwareVersion: this.firmwareVersion,
                    lastError: this.lastError
                }
            })
        );
    }

    async connect () {
        this.lastError = '';

        if (this.connected) {
            return;
        }

        if (!window.navigator.serial) {
            this.lastError = 'Gebruik Chrome of Edge op een computer.';
            throw new Error(this.lastError);
        }

        try {
            this.port = await window.navigator.serial.requestPort();

            await this.port.open({
                baudRate: BAUD_RATE
            });

            this.writer = this.port.writable.getWriter();
            this.connected = true;
            this.keepReading = true;

            this.readSerial();

            await new Promise(resolve => setTimeout(resolve, 1300));

            const response = await this.sendAndWait(
                'PING',
                line => line.startsWith('PONG|MODELLABS_DEVICE|'),
                3500
            );

            this.firmwareVersion = response.split('|')[2] || '';
            this.broadcastState();
        } catch (error) {
            this.lastError = error && error.message ?
                error.message :
                String(error);

            await this.disconnect();
            throw error;
        }
    }

    async disconnect () {
        this.keepReading = false;
        this.connected = false;

        if (this.reader) {
            try {
                await this.reader.cancel();
            } catch (error) {
                // De poort kan al gesloten zijn.
            }
        }

        if (this.writer) {
            try {
                this.writer.releaseLock();
            } catch (error) {
                // De lock kan al vrijgegeven zijn.
            }

            this.writer = null;
        }

        if (this.port) {
            try {
                await this.port.close();
            } catch (error) {
                // De poort kan al gesloten zijn.
            }

            this.port = null;
        }

        this.reader = null;
        this.buffer = '';
        this.rejectPending(new Error('Verbinding verbroken.'));
        this.broadcastState();
    }

    isConnected () {
        return this.connected;
    }

    getFirmwareVersion () {
        return this.firmwareVersion || 'onbekend';
    }

    getLastError () {
        return this.lastError;
    }

    async send (command) {
        if (!this.connected || !this.writer) {
            this.lastError =
                'Verbind eerst met het Modellabs-apparaat.';

            throw new Error(this.lastError);
        }

        const data = encoder.encode(`${command}\n`);

        this.writeQueue = this.writeQueue.then(() =>
            this.writer.write(data)
        );

        return this.writeQueue;
    }

    waitForLine (check, timeout = 2500) {
        return new Promise((resolve, reject) => {
            const item = {
                check,
                resolve,
                reject,
                timer: null
            };

            item.timer = setTimeout(() => {
                const index = this.pendingResponses.indexOf(item);

                if (index !== -1) {
                    this.pendingResponses.splice(index, 1);
                }

                reject(new Error(
                    'Geen antwoord van het apparaat.'
                ));
            }, timeout);

            this.pendingResponses.push(item);
        });
    }

    async sendAndWait (command, check, timeout = 2500) {
        const responsePromise = this.waitForLine(
            check,
            timeout
        );

        await this.send(command);

        return responsePromise;
    }

    resolvePending (line) {
        for (
            let i = this.pendingResponses.length - 1;
            i >= 0;
            i--
        ) {
            const item = this.pendingResponses[i];

            if (item.check(line)) {
                clearTimeout(item.timer);
                this.pendingResponses.splice(i, 1);
                item.resolve(line);
            }
        }
    }

    rejectPending (error) {
        for (const item of this.pendingResponses) {
            clearTimeout(item.timer);
            item.reject(error);
        }

        this.pendingResponses = [];
    }

    async readSerial () {
        const decoder = new TextDecoder();

        try {
            while (
                this.keepReading &&
                this.port &&
                this.port.readable
            ) {
                this.reader = this.port.readable.getReader();

                try {
                    while (this.keepReading) {
                        const {
                            value,
                            done
                        } = await this.reader.read();

                        if (done) {
                            break;
                        }

                        this.buffer += decoder.decode(value, {
                            stream: true
                        });

                        let newlineIndex =
                            this.buffer.indexOf('\n');

                        while (newlineIndex !== -1) {
                            const line = this.buffer
                                .slice(0, newlineIndex)
                                .replace(/\r$/, '')
                                .trim();

                            this.buffer =
                                this.buffer.slice(
                                    newlineIndex + 1
                                );

                            if (line) {
                                this.handleLine(line);
                            }

                            newlineIndex =
                                this.buffer.indexOf('\n');
                        }
                    }
                } finally {
                    if (this.reader) {
                        try {
                            this.reader.releaseLock();
                        } catch (error) {
                            // Lock was mogelijk al vrij.
                        }

                        this.reader = null;
                    }
                }

                break;
            }
        } catch (error) {
            if (this.keepReading) {
                this.lastError =
                    error && error.message ?
                        error.message :
                        String(error);

                this.connected = false;
                this.rejectPending(error);
                this.broadcastState();
            }
        }
    }

    handleLine (line) {
        const parts = line.split('|');
        const type = parts[0];

        if (type === 'READY' || type === 'PONG') {
            this.firmwareVersion =
                parts[2] || this.firmwareVersion;
        }

        if (type === 'LIGHT') {
            const value = Number(parts[1]);

            if (Number.isFinite(value)) {
                this.lightValue = value;
            }
        }

        if (
            type === 'TOUCH' &&
            parts[1] === 'BUTTON'
        ) {
            this.lastButton = parts[2] || '0';
            this.lastButtonLabel =
                parts.slice(3).join('|');

            this.runtime.startHats(
                'modellabsdevice_whenButtonTouched',
                {
                    BUTTON: this.lastButton
                }
            );

            this.runtime.startHats(
                'modellabsdevice_whenAnyButtonTouched'
            );
        }

        if (
            type === 'TOUCH' &&
            parts[1] === 'SCREEN'
        ) {
            const x = Number(parts[2]);
            const y = Number(parts[3]);

            if (Number.isFinite(x)) {
                this.touchX = x;
            }

            if (Number.isFinite(y)) {
                this.touchY = y;
            }

            this.runtime.startHats(
                'modellabsdevice_whenScreenTouched'
            );
        }

        if (type === 'ERROR') {
            this.lastError = parts.slice(1).join('|');
        }

        this.resolvePending(line);
    }

    setLedColor (args) {
        return this.send(
            `LED|${this.clean(args.COLOR)}`
        );
    }

    setTitle (args) {
        return this.send(
            `TITLE|${this.clean(args.TEXT)}`
        );
    }

    showText (args) {
        return this.send(
            `TEXT|${this.clean(args.TEXT)}`
        );
    }

    setStatus (args) {
        return this.send(
            `STATUS|${this.clean(args.TEXT)}`
        );
    }

    clearScreen () {
        return this.send('CLEAR');
    }

    setBackground (args) {
        return this.send(
            `BACKGROUND|${this.clean(args.COLOR)}`
        );
    }

    setTextColor (args) {
        return this.send(
            `TEXT_COLOR|${this.clean(args.COLOR)}`
        );
    }

    setBrightness (args) {
        const value = Math.max(
            0,
            Math.min(
                255,
                Math.round(Number(args.VALUE))
            )
        );

        return this.send(
            `BRIGHTNESS|${value}`
        );
    }

    setButtons (args) {
        return this.send(
            `BUTTONS|${this.clean(args.LEFT)}|` +
            `${this.clean(args.MIDDLE)}|` +
            `${this.clean(args.RIGHT)}`
        );
    }

    showButtons () {
        return this.send('BUTTONS|SHOW');
    }

    hideButtons () {
        return this.send('BUTTONS|HIDE');
    }

    setButtonColor (args) {
        return this.send(
            `BUTTON_COLOR|${this.clean(args.BUTTON)}|` +
            `${this.clean(args.COLOR)}`
        );
    }

    getLastButton () {
        return this.lastButton;
    }

    getLastButtonLabel () {
        return this.lastButtonLabel;
    }

    getTouchX () {
        return this.touchX;
    }

    getTouchY () {
        return this.touchY;
    }

    async readLight () {
        const response = await this.sendAndWait(
            'GET|LIGHT',
            line => line.startsWith('LIGHT|')
        );

        const value = Number(
            response.split('|')[1]
        );

        if (Number.isFinite(value)) {
            this.lightValue = value;
        }

        return this.lightValue;
    }

    getLastLight () {
        return this.lightValue;
    }

    resetDevice () {
        return this.send('RESET');
    }
}

export default ModellabsDevice;