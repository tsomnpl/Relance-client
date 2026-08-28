// This file centralizes shared quota reads and updates for total generations.
const QUOTA_LIMIT = 5;
const GLOBAL_QUOTA_KEY = "total_generations";

const upstashUrl = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const upstashToken =
  process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

let memoryCounter = 0;

type QuotaState = {
  used: number;
  limit: number;
  exhausted: boolean;
};

type QuotaIncrementResult = {
  accepted: boolean;
  quota: QuotaState;
};

function hasRedisConfig() {
  return Boolean(upstashUrl && upstashToken);
}

async function callUpstash(command: string, args: (string | number)[]) {
  if (!upstashUrl || !upstashToken) {
    throw new Error("REDIS_NOT_CONFIGURED");
  }

  const encodedArgs = args.map((value) => encodeURIComponent(String(value))).join("/");
  const url = `${upstashUrl}/${command}${encodedArgs ? `/${encodedArgs}` : ""}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${upstashToken}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error("REDIS_COMMAND_FAILED");
  }

  return (await response.json()) as { result: unknown };
}

export async function getQuotaState(): Promise<QuotaState> {
  if (!hasRedisConfig()) {
    return {
      used: memoryCounter,
      limit: QUOTA_LIMIT,
      exhausted: memoryCounter >= QUOTA_LIMIT,
    };
  }

  const data = await callUpstash("get", [GLOBAL_QUOTA_KEY]);
  const used = Number(data.result ?? 0);

  return {
    used,
    limit: QUOTA_LIMIT,
    exhausted: used >= QUOTA_LIMIT,
  };
}

export async function incrementQuotaOnSuccess(): Promise<QuotaIncrementResult> {
  if (!hasRedisConfig()) {
    if (memoryCounter < QUOTA_LIMIT) {
      memoryCounter += 1;
      return {
        accepted: true,
        quota: {
          used: memoryCounter,
          limit: QUOTA_LIMIT,
          exhausted: memoryCounter >= QUOTA_LIMIT,
        },
      };
    }

    return {
      accepted: false,
      quota: {
        used: memoryCounter,
        limit: QUOTA_LIMIT,
        exhausted: true,
      },
    };
  }

  const increment = await callUpstash("incr", [GLOBAL_QUOTA_KEY]);
  const used = Number(increment.result ?? 0);

  if (used > QUOTA_LIMIT) {
    await callUpstash("decr", [GLOBAL_QUOTA_KEY]);

    return {
      accepted: false,
      quota: {
        used: QUOTA_LIMIT,
        limit: QUOTA_LIMIT,
        exhausted: true,
      },
    };
  }

  return {
    accepted: true,
    quota: {
      used,
      limit: QUOTA_LIMIT,
      exhausted: used >= QUOTA_LIMIT,
    },
  };
}
