import { allowMethods } from "../_lib/shared.js";

const DEFAULT_PK = "pk_live_51TZC1LFsO1Kahb8d6LbEBo6efK1oqIUCgAfpoSPTUE3WDqpP6LlkKXQFqRThAGVjfp336IElOVxpKILQWJ3MN5lo009UyqPPu4";

export default function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  res.status(200).json({
    publicKey: process.env.VITE_STRIPE_PUBLIC_KEY || process.env.STRIPE_PUBLISHABLE_KEY || DEFAULT_PK,
    hasStripeSetup: Boolean(process.env.STRIPE_SECRET_KEY),
  });
}
