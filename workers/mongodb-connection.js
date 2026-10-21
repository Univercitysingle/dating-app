const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store"
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS });
}

export class MongoDBConnection {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.clientPromise = null;
  }

  async getClient() {
    if (!this.env.MONGODB_URI) {
      throw new Error("MongoDB configuration is missing");
    }

    if (!this.clientPromise) {
      this.clientPromise = import("mongodb").then(({ MongoClient }) => {
        const client = new MongoClient(this.env.MONGODB_URI, {
          maxPoolSize: 1,
          minPoolSize: 0,
          serverSelectionTimeoutMS: 5000,
          connectTimeoutMS: 5000,
          maxIdleTimeMS: 20000
        });
        return client.connect().then(() => client);
      }).catch((error) => {
        this.clientPromise = null;
        throw error;
      });
    }

    return this.clientPromise;
  }

  async ping() {
    try {
      const client = await this.getClient();
      await client.db().command({ ping: 1 });
      return { ok: true };
    } catch {
      return { ok: false };
    }
  }

  async fetch(request) {
    if (request.method !== "POST" || new URL(request.url).pathname !== "/internal/ping") {
      return json({ error: "Not found" }, 404);
    }
    const result = await this.ping();
    return json({ status: result.ok ? "ok" : "unavailable" }, result.ok ? 200 : 503);
  }
}
