import { createApp } from './app.js';
import { PORT } from './config.js';

const app = createApp();
app.listen(PORT, () => {
  console.log(`[huichat] server listening on http://localhost:${PORT}`);
});
