/**
 * Consolidates desktop and mobile actions into one keyboard-accessible menu.
 * This class owns only presentation and focus: host callbacks own game state.
 */
export class QuickMenu {
    constructor({
        onOpen = () => {},
        onHelp = () => {},
        onLeaderboard = () => {},
        onDaily = () => {},
        canLeaderboard = () => true,
        canDaily = () => true,
    } = {}) {
        this.trigger = document.querySelector('[data-quick-open]');
        this.menu = document.querySelector('[data-quick-menu]');
        this.help = document.querySelector('[data-quick-help]');
        this.leaderboard = document.querySelector('[data-quick-leaderboard]');
        this.daily = document.querySelector('[data-quick-daily]');
        this.canLeaderboard = canLeaderboard;
        this.canDaily = canDaily;
        this.onOpen = onOpen;
        this.opened = false;
        this.handleToggle = () => this.opened ? this.close() : this.open();
        this.handleOutside = (event) => {
            if (this.opened && !this.menu.contains(event.target)
                && !this.trigger.contains(event.target)) this.close({ focus: false });
        };
        this.handleKey = (event) => {
            if (!this.opened) return;
            if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                this.close();
            }
        };
        this.handleHelp = () => { this.close({ focus: false }); onHelp(); };
        this.handleLeaderboard = () => { this.close({ focus: false }); onLeaderboard(); };
        this.handleDaily = () => { this.close({ focus: false }); onDaily(); };
        this.trigger.addEventListener('click', this.handleToggle);
        this.help.addEventListener('click', this.handleHelp);
        this.leaderboard.addEventListener('click', this.handleLeaderboard);
        this.daily.addEventListener('click', this.handleDaily);
        document.addEventListener('pointerdown', this.handleOutside, true);
        document.addEventListener('keydown', this.handleKey, true);
    }

    open() {
        if (this.opened) return;
        this.onOpen();
        this.opened = true;
        this.menu.hidden = false;
        this.trigger.setAttribute('aria-expanded', 'true');
        this.leaderboard.disabled = !this.canLeaderboard();
        this.daily.disabled = !this.canDaily();
        this.help.focus({ preventScroll: true });
    }

    close({ focus = true } = {}) {
        if (!this.opened) return;
        this.opened = false;
        this.menu.hidden = true;
        this.trigger.setAttribute('aria-expanded', 'false');
        if (focus) this.trigger.focus({ preventScroll: true });
    }

    dispose() {
        this.trigger.removeEventListener('click', this.handleToggle);
        this.help.removeEventListener('click', this.handleHelp);
        this.leaderboard.removeEventListener('click', this.handleLeaderboard);
        this.daily.removeEventListener('click', this.handleDaily);
        document.removeEventListener('pointerdown', this.handleOutside, true);
        document.removeEventListener('keydown', this.handleKey, true);
    }
}
