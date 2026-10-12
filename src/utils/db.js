const mongoose = require("mongoose");

let connectionPromise;

/**
 * Connexion MongoDB partagée : un seul établissement de connexion à la fois.
 * Sur Vercel, elle est ouverte à la première requête (app.js) ; en local, dès le démarrage
 * (server.js), pour que la première requête n'attende pas la négociation avec Atlas.
 */
const connectDatabase = async () => {
  if (mongoose.connection.readyState === 1) return mongoose.connection;
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI environment variable is required");
  if (!connectionPromise) {
    connectionPromise = mongoose
      .connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000, family: 4 })
      .finally(() => {
        connectionPromise = undefined;
      });
  }
  await connectionPromise;
  return mongoose.connection;
};

module.exports = { connectDatabase };
