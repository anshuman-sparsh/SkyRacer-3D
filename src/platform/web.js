export const isPoki = false;
export const localOnly = false;
export const storage = undefined;
export const initializePlatform = async () => {};
export const platform = {
    blocked: false, init: async () => {}, loadingFinished() {}, transition() {},
    beforeGameplay: async (isValid = () => true) => isValid(),
    cancelPending() {}, dispose() {},
};
