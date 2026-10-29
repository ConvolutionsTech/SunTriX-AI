import mongoose from "mongoose";

/**
 * Outside production, writing a field a schema doesn't declare throws instead
 * of being silently dropped, so drift between services and models fails tests.
 * Production stays lenient. Must be imported before any model is compiled.
 */
if (process.env.NODE_ENV !== "production") {
  mongoose.plugin((schema) => {
    if (schema.get("strict") === true) schema.set("strict", "throw");
  });
}
