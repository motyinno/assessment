import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { hrmConfig, hrmConfigIssues, hrmSyncEnabled, HrmConfigError } from "@/lib/hrm/config";

const ENV_KEYS = [
  "HRM_SYNC_ENABLED",
  "HRM_KEYCLOAK_URL",
  "HRM_KEYCLOAK_REALM",
  "HRM_KEYCLOAK_CLIENT_ID",
  "HRM_KEYCLOAK_TOKEN_PATH",
  "HRM_API_URL",
  "HRM_USERNAME",
  "HRM_PASSWORD",
  "HRM_SYNC_PAGE_SIZE",
  "HRM_HTTP_TIMEOUT_MS",
  "HRM_HTTP_RETRIES",
] as const;

let savedEnv: Record<string, string | undefined>;

beforeEach(() => {
  savedEnv = {};
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
});

function setValidEnv() {
  process.env.HRM_KEYCLOAK_URL = "https://keycloak.example.com";
  process.env.HRM_API_URL = "https://hrm.example.com";
  process.env.HRM_USERNAME = "tech-user";
  process.env.HRM_PASSWORD = "secret";
}

describe("hrmSyncEnabled", () => {
  it("is true only for the exact string 'true'", () => {
    process.env.HRM_SYNC_ENABLED = "true";
    expect(hrmSyncEnabled()).toBe(true);
  });

  it.each(["True", "TRUE", "1", "yes", "", undefined])("is false for %j", (value) => {
    if (value === undefined) delete process.env.HRM_SYNC_ENABLED;
    else process.env.HRM_SYNC_ENABLED = value;
    expect(hrmSyncEnabled()).toBe(false);
  });
});

describe("hrmConfig", () => {
  it("throws HrmConfigError listing ALL missing required variables", () => {
    let caught: unknown;
    try {
      hrmConfig();
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HrmConfigError);
    const err = caught as HrmConfigError;
    expect(err.missing).toEqual(
      expect.arrayContaining(["HRM_KEYCLOAK_URL", "HRM_API_URL", "HRM_USERNAME", "HRM_PASSWORD"])
    );
    expect(err.missing.length).toBe(4);
  });

  it("returns a full config and strips trailing slashes from URLs", () => {
    setValidEnv();
    process.env.HRM_KEYCLOAK_URL = "https://keycloak.example.com/";
    process.env.HRM_API_URL = "https://hrm.example.com/";
    const cfg = hrmConfig();
    expect(cfg.keycloakUrl).toBe("https://keycloak.example.com");
    expect(cfg.apiUrl).toBe("https://hrm.example.com");
    expect(cfg.tokenPath).toBe("/auth/realms/innowise-group/protocol/openid-connect/token");
  });

  it("does not trim the password value, only checks presence trimmed", () => {
    setValidEnv();
    process.env.HRM_PASSWORD = "secret ";
    const cfg = hrmConfig();
    expect(cfg.password).toBe("secret ");
  });

  it("treats a whitespace-only password as missing", () => {
    setValidEnv();
    process.env.HRM_PASSWORD = "   ";
    expect(() => hrmConfig()).toThrow(HrmConfigError);
  });
});

describe("hrmConfigIssues", () => {
  it("does not throw and returns issues for missing vars", () => {
    const issues = hrmConfigIssues();
    expect(issues.length).toBeGreaterThan(0);
  });

  it("returns an empty array when config is valid", () => {
    setValidEnv();
    expect(hrmConfigIssues()).toEqual([]);
  });
});

describe("intEnv (via hrmConfig)", () => {
  it("falls back to the default on garbage input", () => {
    setValidEnv();
    process.env.HRM_HTTP_TIMEOUT_MS = "not-a-number";
    const cfg = hrmConfig();
    expect(cfg.timeoutMs).toBe(20_000);
  });

  it("falls back to the default when out of range", () => {
    setValidEnv();
    process.env.HRM_HTTP_RETRIES = "999";
    const cfg = hrmConfig();
    expect(cfg.attempts).toBe(3);
  });

  it("accepts a valid override", () => {
    setValidEnv();
    process.env.HRM_SYNC_PAGE_SIZE = "50";
    const cfg = hrmConfig();
    expect(cfg.pageSize).toBe(50);
  });
});
