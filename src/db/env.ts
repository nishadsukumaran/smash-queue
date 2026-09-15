/** Loads .env.local then .env for scripts run outside Next (seed, bootstrap). */
import { config } from "dotenv";
config({ path: ".env.local", quiet: true });
config({ quiet: true });
