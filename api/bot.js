// api/bot.js  (for Vercel /api/bot endpoint)

const TELEGRAM_API = "https://api.telegram.org";

export default async function handler(req, res) {
  // Hardcoded Credentials (Overriding Vercel Env Vars to guarantee connection)
  const BOT_TOKEN = process.env.BOT_TOKEN || '8669833278:AAFHxzU9jZUZIWVrHdogUsYrkQmd_F05MZA';
  const MINI_APP_URL = process.env.MINI_APP_URL || 'https://poputki.online';
  const SUPABASE_URL = 'https://xzvtjcqwmuezxyeerkki.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh6dnRqY3F3bXVlenh5ZWVya2tpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzMxMjA0MTEsImV4cCI6MjA4ODY5NjQxMX0.My0BKDF4tC9egh1nZbs9G0U7KKvwJixIuo71wuPPFDo';

  const log = (msg, data = null) => {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] ${msg}`, data ? JSON.stringify(data) : '');
  };

  // --- GET Setup & Diagnostic Endpoint ---
  if (req.method === "GET") {
    const { url, status } = req.query;

    if (status) {
      try {
        const webhookInfoRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/getWebhookInfo`);
        const webhookInfo = await webhookInfoRes.json();
        const meRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/getMe`);
        const me = await meRes.json();
        
          return res.status(200).json({
            ok: true,
            version: "2.1.0",
            bot: me.result,
            webhook: {
              url: webhookInfo.result.url,
              pending_update_count: webhookInfo.result.pending_update_count,
              last_error_date: webhookInfo.result.last_error_date,
              last_error_message: webhookInfo.result.last_error_message,
              last_synchronization_error_date: webhookInfo.result.last_synchronization_error_date
            },
            config: {
              MINI_APP_URL,
              SUPABASE_URL
            }
          });
      } catch (err) {
        return res.status(500).json({ ok: false, error: err.message });
      }
    }

    try {
      const webhookUrl = url || `https://${req.headers.host}/api/bot`;
      const setWebhookUrl = `${TELEGRAM_API}/bot${BOT_TOKEN}/setWebhook`;

      log(`Setting webhook to: ${webhookUrl}`);

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
          <body style="font-family: sans-serif; padding: 40px; text-align: center; background: #f9fafb;">
            <div style="max-width: 600px; margin: 0 auto; background: white; padding: 30px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1);">
              <h1 style="color: ${data.ok ? '#22c55e' : '#ef4444'}">${data.ok ? '✅ Webhook Setup Successful' : '❌ Webhook Setup Failed'}</h1>
              <p style="color: #4b5563;">Webhook URL: <code style="background: #f3f4f6; padding: 2px 6px; border-radius: 4px;">${webhookUrl}</code></p>
              <div style="text-align: left; margin-top: 20px;">
                <p style="font-weight: bold; margin-bottom: 8px;">Telegram Response:</p>
                <pre style="background: #1f2937; color: #f9fafb; padding: 15px; border-radius: 8px; overflow-x: auto; font-size: 14px;">${JSON.stringify(data, null, 2)}</pre>
              </div>
              <p style="margin-top: 20px; color: #6b7280; font-size: 14px;">Allowed Updates: <b>message, edited_message, callback_query, my_chat_member, chat_member</b></p>
              <div style="margin-top: 30px; border-top: 1px solid #e5e7eb; padding-top: 20px;">
                <a href="/api/bot?status=1" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Check Full Status</a>
                <span style="margin: 0 15px; color: #d1d5db;">|</span>
                <a href="${MINI_APP_URL}" style="color: #3b82f6; text-decoration: none; font-weight: 500;">Go to App</a>
              </div>
            </div>
          </body>
        </html>
      `);
    } catch (err) {
      log(`Setup Error: ${err.message}`);
      return res.status(500).send(`Error: ${err.message}`);
    }
  }

  if (req.method === "HEAD") {
    return res.status(200).end();
  }

  if (req.method !== "POST" && req.method !== "GET") {
    return res.status(405).json({ ok: false, error: "Method not allowed" });
  }

  try {
    const update = req.body;
    log(`Incoming ${req.method} update:`, update);

    // Support multiple update types
    const message = update.message || update.edited_message || update.channel_post || update.edited_channel_post;
    const callbackQuery = update.callback_query;
    const memberUpdate = update.my_chat_member || update.chat_member;

    if (!message && !memberUpdate && !callbackQuery) {
      return res.status(200).json({ ok: true });
    }

    // Handle Callback Queries
    if (callbackQuery) {
      const chatId = callbackQuery.message.chat.id;
      const data = callbackQuery.data;
      log(`Callback query from chat ${chatId}: ${data}`);
      
      // Acknowledge callback query
      await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/answerCallbackQuery`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ callback_query_id: callbackQuery.id })
      });

      return res.status(200).json({ ok: true });
    }

    // Extract chat details
    const chat = (message || memberUpdate).chat;
    const chatId = chat.id;
    const chatType = chat.type;
    const chatTitle = chat.title || chat.first_name || 'Personal Chat';

    // Helper: Sync Group to Supabase
    const syncGroup = async () => {
      if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
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

    // 1. Group / Supergroup / Channel logic -> Save to Supabase
    if (chatType === 'group' || chatType === 'supergroup' || chatType === 'channel') {
      const syncRes = await syncGroup();
      log(`Group sync result for ${chatId}: ${syncRes ? syncRes.status : 'N/A'}`);

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

    // 2. Private chat logic -> Handle /start or Send Mini App Button
    if (chatType === 'private' && message) {
      const text = message.text || "";
      log(`Private message from ${chatId}: ${text}`);
      
      // Handle /start command (both with and without params)
      if (text.startsWith('/start')) {
        const parts = text.split(' ');
        const param = parts.length > 1 ? parts[1] : null;

        if (param) {
          log(`Handling deep link with param: ${param}`);
          
          if (param.startsWith('ride_')) {
            const rideId = param.replace('ride_', '');
            try {
              const rideUrl = `${SUPABASE_URL}/rest/v1/rides?id=eq.${rideId}&select=*`;
              const rideResponse = await fetch(rideUrl, {
                headers: {
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
              });
              
              if (!rideResponse.ok) {
                throw new Error(`Supabase error: ${rideResponse.status} ${rideResponse.statusText}`);
              }

              const rideDataArray = await rideResponse.json();
              const ride = Array.isArray(rideDataArray) ? rideDataArray[0] : null;

              if (ride) {
                const dateStr = ride.date;
                const timeStr = ride.time ? ride.time.substring(0, 5) : '';
                let msg = "";
                if (ride.is_passenger_entry) {
                  msg = `🙋 <b>ПАССАЖИР ИЩЕТ ПОЕЗДКУ</b>\n\n📍 <b>Маршрут:</b> ${ride.from_city} ➡ ${ride.to_city}\n🗓 <b>Дата:</b> ${dateStr}\n⏰ <b>Время:</b> ${timeStr}`;
                } else {
                  const deliveryText = ride.allows_delivery ? '\n📦 <b>Беру посылки</b>' : '';
                  msg = `🚗 <b>ВОДИТЕЛЬ ИЩЕТ ПАССАЖИРОВ</b>\n\n📍 <b>Маршрут:</b> ${ride.from_city} ➡ ${ride.to_city}\n🗓 <b>Дата:</b> ${dateStr}\n⏰ <b>Время:</b> ${timeStr}\n💺 <b>Свободных мест:</b> ${ride.seats}${deliveryText}`;
                }

                const sendRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: msg,
                    parse_mode: "HTML",
                    reply_markup: {
                      inline_keyboard: [[{ text: "🚀 Открыть в приложении", web_app: { url: `${MINI_APP_URL}/ride/${rideId}` } }]]
                    }
                  })
                });
                log(`Deep link ride response status: ${sendRes.status}`);
                return res.status(200).json({ ok: true });
              } else {
                log(`Ride not found for ID: ${rideId}`);
              }
            } catch (e) {
              log('Fetch ride error:', e);
            }
          }

          if (param.startsWith('bus_')) {
            const busId = param.replace('bus_', '');
            try {
              const busUrl = `${SUPABASE_URL}/rest/v1/bus_tickets?id=eq.${busId}&select=*`;
              const busResponse = await fetch(busUrl, {
                headers: {
                  'apikey': SUPABASE_ANON_KEY,
                  'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
                }
              });

              if (!busResponse.ok) {
                throw new Error(`Supabase error: ${busResponse.status} ${busResponse.statusText}`);
              }

              const busDataArray = await busResponse.json();
              const bus = Array.isArray(busDataArray) ? busDataArray[0] : null;

              if (bus) {
                const dateStr = bus.departure_date;
                const timeStr = bus.departure_time ? bus.departure_time.substring(0, 5) : '';
                const stops = (typeof bus.intermediate_stops === 'string' ? JSON.parse(bus.intermediate_stops || '[]') : (bus.intermediate_stops || []));
                const stopsText = stops.length > 0 ? `\n🛑 <b>Остановки:</b> ${stops.map(s => s.city).join(', ')}` : '';
                
                const msg = `🚌 <b>АВТОБУСНЫЙ РЕЙС</b>\n\n📍 <b>Маршрут:</b> ${bus.from_city} ➡ ${bus.to_city}${stopsText}\n🗓 <b>Дата:</b> ${dateStr}\n⏰ <b>Время:</b> ${timeStr}\n💰 <b>Цена:</b> ${bus.price} сом\n🏢 <b>Перевозчик:</b> ${bus.transport_company}`;

                const sendRes = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    chat_id: chatId,
                    text: msg,
                    parse_mode: "HTML",
                    reply_markup: {
                      inline_keyboard: [[{ text: "🚀 Открыть билет", web_app: { url: `${MINI_APP_URL}/bus-ticket/${busId}` } }]]
                    }
                  })
                });
                log(`Deep link bus response status: ${sendRes.status}`);
                return res.status(200).json({ ok: true });
              } else {
                log(`Bus not found for ID: ${busId}`);
              }
            } catch (e) {
              log('Fetch bus error:', e);
            }
          }
        }
      }

      // Default Welcome Message (Fallback for regular text or empty /start)
      const welcomeText = "Poputki.online – это современное приложение, которое делает междугородние поездки проще и выгоднее.\nТы еще ждешь?\n👇ЖМИ👇";
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
        is_persistent: true
      };

      log(`Sending welcome message to ${chatId}`);

      const res1 = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: "Используйте меню ниже для быстрого доступа к функциям или нажмите кнопку:",
          reply_markup: persistentMenu
        })
      });
      log(`Greeting 1 status: ${res1.status}`);

      const res2 = await fetch(`${TELEGRAM_API}/bot${BOT_TOKEN}/sendMessage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: chatId,
          text: welcomeText,
          reply_markup: replyMarkup
        })
      });
      log(`Greeting 2 status: ${res2.status}`);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    log('Handler Exception:', err);
    // Always return 200 to Telegram to prevent retry loops on crash
    return res.status(200).json({ ok: true, error: err.message });
  }
}
