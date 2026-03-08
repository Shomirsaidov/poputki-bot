// api/bot.js  (for Vercel /api/bot endpoint)

const TELEGRAM_API = "https://api.telegram.org";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const update = req.body;

    const message = update.message || update.edited_message;
    const memberUpdate = update.my_chat_member;

    // If it's neither a message nor a member update, we ignore it
    if (!message && !memberUpdate) {
      return res.status(200).json({ ok: true });
    }

    // Extract chat details from either source
    const chat = (message || memberUpdate).chat;
    const chatId = chat.id;
    const chatType = chat.type;
    const chatTitle = chat.title || '';

    // Environment Variables with fallbacks
    const BOT_TOKEN = process.env.BOT_TOKEN;
    const MINI_APP_URL = process.env.MINI_APP_URL || 'https://poputki.online';
    const SUPABASE_URL = process.env.SUPABASE_URL || 'https://kszjwfnjrfouawkqjbwc.supabase.co';
    const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imtzemp3Zm5qcmZvdWF3a3FqYndjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI5ODQ2NDMsImV4cCI6MjA4ODU2MDY0M30.zyK0VyKbl10rgOc36Tsugj4zWJnRN1N-LOEG2ZiXToY';

    // 1. Group / Supergroup logic -> Save to Supabase
    if (chatType === 'group' || chatType === 'supergroup') {
      if (SUPABASE_URL && SUPABASE_ANON_KEY) {
        // Upsert group into our database
        // IMPORTANT: ?on_conflict=chat_id is required for Prefer: resolution=merge-duplicates to work on specific column
        const supabaseRes = await fetch(`${SUPABASE_URL}/rest/v1/telegram_groups?on_conflict=chat_id`, {
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
        }).catch(err => console.error('Supabase fetch error:', err));

        if (supabaseRes && !supabaseRes.ok) {
          const errorText = await supabaseRes.text();
          console.error(`Supabase save failed (${supabaseRes.status}):`, errorText);
        }
      }

      // Return OK to Telegram.
      return res.status(200).json({ ok: true });
    }

    // 2. Private chat logic -> Send Mini App Button
    // Only respond to standard messages in private chats
    if (chatType === 'private' && message) {
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
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error(err);
    return res.status(200).json({ ok: true }); // reply OK so Telegram doesn't retry forever
  }
}
