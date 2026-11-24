/** Render only on state changes, using text nodes rather than dynamic markup. */
export class ObjectivePanel {
    constructor(host, objectives) {
        this.host = host;
        this.objectives = objectives;
        this.title = host.querySelector('[data-objective-title]');
        this.text = host.querySelector('[data-objective-text]');
        this.bar = host.querySelector('progress');
    }
    render(state) {
        this.host.hidden = state !== 'start' && state !== 'terminated';
        if (this.host.hidden) return;
        const result = state === 'terminated' ? this.objectives.result : null;
        this.host.classList.toggle('is-complete', Boolean(result?.complete));
        this.title.textContent = result ? (result.complete ? 'PERSONAL GOAL COMPLETE' : 'PERSONAL GOAL') : 'NEXT FLIGHT · PERSONAL GOAL';
        // The next goal can differ from the just-finished goal after success.
        if (!result) this.objectives.prepare();
        this.text.textContent = result ? `${result.label} · ${result.progress}. ${result.text}` : this.objectives.label;
        this.bar.hidden = !result;
        if (result) this.bar.value = result.ratio;
    }
}
