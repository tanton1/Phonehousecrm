// ARCHIVED LEGACY ENTRYPOINT — DO NOT DEPLOY.
// Supported channel webhooks are handled by the signed Express routes.
const functions = require('firebase-functions');

exports.pancakeWebhook = functions.https.onRequest((_req, res) => {
  res.status(410).json({
    success: false,
    code: 'LEGACY_PANCAKE_WEBHOOK_RETIRED',
    message: 'Webhook này đã ngừng hoạt động. Sử dụng Express connector của PhoneHouse CRM.'
  });
});
