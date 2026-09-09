/**
 * Ping every HRM endpoint the integration uses and print statuses + counts.
 *
 * Usage:
 *   npm run hrm:ping
 *   npm run hrm:ping -- --simulate-401     # poison the token cache, exercise the reset+retry path
 *   npm run hrm:ping -- --page-size 5      # force pagination into several pages
 *   npm run hrm:ping -- --show-token       # print the real pre-signed-link (a live ~5min credential)
 *
 * LOCAL / CI ONLY. The production image doesn't contain src/ or tsconfig.json,
 * so this doesn't run inside the app container. In prod, use
 * POST /api/hrm/sync?dryRun=1 instead (S04).
 */
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());

import { hrmConfigIssues } from "@/lib/hrm/config";
import {
  getHrmAccessToken,
  hrmTokenStats,
  primeHrmTokenCache,
} from "@/lib/hrm/auth";
import { hrmFetch } from "@/lib/hrm/http";
import { isHrmError } from "@/lib/hrm/http";
import { fetchOrgUnits } from "@/lib/hrm/org-units";
import { loadDictionariesWithInfo } from "@/lib/hrm/dictionaries";
import { searchEmployees } from "@/lib/hrm/employees";
import {
  buildPhotoUrl,
  fileTokenStats,
  getFileToken,
} from "@/lib/hrm/photos";
import { HRM_DISMISSAL_ACTUAL } from "@/lib/hrm/types";

interface Args {
  simulate401: boolean;
  pageSize: number | null;
  showToken: boolean;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { simulate401: false, pageSize: null, showToken: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--simulate-401") args.simulate401 = true;
    else if (argv[i] === "--show-token") args.showToken = true;
    else if (argv[i] === "--page-size") args.pageSize = Number(argv[++i]);
  }
  return args;
}

function maskLink(url: string): string {
  const tokenIdx = url.indexOf("fileToken=");
  if (tokenIdx === -1) return url;
  const prefix = url.slice(0, tokenIdx + "fileToken=".length);
  const rest = url.slice(tokenIdx + "fileToken=".length);
  return `${prefix}${rest.slice(0, 8)}...(${rest.length} chars total, masked)`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // 0. config
  const issues = hrmConfigIssues();
  if (issues.length > 0) {
    console.error("HRM config problems:");
    for (const issue of issues) console.error(`  - ${issue}`);
    process.exit(1);
  }
  console.log("config: OK");

  // 1. token — two calls, expect one grant (cache hit on the second)
  await getHrmAccessToken();
  await getHrmAccessToken();
  const tokenStatsAfterTwoCalls = hrmTokenStats();
  console.log(`token: OK (grants=${tokenStatsAfterTwoCalls.grants})`);

  if (args.simulate401) {
    // Poison the cache with a token the server will reject, so the next
    // request actually gets a 401 and exercises reset+retry — merely
    // resetting the cache would just hand out a fresh valid token instead.
    primeHrmTokenCache("eyJhbGciOiJub25lIn0.e30.", Date.now() + 600_000);
  }

  // 2. transport: cheapest authenticated GET
  const orgUnitsPingPath = "/api/employee-management/api/v1/org-units";
  await hrmFetch(orgUnitsPingPath);
  console.log("transport: OK");

  // 3. org-units
  let orgUnits;
  try {
    orgUnits = await fetchOrgUnits();
    console.log(`org-units: OK (count=${orgUnits.length})`);
  } catch (e) {
    console.error("org-units: FAILED", describeError(e));
    process.exit(1);
  }

  // 4. dictionaries
  try {
    const { dictionaries, info } = await loadDictionariesWithInfo();
    console.log(
      `dictionaries: OK (professionalLevel=${dictionaries.professionalLevel.size}, ` +
        `jobTitle=${dictionaries.jobTitle.size}, employeeStatus=${dictionaries.employeeStatus.size}, ` +
        `collisions=${info.collisions})`
    );
  } catch (e) {
    console.error("dictionaries: FAILED", describeError(e));
    process.exit(1);
  }

  // 5. employees — full paginated crawl
  try {
    let page = 0;
    let actualCount = 0;
    let bodyShape: string | null = null;
    let totalSource: string | null = null;
    const requestedSize = args.pageSize ?? undefined;
    for (;;) {
      const result = await searchEmployees({
        page,
        size: requestedSize,
        dismissalStatus: HRM_DISMISSAL_ACTUAL,
      });
      if (page === 0) {
        totalSource = result.totalSource;
        bodyShape = result.totalSource === "body" ? "spring-page" : "array";
      }
      actualCount += result.items.length;
      if (!result.hasMore) break;
      page++;
    }
    console.log(
      `employees: OK (ACTUAL=${actualCount}, pages=${page + 1}, requestedSize=${
        requestedSize ?? "default"
      }, bodyShape=${bodyShape}, totalSource=${totalSource})`
    );
  } catch (e) {
    console.error("employees: FAILED", describeError(e));
    process.exit(1);
  }

  // 6-7. photos: fileToken + pre-signed link
  try {
    const fileToken = await getFileToken();
    // A representative filename is enough to sanity-check the URL shape.
    const url = buildPhotoUrl("photos/sample.jpg", fileToken);
    const printed = args.showToken ? url : maskLink(url);
    console.log(`photos: OK (fileTokenLength=${fileToken.length})`);
    console.log(`  pre-signed-link: ${printed}`);
    if (!args.showToken) {
      console.log("  (pass --show-token to print the live link and curl it for a 302 check)");
    }
  } catch (e) {
    console.error("photos: FAILED", describeError(e));
    process.exit(1);
  }

  const finalTokenStats = hrmTokenStats();
  const finalFileTokenStats = fileTokenStats();
  console.log(`\ngrants=${finalTokenStats.grants} cacheHits=${finalTokenStats.cacheHits}`);
  console.log(
    `fileToken: fetches=${finalFileTokenStats.fetches} cacheHits=${finalFileTokenStats.cacheHits} fallbackTtlUsed=${finalFileTokenStats.fallbackTtlUsed}`
  );
  console.log("\nAll six endpoints OK.");
}

function describeError(e: unknown): string {
  if (isHrmError(e)) {
    return `[${e.kind}] status=${e.status} endpoint=${e.endpoint} attempts=${e.attempts} body=${e.bodySnippet}`;
  }
  return e instanceof Error ? e.message : String(e);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
