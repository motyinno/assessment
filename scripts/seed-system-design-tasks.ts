/**
 * Seed the system-design task pool (SystemDesignTask) with a set of classic,
 * well-structured problems. Idempotent — a task is skipped if one with the same
 * title already exists, so it is safe to run against prod more than once.
 *
 * Usage:
 *   npx tsx scripts/seed-system-design-tasks.ts
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const TASKS: Array<{
  title: string;
  difficulty: string;
  description: string;
}> = [
  {
    title: "Design a URL Shortener (TinyURL / bit.ly)",
    difficulty: "mid+",
    description: `Design a service that turns long URLs into short, unique aliases and redirects users from the alias back to the original URL.

FUNCTIONAL REQUIREMENTS
• Create a short URL for a given long URL; optionally accept a custom alias.
• Redirect a short URL to its original URL.
• Optional: link expiration (TTL) and per-link click analytics.

NON-FUNCTIONAL REQUIREMENTS
• Redirects must be low-latency (< 50 ms p99) and highly available (reads >> writes).
• Short codes are unique and hard to guess; the system is read-heavy (~100:1 read/write).
• Durable — links must not be lost.

SCALE (back-of-envelope)
• ~100M new URLs/month, ~10B redirects/month.
• 5-year horizon; estimate storage for the mapping table and required QPS.

DISCUSS
• Short-code generation: base62 of an auto-increment ID vs. hashing (MD5/SHA + truncation) vs. a pre-generated key range (KGS). Collision handling and code length math.
• Data model & storage choice (KV store vs. relational); why a relational unique index or a KV store fits.
• Read path caching (CDN / Redis) and cache-invalidation on expiry.
• Scaling writes: ID generation without a single hot counter, sharding, replication.
• Analytics pipeline (async, non-blocking the redirect).

STRONG SIGNAL: clear capacity math, a defensible key-generation scheme with collision reasoning, and a redirect path that stays fast under cache misses.`,
  },
  {
    title: "Design a Distributed Rate Limiter",
    difficulty: "sen-",
    description: `Design a rate limiter that caps how many requests a client (user / API key / IP) may make in a time window, usable as a shared service across many application servers.

FUNCTIONAL REQUIREMENTS
• Enforce limits like "100 requests / minute per API key".
• Support multiple rules/tiers and return remaining-quota + retry-after info.
• Reject over-limit requests cheaply (HTTP 429).

NON-FUNCTIONAL REQUIREMENTS
• Very low added latency (< 5–10 ms) on the hot path.
• Correct under a distributed fleet — a client's limit is global, not per-server.
• Fail-open vs. fail-closed behavior must be a conscious choice.

SCALE
• Millions of clients, 100k+ QPS across the fleet; limits evaluated on every request.

DISCUSS
• Algorithms: fixed window, sliding-window log, sliding-window counter, token bucket, leaky bucket — trade-offs (burst behavior, memory, boundary spikes).
• Where state lives: in-process vs. centralized (Redis) vs. hybrid; atomicity via Redis Lua / INCR+EXPIRE.
• Race conditions and the "distributed counter" problem; sync intervals if using local counters.
• Handling clock skew, hot keys, and Redis failure (degradation strategy).
• Placement: API gateway / middleware / sidecar.

STRONG SIGNAL: picks an algorithm and justifies it against burst requirements, makes the counter update atomic, and reasons explicitly about the failure mode.`,
  },
  {
    title: "Design a News Feed (Twitter / Instagram home timeline)",
    difficulty: "sen-",
    description: `Design the home timeline: when a user opens the app they see a ranked, reverse-chronological feed of posts from accounts they follow.

FUNCTIONAL REQUIREMENTS
• Publish a post; followers see it in their feed.
• Fetch a user's feed (paginated, near real-time).
• Follow / unfollow; feed reflects the current follow graph.

NON-FUNCTIONAL REQUIREMENTS
• Feed load must be fast (< 200 ms) and highly available.
• Eventual consistency is acceptable (a post can appear a few seconds late).
• Read-heavy; must handle celebrity accounts with tens of millions of followers.

SCALE
• ~500M users, ~200M DAU, avg 200 follows; hundreds of millions of posts/day.

DISCUSS
• Fan-out-on-write (push) vs. fan-out-on-read (pull) vs. HYBRID — and precisely why the "celebrity problem" forces a hybrid.
• Feed storage (per-user timeline cache in Redis) and how much to precompute.
• Data models: posts, social graph, timeline; sharding keys.
• Ranking (chrono vs. ML-ranked) and where it fits without hurting latency.
• Pagination, deduplication, and handling unfollow / deletes.

STRONG SIGNAL: recognizes push doesn't scale for celebrities, proposes a hybrid with a clear threshold, and separates the write fan-out from the read path.`,
  },
  {
    title: "Design a Chat / Messaging System (WhatsApp / Messenger)",
    difficulty: "sen-",
    description: `Design a real-time 1:1 (and small-group) messaging system with delivery/read receipts and presence.

FUNCTIONAL REQUIREMENTS
• Send/receive messages in real time; support offline delivery (store-and-forward).
• Delivery + read receipts; online/last-seen presence.
• Message history persistence and ordering within a conversation.

NON-FUNCTIONAL REQUIREMENTS
• Low end-to-end latency; highly available; durable (no lost messages).
• Ordered, exactly-once-feeling delivery per conversation.
• Scales to hundreds of millions of concurrent connections.

SCALE
• ~1B users, ~50B messages/day, tens of millions of concurrent long-lived connections.

DISCUSS
• Connection layer: WebSocket / long-poll; a gateway that maps user → connected server (presence/session registry).
• How server A routes a message to a user connected to server B (message queue / pub-sub / routing service).
• Storage: message store choice, per-conversation partitioning, ordering (sequence IDs / timestamps + tiebreak).
• Offline users: push notifications + queued delivery; sync on reconnect.
• Group fan-out, receipts, and idempotency/dedup.
• (Bonus) end-to-end encryption implications.

STRONG SIGNAL: nails the "two users on different gateway servers" routing problem, guarantees per-conversation ordering, and handles offline store-and-forward.`,
  },
  {
    title: "Design a Ride-Hailing Nearby-Drivers Service (Uber / Lyft)",
    difficulty: "sen",
    description: `Design the core matching layer: riders request a ride and are matched with nearby available drivers, with live location tracking.

FUNCTIONAL REQUIREMENTS
• Drivers continuously report location; riders request a ride from a pickup point.
• Find nearby available drivers and match rider↔driver; track the trip live.
• Update driver availability (available / on-trip / offline).

NON-FUNCTIONAL REQUIREMENTS
• Matching and "nearby" queries must be fast (< 1 s) and highly available.
• Handle very high write volume from driver location pings.
• Consistency: a driver must not be matched to two riders.

SCALE
• Millions of active drivers pinging every ~4 s → millions of location writes/sec at peak; high query volume in dense cities.

DISCUSS
• Geospatial indexing: geohash / Google S2 / quadtree; how to query "drivers within radius" and handle cell boundaries + hotspots.
• Storing rapidly-changing location (in-memory grid / Redis geo) vs. durable store; write amplification.
• The matching service and avoiding double-booking (locking / atomic state transition / dispatch queue).
• Sharding by geography; dense-city hotspots and rebalancing.
• Live trip tracking channel and ETA updates.

STRONG SIGNAL: chooses a concrete spatial index and explains boundary/hotspot handling, separates the high-write location pipeline from matching, and prevents double-assignment.`,
  },
];

async function main() {
  let added = 0;
  let skipped = 0;
  for (const task of TASKS) {
    const existing = await prisma.systemDesignTask.findFirst({
      where: { title: task.title },
    });
    if (existing) {
      skipped++;
      continue;
    }
    await prisma.systemDesignTask.create({ data: task });
    added++;
  }
  console.log(`System design tasks seeded: ${added} added, ${skipped} skipped.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
