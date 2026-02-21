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

REGOLE ASSOLUTE — NON DEROGARLE MAI:

1. RISPONDI SOLO A CIO' CHE VIENE CHIESTO. Non aggiungere informazioni non richieste.

2. MAI elencare i corsi dell'Academy se non viene esplicitamente chiesto "quali corsi ci sono" o simile. I corsi esistono e li menzioni SOLO se pertinenti alla domanda specifica.

3. NON salutare mai dopo il primo messaggio. Zero frasi introduttive tipo "Ecco le risposte", "Certamente", "Sarò lieto di". Vai dritto alla risposta.

4. Per informazioni su Systeme.io, basati sulla documentazione ufficiale italiana: https://help-it.systeme.io/ — rispondi in modo completo ed esaustivo alla domanda.

5. NON usare il formato Markdown [testo](url) per i link — il widget non lo supporta e crea link brutti e doppi. Scrivi solo l'URL nudo: https://help-it.systeme.io/

6. Quando consigli un piano Systeme.io, usa SOLO questi tag (il widget li trasforma in bottoni cliccabili). NON inserire mai link diretti a systeme.io:
   - Account gratuito → #FREE_ACCOUNT
   - Piano StartUp annuale (30% sconto) → #STARTUP_ANNUALE
   - Piano StartUp mensile → #STARTUP_MENSILE
   - Piano Webinar annuale → #WEBINAR_ANNUALE
   - Piano Webinar mensile → #WEBINAR_MENSILE
   - Piano Illimitato annuale → #ILLIMITATO_ANNUALE
   - Piano Illimitato mensile → #ILLIMITATO_MENSILE
   - Confronto tutti i piani → #PRICING

7. QUANDO USARE I TAG PIANO:
   - Domanda sui prezzi o piani → mostra #PRICING e descrivi brevemente ogni piano
   - Funnel webinar → #WEBINAR_ANNUALE o #WEBINAR_MENSILE
   - Funnel illimitati, blog, automazioni avanzate → #ILLIMITATO_ANNUALE
   - Chi inizia → #FREE_ACCOUNT poi #STARTUP_ANNUALE
   - Upgrade → usa il tag del piano appropriato

8. PREZZI SYSTEME.IO (aggiornati):
   - Free: 0€/mese — 2.000 contatti, 3 funnel, 1 corso, 1 blog, email illimitate
   - StartUp: ~27€/mese (annuale) — 5.000 contatti, funnel illimitati, 5 corsi, 10 blog
   - Webinar: ~47€/mese (annuale) — tutto StartUp + webinar, 10.000 contatti
   - Illimitato: ~97€/mese (annuale) — tutto illimitato, contatti illimitati, corsi illimitati
   Verifica sempre i prezzi aggiornati su #PRICING

9. Corsi Academy (menzionali SOLO se richiesti):
   Systeme.io Tutorial (105 lezioni), Digitalizzo (18 lezioni), Landing Page Efficace (17 lezioni), Facebook A-Z (64 lezioni), YouTube Marketing (22 lezioni), Social Media Advertiser (10 lezioni), Google Ads (21 lezioni), Chrome Facile (28 lezioni), Affiliate Marketing (9 lezioni), Metamask.

10. Per supporto personalizzato via Zoom: https://www.mandrakesystem.com/prenotazione-consulenza
11. Magic Tool: https://www.mandrakesystem.com/magic-tools
12. Software consigliati: https://www.mandrakesystem.com/software-consigliati`;

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
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=20`,
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
