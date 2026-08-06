import * as THREE from 'three';
import { EnergyRing } from '../entities/EnergyRing.js';
import { Obstacle } from '../entities/Obstacle.js';
import { TrackSegment } from '../entities/TrackSegment.js';
import { disposeObject3D } from '../utils/Memory.js';

const RING_RADIUS = 1.8;
const NEAR_MISS_RADIUS = 3.4;
const SURGE_RING_INTERVAL = 7;

export class TrackManager {
    constructor(scene, {
        segmentLength = 24,
        trackWidth = 32,
        aheadDistance = 120,
        behindDistance = 48,
        ringSpawnChance = 0.65,
        obstacleSpawnChance = 0.55,
        edgeClearance = 1.6,
        craftBounds = { minY: 1, maxY: 10 },
        random = Math.random,
    } = {}) {
        this.scene = scene;
        this.segmentLength = segmentLength;
        this.trackWidth = trackWidth;
        this.aheadDistance = aheadDistance;
        this.behindDistance = behindDistance;
        this.ringSpawnChance = ringSpawnChance;
        this.obstacleSpawnChance = obstacleSpawnChance;
        this.craftBounds = craftBounds;
        this.random = random;
        this.segments = [];
        this.energyRings = [];
        this.energyRingPool = [];
        this.surgeRingPool = [];
        this.obstaclePool = [];
        this.obstacles = [];
        this.segmentPool = [];
        this.nextSegmentZ = 0;
        this.spawnedRingCount = 0;

        // Strict safe band: inside the guide rails, accounting for ring radius, and
        // never wider than the craft can actually reach. Guarantees every spawn is
        // on-screen, reachable, and clear of the side barriers.
        const railHalfWidth = trackWidth / 2 - edgeClearance;
        this.ringHalfWidth = Math.max(railHalfWidth - RING_RADIUS, 0.5);
        this.obstacleHalfWidth = Math.max(railHalfWidth - 1.4, 0.5);

        this.#fillAhead(0);
    }

    update(delta, hovercraft) {
        let collectedRings = 0;
        let collectedEnergyRings = 0;
        let collectedSurgeRings = 0;
        let nearMisses = 0;
        let collided = false;

        const craftBox = hovercraft.refreshBounds();

        for (let index = this.energyRings.length - 1; index >= 0; index -= 1) {
            const ring = this.energyRings[index];
            ring.update(delta);

            const collected = ring.containsPoint(hovercraft.position);
            const passedBehind = ring.position.z > hovercraft.position.z + this.behindDistance;
            if (!collected && !passedBehind) continue;

            if (collected) {
                collectedRings += 1;
                if (ring.isSurge) {
                    collectedSurgeRings += 1;
                } else {
                    collectedEnergyRings += 1;
                }
            }
            this.energyRings.splice(index, 1);
            this.#releaseEnergyRing(ring);
        }

        for (let index = this.obstacles.length - 1; index >= 0; index -= 1) {
            const obstacle = this.obstacles[index];
            obstacle.update(delta);

            if (!hovercraft.isSpinningOut && obstacle.intersects(craftBox)) {
                // Stop on the first intersection. No second impact, near-miss, or
                // course-spawn work can occur during this terminal frame.
                collided = true;
                return {
                    collectedRings,
                    collectedEnergyRings,
                    collectedSurgeRings,
                    nearMisses,
                    collided,
                };
            } else if (!obstacle.wasNearMissed && !hovercraft.isSpinningOut) {
                // A near-miss is a barrier the craft has just slipped past while
                // staying close to it, which rewards tight, skilful navigation.
                const passed = obstacle.position.z > hovercraft.position.z;
                if (passed && hovercraft.position.distanceTo(obstacle.position) < NEAR_MISS_RADIUS) {
                    obstacle.wasNearMissed = true;
                    nearMisses += 1;
                }
            }

            if (obstacle.position.z <= hovercraft.position.z + this.behindDistance) continue;

            this.obstacles.splice(index, 1);
            this.#releaseObstacle(obstacle);
        }

        for (let index = this.segments.length - 1; index >= 0; index -= 1) {
            const segment = this.segments[index];
            if (segment.position.z <= hovercraft.position.z + this.behindDistance) continue;

            this.segments.splice(index, 1);
            this.#releaseSegment(segment);
        }

        this.#fillAhead(hovercraft.position.z);
        return {
            collectedRings,
            collectedEnergyRings,
            collectedSurgeRings,
            nearMisses,
            collided,
        };
    }

