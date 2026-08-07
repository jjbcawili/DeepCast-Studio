// Compatibility shim. The active Studio implementation is StudioPageV2,
// which uses durable episode shells and background jobs instead of browser-held SSE.
export { StudioPage } from './StudioPageV2';
