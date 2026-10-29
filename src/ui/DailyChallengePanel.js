import { formatCountdown, nextUtcMidnight } from '../utils/DailyChallenge.js';

/**
 * Isolated daily competition dialog. No rendering-loop work or raw HTML from
 * player nicknames; a 1-second interval exists only while the panel is open.
 */
export class DailyChallengePanel {
    constructor({ service, onPlay, onSubmit, onOpen, canPlay, canSubmit }) {
        this.service = service;
        this.onPlay = onPlay;
        this.onSubmit = onSubmit;
        this.onOpen = onOpen;
        this.canPlay = canPlay;
        this.canSubmit = canSubmit;
        this.dialog = document.querySelector('[data-daily-dialog]');
        this.openButtons = [
            document.querySelector('[data-daily-open]'),
            document.querySelector('[data-daily-menu]'),
        ];
        this.closeButton = document.querySelector('[data-daily-close]');
        this.refreshButton = document.querySelector('[data-daily-refresh]');
        this.playButton = document.querySelector('[data-daily-play]');
        this.sendButton = document.querySelector('[data-daily-send]');
        this.dateElement = document.querySelector('[data-daily-date]');
        this.countdownElement = document.querySelector('[data-daily-countdown]');
        this.statusElement = document.querySelector('[data-daily-status]');
        this.ownElement = document.querySelector('[data-daily-own]');
        this.list = document.querySelector('[data-daily-list]');
        this.form = document.querySelector('[data-daily-form]');
        this.nickname = document.querySelector('[data-daily-nickname]');
        this.nicknameLabel = document.querySelector('[data-daily-nickname-label]');
        this.today = null;
        this.serverSkew = 0;
        this.timer = 0;
        this.loading = false;
        this.submitting = false;
        this.opener = this.openButtons[0];
        this.launchedRun = false;

        for (const button of this.openButtons) {
            button.hidden = !service.enabled;
            button.addEventListener('click', (event) => this.open(event));
        }
        this.closeButton.addEventListener('click', () => this.dialog.close());
        this.refreshButton.addEventListener('click', () => { void this.refresh(); });
        this.playButton.addEventListener('click', () => { void this.play(); });
        this.sendButton.addEventListener('click', () => { void this.submit(); });
        this.onClosed = () => {
            if (this.timer) clearInterval(this.timer);
            this.timer = 0;
            if (this.launchedRun) {
                this.launchedRun = false;
                // Restore keyboard steering after the dialog closes, including
                // when opened from a focusable daily-menu button.
                const canvas = document.querySelector('#app canvas');
                if (canvas) {
                    canvas.tabIndex = 0;
                    canvas.focus({ preventScroll: true });
                }
            } else {
                this.opener?.focus?.({ preventScroll: true });
            }
        };
        this.dialog.addEventListener('close', this.onClosed);
    }

    open(event) {
        if (!this.service.enabled || this.dialog.open) return;
        this.opener = event?.currentTarget ?? this.openButtons[0];
        this.onOpen();
        this.dialog.showModal();
        this.closeButton.focus();
        this.updateActions();
        void this.refresh();
        if (this.timer) clearInterval(this.timer);
        this.timer = setInterval(() => this.updateCountdown(), 1000);
    }

    updateActions() {
        const canStart = this.canPlay();
        this.playButton.disabled = !canStart || this.loading;
        this.playButton.textContent = canStart ? 'PLAY TODAY’S COURSE' : 'FINISH YOUR CURRENT RUN FIRST';
        const maySubmit = this.canSubmit();
        this.form.hidden = !maySubmit;
        this.sendButton.disabled = this.submitting || !maySubmit;
    }

    updateCountdown() {
        if (!this.today) {
            this.countdownElement.textContent = '--:--:--';
            return;
        }
        const remaining = nextUtcMidnight(this.today.date) - (Date.now() + this.serverSkew);
        this.countdownElement.textContent = formatCountdown(remaining);
        if (remaining <= 0) {
            this.countdownElement.textContent = '00:00:00 — REFRESH FOR NEXT COURSE';
        }
    }

    async refresh() {
        if (this.loading) return;
        this.loading = true;
        this.refreshButton.disabled = true;
        this.statusElement.textContent = 'Loading today’s rankings…';
        this.updateActions();
        try {
            const result = await this.service.getToday();
            this.today = result;
            this.serverSkew = Date.parse(result.serverNow) - Date.now();
            this.dateElement.textContent = result.date + ' UTC';
            this.ownElement.textContent = result.me
                ? 'Your daily best: ' + Number(result.me.score).toLocaleString()
                    + ' · Rank #' + result.me.rank
                : 'No daily best yet — your first run can enter today’s rankings.';
            const rows = document.createDocumentFragment();
            for (const player of (result.entries ?? [])) {
                const row = document.createElement('li');
                row.className = 'leaderboard-list__row';
                const rank = document.createElement('span');
                rank.className = 'leaderboard-list__rank';
                rank.textContent = '#' + player.rank;
                const name = document.createElement('span');
                name.className = 'leaderboard-list__name';
                name.textContent = player.nickname;
                const score = document.createElement('strong');
                score.className = 'leaderboard-list__score';
                score.textContent = Number(player.score).toLocaleString();
                row.append(rank, name, score);
                rows.append(row);
            }
            this.list.replaceChildren(rows);
            const registeredNickname = typeof result.nickname === 'string'
                ? result.nickname : null;
            this.nickname.readOnly = Boolean(registeredNickname);
            if (registeredNickname) this.nickname.value = registeredNickname;
            else this.nickname.value = this.nickname.value || this.service.getKnownNickname();
            this.nicknameLabel.textContent = registeredNickname
                ? 'Your registered nickname (permanent)'
                : 'Pilot nickname (3–16 letters, numbers or underscores)';
            this.statusElement.textContent = result.entries?.length
                ? 'Top 50 daily pilots · Highest score per player'
                : 'No daily scores yet. Be the first!';
            this.updateCountdown();
        } catch (error) {
            this.statusElement.textContent = 'Daily rankings unavailable: ' + error.message;
        } finally {
            this.loading = false;
            this.refreshButton.disabled = false;
            this.updateActions();
        }
    }

    async play() {
        if (!this.canPlay()) return;
        this.playButton.disabled = true;
        this.statusElement.textContent = 'Registering your daily attempt…';
        try {
            const ready = await this.onPlay();
            if (ready) {
                this.launchedRun = true;
                this.dialog.close();
            }
            else this.statusElement.textContent = 'Could not start the daily attempt.';
        } catch (error) {
            this.statusElement.textContent = error.message;
        } finally {
            this.updateActions();
        }
    }

    async submit() {
        if (!this.canSubmit() || this.submitting) return;
        const name = this.nickname.value.trim();
        if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) {
            this.statusElement.textContent = 'Enter a nickname with 3–16 letters, digits, or underscores.';
            this.nickname.focus();
            return;
        }
        this.submitting = true;
        this.sendButton.disabled = true;
        this.statusElement.textContent = 'Verifying your daily result…';
        try {
            const result = await this.onSubmit(name);
            await this.refresh();
            this.statusElement.textContent = result.isNewBest
                ? 'New daily personal best recorded!'
                : 'Valid attempt recorded. Your higher daily score remains.';
        } catch (error) {
            this.statusElement.textContent = 'Could not submit: ' + error.message;
        } finally {
            this.submitting = false;
            this.updateActions();
        }
    }

    dispose() {
        if (this.timer) clearInterval(this.timer);
        this.dialog.removeEventListener('close', this.onClosed);
        // DOM is being torn down on pagehide, so listeners cannot outlive it.
    }
}