    /** Clears the course and rebuilds it from the origin for an in-place restart. */
    reset() {
        this.energyRings.forEach((ring) => this.#releaseEnergyRing(ring));
        this.obstacles.forEach((obstacle) => this.#releaseObstacle(obstacle));
        this.segments.forEach((segment) => this.#releaseSegment(segment));
        this.energyRings.length = 0;
        this.obstacles.length = 0;
        this.segments.length = 0;
        this.nextSegmentZ = 0;
        this.spawnedRingCount = 0;
        this.#fillAhead(0);
    }

    destroy() {
        const allRings = [...this.energyRings, ...this.energyRingPool, ...this.surgeRingPool];
        const allObstacles = [...this.obstacles, ...this.obstaclePool];
        const allSegments = [...this.segments, ...this.segmentPool];
        allRings.forEach((ring) => this.#removeAndDispose(ring));
        allObstacles.forEach((obstacle) => this.#removeAndDispose(obstacle));
        allSegments.forEach((segment) => this.#removeAndDispose(segment));
        this.energyRings.length = 0;
        this.obstacles.length = 0;
        this.segments.length = 0;
        this.energyRingPool.length = 0;
        this.surgeRingPool.length = 0;
        this.obstaclePool.length = 0;
        this.segmentPool.length = 0;
    }

    #fillAhead(craftZ) {
        const forwardLimit = craftZ - this.aheadDistance;

        while (this.nextSegmentZ >= forwardLimit) {
            this.#spawnSegment(this.nextSegmentZ);
            this.nextSegmentZ -= this.segmentLength;
        }
    }

    #acquireEnergyRing(isSurge) {
        const pool = isSurge ? this.surgeRingPool : this.energyRingPool;
        return pool.pop() ?? new EnergyRing({ isSurge });
    }

    #releaseEnergyRing(ring) {
        this.scene.remove(ring);
        ring.visible = false;
        ring.position.set(0, 0, 0);
        ring.ringVisual.rotation.set(0, 0, 0);
        ring.halo.scale.setScalar(1);
        (ring.isSurge ? this.surgeRingPool : this.energyRingPool).push(ring);
    }

    #acquireObstacle() {
        const obstacle = this.obstaclePool.pop() ?? new Obstacle();
        obstacle.wasNearMissed = false;
        return obstacle;
    }

    #acquireSegment() {
        return this.segmentPool.pop() ?? new TrackSegment({
            length: this.segmentLength,
            width: this.trackWidth,
        });
    }

    #releaseSegment(segment) {
        this.scene.remove(segment);
        segment.visible = false;
        segment.position.set(0, 0, 0);
        this.segmentPool.push(segment);
    }

    #releaseObstacle(obstacle) {
        this.scene.remove(obstacle);
        obstacle.visible = false;
        obstacle.position.set(0, 0, 0);
        obstacle.halo.scale.setScalar(1);
        obstacle.wasNearMissed = false;
        this.obstaclePool.push(obstacle);
    }

    #spawnSegment(z) {
        const segment = this.#acquireSegment();
        segment.position.z = z;
        segment.visible = true;
        this.segments.push(segment);
        this.scene.add(segment);

        // The first stretch stays clear so the run always opens with a fair lead-in.
        const isOpeningStretch = z > -this.segmentLength * 2;
        const ring = this.random() <= this.ringSpawnChance ? this.#spawnRing(z) : null;
        if (!isOpeningStretch && this.random() <= this.obstacleSpawnChance) {
            this.#spawnObstacle(z, ring);
        }
    }

    #spawnRing(z) {
        this.spawnedRingCount += 1;
        const isSurge = this.spawnedRingCount % SURGE_RING_INTERVAL === 0;
        const ring = this.#acquireEnergyRing(isSurge);
        const { minY, maxY } = this.craftBounds;
        ring.position.set(
            (this.random() * 2 - 1) * this.ringHalfWidth,
            THREE.MathUtils.clamp(minY + this.random() * (maxY - minY), minY + 0.8, maxY - 0.8),
            z - this.segmentLength * (0.18 + this.random() * 0.24),
        );
        ring.visible = true;
        this.energyRings.push(ring);
        this.scene.add(ring);
        return ring;
    }

    #spawnObstacle(z, ring) {
        const { minY, maxY } = this.craftBounds;
        const obstacleZ = z - this.segmentLength * (0.55 + this.random() * 0.3);

        let x = 0;
        let y = 0;
        // Reject placements that overlap the segment's ring, so collecting a ring
        // never forces contact with a barrier.
        for (let attempt = 0; attempt < 6; attempt += 1) {
            x = (this.random() * 2 - 1) * this.obstacleHalfWidth;
            y = THREE.MathUtils.clamp(minY + this.random() * (maxY - minY), minY + 0.6, maxY - 0.6);

            const clearOfRing = !ring
                || Math.abs(ring.position.z - obstacleZ) > 6
                || Math.hypot(ring.position.x - x, ring.position.y - y) > RING_RADIUS + 2.4;
            if (clearOfRing) break;
        }

        const obstacle = this.#acquireObstacle();
        obstacle.position.set(x, y, obstacleZ);
        obstacle.visible = true;
        this.obstacles.push(obstacle);
        this.scene.add(obstacle);
    }

    #removeAndDispose(object) {
        this.scene.remove(object);
        disposeObject3D(object);
    }
}
