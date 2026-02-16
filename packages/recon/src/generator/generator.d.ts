/** PingApp code generator — takes a SiteDefinitionResult and scaffolds a complete project. */
import type { GeneratorConfig, GeneratorResult } from '../types.js';
export declare class PingAppGenerator {
    /** Generate all file contents from a SiteDefinitionResult. Returns a Map of relative path → content. */
    preview(config: GeneratorConfig): Map<string, string>;
    /** Generate a complete PingApp from a SiteDefinitionResult and write to disk. */
    generate(config: GeneratorConfig): Promise<GeneratorResult>;
}
//# sourceMappingURL=generator.d.ts.map