const mongoose = require("mongoose");
const { rateLimit, ipKeyGenerator } = require("express-rate-limit");

/**
 * Compteurs de limitation partagés dans MongoDB. Le stockage en mémoire par défaut
 * est inefficace sur Vercel : chaque instance serverless a sa propre mémoire.
 */
const hitSchema = new mongoose.Schema(
  { _id: String, hits: { type: Number, default: 0 }, expiresAt: { type: Date, required: true } },
  { versionKey: false, collection: "ratelimits" }
);
hitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
const RateLimitHit = mongoose.models.RateLimitHit || mongoose.model("RateLimitHit", hitSchema);

class MongoRateLimitStore {
  constructor(prefix) {
    this.prefix = `${prefix}:`;
    this.localKeys = false;
  }

  init(options) {
    this.windowMs = options.windowMs;
  }

  async increment(key, attempt = 0) {
    const id = this.prefix + key;
    const now = new Date();
    const current = await RateLimitHit.findOneAndUpdate(
      { _id: id, expiresAt: { $gt: now } },
      { $inc: { hits: 1 } },
      { returnDocument: "after" }
    ).lean();
    if (current) return { totalHits: current.hits, resetTime: current.expiresAt };

    const expiresAt = new Date(now.getTime() + this.windowMs);
    try {
      const fresh = await RateLimitHit.findOneAndUpdate(
        { _id: id },
        { $set: { hits: 1, expiresAt } },
        { returnDocument: "after", upsert: true }
      ).lean();
      return { totalHits: fresh.hits, resetTime: fresh.expiresAt };
    } catch (error) {
      // Deux requêtes simultanées peuvent créer le même compteur : on réessaie une fois.
      if (error?.code === 11000 && attempt === 0) return this.increment(key, 1);
      throw error;
    }
  }

  async decrement(key) {
    await RateLimitHit.updateOne({ _id: this.prefix + key, hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }

  async resetKey(key) {
    await RateLimitHit.deleteOne({ _id: this.prefix + key });
  }
}

const createLimiter = ({ name, windowMs, limit, keyGenerator, message, skipSuccessfulRequests = false }) =>
  rateLimit({
    windowMs,
    limit,
    skipSuccessfulRequests,
    standardHeaders: true,
    legacyHeaders: false,
    // En cas de panne du compteur, on laisse passer plutôt que de bloquer tout le monde.
    passOnStoreError: true,
    skip: () => process.env.NODE_ENV === "test",
    store: process.env.NODE_ENV === "test" ? undefined : new MongoRateLimitStore(name),
    ...(keyGenerator ? { keyGenerator } : {}),
    message: { error: message || "Trop de tentatives, réessayez plus tard." },
  });

/** Clé IP + identifiant saisi : limite le bourrage d'identifiants sur un même compte. */
const ipAndIdentifierKey = (req) =>
  `${ipKeyGenerator(req.ip || "")}|${String(req.body?.email || "").trim().toLowerCase().slice(0, 120)}`;

module.exports = { createLimiter, ipAndIdentifierKey, MongoRateLimitStore };
