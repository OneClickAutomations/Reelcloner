/**
 * Apify adapter — resolve a social URL to a downloadable video.
 * Stage 1: typed surface only. Implemented in Stage 5.
 *
 * TODO (Stage 5): move the actor IDs into config once verified against the Apify store.
 */

export async function scrapeReference(_url: string): Promise<string> {
  throw new Error("Not implemented until Stage 5: apify.scrapeReference");
}
