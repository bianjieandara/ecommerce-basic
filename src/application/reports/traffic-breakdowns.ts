// Traffic breakdowns until Stage 19. The funnel asks for them; this source has none, so the report says the data is pending.
// Stage 19 replaces it with a reader of the Analytics Engine dataset (the AnalyticsSqlQueryService), wired in composition.
import type { TrafficBreakdownSource, TrafficBreakdowns } from './ports';

/** Reports that the event stream is not connected yet. */
export class PendingTrafficBreakdowns implements TrafficBreakdownSource {
  /**
   * @returns Always null: no event stream is read before Stage 19.
   */
  async breakdowns(): Promise<TrafficBreakdowns | null> {
    return null;
  }
}
