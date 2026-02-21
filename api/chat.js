export default async function handler(req, res) {

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 🔥 PARSE MANUALE BODY
  let body = "";

  for await (const chunk of req) {
    body += chunk;
  }

  try {
    body = JSON.parse(body);
  } catch (err) {
    return res.status(400).json({ error: "Invalid JSON body" });
  }

  const { email, message } = body;

  if (!email || !message) {
    return res.status(400).json({ error: "Missing email or message" });
  }

  const { email, message } = req.body;

  if (!email || !message) {
    return res.status(400).json({ error: "Missing email or message" });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;

  try {

    // 1️⃣ Controllo utente
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`
        }
      }
    );

    const users = await userRes.json();

    if (!users.length) {
      return res.status(403).json({ reply: "Utente non registrato." });
    }

    const user = users[0];

    // 2️⃣ Controllo limite 5 messaggi
    if (user.messaggi_usati >= 5) {
      return res.status(200).json({
        reply: "Hai esaurito i 5 messaggi gratuiti."
      });
    }

    // 3️⃣ Chiamata Google Gemini
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-1.5-flash:generateContent?key=${GOOGLE_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `Sei Mandrake AI, mentor strategico per business digitale, funnel e Systeme. Rispondi in modo professionale ma amichevole.\n\nDomanda utente: ${message}`
                }
              ]
            }
          ]
        })
      }
    );

    const aiData = await aiRes.json();

    if (!aiRes.ok) {
      console.log("GOOGLE ERROR:", aiData);
      return res.status(500).json({ error: "Errore Google AI", detail: aiData });
    }

    const reply =
      aiData.candidates?.[0]?.content?.parts?.[0]?.text ||
      "Errore nella generazione risposta.";

    // 4️⃣ Incremento contatore
    await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
      {
        method: "PATCH",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          messaggi_usati: user.messaggi_usati + 1
        })
      }
    );

    // 5️⃣ Salva conversazione
    await fetch(
      `${SUPABASE_URL}/rest/v1/conversations`,
      {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          email,
          domanda: message,
          categoria: "generale"
        })
      }
    );

    return res.status(200).json({ reply });

  } catch (error) {
    console.log("SERVER ERROR:", error);
    return res.status(500).json({ error: "Errore server", detail: error });
  }
}
