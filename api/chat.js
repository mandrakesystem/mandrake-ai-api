export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { email, message } = req.body;
  if (!email || !message) return res.status(400).json({ error: "Missing email or message" });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const OPENAI_KEY = process.env.OPENAI_KEY; // la tua key gratuita per i 5 messaggi

  try {
    // 1️⃣ Controlla utente
    const userRes = await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` }
    });

    const users = await userRes.json();
    if (!users.length) return res.status(403).json({ reply: "Utente non registrato." });

    const user = users[0];

    // 2️⃣ Controllo 5 messaggi
    if (user.messaggi_usati >= 5) {
      return res.status(200).json({ reply: "Hai esaurito i 5 messaggi gratuiti. Collega la tua API personale per continuare." });
    }

    // 3️⃣ Chiamata OpenAI
    const aiRes = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${OPENAI_KEY}` },
      body: JSON.stringify({
        model: "gpt-4o-mini", 
        messages: [
          { role: "system", content: "Sei Mandrake AI, mentor strategico per business digitale, funnel e Systeme." },
          { role: "user", content: message }
        ]
      })
    });

    const aiData = await aiRes.json();

    if (!aiRes.ok) {
      console.log("OPENAI ERROR:", aiData);
      return res.status(500).json({ error: "Errore OpenAI", detail: aiData });
    }

    const reply = aiData.choices?.[0]?.message?.content;
    if (!reply) return res.status(500).json({ error: "Risposta AI non valida", detail: aiData });

    // 4️⃣ Incrementa contatore
    await fetch(`${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`, {
      method: "PATCH",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messaggi_usati: user.messaggi_usati + 1, ultimo_accesso: new Date().toISOString() })
    });

    // 5️⃣ Salva conversazione
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ email, domanda: message, categoria: "generale" })
    });

    return res.status(200).json({ reply });

  } catch (error) {
    console.log("SERVER ERROR:", error);
    return res.status(500).json({ error: "Errore server", detail: error });
  }
}
