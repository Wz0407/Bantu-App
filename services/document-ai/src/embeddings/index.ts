import type { AvailabilityReporting, ProviderResult } from "../common.js";

/** Local embedding models are implemented in Phase 3 behind this interface. */
export interface EmbeddingProvider extends AvailabilityReporting {
  embed(texts: string[]): Promise<ProviderResult<number[][]>>;
}
