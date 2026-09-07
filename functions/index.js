const { onRequest } = require('firebase-functions/v2/https')
const { defineSecret } = require('firebase-functions/params')

const telegramBotToken = defineSecret('TELEGRAM_BOT_TOKEN')

exports.sendTelegram = onRequest({ cors: true, secrets: [telegramBotToken] }, async (request, response) => {
  if (request.method !== 'POST') {
    response.status(405).json({ error: 'Method not allowed' })
    return
  }

  const { chatId, message } = request.body || {}
  if (!chatId || !message) {
    response.status(400).json({ error: 'chatId and message are required' })
    return
  }

  const telegramResponse = await fetch(`https://api.telegram.org/bot${telegramBotToken.value()}/sendMessage`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text: message }),
  })

  const result = await telegramResponse.json()
  response.status(telegramResponse.ok ? 200 : 502).json(result)
})