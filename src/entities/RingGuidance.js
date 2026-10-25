import * as THREE from 'three';

const MAX_GUIDANCE_DISTANCE = 42;
const MIN_GUIDANCE_DISTANCE = 3;
const MIN_FORWARD_SPEED = 5;
const MAX_LOOKAHEAD_SECONDS = 1.6;
const MARKER_LIMIT = 3.5;

/** One reusable flight-path marker for the nearest upcoming ring. */
export class RingGuidance extends THREE.Group {
    constructor() {
        super();
        this.name = 'RingGuidance';
        this.target = null;
        this.futurePosition = new THREE.Vector3();

        // The earlier tiny torus and dot looked too much like speed particles.
        // A filled dark diamond behind a crisp coloured diamond outline keeps
        // guidance legible at boost speeds without increasing particle effects.
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
        // Speed particles don't write depth: draw this translucent marker after
        // them, but keep normal depth testing against actual track geometry.
        this.backing.renderOrder = 10;
        this.marker.renderOrder = 11;
        this.dot.renderOrder = 12;
        this.marker.add(this.backing, this.dot);
        this.add(this.marker);

        // A faint vertical reference links only the selected ring to its
        // ground projection. Unit geometry is scaled rather than rebuilt.
        const stemGeometry = new THREE.BufferGeometry().setFromPoints([
            new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -1, 0),
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
        let nearest = null;
        let nearestDistance = MAX_GUIDANCE_DISTANCE;
        for (const ring of rings) {
            const distance = craft.position.z - ring.position.z;
            const reachableDistance = speed * MAX_LOOKAHEAD_SECONDS
                - ring.collectionRadius - 0.7;
            if (distance >= MIN_GUIDANCE_DISTANCE
                && distance <= reachableDistance
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
        this.visible = Boolean(nearest) && speed >= MIN_FORWARD_SPEED;
        if (!this.visible) return;

        const crossingTime = nearestDistance / speed;
        const forecastTime = crossingTime + (nearest.collectionRadius + 0.7) / speed;
        const futureX = THREE.MathUtils.clamp(
            craft.position.x + craft.velocity.x * forecastTime,
            craft.bounds.minX, craft.bounds.maxX,
        );
        const futureY = THREE.MathUtils.clamp(
            craft.position.y + craft.velocity.y * forecastTime,
            craft.bounds.minY, craft.bounds.maxY,
        );
        const futureZ = craft.position.z - speed * forecastTime;

        // Use the actual swept Stage A sphere test for the status. The marker
        // itself shows the projected position at the ring's forward plane.
        this.futurePosition.set(futureX, futureY, futureZ);
        const aligned = nearest.intersectsPath(craft.position, this.futurePosition);
        const planeTime = crossingTime;
        const planeX = THREE.MathUtils.clamp(
            craft.position.x + craft.velocity.x * planeTime,
            craft.bounds.minX, craft.bounds.maxX,
        );
        const planeY = THREE.MathUtils.clamp(
            craft.position.y + craft.velocity.y * planeTime,
            craft.bounds.minY, craft.bounds.maxY,
        );

        this.position.copy(nearest.position);
        this.marker.position.set(
            THREE.MathUtils.clamp(planeX - nearest.position.x, -MARKER_LIMIT, MARKER_LIMIT),
            THREE.MathUtils.clamp(planeY - nearest.position.y, -MARKER_LIMIT, MARKER_LIMIT),
            0.12,
        );
        const color = aligned ? 0xc8ffad : 0xffd07b;
        this.markerMaterial.color.setHex(color);
        this.stem.scale.y = Math.max(0, nearest.position.y - 0.015);
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
