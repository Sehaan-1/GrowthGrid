// Stand-in for the mongodb-memory-server package when running under the
// memory harness — the harness replaces the db connector anyway, so the
// embedded server is never actually needed.
export class MongoMemoryServer {
  static async create() {
    return { getUri: () => 'memory://harness' };
  }
}
