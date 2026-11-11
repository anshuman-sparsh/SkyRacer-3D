/** Stop the flight while the browser rebuilds GPU resources; never auto-resume. */
export class WebGLRecovery {
    constructor(canvas, { onLost = () => {}, onRestored = () => {} } = {}) {
        this.lost = false;
        this.onLost = event => {
            event.preventDefault(); // Allow the browser/Three.js to restore the context.
            if (this.lost) return;
            this.lost = true;
            onLost();
        };
        this.onRestored = () => {
            if (!this.lost) return;
            this.lost = false;
            onRestored();
        };
        this.canvas = canvas;
        canvas.addEventListener('webglcontextlost', this.onLost);
        canvas.addEventListener('webglcontextrestored', this.onRestored);
    }
    dispose() {
        this.canvas.removeEventListener('webglcontextlost', this.onLost);
        this.canvas.removeEventListener('webglcontextrestored', this.onRestored);
    }
}
