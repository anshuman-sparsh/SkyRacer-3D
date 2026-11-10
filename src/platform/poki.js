import { PokiAdapter, initializeSdk } from './PokiAdapter.js';
export { storage } from './poki-storage.js';
export const isPoki = true;
export const localOnly = __POKI_LOCAL_ONLY__;
export const platform = new PokiAdapter();
export const initializePlatform = () => initializeSdk(platform);
