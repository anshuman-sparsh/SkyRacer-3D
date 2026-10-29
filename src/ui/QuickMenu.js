/**
 * Consolidates desktop and mobile actions into one keyboard-accessible menu.
 * The Audio row opens an anchored, nonmodal On/Off popover. It does not change
 * sound until the user explicitly chooses a setting, nor close the main menu.
 * Audio state and gameplay ownership stay with the caller.
 */
export class QuickMenu {
    constructor({
        onOpen = () => {},
        onHelp = () => {},
        getAudioEnabled = () => true,
        onAudioChange = () => {},
        onLeaderboard = () => {},
        onDaily = () => {},
        canLeaderboard = () => true,
        canDaily = () => true,
    } = {}) {
        this.trigger = document.querySelector('[data-quick-open]');
        this.menu = document.querySelector('[data-quick-menu]');
        this.help = document.querySelector('[data-quick-help]');
        this.audio = document.querySelector('[data-quick-audio]');
        this.audioGroup = document.querySelector('[data-quick-audio-group]');
        this.audioPanel = document.querySelector('[data-quick-audio-panel]');
        this.audioOn = document.querySelector('[data-quick-audio-on]');
        this.audioOff = document.querySelector('[data-quick-audio-off]');
        this.audioState = document.querySelector('[data-quick-audio-state]');
        this.leaderboard = document.querySelector('[data-quick-leaderboard]');
        this.daily = document.querySelector('[data-quick-daily]');
        this.canLeaderboard = canLeaderboard;
        this.canDaily = canDaily;
        this.getAudioEnabled = getAudioEnabled;
        this.onAudioChange = onAudioChange;
        this.onOpen = onOpen;
        this.opened = false;
        this.audioOpen = false;

        this.handleToggle = () => this.opened ? this.close() : this.open();
        this.handleOutside = (event) => {
            if (!this.opened) return;
            if (!this.menu.contains(event.target) && !this.trigger.contains(event.target)) {
                this.close({ focus: false });
            } else if (this.audioOpen && !this.audioGroup.contains(event.target)) {
                this.closeAudio({ focus: false });
            }
        };
        this.handleKey = (event) => {
            if (!this.opened || event.key !== 'Escape') return;
            event.preventDefault();
            event.stopPropagation();
            if (this.audioOpen) this.closeAudio();
            else this.close();
        };
        this.handleHelp = () => { this.close({ focus: false }); onHelp(); };
        this.handleAudio = () => this.audioOpen ? this.closeAudio() : this.openAudio();
        this.handleAudioOn = () => this.selectAudio(true);
        this.handleAudioOff = () => this.selectAudio(false);
        this.handleLeaderboard = () => { this.close({ focus: false }); onLeaderboard(); };
        this.handleDaily = () => { this.close({ focus: false }); onDaily(); };

        this.trigger.addEventListener('click', this.handleToggle);
        this.help.addEventListener('click', this.handleHelp);
        this.audio.addEventListener('click', this.handleAudio);
        this.audioOn.addEventListener('click', this.handleAudioOn);
        this.audioOff.addEventListener('click', this.handleAudioOff);
        this.leaderboard.addEventListener('click', this.handleLeaderboard);
        this.daily.addEventListener('click', this.handleDaily);
        document.addEventListener('pointerdown', this.handleOutside, true);
        document.addEventListener('keydown', this.handleKey, true);
        this.refreshAudio();
    }

    /** Also called when the desktop HUD audio button changes the sound. */
    refreshAudio() {
        const enabled = Boolean(this.getAudioEnabled());
        this.audioState.textContent = enabled ? 'ON' : 'OFF';
        this.audioOn.setAttribute('aria-pressed', String(enabled));
        this.audioOff.setAttribute('aria-pressed', String(!enabled));
    }

    openAudio() {
        if (!this.opened || this.audioOpen) return;
        this.refreshAudio();
        this.audioOpen = true;
        this.audioPanel.hidden = false;
        this.audio.setAttribute('aria-expanded', 'true');
        this.audioOn.focus({ preventScroll: true });
    }

    closeAudio({ focus = true } = {}) {
        if (!this.audioOpen) return;
        this.audioOpen = false;
        this.audioPanel.hidden = true;
        this.audio.setAttribute('aria-expanded', 'false');
        if (focus) this.audio.focus({ preventScroll: true });
    }

    selectAudio(enabled) {
        if (!this.audioOpen) return;
        this.onAudioChange(Boolean(enabled));
        this.refreshAudio();
        // Keep the mini popover visible, allowing users to compare ON and OFF.
    }

    open() {
        if (this.opened) return;
        this.onOpen();
        this.opened = true;
        this.menu.hidden = false;
        this.trigger.setAttribute('aria-expanded', 'true');
        this.leaderboard.disabled = !this.canLeaderboard();
        this.daily.disabled = !this.canDaily();
        this.refreshAudio();
        this.help.focus({ preventScroll: true });
    }

    close({ focus = true } = {}) {
        if (!this.opened) return;
        this.closeAudio({ focus: false });
        this.opened = false;
        this.menu.hidden = true;
        this.trigger.setAttribute('aria-expanded', 'false');
        if (focus) this.trigger.focus({ preventScroll: true });
    }

    dispose() {
        this.trigger.removeEventListener('click', this.handleToggle);
        this.help.removeEventListener('click', this.handleHelp);
        this.audio.removeEventListener('click', this.handleAudio);
        this.audioOn.removeEventListener('click', this.handleAudioOn);
        this.audioOff.removeEventListener('click', this.handleAudioOff);
        this.leaderboard.removeEventListener('click', this.handleLeaderboard);
        this.daily.removeEventListener('click', this.handleDaily);
        document.removeEventListener('pointerdown', this.handleOutside, true);
        document.removeEventListener('keydown', this.handleKey, true);
    }
}
