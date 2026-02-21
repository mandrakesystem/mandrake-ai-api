// api/chat.js — Mandrake AI v3.1 — fixed for Vercel

export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── PARSE BODY (metodo robusto per Vercel) ────────────────────────────────
  let parsed;
  try {
    if (req.body && typeof req.body === 'object') {
      parsed = req.body;
    } else {
      let rawBody = '';
      for await (const chunk of req) rawBody += chunk;
      parsed = JSON.parse(rawBody);
    }
  } catch (e) {
    console.error('PARSE ERROR:', e.message);
    return res.status(400).json({ error: 'Invalid JSON', detail: e.message });
  }

  const { email, message, apiKey: userKey } = parsed;

  console.log('REQUEST — email:', email, '| message:', message?.substring(0, 50), '| userKey:', !!userKey);

  const isPing = message === '__ping__';

  if (!email) return res.status(400).json({ error: 'Missing email' });
  if (!message) return res.status(400).json({ error: 'Missing message' });

  const GOOGLE_KEY = userKey || process.env.GOOGLE_API_KEY;
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;

  console.log('ENV — GOOGLE_API_KEY:', !!process.env.GOOGLE_API_KEY, '| SUPABASE_URL:', !!SUPABASE_URL, '| SUPABASE_KEY:', !!SUPABASE_KEY);

  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return res.status(500).json({ error: 'Supabase env vars missing' });
  }

  if (!isPing && !GOOGLE_KEY) {
    return res.status(400).json({ error: 'Missing API key' });
  }

  const SB = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation'
  };

  const SYSTEM_PROMPT = `Sei Mandrake AI, l'assistente intelligente dell'Academy Mandrake System.
Sei esperto di marketing digitale, funnels, Systeme.io, Facebook Ads, Google Ads, affiliazioni, automazioni, landing page ed email marketing.

REGOLE OBBLIGATORIE:
1. Rispondi SEMPRE in italiano, in modo professionale e amichevole.
2. Usa **grassetto** per i punti chiave e organizza le risposte in paragrafi chiari.
3. Quando una funzionalità di Systeme.io richiede un piano specifico, indicalo SEMPRE con il tag [PIANO:codice] corretto:
   - Funnel webinar → [PIANO:webinar_annual] o [PIANO:webinar_monthly]
   - Funnel illimitati, blog, regole avanzate → [PIANO:unlimited_annual] o [PIANO:unlimited_monthly]
   - Chi inizia o vuole un piano base → [PIANO:startup_annual] o [PIANO:startup_monthly]
   - Confronto piani → [PIANO:pricing]
   - Account gratuito → [PIANO:free]
4. Corsi disponibili: Systeme.io Tutorial (105 lezioni), Digitalizzo - Funnel Marketing, Landing Page Efficace, Facebook A-Z (64 lezioni), YouTube Marketing, Social Media Advertiser, Google Ads, Chrome Facile, Affiliate Marketing, Metamask.
5. Per supporto personalizzato: https://www.mandrakesystem.com/prenotazione-consulenza
6. Magic Tool: https://www.mandrakesystem.com/magic-tools
7. Guida Systeme (IT): https://help-it.systeme.io/`;

  try {
    // 1. VERIFICA UTENTE
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=id,email,messaggi_usati,ultimo_reset`,
      { headers: SB }
    );
    const users = await userRes.json();
    console.log('SUPABASE users — status:', userRes.status, '| found:', users.length);

    if (!Array.isArray(users) || users.length === 0) {
      return res.status(200).json({ reply: '__NOT_REGISTERED__' });
    }

    const user = users[0];
    console.log('USER:', user.email, '| messaggi_usati:', user.messaggi_usati, '| ultimo_reset:', user.ultimo_reset);

    // Risposta al ping
    if (isPing) {
      return res.status(200).json({ reply: '__PING_OK__', messaggi_rimasti: Math.max(0, 5 - (user.messaggi_usati || 0)) });
    }

    // 2. RESET GIORNALIERO
    const oggi = new Date().toISOString().split('T')[0];
    const ultimoReset = user.ultimo_reset ? String(user.ultimo_reset).split('T')[0] : null;
    let messaggiUsati = user.messaggi_usati || 0;

    if (ultimoReset !== oggi) {
      console.log('RESET giornaliero — azzero contatore');
      messaggiUsati = 0;
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB, body: JSON.stringify({ messaggi_usati: 0, ultimo_reset: oggi }) }
      );
    }

    // 3. CONTROLLA LIMITE
    if (!userKey && messaggiUsati >= 5) {
      console.log('LIMIT REACHED');
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    // 4. CARICA STORICO
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=16&select=domanda,risposta`,
      { headers: SB }
    );
    const convHistory = await convRes.json();
    console.log('HISTORY — righe:', Array.isArray(convHistory) ? convHistory.length : 'errore');

    const contents = [];
    if (Array.isArray(convHistory)) {
      convHistory.forEach(row => {
        if (row.domanda) contents.push({ role: 'user', parts: [{ text: row.domanda }] });
        if (row.risposta) contents.push({ role: 'model', parts: [{ text: row.risposta }] });
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    // 5. CHIAMA GEMINI
    // Prova prima gemini-2.0-flash, poi fallback a gemini-1.5-flash
    const GEMINI_MODEL = 'gemini-2.0-flash';
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${GOOGLE_KEY}`;
    console.log('GEMINI — model:', GEMINI_MODEL, '| turns:', contents.length);

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
    console.log('GEMINI — response status:', aiRes.status, '| error:', aiData?.error?.message);

    if (!aiRes.ok) {
      console.error('GEMINI ERROR FULL:', JSON.stringify(aiData));
      return res.status(500).json({ error: 'Errore Google AI', detail: aiData?.error?.message || JSON.stringify(aiData) });
    }

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('GEMINI — risposta vuota:', JSON.stringify(aiData));
      return res.status(500).json({ error: 'Risposta Gemini vuota', detail: JSON.stringify(aiData).substring(0, 300) });
    }

    console.log('REPLY OK — chars:', reply.length);

    // 6. INCREMENTA CONTATORE
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB, body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 }) }
      );
    }

    // 7. SALVA CONVERSAZIONE
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: SB,
      body: JSON.stringify({
        email,
        domanda: message,
        risposta: reply,
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
