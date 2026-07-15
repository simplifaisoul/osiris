import { describe, expect, it } from "vitest";

import { BoundedHttpFetcher } from "../src/framework/http-fetcher.js";
import { normaliseUsgsEarthquakeFeed } from "../src/normalisers/usgs.js";

const runLive = process.env.RUN_LIVE_TESTS === "1";

describe.skipIf(!runLive)("USGS live boundary", () => {
  it("still returns the expected bounded GeoJSON contract", async () => {
    const fetcher = new BoundedHttpFetcher({
      maxBodyBytes: 25 * 1024 * 1024,
      timeoutMs: 10_000,
    });
    const raw = await fetcher.fetch(
      "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson",
    );

    expect(raw.status).toBe(200);
    const feed = normaliseUsgsEarthquakeFeed(raw.body);
    expect(feed.feedMetadata.count).toBe(feed.records.length);
  });
});
