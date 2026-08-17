// Legacy Vercel serverless entry point - wraps the same Express app used for
// local dev (backend/mock-server/app.js) so YECHIM CRM's login/API calls can
// work in demo deployments, not just on `npm run dev`.
//
// Deliberately plain CommonJS (`.cjs` extension forces this regardless of
// package.json "type": "module") and `require()`, so there is no ESM/CJS
// module-boundary ambiguity for Vercel's Node.js function bundler to resolve
// when it traces into backend/mock-server/app.js.
//
// IMPORTANT: this is still the mock/demo backend. Data lives in the function's
// in-memory state, which is NOT guaranteed to persist between invocations on
// Vercel. It is not a substitute for a real backend with a real database.
const app = require('../mock-server/app.js')

module.exports = (req, res) => app(req, res)
