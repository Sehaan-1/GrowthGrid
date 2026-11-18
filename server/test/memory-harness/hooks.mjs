// Loader hooks: redirect the server's Mongoose model imports (and its db
// connector) to the in-memory harness implementations.
const MODELS = new Set(['User', 'Client', 'Campaign', 'Lead', 'MetricSnapshot', 'Notification']);

export async function resolve(specifier, context, nextResolve) {
  if (specifier === 'mongodb-memory-server') {
    return { url: new URL('./mongo-memory-server.js', import.meta.url).href, shortCircuit: true };
  }
  const resolved = await nextResolve(specifier, context);
  const url = resolved.url;

  const model = url.match(/\/server\/src\/models\/(\w+)\.js$/);
  if (model && MODELS.has(model[1])) {
    return { url: new URL(`./models/${model[1]}.js`, import.meta.url).href, shortCircuit: true };
  }
  if (/\/server\/src\/db\.js$/.test(url)) {
    return { url: new URL('./db.js', import.meta.url).href, shortCircuit: true };
  }
  return resolved;
}
