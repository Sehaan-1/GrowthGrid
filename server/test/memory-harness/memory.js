// In-memory stand-ins for the Mongoose models so the API can be booted and
// tested without a MongoDB server (used by test/memory-harness). Implements the
// exact subset of the Mongoose API the routes and services rely on: chainable
// find/findOne (sort/limit/select/populate/lean/distinct), create, insertMany,
// updateOne($set/$setOnInsert, upsert), findOneAndUpdate, countDocuments,
// estimatedDocumentCount, exists, aggregate (via mingo) and doc-level
// save/populate/toObject. All ids are 24-char hex strings, which keeps
// ObjectId comparisons trivial (string equality) and passes
// mongoose.isValidObjectId checks in the routes.

import { randomBytes } from 'node:crypto';
import { Aggregator, Query as MingoQuery } from 'mingo';

const stores = new Map(); // collection name -> Map(id -> raw object)

const storeFor = (name) => {
  if (!stores.has(name)) stores.set(name, new Map());
  return stores.get(name);
};

// populate path -> backing collection
const REFS = { client: 'clients', campaign: 'campaigns', user: 'users' };

const clone = (v) => {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return new Date(v.getTime());
  if (Array.isArray(v)) return v.map(clone);
  if (typeof v === 'object') {
    const out = {};
    for (const [k, val] of Object.entries(v)) out[k] = clone(val);
    return out;
  }
  return v;
};

const matches = (filter) => {
  if (!filter || Object.keys(filter).length === 0) return () => true;
  const q = new MingoQuery(filter);
  return (doc) => q.test(doc);
};

function applyProjection(raw, select) {
  if (!select) return raw;
  const fields = select.split(/\s+/).filter(Boolean);
  const out = { _id: raw._id };
  for (const f of fields) if (!f.startsWith('-') && f in raw) out[f] = raw[f];
  return out;
}

function applySort(docs, sort) {
  const entries = Object.entries(sort);
  const cmpVal = (a, b) => {
    if (a == null && b == null) return 0;
    if (a == null) return -1;
    if (b == null) return 1;
    const av = a instanceof Date ? a.getTime() : a;
    const bv = b instanceof Date ? b.getTime() : b;
    return av < bv ? -1 : av > bv ? 1 : 0;
  };
  return [...docs].sort((a, b) => {
    for (const [key, dir] of entries) {
      const cmp = cmpVal(a[key], b[key]);
      if (cmp !== 0) return cmp * Math.sign(dir);
    }
    return 0;
  });
}

function populateRaw(raw, path, select) {
  const id = raw[path];
  if (id === null || id === undefined || typeof id === 'object') return raw;
  const target = storeFor(REFS[path] ?? `${path}s`).get(String(id));
  const populated = target ? clone(target) : null;
  return { ...raw, [path]: populated ? applyProjection(populated, select) : null };
}

class Doc {
  constructor(model, raw) {
    Object.defineProperty(this, '$model', { value: model, enumerable: false });
    Object.assign(this, clone(raw));
  }
  async save() {
    this.updatedAt = new Date();
    if (!this.createdAt) this.createdAt = this.updatedAt;
    this.$model.$store.set(String(this._id), clone(this));
    return this;
  }
  async populate(path, select) {
    Object.assign(this, populateRaw(this, path, select));
    return this;
  }
  toObject() {
    return clone(this);
  }
  toJSON() {
    return this.toObject();
  }
}

class Query {
  constructor(model, filter, { single = false } = {}) {
    this.$model = model;
    this.$filter = filter;
    this.$single = single;
    this.$sort = null;
    this.$limit = null;
    this.$select = null;
    this.$lean = false;
    this.$populate = [];
    this.$distinct = null;
  }
  sort(s) { this.$sort = s; return this; }
  limit(n) { this.$limit = n; return this; }
  select(s) { this.$select = s; return this; }
  lean() { this.$lean = true; return this; }
  populate(path, select) { this.$populate.push([path, select]); return this; }
  distinct(field) { this.$distinct = field; return this; }
  then(resolve, reject) { return this.exec().then(resolve, reject); }

