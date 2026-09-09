/*
 * Cache warming for every join the realm declares.
 *
 * The realm-spec's read cache is the producer `cache:` (ttl) — there is no
 * view-level cache and no stale-while-revalidate, so the first read after a
 * TTL expiry pays the whole fan-out. The political axis is the slowest cold:
 * Represent asks for <= 60 req/min, so the paced producers cost ~1s per place
 * per producer when cold. This handler traverses EVERY join for every watched
 * place so one call (or one schedule tick) leaves all producer caches warm.
 *
 * Wasm conventions (this host): handler is (args, ctx), args first; the graph
 * is read with ctx.gateway.cypher.query; cypher_query takes no bound
 * parameters. Manifest schedules pass empty args, so every field is optional.
 */

type Row = Record<string, any>

async function read(ctx: any, cypher: string): Promise<Row[]> {
  const res = await ctx.gateway.cypher.query({ cypher })
  if (!res) return []
  if (Array.isArray(res)) return res
  if (Array.isArray(res.rows)) return res.rows
  if (res.data && Array.isArray(res.data.rows)) return res.data.rows
  return []
}

/**
 * Keep every join warm: traverse the political axis (MP, all reps), the five
 * census figures, and the live feeds (alerts, weather, AQHI, rivers) for
 * every watched CaPlace, so a user's read answers from cache instead of
 * paying the cold fan-out (the Represent producers are paced to 1 call/s and
 * dominate a cold load). Returns per-place counts as a freshness report.
 */
export async function warmLiveFeeds(args: { limit?: number }, ctx: any) {
  const rows = await read(ctx, `
    MATCH (p:CaPlace)
    OPTIONAL MATCH (p)-[:HAS_SEAT]->(s:CaSeat)
    WITH p, count(s) AS seat
    OPTIONAL MATCH (p)-[:HAS_REP]->(rep:ElectedRep)
    WITH p, seat, count(rep) AS reps
    OPTIONAL MATCH (p)-[:HAS_POPULATION]->(c1:CaPopulation)
    WITH p, seat, reps, count(c1) AS pop
    OPTIONAL MATCH (p)-[:HAS_MEDIAN_AGE]->(c2:CaMedianAge)
    WITH p, seat, reps, pop, count(c2) AS age
    OPTIONAL MATCH (p)-[:HAS_HOUSEHOLD_INCOME]->(c3:CaHouseholdIncome)
    WITH p, seat, reps, pop, age, count(c3) AS income
    OPTIONAL MATCH (p)-[:HAS_DWELLING_VALUE]->(c4:CaDwellingValue)
    WITH p, seat, reps, pop, age, income, count(c4) AS dwelling
    OPTIONAL MATCH (p)-[:HAS_UNEMPLOYMENT]->(c5:CaUnemployment)
    WITH p, seat, reps, pop, age, income, dwelling, count(c5) AS unemployment
    OPTIONAL MATCH (p)-[:HAS_ALERT]->(al:CaWeatherAlert)
    WITH p, seat, reps, pop, age, income, dwelling, unemployment, count(al) AS alerts
    OPTIONAL MATCH (p)-[:HAS_WEATHER]->(w:LocalWeather)
    WITH p, seat, reps, pop, age, income, dwelling, unemployment, alerts, count(w) AS weatherSites
    OPTIONAL MATCH (p)-[:HAS_AIR]->(a:AirQualityObs)
    WITH p, seat, reps, pop, age, income, dwelling, unemployment, alerts, weatherSites, count(a) AS airStations
    OPTIONAL MATCH (p)-[:HAS_RIVER]->(r:RiverReading)
    RETURN p.name AS place, seat, reps, pop, age, income, dwelling, unemployment,
           alerts, weatherSites, airStations, count(r) AS riverReadings
    LIMIT 100
  `)
  return {
    warmedAt: new Date().toISOString(),
    placesWarmed: rows.length,
    places: rows,
  }
}

/* A little inside the shortest live TTL, so the live caches never go cold
   between ticks; the weekly axes answer from cache on almost every tick.
   NOTE: manifest schedules are adoption-gated (realm-spec) and do not fire
   when installed through the MCP door — embabel/me#1152. The verb remains
   directly callable. */
defineSchedule('warmLiveFeeds', '0 */9 * * * *')
