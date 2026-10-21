// The global fetch must be called without a receiver. Storing it in a field and calling it as a method (`this.fetcher(...)`)
// throws "Illegal invocation" in the Workers runtime, so adapters take this wrapper as their default instead.

/**
 * Fetch with no receiver. Safe to store in a field and call as a method.
 * @param input Request URL or Request.
 * @param init Request options.
 * @returns The response.
 */
export const workersFetch: typeof fetch = (input, init) => fetch(input, init);
