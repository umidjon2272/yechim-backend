/**
 * Local dev entry point — starts the Express app (see app.js) listening on
 * a real port. Not used by Vercel; the serverless deployment uses
 * /api/index.js instead, which imports the same app.js.
 */
const app = require('./app')

const PORT = process.env.PORT || 4000

app.listen(PORT, () => {
  console.log(`ZENIX CRM mock-server running at http://localhost:${PORT}`)
  console.log('Seeded login: admin@zenix.com / admin123 (SUPER_ADMIN)')
  console.log('Also: sardor@zenix.com / sardor123 (SALES), javohir@zenix.com / javohir123 (INSTALLER)')
})
