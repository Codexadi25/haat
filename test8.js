const email = require('./src/services/email');
const env = require('./src/config/env');
(async () => {
  try {
    await email.sendPasswordReset('test@example.com', 'http://localhost/reset');
    console.log("SUCCESS");
  } catch(e) {
    console.error("ERROR:", e.message);
  }
  process.exit();
})();
