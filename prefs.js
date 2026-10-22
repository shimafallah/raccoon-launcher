import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import GObject from 'gi://GObject';

import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class RaccoonLauncherPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        window.add(page);

        // --- Shortcut ---------------------------------------------------
        const shortcutGroup = new Adw.PreferencesGroup({title: 'Shortcut'});
        page.add(shortcutGroup);
        shortcutGroup.add(new ShortcutRow(settings, 'toggle-launcher'));

        // --- Appearance -------------------------------------------------
        const appearance = new Adw.PreferencesGroup({title: 'Appearance'});
        page.add(appearance);
        appearance.add(new ColorRow(settings, 'box-color'));

        // --- Providers --------------------------------------------------
        const providers = new Adw.PreferencesGroup({title: 'Providers'});
        page.add(providers);

        const addToggle = (key, title, subtitle) => {
            const row = new Adw.SwitchRow({title, subtitle});
            providers.add(row);
            settings.bind(key, row, 'active', Gio.SettingsBindFlags.DEFAULT);
        };
        addToggle('enable-apps', 'Application search', 'Find and launch installed apps');
        addToggle('enable-calc', 'Calculator', 'Type a math expression to evaluate it');
        addToggle('enable-web', 'Web search', 'Prefixes: g, ddg, yt, wiki, gh');
        addToggle('enable-system', 'System actions', 'Lock, log out, suspend, restart, power off');

        // --- Behaviour --------------------------------------------------
        const behaviour = new Adw.PreferencesGroup({title: 'Behaviour'});
        page.add(behaviour);
        const spin = new Adw.SpinRow({
            title: 'Maximum results',
            adjustment: new Gtk.Adjustment({
                lower: 3,
                upper: 20,
                step_increment: 1,
            }),
        });
        behaviour.add(spin);
        settings.bind('max-results', spin, 'value', Gio.SettingsBindFlags.DEFAULT);
    }
}

const DEFAULT_BOX_COLOR = 'rgba(30,30,35,0.98)';

const ColorRow = GObject.registerClass(
class ColorRow extends Adw.ActionRow {
    _init(settings, key) {
        super._init({
            title: 'Box color',
            subtitle: 'Background color of the launcher box',
        });
        this._settings = settings;
        this._key = key;
        this._syncing = false;

        this._button = new Gtk.ColorDialogButton({
            dialog: new Gtk.ColorDialog({with_alpha: true}),
            valign: Gtk.Align.CENTER,
        });
        this._syncFromSettings();
        this._button.connect('notify::rgba', () => {
            if (this._syncing)
                return;
            this._settings.set_string(this._key, this._button.get_rgba().to_string());
        });
        this.add_suffix(this._button);

        const reset = new Gtk.Button({
            icon_name: 'edit-clear-symbolic',
            tooltip_text: 'Reset to default color',
            valign: Gtk.Align.CENTER,
        });
        reset.add_css_class('flat');
        reset.connect('clicked', () => {
            this._settings.reset(this._key);
            this._syncFromSettings();
        });
        this.add_suffix(reset);
        this.activatable_widget = this._button;
    }

    _syncFromSettings() {
        this._syncing = true;
        const rgba = new Gdk.RGBA();
        if (!rgba.parse(this._settings.get_string(this._key)))
            rgba.parse(DEFAULT_BOX_COLOR);
        this._button.set_rgba(rgba);
        this._syncing = false;
    }
});

const ShortcutRow = GObject.registerClass(
class ShortcutRow extends Adw.ActionRow {
    _init(settings, key) {
        super._init({
            title: 'Toggle launcher',
            subtitle: 'Click "Set" and press the new shortcut',
        });
        this._settings = settings;
        this._key = key;

        this._label = new Gtk.ShortcutLabel({
            valign: Gtk.Align.CENTER,
            disabled_text: 'Disabled',
        });
        this.add_suffix(this._label);

        const button = new Gtk.Button({label: 'Set', valign: Gtk.Align.CENTER});
        button.connect('clicked', () => this._capture());
        this.add_suffix(button);
        this.activatable_widget = button;

        this._changedId = settings.connect(`changed::${key}`, () => this._sync());
        this.connect('destroy', () => settings.disconnect(this._changedId));
        this._sync();
    }

    _sync() {
        const accels = this._settings.get_strv(this._key);
        this._label.set_accelerator(accels.length > 0 ? accels[0] : '');
    }

    _capture() {
        const dialog = new Gtk.Window({
            modal: true,
            transient_for: this.get_root(),
            title: 'Set shortcut',
            default_width: 360,
            default_height: 120,
        });
        dialog.set_child(new Gtk.Label({
            label: 'Press the new shortcut\u2026\n(Backspace to clear, Esc to cancel)',
            justify: Gtk.Justification.CENTER,
        }));

        let pendingSuper = null;

        const controller = new Gtk.EventControllerKey();
        controller.connect('key-pressed', (_c, keyval, keycode, state) => {
            let mask = state & Gtk.accelerator_get_default_mod_mask();
            mask &= ~Gdk.ModifierType.LOCK_MASK;

            if (keyval === Gdk.KEY_Escape && mask === 0) {
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            if (keyval === Gdk.KEY_BackSpace && mask === 0) {
                this._settings.set_strv(this._key, []);
                dialog.close();
                return Gdk.EVENT_STOP;
            }

            if ((keyval === Gdk.KEY_Super_L || keyval === Gdk.KEY_Super_R) && mask === 0) {
                pendingSuper = keyval;
                return Gdk.EVENT_STOP;
            }

            pendingSuper = null;

            if (isModifier(keyval) || mask === 0)
                return Gdk.EVENT_STOP;

            const accel = Gtk.accelerator_name_with_keycode(null, keyval, keycode, mask);
            this._settings.set_strv(this._key, [accel]);
            dialog.close();
            return Gdk.EVENT_STOP;
        });

        controller.connect('key-released', (_c, keyval) => {
            if (pendingSuper && (keyval === Gdk.KEY_Super_L || keyval === Gdk.KEY_Super_R)) {
                const accel = keyval === Gdk.KEY_Super_R ? 'Super_R' : 'Super_L';
                this._settings.set_strv(this._key, [accel]);
                dialog.close();
                return Gdk.EVENT_STOP;
            }
            return Gdk.EVENT_PROPAGATE;
        });

        dialog.add_controller(controller);
        dialog.present();
    }
});

function isModifier(keyval) {
    return [
        Gdk.KEY_Shift_L, Gdk.KEY_Shift_R,
        Gdk.KEY_Control_L, Gdk.KEY_Control_R,
        Gdk.KEY_Alt_L, Gdk.KEY_Alt_R,
        Gdk.KEY_Super_L, Gdk.KEY_Super_R,
        Gdk.KEY_Meta_L, Gdk.KEY_Meta_R,
    ].includes(keyval);
}
