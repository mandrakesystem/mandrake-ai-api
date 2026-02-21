// api/chat.js — Mandrake AI v3.2

export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── PARSE BODY — stesso metodo del vecchio che funzionava ─────────────────
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { email, message, apiKey: userKey } = parsed;
  const apiKey = userKey || process.env.GOOGLE_API_KEY;

  if (!email || !message) {
    return res.status(400).json({ error: 'Missing email or message' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  // Headers GET Supabase — identici al vecchio che funzionava
  const SB_GET = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`
  };

  // Headers POST/PATCH Supabase
  const SB_WRITE = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // ── SYSTEM PROMPT CON AFFILIAZIONI ────────────────────────────────────────
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
    // ── 1. VERIFICA UTENTE — identico al vecchio che funzionava ──────────────
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
    console.log('USER:', user.email, '| messaggi_usati:', user.messaggi_usati, '| ultimo_reset:', user.ultimo_reset);

    // ── 2. RESET GIORNALIERO (nuovo rispetto al vecchio) ──────────────────────
    const oggi = new Date().toISOString().split('T')[0];
    const ultimoReset = user.ultimo_reset ? String(user.ultimo_reset).split('T')[0] : null;
    let messaggiUsati = user.messaggi_usati || 0;

    if (ultimoReset !== oggi) {
      console.log('RESET giornaliero — azzero contatore');
      messaggiUsati = 0;
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: 0, ultimo_reset: oggi }) }
      );
    }

    // ── 3. LIMITE MESSAGGI ────────────────────────────────────────────────────
    if (!userKey && messaggiUsati >= 5) {
      console.log('LIMIT REACHED — messaggi usati:', messaggiUsati);
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    // Ping di verifica email — non chiamare Gemini
    if (message === '__ping__') {
      return res.status(200).json({ reply: '__PING_OK__', messaggi_rimasti: Math.max(0, 5 - messaggiUsati) });
    }

    if (!apiKey) {
      return res.status(400).json({ error: 'Missing API key' });
    }

    // ── 4. CARICA STORICO CONVERSAZIONI ───────────────────────────────────────
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=16`,
      { headers: SB_GET }
    );
    const convHistory = await convRes.json();
    console.log('HISTORY — righe:', Array.isArray(convHistory) ? convHistory.length : 'errore fetch');

    // Costruisce contents per Gemini con storia + messaggio attuale
    const contents = [];
    if (Array.isArray(convHistory)) {
      convHistory.forEach(row => {
        if (row.domanda) contents.push({ role: 'user',  parts: [{ text: row.domanda }] });
        if (row.risposta) contents.push({ role: 'model', parts: [{ text: row.risposta }] });
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    // ── 5. CHIAMATA GEMINI ────────────────────────────────────────────────────
    // Usiamo gemini-1.5-flash che è stabile e disponibile su tutti gli account
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
    console.log('GEMINI — turns in context:', contents.length);

    const aiRes = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents,
        generationConfig: { temperature: 0.7, maxOutputTokens: 1024 }
      })
    });

    const aiData = await aiRes.json();
    console.log('GEMINI — status:', aiRes.status, '| error:', aiData?.error?.message || 'nessuno');

    if (!aiRes.ok) {
      console.error('GEMINI ERROR:', JSON.stringify(aiData));
      return res.status(500).json({ error: 'Errore Google AI', detail: aiData?.error?.message });
    }

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('GEMINI — testo vuoto:', JSON.stringify(aiData).substring(0, 400));
      return res.status(500).json({ error: 'Risposta Gemini vuota' });
    }

    console.log('REPLY OK — chars:', reply.length, '| preview:', reply.substring(0, 80));

    // ── 6. INCREMENTA CONTATORE ───────────────────────────────────────────────
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 }) }
      );
    }

    // ── 7. SALVA CONVERSAZIONE (domanda + risposta) ───────────────────────────
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: SB_WRITE,
      body: JSON.stringify({
        email,
        domanda: message,
        risposta: reply,          // nuovo: salva anche la risposta AI
        categoria: 'generale',
        usa_propria_key: !!userKey
      })
    });

    return res.status(200).json({
      reply,
      messaggi_rimasti: userKey ? 999 : Math.max(0, 4 - messaggiUsati)
    });

  } catch (error) {
    console.error('SERVER ERROR:', error.message, '\n', error.stack);
    return res.status(500).json({ error: 'Errore server', detail: error.message });
  }
}
