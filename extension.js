import Gio from 'gi://Gio';
import GObject from 'gi://GObject';
import Meta from 'gi://Meta';
import Shell from 'gi://Shell';

import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

import {SearchEngine} from './lib/search.js';
import {LauncherOverlay} from './lib/overlay.js';

const TOGGLE_KEY = 'toggle-launcher';
const MUTTER_SCHEMA = 'org.gnome.mutter';

function isSuperKey(accel) {
    return accel === 'Super_L' || accel === 'Super_R' || accel === 'Super';
}

export default class RaccoonLauncherExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._mutterSettings = new Gio.Settings({schema: MUTTER_SCHEMA});
        this._engine = new SearchEngine(this._settings);
        this._overlay = new LauncherOverlay(
            this._engine,
            this._settings,
            () => this.openPreferences()
        );

        this._bindShortcut();
        this._settingsChangedId = this._settings.connect(`changed::${TOGGLE_KEY}`, () => {
            this._bindShortcut();
        });
    }

    _bindShortcut() {
        this._unbindShortcut();

        const accels = this._settings.get_strv(TOGGLE_KEY);
        if (!accels || accels.length === 0)
            return;

        const primaryAccel = accels[0];

        if (isSuperKey(primaryAccel)) {
            // Ensure Mutter's overlay-key is active and matches the desired key
            this._oldOverlayKey = this._mutterSettings.get_string('overlay-key');
            if (this._oldOverlayKey !== primaryAccel) {
                this._mutterSettings.set_string('overlay-key', primaryAccel);
                this._restoredOverlayKey = true;
            }

            const blockDefaultHandler = () => {
                if (!this._defaultOverlayKeyId) {
                    this._defaultOverlayKeyId = GObject.signal_handler_find(global.display, {signalId: 'overlay-key'});
                    if (this._defaultOverlayKeyId)
                        GObject.signal_handler_block(global.display, this._defaultOverlayKeyId);
                }
            };

            blockDefaultHandler();

            if (!this._defaultOverlayKeyId && Main.layoutManager?._startingUp) {
                this._startupCompleteId = Main.layoutManager.connect('startup-complete', () => {
                    blockDefaultHandler();
                    if (this._startupCompleteId) {
                        Main.layoutManager.disconnect(this._startupCompleteId);
                        this._startupCompleteId = 0;
                    }
                });
            }

            this._overlayKeyId = global.display.connect('overlay-key', () => {
                this._overlay?.toggle();
            });

            Main.wm.allowKeybinding('overlay-key', Shell.ActionMode.ALL);
            this._isSuperBound = true;
        } else {
            Main.wm.addKeybinding(
                TOGGLE_KEY,
                this._settings,
                Meta.KeyBindingFlags.NONE,
                Shell.ActionMode.NORMAL | Shell.ActionMode.OVERVIEW,
                () => this._overlay?.toggle()
            );
            this._isKeybindingBound = true;
        }
    }

    _unbindShortcut() {
        if (this._startupCompleteId && Main.layoutManager) {
            Main.layoutManager.disconnect(this._startupCompleteId);
            this._startupCompleteId = 0;
        }

        if (this._isKeybindingBound) {
            Main.wm.removeKeybinding(TOGGLE_KEY);
            this._isKeybindingBound = false;
        }

        if (this._overlayKeyId) {
            global.display.disconnect(this._overlayKeyId);
            this._overlayKeyId = null;
        }

        if (this._defaultOverlayKeyId) {
            GObject.signal_handler_unblock(global.display, this._defaultOverlayKeyId);
            this._defaultOverlayKeyId = null;
        }

        if (this._restoredOverlayKey && this._mutterSettings) {
            this._mutterSettings.set_string('overlay-key', this._oldOverlayKey);
            this._restoredOverlayKey = false;
        }

        this._isSuperBound = false;
    }

    disable() {
        if (this._settingsChangedId) {
            this._settings?.disconnect(this._settingsChangedId);
            this._settingsChangedId = 0;
        }

        this._unbindShortcut();

        this._overlay?.destroy();
        this._overlay = null;

        this._engine?.destroy();
        this._engine = null;

        this._settings = null;
        this._mutterSettings = null;
    }
}
