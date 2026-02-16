/**
 * Recon Pipeline — orchestrates snapshot → analyzer → generator.
 *
 * `pingdev recon <url>` runs through all three stages and outputs a PingApp.
 */
import type { ReconOptions, ReconResult } from './types.js';
/** Run the full recon pipeline. */
export declare function runRecon(options: ReconOptions): Promise<ReconResult>;
//# sourceMappingURL=pipeline.d.ts.map