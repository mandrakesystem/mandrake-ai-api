// api/chat.js — Mandrake AI v3.7 — DEFINITIVO

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // DEBUG: GET /api/chat?listmodels=1
  if (req.method === 'GET' && req.query?.listmodels) {
    const k = req.query.key || process.env.GOOGLE_API_KEY;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`);
    const d = await r.json();
    const names = d.models?.map(m => m.name + ' | ' + m.supportedGenerationMethods?.join(',')) || d;
    return res.status(200).json({ models: names });
  }

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
  const SB_WRITE = { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' };

  const SYSTEM_PROMPT = `Sei Mandrake AI, l'assistente intelligente dell'Academy Mandrake System di Gennaro Merolla.
Sei esperto di marketing digitale, funnels, Systeme.io, Facebook Ads, Google Ads, affiliazioni, automazioni, landing page ed email marketing.

REGOLA N.1 — ASSOLUTA: Rispondi ESCLUSIVAMENTE all'ULTIMO messaggio dell'utente. Non ripetere mai informazioni già date nei messaggi precedenti. Se l'utente fa una domanda nuova, rispondi SOLO a quella.

REGOLA N.2: Rispondi SOLO a ciò che viene chiesto. Niente informazioni extra non richieste.

REGOLA N.3: Zero frasi introduttive. Niente "Ecco", "Certamente", "Sarò lieto". Vai dritto alla risposta.

REGOLA N.4: NON usare il formato Markdown [testo](url). Solo URL nudi: https://esempio.com

REGOLA N.5 — LINK SYSTEME.IO:
- Quando menzioni Systeme.io come piattaforma su cui registrarsi o fare upgrade, usa SEMPRE il link affiliato: https://systeme.io/it?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53
- Per la documentazione ufficiale usa: https://help-it.systeme.io/
- Per cercare un argomento specifico nella documentazione usa: https://help-it.systeme.io/search?query=PAROLA_CHIAVE (sostituisci PAROLA_CHIAVE con l'argomento in inglese o italiano)
- NON inventare mai URL specifici di help-it.systeme.io tipo /article/123-titolo
- NON linkare mai URL del tipo mandrakesystem.com/dashboard/it/course-viewer — queste pagine non esistono pubblicamente

REGOLA N.6: Usa **grassetto** per i punti chiave. Risposte complete ed esaustive.

REGOLA N.7 — CORSI: Quando l'utente chiede cosa studiare, imparare o formarsi, consiglia i corsi pertinenti con nome, numero lezioni e link video specifico dal catalogo.

REGOLA N.8 — VIDEO: Quando l'utente chiede un video su un argomento specifico, cerca nel catalogo il video con il titolo più pertinente e linka QUELL'URL YouTube esatto. Non linkare mai il canale generico se hai il video specifico. Quando consigli un corso completo, linka anche: https://www.mandrakesystem.com/dashboard/it/login

CATALOGO CORSI ACADEMY MANDRAKE:
- Systeme.io Tutorial (105 lezioni) → funnel, pagine, editor, blog, corsi, email, automazioni, siti
- Digitalizzo - Funnel Marketing (18 lezioni) → trovare clienti, strategia funnel, PMI
- Landing Page Perfetta (17 lezioni) → landing page ad alta conversione
- Facebook A-Z (64 lezioni) → Facebook dalle basi alle campagne Ads avanzate
- YouTube Marketing (21 lezioni) → crescita canale, contenuti, YouTube Ads
- Google Ads (20 lezioni) → campagne PPC, parole chiave, lead generation
- Google Chrome (28 lezioni) → Chrome, estensioni, password, privacy
- Affiliate Marketing (17 lezioni) → guadagnare con affiliazioni, Amazon, network
- Metamask (19 lezioni) → wallet crypto, reti, token, swap

QUANDO CONSIGLIARE I CORSI:
- Funnel, vendite, trovare clienti → Digitalizzo + Systeme.io Tutorial
- Landing page → Landing Page Perfetta + Systeme.io Tutorial
- Facebook/Instagram Ads → Facebook A-Z
- Google Ads → Google Ads
- Video marketing → YouTube Marketing
- Affiliazioni → Affiliate Marketing
- Crypto → Metamask
- Usare Systeme.io → Systeme.io Tutorial

CANALE YOUTUBE tutorial gratuiti: https://www.youtube.com/@GennaroMerolla
ACADEMY accesso corsi: https://www.mandrakesystem.com/dashboard/it/login

PIANI SYSTEME — usa SOLO questi tag (diventano bottoni cliccabili):
- Account gratuito → #FREE_ACCOUNT
- StartUp annuale 30% sconto → #STARTUP_ANNUALE
- StartUp mensile → #STARTUP_MENSILE
- Webinar annuale → #WEBINAR_ANNUALE
- Webinar mensile → #WEBINAR_MENSILE
- Illimitato annuale → #ILLIMITATO_ANNUALE
- Illimitato mensile → #ILLIMITATO_MENSILE
- Confronto piani → #PRICING

PREZZI INDICATIVI SYSTEME:
- Free: 0€ — 2.000 contatti, 3 funnel, 1 corso
- StartUp: ~27€/mese annuale — 5.000 contatti, funnel illimitati, 5 corsi
- Webinar: ~47€/mese annuale — 10.000 contatti, webinar inclusi
- Illimitato: ~97€/mese annuale — tutto illimitato

QUANDO USARE I TAG PIANO:
- Domanda su prezzi/piani → #PRICING + descrizione piani
- Funnel webinar → #WEBINAR_ANNUALE
- Funnel/automazioni avanzate/blog illimitati → #ILLIMITATO_ANNUALE
- Chi inizia → #FREE_ACCOUNT poi #STARTUP_ANNUALE

ALTRI LINK (solo se pertinenti):
- Consulenza Zoom con Gennaro: https://www.mandrakesystem.com/prenotazione-consulenza
- Magic Tool: https://www.mandrakesystem.com/magic-tools
- Software consigliati: https://www.mandrakesystem.com/software-consigliati`;

  try {
    // 1. VERIFICA UTENTE
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
      console.log('RESET giornaliero — azzero contatore');
      messaggiUsati = 0;
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: 0, ultimo_reset: oggi }) }
      );
    }

    // 3. PING
    if (message === '__ping__') {
      return res.status(200).json({ reply: '__PING_OK__', messaggi_rimasti: Math.max(0, 5 - messaggiUsati) });
    }

    // 4. LIMITE MESSAGGI
    if (!userKey && messaggiUsati >= 5) {
      console.log('LIMIT REACHED — messaggi usati:', messaggiUsati);
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

    // 5. CARICA CORSI — solo se domanda riguarda video/studio/corsi
    let corsiContext = '';
    const corsiKeywords = ['studi', 'corso', 'corsi', 'lezione', 'lezioni', 'impara', 'imparare',
      'playlist', 'video', 'youtube', 'tutorial', 'formazione', 'hai un video',
      'spieg', 'mostr', 'guarda', 'dove imparo', 'dove vedo', 'come faccio', 'come si fa',
      'popup', 'funnel', 'tasti', 'testo', 'testi', 'colonne', 'blocchi', 'blog',
      'automazione', 'regole', 'email', 'checkout', 'webinar', 'sito'];
    const msgLower = message.toLowerCase();
    if (corsiKeywords.some(k => msgLower.includes(k))) {
      try {
        const corsiRes = await fetch('https://mandrake-ai-api.vercel.app/corsi.json');
        if (corsiRes.ok) {
          const corsiData = await corsiRes.json();
          const lines = [];
          for (const [nome, corso] of Object.entries(corsiData)) {
            const maxVideo = nome.includes('Systeme') ? corso.video.length : 8;
            const videoList = corso.video.slice(0, maxVideo).map(v => `${v.titolo} → ${v.url}`).join(' | ');
            lines.push(`\n### ${nome} (${corso.lezioni} lezioni)\n${corso.descrizione}\nVideo: ${videoList}`);
          }
          corsiContext = '\n\nCATALOGO DETTAGLIATO CORSI:\n' + lines.join('\n');
          console.log('CORSI — caricati, lunghezza:', corsiContext.length);
        }
      } catch(e) { console.log('CORSI — errore:', e.message); }
    }

    // 6. STORICO CONVERSAZIONI
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=6`,
      { headers: SB_GET }
    );
    const convHistory = await convRes.json();
    console.log('HISTORY — righe:', Array.isArray(convHistory) ? convHistory.length : 'errore');

    const contents = [];
    if (Array.isArray(convHistory)) {
      convHistory.forEach(row => {
        if (row.domanda) contents.push({ role: 'user', parts: [{ text: row.domanda }] });
      });
    }
    contents.push({ role: 'user', parts: [{ text: message }] });

    // 7. CHIAMATA GEMINI
    console.log('GEMINI — chiamata con', contents.length, 'turns');
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT + corsiContext }] },
          contents,
          generationConfig: { temperature: 0.7, maxOutputTokens: 4096 }
        })
      }
    );

    const aiData = await aiRes.json();
    console.log('GEMINI — status:', aiRes.status, '| error:', aiData?.error?.message || 'nessuno');

    if (!aiRes.ok) {
      console.error('GEMINI ERROR:', JSON.stringify(aiData));
      return res.status(500).json({ error: 'Errore Google AI', detail: aiData?.error?.message, code: aiData?.error?.code });
    }

    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!reply) {
      console.error('GEMINI — testo vuoto:', JSON.stringify(aiData).substring(0, 300));
      return res.status(500).json({ error: 'Risposta Gemini vuota' });
    }

    console.log('REPLY OK — chars:', reply.length);

    // 8. INCREMENTA CONTATORE
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 }) }
      );
    }

    // 9. SALVA CONVERSAZIONE
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
