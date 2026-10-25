import * as THREE from 'three';

// Keep the flight-path marker at a fixed point ahead of the aircraft.
// Forward movement in SkyRacer is along negative Z.
const MARKER_FORWARD_OFFSET = 11;

/** A reusable, craft-following flight-path marker independent of rings. */
export class RingGuidance extends THREE.Group {
    constructor() {
        super();
        this.name = 'RingGuidance';

        // Retain the existing diamond silhouette so the marker is recognizable.
        const backingGeometry = new THREE.CircleGeometry(0.43, 4);
        const markerGeometry = new THREE.RingGeometry(0.3, 0.39, 4);
        const dotGeometry = new THREE.SphereGeometry(0.075, 6, 4);
        this.backingMaterial = new THREE.MeshBasicMaterial({
            color: 0x07131c, transparent: true, opacity: 0.92,
            depthWrite: false, fog: false,
        });
        this.markerMaterial = new THREE.MeshBasicMaterial({
            color: 0xc8ffad, transparent: true, opacity: 0.98,
            depthWrite: false, fog: false,
        });
        this.dotMaterial = new THREE.MeshBasicMaterial({
            color: 0xf5fbff, depthWrite: false, fog: false,
        });

        this.marker = new THREE.Mesh(markerGeometry, this.markerMaterial);
        this.backing = new THREE.Mesh(backingGeometry, this.backingMaterial);
        this.backing.position.z = -0.012;
        this.dot = new THREE.Mesh(dotGeometry, this.dotMaterial);
        this.backing.renderOrder = 10;
        this.marker.renderOrder = 11;
        this.dot.renderOrder = 12;
        this.marker.add(this.backing, this.dot);
        this.add(this.marker);
        this.visible = false;
    }

    update(craft) {
        // Match the aircraft's current lane and height every frame.
        // No ring selection, velocity prediction or target switching.
        this.position.set(
            craft.position.x,
            craft.position.y,
            craft.position.z - MARKER_FORWARD_OFFSET,
        );
        this.visible = true;
    }

    hide() {
        this.visible = false;
    }

    dispose() {
        this.hide();
        this.marker.geometry.dispose();
        this.backing.geometry.dispose();
        this.dot.geometry.dispose();
        this.backingMaterial.dispose();
        this.markerMaterial.dispose();
        this.dotMaterial.dispose();
    }
}
