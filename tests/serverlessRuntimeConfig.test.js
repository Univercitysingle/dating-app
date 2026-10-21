const { getRuntimeConfig } = require("../serverless/runtimeConfig");

describe("getRuntimeConfig", () => {
  test("preserves legacy runtime defaults", () => {
    expect(getRuntimeConfig({})).toEqual({
      serverlessRuntime: false,
      enableInProcessCron: true,
      mongoMaxPoolSize: 10,
    });
  });

  test("disables in-process cron in serverless mode", () => {
    expect(getRuntimeConfig({ SERVERLESS_RUNTIME: "true" })).toEqual({
      serverlessRuntime: true,
      enableInProcessCron: false,
      mongoMaxPoolSize: 5,
    });
  });

  test("allows explicit cron disable in a non-serverless runtime", () => {
    expect(
      getRuntimeConfig({ ENABLE_IN_PROCESS_CRON: "false" }).enableInProcessCron
    ).toBe(false);
  });

  test("supports a valid MongoDB pool-size override", () => {
    expect(
      getRuntimeConfig({
        SERVERLESS_RUNTIME: "true",
        MONGO_MAX_POOL_SIZE: "8",
      }).mongoMaxPoolSize
    ).toBe(8);
  });

  test.each(["0", "-1", "101", "invalid", "8abc", ""])(
    "uses a safe default for invalid pool size %p",
    (value) => {
      expect(
        getRuntimeConfig({
          SERVERLESS_RUNTIME: "true",
          MONGO_MAX_POOL_SIZE: value,
        }).mongoMaxPoolSize
      ).toBe(5);
    }
  );

  test("does not mutate the supplied environment object", () => {
    const env = { SERVERLESS_RUNTIME: "true" };
    const original = { ...env };

    getRuntimeConfig(env);

    expect(env).toEqual(original);
  });
});
