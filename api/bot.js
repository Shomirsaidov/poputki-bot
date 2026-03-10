// api/bot.js  (for Vercel /api/bot endpoint)

const TELEGRAM_API = "https://api.telegram.org";

export default async function handler(req, res) {
  // Hardcoded Supabase Credentials (Overriding Vercel Env Vars to guarantee connection)
  const BOT_TOKEN = process.env.BOT_TOKEN || '8669833278:AAFHxzU9jZUZIWVrHdogUsYrkQmd_F05MZA';
  const MINI_APP_URL = process.env.MINI_APP_URL || 'https://poputki.online';
  const SUPABASE_URL = 'https://xzvtjcqwmuezxyeerkki.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6dnRqY3F3bXVlenh5ZWVya2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMjA0MTEsImV4cCI6MjA4ODY5NjQxMX0.My0BKDF4tC9egh1nZbs9G0U7KKvwJixIuo71wuPPFDo';

  // --- GET Setup Endpoint ---
  if (req.method === "GET") {
    try {
      const webhookUrl = `https://${req.headers.host}/api/bot`;
      const setWebhookUrl = `${TELEGRAM_API}/bot${BOT_TOKEN}/setWebhook`;

      const response = await fetch(setWebhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: webhookUrl,
          allowed_updates: ["message", "edited_message", "my_chat_member", "chat_member", "callback_query"]
        })
      });

      const data = await response.json();
      return res.status(200).send(`
        <html>
          <body style="font-family: sans-serif; padding: 40px; text-align: center;">
            <h1 style="color: ${data.ok ? '#22c55e' : '#ef4444'}">${data.ok ? '✅ Webhook Setup Successful' : '❌ Webhook Setup Failed'}</h1>
            <p>URL: <code>${webhookUrl}</code></p>
            <pre style="background: #f4f4f4; padding: 20px; border-radius: 10px; text-align: left; display: inline-block;">${JSON.stringify(data, null, 2)}</pre>
            <p style="margin-top: 20px;">Allowed Updates: <b>message, edited_message, my_chat_member, chat_member</b></p>
            <p><a href="/">Go to Home</a></p>
          </body>
        </html>
      `);
    } catch (err) {
      return res.status(500).send(`Error: ${err.message}`);
    }
  }

  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const update = req.body;

    // Support multiple update types for group synchronization
    const message = update.message || update.edited_message;
    const memberUpdate = update.my_chat_member || update.chat_member;

    if (!message && !memberUpdate) {
      return res.status(200).json({ ok: true });
    }

    // Extract chat details
    const chat = (message || memberUpdate).chat;
    const chatId = chat.id;
    const chatType = chat.type;
    const chatTitle = chat.title || chat.first_name || 'Personal Chat';

    // Helper: Sync Group to Supabase
    const syncGroup = async () => {
      if (chatType === 'group' || chatType === 'supergroup') {
        const syncUrl = `${SUPABASE_URL}/rest/v1/telegram_groups?on_conflict=chat_id`;
        const resSync = await fetch(syncUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'apikey': SUPABASE_ANON_KEY,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Prefer': 'resolution=merge-duplicates'
          },
          body: JSON.stringify({
            chat_id: chatId.toString(),
            title: chatTitle
          })
        });
        return resSync;
      }
      return null;
    };

    // 1. Group / Supergroup logic -> Save to Supabase
    if (chatType === 'group' || chatType === 'supergroup') {
      const syncRes = await syncGroup();

      // Handle /test command for verification
      if (message && message.text && message.text.startsWith('/test')) {
        let statusMsg = "DB Sync Status: ";
        if (syncRes && syncRes.ok) {
          statusMsg += "✅ SUCCESS! Group ID saved/verified.";
        } else {
          const errText = syncRes ? await syncRes.text() : "Sync not triggered";
          statusMsg += `❌ FAILED. ${errText}`;
        }

        await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chat_id: chatId, text: statusMsg })
        });
      }

      return res.status(200).json({ ok: true });
    }

    // 2. Private chat logic -> Send Mini App Button
    if (chatType === 'private' && message) {
      const text = "Poputki.online – это современное приложение, которое делает междугородние поездки проще и выгоднее.\nТы еще ждешь?\n👇ЖМИ👇";
      const replyMarkup = {
        inline_keyboard: [[{ text: "Открыть приложение", web_app: { url: `${MINI_APP_URL}/search` } }]]
      };

      const persistentMenu = {
        keyboard: [
          [
            { text: "Создать поездку", web_app: { url: `${MINI_APP_URL}/create` } },
            { text: "Найти поездку", web_app: { url: `${MINI_APP_URL}/search` } }
          ],
          [
            { text: "Мои поездки", web_app: { url: `${MINI_APP_URL}/my-rides` } },
            { text: "Профиль", web_app: { url: `${MINI_APP_URL}/profile` } }
          ]
        ],
        resize_keyboard: true,
        persistent: true
      };

      await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Используйте меню ниже для быстрого доступа к функциям или нажмите кнопку:",
          reply_markup: persistentMenu
        })
      });

      await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text,
          reply_markup: replyMarkup
        })
      });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ ok: true });
  }
}
