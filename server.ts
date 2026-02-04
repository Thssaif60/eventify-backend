import { env } from "./config/env.js";
import { buildApp } from "./app.js";

const app = buildApp();

app.listen(env.PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Eventify backend running on http://localhost:${env.PORT}`);
});
