// api/bot.js  (for Vercel /api/bot endpoint)

const TELEGRAM_API = "https://api.telegram.org";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const update = req.body;

    // Handle only messages; ignore other update types for simplicity
    const message = update.message || update.edited_message;
    if (!message) {
      return res.status(200).json({ ok: true });
    }

    const chatId = message.chat.id;
    const chatType = message.chat.type;

    // Environment Variables
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MINI_APP_URL = process.env.MINI_APP_URL || 'https://poputki.online';
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;

    // 1. Group / Supergroup logic -> Save to Supabase
    if (chatType === 'group' || chatType === 'supergroup') {
      const chatTitle = message.chat.title || '';

      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        // Upsert group into our database
        await fetch(`${SUPABASE_URL}/rest/v1/telegram_groups`, {
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
        }).catch(err => console.error('Supabase save error:', err));
      }

      // Optionally, you can send a welcome message to the group here.
      // We will skip sending to avoid spam, but we return OK to Telegram.
      return res.status(200).json({ ok: true });
    }

    // 2. Private chat logic -> Send Mini App Button
    const text = "Poputki.online – это современное приложение, которое делает междугородние поездки проще и выгоднее.\nТы еще ждешь?\n👇ЖМИ👇";

    // Inline keyboard button that opens a Web App (Mini App)
    const replyMarkup = {
      inline_keyboard: [
        [
          {
            text: "Открыть приложение",
            web_app: { url: MINI_APP_URL }
          }
        ]
      ]
    };

    const sendMessageUrl = `${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`;

    await fetch(sendMessageUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        reply_markup: replyMarkup
      })
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ ok: true }); // reply OK so Telegram doesn't retry forever
  }
}
