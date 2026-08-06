const SHARED_FLAG = 'skyRacerShared';

/**
 * Flags a geometry, material, or texture as shared between many entities so the
 * generic disposal walker leaves it alone. Shared resources are owned by the
 * module that created them and are released through that module's own teardown.
 */
export function markShared(resource) {
    if (resource && resource.userData) resource.userData[SHARED_FLAG] = true;
    return resource;
}

export function isShared(resource) {
    return Boolean(resource?.userData?.[SHARED_FLAG]);
}

/**
 * Releases a material plus any textures it uniquely owns. Shared textures are
 * skipped so recycling one entity never blanks the surfaces of its siblings.
 */
export function disposeMaterial(material) {
    if (!material || isShared(material)) return;

    for (const value of Object.values(material)) {
        if (value?.isTexture && !isShared(value)) value.dispose();
    }
    material.dispose();
}

/** Force-releases a resource even when it carries the shared flag. */
export function disposeShared(resource) {
    if (!resource) return;

    for (const value of Object.values(resource)) {
        if (value?.isTexture && value !== resource) value.dispose();
    }
    resource.dispose();
}

export function disposeObject3D(root) {
    const geometries = new Set();
    const materials = new Set();

    root.traverse((object) => {
        if (object.geometry && !isShared(object.geometry)) geometries.add(object.geometry);

        const objectMaterials = Array.isArray(object.material) ? object.material : [object.material];
        objectMaterials.forEach((material) => {
            if (material && !isShared(material)) materials.add(material);
        });
    });

    geometries.forEach((geometry) => geometry.dispose());
    materials.forEach((material) => disposeMaterial(material));
}
