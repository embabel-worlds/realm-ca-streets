#!/bin/sh
# tests/verify.sh — realm-ca-streets' battery against a LIVE appliance, in one command.
#
#   APPLIANCE=http://localhost:11043 AUTH=user:pass sh tests/verify.sh
#
# Keyless: every source is open. realm-uk-streets must be installed beside it (the Atlantic views
# read its labels).
#
#   L1  every view answers BY NAME on its defaults. A refusal or error fails. Views over watched
#       places may be empty on a world that watches none; the national views must return rows.
#   L2  the national Crime Severity Index read against StatCan's WDS directly: every CMA series
#       the realm reads for 2025, value for value.
#   L3  cost: the national read, cold, is ONE source call for every CMA.
#
# StatCan's WDS has scheduled downtime; when it is down the national checks fail and say so.
# The browser suites (tests/test.mjs and friends) are separate and not run here.
# The last line on success is exactly `ALL CHECKS PASS`; any failure exits 1.
set -eu
cd "$(dirname "$0")/.."
APPLIANCE=${APPLIANCE:-${APPLIANCE_URL:-http://localhost:11043}}
AUTH=${AUTH:-${EMBABEL_AUTH:-}}
[ -n "$AUTH" ] || { echo "set AUTH=user:pass for the target appliance"; exit 2; }
exec python3 - "$APPLIANCE" "$AUTH" <<'PY'
import base64, glob, json, re, sys, urllib.parse, urllib.request
import yaml

base, auth = sys.argv[1], sys.argv[2]
HDR = {"Authorization": "Basic " + base64.b64encode(auth.encode()).decode(), "Content-Type": "application/json"}
NATIONAL = {"CanadaCrimeOutliers", "CanadaGrowthOutliers", "CaCmasRanked", "CanadaCrimeMomentum", "TheImpunityIndex"}
fails = []

def check(what, ok, detail=""):
    print(("ok    " if ok else "FAIL  ") + what + (("  " + detail) if detail else ""))
    if not ok: fails.append(what)

def post(path, body):
    req = urllib.request.Request(base + path, json.dumps(body).encode(), HDR)
    try:
        with urllib.request.urlopen(req, timeout=600) as r: return json.load(r)
    except urllib.error.HTTPError as e:
        return {"status": "HTTP %d" % e.code, "error": e.read().decode()[:300]}

print("== L1: every view by name")
for f in sorted(glob.glob("views/*.yml")):
    for v in yaml.safe_load(open(f)) or []:
        env = post("/api/v1/views/%s/invoke" % urllib.parse.quote(v["name"]), {"args": {}})
        rows = env.get("data") or []
        ok = env.get("status") == "SUCCEEDED" and (rows or v["name"] not in NATIONAL)
        check("%-28s %4d rows" % (v["name"], len(rows)), ok, "" if ok else "%s %s" % (env.get("status"), str(env.get("error"))[:200]))

print("== L2 + L3: the national Crime Severity Index, 2025")
prod = next(p for p in yaml.safe_load(open("producers/streets.yml")) if p["name"] == "nationalCsiNow")
vectors = prod["args"]["vectorIds"].split(",")
url = ("https://www150.statcan.gc.ca/t1/wds/rest/getDataFromVectorByReferencePeriodRange?"
       + urllib.parse.urlencode({"vectorIds": ",".join(vectors), "startRefPeriod": "2025-01-01", "endReferencePeriod": "2025-12-31"}))
req = urllib.request.Request(url, headers={"Accept-Encoding": "identity", "User-Agent": "realm-ca-streets-battery"})
try:
    src = json.load(urllib.request.urlopen(req, timeout=120))
except Exception as e:
    src = None
    check("StatCan WDS answers", False, "unavailable (%s) — scheduled downtime?" % str(e)[:120])
r = post("/api/v1/admin/kg/execute", {"cypher":
    "MATCH (u:CaCmaSet {set: 'canada'})-[:LISTS_CSI_NOW {ai: {fresh: true}}]->(c:CaCmaCsiNow) RETURN c.vector AS vector, c.csi AS csi"})
got = {str(x["vector"]): x["csi"] for x in r.get("rows") or []}
check("national read, cold: 1 source call", r.get("apiCalls") == 1, "apiCalls=%s, %d rows" % (r.get("apiCalls"), len(got)))
if src is not None:
    want = {}
    for item in src:
        o = item.get("object") or {}
        pts = o.get("vectorDataPoint") or []
        if pts: want[str(o.get("vectorId"))] = pts[0].get("value")
    check("every CMA series the source publishes is read", set(want) == set(got), "source %d, realm %d" % (len(want), len(got)))
    diff = {k: (got.get(k), want[k]) for k in want if got.get(k) is not None and abs(float(got[k]) - float(want[k])) > 1e-9}
    check("CSI 2025 = StatCan's, series by series", not diff, str(dict(list(diff.items())[:3])))

print()
if fails:
    print("%d check(s) failed: %s" % (len(fails), "; ".join(fails))); sys.exit(1)
print("ALL CHECKS PASS")
PY
