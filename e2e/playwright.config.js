// End-to-end suite for all 4 Prism modes. Runs against dedicated test
// instances of the backend/frontend (ports 3099/5199, not the normal dev
// ports 3002/5174) so it never collides with a dev server already running,
// and always forces every AI provider to `mock` regardless of whatever
// real credentials are in backend/.env — these tests must be free,
// deterministic, and runnable on any machine with zero API keys or Ollama
// installed, not dependent on quota, network, or a locally running model.
const path = require('path');

module.exports = {
  testDir: './tests',
  timeout: 30000,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    launchOptions: {
      args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'],
    },
  },
  webServer: [
    {
      command: 'node server.js',
      cwd: path.join(__dirname, '..', 'backend'),
      port: 3099,
      env: {
        PORT: '3099',
        VISION_PROVIDER: 'mock',
        TTS_PROVIDER: 'mock',
        IMAGE_PROVIDER: 'mock',
      },
      reuseExistingServer: false,
      timeout: 20000,
    },
    {
      command: 'node serve.js',
      cwd: path.join(__dirname, '..', 'frontend'),
      port: 5199,
      env: { FRONTEND_PORT: '5199' },
      reuseExistingServer: false,
      timeout: 20000,
    },
  ],
};
