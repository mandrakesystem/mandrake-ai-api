// api/chat.js — Mandrake AI v3.4 — DEFINITIVO
// DEBUG ENDPOINT: GET /api/chat?listmodels=1&key=TUA_KEY per vedere modelli disponibili

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // DEBUG: GET /api/chat?listmodels=1&key=... → lista modelli disponibili
  if (req.method === 'GET' && req.query?.listmodels) {
    const k = req.query.key || process.env.GOOGLE_API_KEY;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
    const d = await r.json();
    const names = d.models?.map(m => m.name + ' | ' + m.supportedGenerationMethods?.join(',')) || d;
    return res.status(200).json({ models: names });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Parse body — metodo originale che funzionava
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

  // Headers identici al vecchio file originale che funzionava
  const SB_GET   = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
  const SB_WRITE = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  // System prompt con gli STESSI placeholder #HASHTAG usati dal widget
  const SYSTEM_PROMPT = `Sei Mandrake AI, l'assistente intelligente dell'Academy Mandrake System.
Sei esperto di marketing digitale, funnels, Systeme.io, Facebook Ads, Google Ads, affiliazioni, automazioni, landing page ed email marketing.

REGOLA ASSOLUTA N.1: Rispondi ESCLUSIVAMENTE all'ULTIMO messaggio dell'utente. Ignora completamente i messaggi precedenti della conversazione per formulare la tua risposta. Non ripetere mai informazioni già date nei messaggi precedenti.

REGOLA N.2: Rispondi SOLO a ciò che viene chiesto. Non aggiungere informazioni non richieste, non elencare corsi, non aggiungere link alla consulenza se non richiesti.

REGOLA N.3: Zero frasi introduttive. Niente "Ecco le risposte", "Certamente", "Sarò lieto di". Vai dritto alla risposta.

REGOLA N.4: NON usare il formato Markdown [testo](url). Scrivi solo URL nudi: https://esempio.com

REGOLA N.5: Per informazioni su Systeme.io usa la documentazione ufficiale italiana: https://help-it.systeme.io/

REGOLA N.6: Usa **grassetto** per i punti chiave. Risposte complete ed esaustive.

PIANI SYSTEME (usa i tag — il widget li trasforma in bottoni):
- Account gratuito → #FREE_ACCOUNT
- StartUp annuale 30% sconto → #STARTUP_ANNUALE  
- StartUp mensile → #STARTUP_MENSILE
- Webinar annuale → #WEBINAR_ANNUALE
- Webinar mensile → #WEBINAR_MENSILE
- Illimitato annuale → #ILLIMITATO_ANNUALE
- Illimitato mensile → #ILLIMITATO_MENSILE
- Confronto piani → #PRICING

PREZZI INDICATIVI:
- Free: 0€ — 2.000 contatti, 3 funnel, 1 corso
- StartUp: ~27€/mese annuale — 5.000 contatti, funnel illimitati, 5 corsi
- Webinar: ~47€/mese annuale — 10.000 contatti, webinar inclusi
- Illimitato: ~97€/mese annuale — tutto illimitato

QUANDO USARE I TAG:
- Domanda su prezzi/piani → #PRICING + descrizione
- Funnel webinar → #WEBINAR_ANNUALE
- Funnel/automazioni avanzate → #ILLIMITATO_ANNUALE
- Chi inizia → #FREE_ACCOUNT o #STARTUP_ANNUALE

LINK UTILI (usali SOLO se pertinenti alla domanda):
- Consulenza Zoom: https://www.mandrakesystem.com/prenotazione-consulenza
- Magic Tool: https://www.mandrakesystem.com/magic-tools
- Software consigliati: https://www.mandrakesystem.com/software-consigliati

CORSI ACADEMY (menzionali SOLO se l'utente chiede esplicitamente dei corsi):
Systeme.io Tutorial (105 lezioni), Digitalizzo (18 lezioni), Landing Page Efficace (17 lezioni), Facebook A-Z (64 lezioni), YouTube Marketing (22 lezioni), Social Media Advertiser (10 lezioni), Google Ads (21 lezioni), Chrome Facile (28 lezioni), Affiliate Marketing (9 lezioni), Metamask.`;

  try {
    // 1. VERIFICA UTENTE — identico al vecchio originale
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

    // 2. RESET GIORNALIERO — usa colonna ultimo_reset che esiste nella tabella
    const oggi = new Date().toISOString().split('T')[0];
    const ultimoReset = user.ultimo_reset ? String(user.ultimo_reset).split('T')[0] : null;
    let messaggiUsati = user.messaggi_usati || 0;

    if (ultimoReset !== oggi) {
      console.log('RESET giornaliero — nuovo giorno, azzero contatore');
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

    // 4. LIMITE MESSAGGI
    if (!userKey && messaggiUsati >= 5) {
      console.log('LIMIT REACHED — messaggi usati:', messaggiUsati);
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

    // 5. STORICO CONVERSAZIONI — solo colonne che esistono: domanda, categoria
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=6`,
      { headers: SB_GET }
    );
    const convHistory = await convRes.json();
    console.log('HISTORY — righe:', Array.isArray(convHistory) ? convHistory.length : 'errore');

    // Costruisce contents per Gemini (solo domande, senza risposta perché non salvata)
    const contents = [];
    if (Array.isArray(convHistory)) {
      convHistory.forEach(row => {
        if (row.domanda) contents.push({ role: 'user', parts: [{ text: row.domanda }] });
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    // 6. CHIAMATA GEMINI — stesso endpoint del vecchio originale /v1/ con gemini-2.5-flash
    console.log('GEMINI — chiamata con', contents.length, 'turns');
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
        })
      }
    );

    const aiData = await aiRes.json();
    console.log('GEMINI — status:', aiRes.status, '| error:', aiData?.error?.message || 'nessuno');

    if (!aiRes.ok) {
      console.error('GEMINI ERROR FULL:', JSON.stringify(aiData));
      // Ritorna il dettaglio completo al client per debug
      return res.status(500).json({ error: 'Errore Google AI', detail: aiData?.error?.message, code: aiData?.error?.code, status: aiData?.error?.status });
    }

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('GEMINI — testo vuoto:', JSON.stringify(aiData).substring(0, 300));
      return res.status(500).json({ error: 'Risposta Gemini vuota' });
    }

    console.log('REPLY OK — chars:', reply.length);

    // 7. INCREMENTA CONTATORE
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 }) }
      );
    }

    // 8. SALVA CONVERSAZIONE — solo colonne che esistono: email, domanda, categoria
    await fetch(`${SUPABASE_URL}/rest/v1/conversations`, {
      method: 'POST',
      headers: SB_WRITE,
      body: JSON.stringify({ email, domanda: message, categoria: 'generale' })
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
