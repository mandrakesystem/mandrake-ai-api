// api/chat.js — Mandrake AI v3.3

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { email, message, apiKey: userKey } = parsed;
  const apiKey = userKey || process.env.GOOGLE_API_KEY;

  if (!email || !message) return res.status(400).json({ error: 'Missing email or message' });

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  const SB_GET   = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const SB_WRITE = { ...SB_GET, 'Content-Type': 'application/json' };

  const SYSTEM_PROMPT = `Sei Mandrake AI, l'assistente intelligente dell'Academy Mandrake System.
Sei esperto di marketing digitale, funnels, Systeme.io, Facebook Ads, Google Ads, affiliazioni, automazioni, landing page ed email marketing.

REGOLE OBBLIGATORIE:
1. Rispondi SEMPRE in italiano, in modo professionale e amichevole.
2. Usa **grassetto** per i punti chiave e organizza le risposte in paragrafi chiari.
3. Quando una funzionalità richiede un piano Systeme.io specifico, inserisci il tag [PIANO:codice]:
   - Funnel webinar → [PIANO:webinar_annual] o [PIANO:webinar_monthly]
   - Funnel illimitati, blog, regole avanzate → [PIANO:unlimited_annual] o [PIANO:unlimited_monthly]
   - Chi inizia → [PIANO:startup_annual] o [PIANO:startup_monthly]
   - Confronto piani → [PIANO:pricing]
   - Account gratuito → [PIANO:free]
4. Corsi Academy: Systeme.io Tutorial (105 lezioni), Digitalizzo - Funnel Marketing, Landing Page Efficace, Facebook A-Z (64 lezioni), YouTube Marketing, Social Media Advertiser, Google Ads, Chrome Facile, Affiliate Marketing, Metamask.
5. Per supporto personalizzato: https://www.mandrakesystem.com/prenotazione-consulenza
6. Magic Tool: https://www.mandrakesystem.com/magic-tools
7. Guida Systeme IT: https://help-it.systeme.io/`;

  try {
    // 1. VERIFICA UTENTE — identico al vecchio che funzionava
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
      { headers: SB_GET }
    );
    const users = await userRes.json();
    console.log('SUPABASE users — status:', userRes.status, '| found:', users?.length);

    if (!users || !users.length) {
      return res.status(200).json({ reply: '__NOT_REGISTERED__' });
    }
    const user = users[0];

    // 2. RESET GIORNALIERO
    const oggi = new Date().toISOString().split('T')[0];
    const ultimoReset = user.ultimo_reset ? String(user.ultimo_reset).split('T')[0] : null;
    let messaggiUsati = user.messaggi_usati || 0;

    if (ultimoReset !== oggi) {
      messaggiUsati = 0;
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: 0, ultimo_reset: oggi }) }
      );
    }

    // 3. PING — solo verifica email, non chiama Gemini
    if (message === '__ping__') {
      return res.status(200).json({ reply: '__PING_OK__', messaggi_rimasti: Math.max(0, 5 - messaggiUsati) });
    }

    // 4. LIMITE
    if (!userKey && messaggiUsati >= 5) {
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

    // 5. STORICO CONVERSAZIONI
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=16`,
      { headers: SB_GET }
    );
    const convHistory = await convRes.json();

    const contents = [];
    if (Array.isArray(convHistory)) {
      convHistory.forEach(row => {
        if (row.domanda) contents.push({ role: 'user',  parts: [{ text: row.domanda }] });
        if (row.risposta) contents.push({ role: 'model', parts: [{ text: row.risposta }] });
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    // 6. GEMINI — prova modelli in ordine finché uno funziona
    const MODELS = [
      { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-05-20:generateContent?key=${apiKey}` },
      { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}` },
      { url: `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}` },
    ];

    let reply = null;

    for (const model of MODELS) {
      console.log('GEMINI — trying:', model.url.split('/models/')[1].split(':')[0]);
      try {
        const aiRes = await fetch(model.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
          })
        });
        const aiData = await aiRes.json();

        if (aiRes.ok && aiData.candidates?.[0]?.content?.parts?.[0]?.text) {
          reply = aiData.candidates[0].content.parts[0].text;
          console.log('GEMINI OK — model:', model.url.split('/models/')[1].split(':')[0], '| chars:', reply.length);
          break;
        } else {
          console.log('GEMINI FAIL:', aiData?.error?.message || 'no candidates');
        }
      } catch (e) {
        console.log('GEMINI FETCH ERROR:', e.message);
      }
    }

    if (!reply) {
      return res.status(500).json({ error: 'Tutti i modelli Gemini hanno fallito. Controlla la API key.' });
    }

    // 7. INCREMENTA CONTATORE
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 }) }
      );
    }

    // 8. SALVA CONVERSAZIONE
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: SB_WRITE,
      body: JSON.stringify({ email, domanda: message, risposta: reply, categoria: 'generale', usa_propria_key: !!userKey })
    });

    return res.status(200).json({ reply, messaggi_rimasti: userKey ? 999 : Math.max(0, 4 - messaggiUsati) });

  } catch (error) {
    console.error('SERVER ERROR:', error.message, '\n', error.stack);
    return res.status(500).json({ error: 'Errore server', detail: error.message });
  }
}
