/**
 * Stable public facade for world generation. Stage implementation belongs in
 * generation/ so callers never depend on its internal decomposition.
 */
export { generateWorld, type GeneratedWorld } from './generation/pipeline.js';
