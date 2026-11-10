/** No share navigation or URL-driven dialogs in either Poki distribution. */
export class FriendChallengePanel {
    constructor() {
        this.dialog = document.querySelector('[data-friend-dialog]');
        this.status = document.querySelector('[data-friend-status]');
        this.outcome = document.querySelector('[data-friend-outcome]');
        this.updateActions();
    }
    updateActions() {
        document.querySelector('[data-quick-friend]').hidden = true;
        document.querySelector('[data-friend-result]').hidden = true;
    }
    updateOutcome() {} setVerifiedResult() {} open() {} dispose() {}
}
