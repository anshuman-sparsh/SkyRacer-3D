import { beatsChallenge, createChallengeLink, readChallengeLink, verifiedChallenge } from '../utils/FriendChallenge.js';

/**
 * Friend-challenge dialog. Never trusts scores or authors from query parameters.
 * Server-backed create/resolve/submit hooks will be connected in M4-B/C.
 */
export class FriendChallengePanel {
    constructor({ service, onOpen, getResult, canCreate, onAccept }) {
        this.service = service;
        this.onOpen = onOpen;
        this.getResult = getResult;
        this.canCreate = canCreate;
        this.onAccept = onAccept;
        this.dialog = document.querySelector('[data-friend-dialog]');
        this.menuButton = document.querySelector('[data-quick-friend]');
        this.resultButton = document.querySelector('[data-friend-result]');
        this.closeButton = document.querySelector('[data-friend-close]');
        this.status = document.querySelector('[data-friend-status]');
        this.target = document.querySelector('[data-friend-target]');
        this.creator = document.querySelector('[data-friend-creator]');
        this.expires = document.querySelector('[data-friend-expiry]');
        this.details = document.querySelector('[data-friend-details]');
        this.createButton = document.querySelector('[data-friend-create]');
        this.acceptButton = document.querySelector('[data-friend-accept]');
        this.copyButton = document.querySelector('[data-friend-copy]');
        this.linkInput = document.querySelector('[data-friend-link]');
        this.outcome = document.querySelector('[data-friend-outcome]');
        this.pending = readChallengeLink(window.location.href);
        this.challenge = null;
        this.sharedLink = null;
        this.opener = this.menuButton;
        this.busy = false;
        this.disposed = false;

        this.handlers = [
            [this.menuButton, 'click', event => this.open(event)],
            [this.resultButton, 'click', event => this.open(event)],
            [this.closeButton, 'click', () => this.dialog.close()],
            [this.createButton, 'click', () => { void this.create(); }],
            [this.acceptButton, 'click', () => { void this.accept(); }],
            [this.copyButton, 'click', () => { void this.copy(); }],
        ];
        for (const [element, event, callback] of this.handlers) element.addEventListener(event, callback);
        this.onClose = () => this.opener?.focus?.({ preventScroll: true });
        this.dialog.addEventListener('close', this.onClose);
        this.updateActions();
        if (this.pending.present) {
            // Opening the dialog never starts a run or changes its mode.
            queueMicrotask(() => { if (!this.disposed) this.open({ currentTarget: this.menuButton }); });
        }
    }

    updateActions() {
        const enabled = Boolean(this.service?.enabled);
        this.createButton.disabled = !enabled || this.busy || !this.canCreate();
        this.acceptButton.disabled = !enabled || this.busy || !this.challenge || this.challenge.expired;
        this.copyButton.disabled = !this.sharedLink || this.busy;
        this.resultButton.hidden = !this.canCreate();
    }

    async open(event) {
        if (this.dialog.open) return;
        this.opener = event?.currentTarget ?? this.menuButton;
        this.onOpen();
        this.dialog.showModal();
        this.closeButton.focus({ preventScroll: true });
        this.updateActions();
        if (!this.pending.present) {
            this.status.textContent = this.service?.enabled
                ? 'Share a verified finished flight or enter a friend’s challenge link.'
                : 'Friend Challenges are being prepared. Server verification arrives in M4-B.';
            return;
        }
        if (!this.pending.id) {
            this.status.textContent = 'This challenge link is invalid. Ask your friend for a fresh link.';
            return;
        }
        if (!this.service?.enabled) {
            this.status.textContent = 'This challenge link is recognized. Challenge verification is coming in M4-B.';
            return;
        }
        await this.resolve();
    }

    async resolve() {
        this.busy = true;
        this.status.textContent = 'Checking this challenge with SkyRacer…';
        this.updateActions();
        try {
            const response = await this.service.resolve(this.pending.id);
            this.challenge = verifiedChallenge(response, this.pending.id);
            this.details.hidden = false;
            this.creator.textContent = this.challenge.creatorNickname;
            this.target.textContent = this.challenge.targetScore.toLocaleString();
            this.expires.textContent = new Date(this.challenge.expiresAt).toLocaleString();
            this.status.textContent = this.challenge.expired
                ? 'This challenge has expired.'
                : 'Beat this score to win. Your flight must be verified by the server.';
            this.updateOutcome();
        } catch (error) {
            this.challenge = null;
            this.details.hidden = true;
            this.status.textContent = 'Challenge unavailable: ' + error.message;
        } finally {
            this.busy = false;
            this.updateActions();
        }
    }

    updateOutcome() {
        const score = this.getResult()?.score;
        this.outcome.textContent = this.challenge && Number.isSafeInteger(score) && score >= 0
            ? (beatsChallenge(score, this.challenge.targetScore)
                ? 'Your local score beats the target. Server confirmation is still required.'
                : 'Your score has not beaten the target yet.')
            : '';
    }

    async create() {
        const result = this.getResult();
        if (this.busy || !this.service?.enabled || !this.canCreate() || !result) return;
        this.busy = true;
        this.updateActions();
        this.status.textContent = 'Creating a verified challenge…';
        try {
            const data = await this.service.create(result);
            const challenge = verifiedChallenge(data);
            this.sharedLink = createChallengeLink(challenge.id, window.location.href);
            this.linkInput.value = this.sharedLink;
            this.status.textContent = 'Challenge created! Copy the link to invite a friend.';
        } catch (error) {
            this.sharedLink = null;
            this.linkInput.value = '';
            this.status.textContent = 'Could not create a challenge: ' + error.message;
        } finally {
            this.busy = false;
            this.updateActions();
        }
    }

    async accept() {
        if (!this.challenge || this.challenge.expired || !this.service?.enabled || this.busy) return;
        this.busy = true;
        this.updateActions();
        try {
            const ready = await this.onAccept(this.challenge);
            if (ready) this.dialog.close();
            else this.status.textContent = 'Finish your current flight before accepting a challenge.';
        } catch (error) {
            this.status.textContent = 'Could not accept: ' + error.message;
        } finally {
            this.busy = false;
            this.updateActions();
        }
    }

    async copy() {
        if (!this.sharedLink) return;
        try {
            await navigator.clipboard.writeText(this.sharedLink);
            this.status.textContent = 'Challenge link copied.';
        } catch {
            this.linkInput.focus();
            this.linkInput.select();
            this.status.textContent = 'Select and copy this link to share it.';
        }
    }

    dispose() {
        this.disposed = true;
        for (const [element, event, callback] of this.handlers) element.removeEventListener(event, callback);
        this.dialog.removeEventListener('close', this.onClose);
    }
}
