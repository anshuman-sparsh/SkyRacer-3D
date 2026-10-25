import * as THREE from 'three';

const MAX_GUIDANCE_DISTANCE = 42;
const MIN_GUIDANCE_DISTANCE = 3;
const MIN_FORWARD_SPEED = 5;
const MAX_LOOKAHEAD_SECONDS = 1.6;
const GUIDANCE_EXIT_BUFFER = 2.5;
const MARKER_FORWARD_OFFSET = 11;
const TRACK_SURFACE_Y = 0.015;

/**
 * The diamond follows the aircraft's lane, while proximity, alignment and
 * the vertical ground reference follow the nearest approaching ring.
 */
export class RingGuidance extends THREE.Group {
    constructor() {
        super();
        this.name = 'RingGuidance';
        this.target = null;
        this.futurePosition = new THREE.Vector3();

        // Keep the established dark-backed diamond, without changing its size.
        const backingGeometry = new THREE.CircleGeometry(0.43, 4);
        const markerGeometry = new THREE.RingGeometry(0.3, 0.39, 4);
        const dotGeometry = new THREE.SphereGeometry(0.075, 6, 4);
        this.backingMaterial = new THREE.MeshBasicMaterial({
            color: 0x07131c, transparent: true, opacity: 0.92,
            depthWrite: false, fog: false,
        });
        this.markerMaterial = new THREE.MeshBasicMaterial({
            color: 0xffd07b, transparent: true, opacity: 0.98,
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

        // This line is independent of the diamond: its world position always
        // stays at the selected ring and reaches down to the track surface.
        const stemGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0),
            new THREE.Vector3(0, -1, 0),
        ]);
        this.stemMaterial = new THREE.LineBasicMaterial({
            color: 0x8fcbd5, transparent: true, opacity: 0.18,
            depthWrite: false, fog: true,
        });
        this.stem = new THREE.Line(stemGeometry, this.stemMaterial);
        this.add(this.stem);
        this.visible = false;
    }

    update(rings, craft) {
        const speed = Math.max(0, -craft.velocity.z);
        if (speed < MIN_FORWARD_SPEED) {
            this.hide();
            return;
        }

        let nearest = null;
        let nearestDistance = Infinity;
        for (const ring of rings) {
            const distance = craft.position.z - ring.position.z;
            const lookahead = Math.min(
                MAX_GUIDANCE_DISTANCE,
                speed * MAX_LOOKAHEAD_SECONDS - ring.collectionRadius - 0.7,
            );
            // Once visible, give the active target a small release buffer so
            // frame-to-frame speed changes do not blink the marker or line.
            const retaining = ring === this.target;
            const minimum = retaining ? 0 : MIN_GUIDANCE_DISTANCE;
            const maximum = lookahead + (retaining ? GUIDANCE_EXIT_BUFFER : 0);
            if (distance >= minimum && distance <= maximum
                && distance < nearestDistance) {
                nearest = ring;
                nearestDistance = distance;
            }
        }

        if (nearest !== this.target) {
            if (this.target) this.target.groundAnchor.visible = false;
            this.target = nearest;
            if (nearest) nearest.groundAnchor.visible = true;
        }

        if (!nearest) {
            this.visible = false;
            return;
        }

        // The marker stays in the craft's *current* lane at a fixed forward
        // offset, independent of the position of the selected ring.
        this.position.set(
            craft.position.x,
            craft.position.y,
            craft.position.z - MARKER_FORWARD_OFFSET,
        );
        this.visible = true;

        // Preserve the original swept-sphere ring crossing prediction for
        // green (aligned) / amber (misaligned) status; never use it to move
        // the diamond toward a ring.
        const forecastTime = (nearestDistance + nearest.collectionRadius + 0.7) / speed;
        this.futurePosition.set(
            THREE.MathUtils.clamp(
                craft.position.x + craft.velocity.x * forecastTime,
                craft.bounds.minX, craft.bounds.maxX,
            ),
            THREE.MathUtils.clamp(
                craft.position.y + craft.velocity.y * forecastTime,
                craft.bounds.minY, craft.bounds.maxY,
            ),
            craft.position.z - speed * forecastTime,
        );
        const aligned = nearest.intersectsPath(craft.position, this.futurePosition);
        this.markerMaterial.color.setHex(aligned ? 0xc8ffad : 0xffd07b);

        // The ring's ground reference stays on the ring even while the
        // diamond moves left/right/up/down with the aircraft.
        this.stem.position.set(
            nearest.position.x - this.position.x,
            nearest.position.y - this.position.y,
            nearest.position.z - this.position.z,
        );
        this.stem.scale.y = Math.max(0, nearest.position.y - TRACK_SURFACE_Y);
    }

    hide() {
        if (this.target) this.target.groundAnchor.visible = false;
        this.target = null;
        this.visible = false;
    }

    dispose() {
        this.hide();
        this.marker.geometry.dispose();
        this.backing.geometry.dispose();
        this.dot.geometry.dispose();
        this.stem.geometry.dispose();
        this.backingMaterial.dispose();
        this.markerMaterial.dispose();
        this.dotMaterial.dispose();
        this.stemMaterial.dispose();
    }
}
