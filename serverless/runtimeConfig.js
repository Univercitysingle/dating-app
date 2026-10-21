function getRuntimeConfig(env = process.env) {
  const serverlessRuntime = env.SERVERLESS_RUNTIME === "true";
  const configuredPoolSize = Number(env.MONGO_MAX_POOL_SIZE);
  const defaultPoolSize = serverlessRuntime ? 5 : 10;

  return {
    serverlessRuntime,
    enableInProcessCron:
      !serverlessRuntime && env.ENABLE_IN_PROCESS_CRON !== "false",
    mongoMaxPoolSize:
      Number.isInteger(configuredPoolSize) &&
      configuredPoolSize >= 1 &&
      configuredPoolSize <= 100
        ? configuredPoolSize
        : defaultPoolSize,
  };
}

module.exports = { getRuntimeConfig };
