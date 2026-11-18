// Stand-in for src/db.js when running under the memory harness.
export async function connectMongo() {
  return { name: 'memory-harness' };
}

export async function disconnectMongo() {}