  async exec() {
    const store = this.$model.$store;
    let raws = [...store.values()].filter(matches(this.$filter));

    if (this.$distinct) {
      const seen = [];
      for (const raw of raws) {
        const v = raw[this.$distinct];
        if (!seen.some((s) => String(s) === String(v))) seen.push(v);
      }
      return seen;
    }

    if (this.$sort) raws = applySort(raws, this.$sort);
    if (this.$limit != null) raws = raws.slice(0, this.$limit);

    let docs = raws.map((raw) => (this.$lean ? clone(raw) : new Doc(this.$model, raw)));
    for (const [path, select] of this.$populate) {
      docs = docs.map((d) => {
        const raw = this.$lean ? d : d.toObject();
        const populated = populateRaw(raw, path, select);
        return this.$lean ? populated : Object.assign(d, populated);
      });
    }
    if (this.$select) {
      docs = docs.map((d) => {
        const raw = this.$lean ? d : d.toObject();
        const projected = applyProjection(raw, this.$select);
        return this.$lean ? projected : Object.assign(d, projected);
      });
    }
    return this.$single ? docs[0] ?? null : docs;
  }
}

export function modelFor(collectionName, defaults = {}) {
  const store = storeFor(collectionName);

  class Model {
    static get $store() { return store; }
    static get modelName() { return collectionName; }

    static find(filter = {}) { return new Query(Model, filter); }
    static findOne(filter = {}) { return new Query(Model, filter, { single: true }); }
    static findById(id) { return new Query(Model, { _id: String(id) }, { single: true }); }

    static async countDocuments(filter = {}) {
      return [...store.values()].filter(matches(filter)).length;
    }
    static async estimatedDocumentCount() { return store.size; }
    static async exists(filter = {}) {
      const found = [...store.values()].find(matches(filter));
      return found ? { _id: found._id } : null;
    }

    static async create(input) {
      const now = new Date();
      const raw = {
        ...clone(defaults),
        ...clone(input),
        _id: input._id ?? randomBytes(12).toString('hex'),
        createdAt: input.createdAt ?? now,
        updatedAt: input.updatedAt ?? now,
      };
      store.set(String(raw._id), raw);
      return new Doc(Model, raw);
    }

    static async insertMany(inputs) {
      const out = [];
      for (const input of inputs) out.push(await Model.create(input));
      return out;
    }

    static async updateOne(filter, update = {}, { upsert = false } = {}) {
      const existing = [...store.values()].find(matches(filter));
      if (existing) {
        Object.assign(existing, clone(update.$set ?? {}), { updatedAt: new Date() });
        return { acknowledged: true, modifiedCount: 1, upsertedCount: 0 };
      }
      if (!upsert) return { acknowledged: true, modifiedCount: 0, upsertedCount: 0 };
      const now = new Date();
      const raw = {
        ...clone(defaults),
        ...clone(filter),
        ...clone(update.$setOnInsert ?? {}),
        ...clone(update.$set ?? {}),
        _id: filter._id ?? randomBytes(12).toString('hex'),
        createdAt: now,
        updatedAt: now,
      };
      store.set(String(raw._id), raw);
      return { acknowledged: true, modifiedCount: 0, upsertedCount: 1 };
    }

    static async findOneAndUpdate(filter, update = {}, { upsert = false, new: returnNew = true } = {}) {
      await Model.updateOne(filter, update, { upsert });
      const found = [...store.values()].find(matches(filter));
      return found && returnNew ? new Doc(Model, found) : null;
    }

    static aggregate(pipeline) {
      const raws = [...store.values()].map(clone);
      const result = new Aggregator(pipeline, {
        collectionResolver: (name) => [...storeFor(name).values()].map(clone),
      }).run(raws);
      return Promise.resolve(result);
    }
  }

  return Model;
}
