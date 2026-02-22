// api/chat.js — Mandrake AI v3.8 — DEFINITIVO

export default async function handler(req, res) {

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

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

REGOLA N.1 — FONDAMENTALE: Rispondi ESCLUSIVAMENTE alla domanda attuale dell'utente indicata in "DOMANDA ATTUALE". Le domande precedenti in "STORICO" sono solo contesto di riferimento — NON rispondere ad esse, NON ripeterle, NON riassumerle.

REGOLA N.2: Rispondi SOLO a ciò che viene chiesto. Niente informazioni extra non richieste.

REGOLA N.3: Zero frasi introduttive. Niente "Ecco", "Certamente", "Sarò lieto". Vai dritto alla risposta.

REGOLA N.4: NON usare il formato Markdown [testo](url). Solo URL nudi: https://esempio.com

REGOLA N.5 — LINK SYSTEME.IO:
- Quando menzioni Systeme.io come piattaforma su cui registrarsi o fare upgrade, usa SEMPRE il reflink: https://systeme.io/it?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53
- Per la documentazione usa: https://help-it.systeme.io/search?query=PAROLA_CHIAVE (sostituisci con l'argomento specifico)
- NON inventare mai URL specifici di help-it.systeme.io tipo /article/123-titolo
- NON linkare mai URL tipo mandrakesystem.com/dashboard/it/course-viewer — non esistono pubblicamente

REGOLA N.6: Usa **grassetto** per i punti chiave.

REGOLA N.7 — VIDEO: Quando l'utente chiede un video su un argomento, cerca nel catalogo il video con titolo più pertinente e linka QUELL'URL YouTube esatto. Mai il canale generico se hai il video specifico.

REGOLA N.8 — CORSI: Consiglia i corsi pertinenti solo quando l'utente chiede cosa studiare/imparare o vuole video. Linka academy: https://www.mandrakesystem.com/dashboard/it/login

CATALOGO CORSI:
- Systeme.io Tutorial (105 lezioni) → funnel, pagine, editor, blog, email, automazioni, siti
- Digitalizzo - Funnel Marketing (18 lezioni) → strategia funnel, trovare clienti, PMI
- Landing Page Perfetta (17 lezioni) → landing page ad alta conversione
- Facebook A-Z (64 lezioni) → Facebook dalle basi alle Ads avanzate
- YouTube Marketing (21 lezioni) → crescita canale, contenuti, YouTube Ads
- Google Ads (20 lezioni) → campagne PPC, parole chiave, lead generation
- Google Chrome (28 lezioni) → Chrome, estensioni, password, privacy
- Affiliate Marketing (17 lezioni) → affiliazioni, Amazon, network
- Metamask (19 lezioni) → wallet crypto, reti, token, swap

PIANI SYSTEME — usa SOLO questi tag (diventano bottoni):
#FREE_ACCOUNT | #STARTUP_ANNUALE | #STARTUP_MENSILE | #WEBINAR_ANNUALE | #WEBINAR_MENSILE | #ILLIMITATO_ANNUALE | #ILLIMITATO_MENSILE | #PRICING

PREZZI: Free 0€ (2k contatti, 3 funnel, 1 corso) | StartUp ~27€/mese annuale (5k contatti, funnel illimitati) | Webinar ~47€/mese annuale (10k contatti, webinar) | Illimitato ~97€/mese annuale (tutto illimitato)

ALTRI LINK: Consulenza Zoom: https://www.mandrakesystem.com/prenotazione-consulenza | Magic Tool: https://www.mandrakesystem.com/magic-tools | Software: https://www.mandrakesystem.com/software-consigliati`;

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
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    if (!apiKey) return res.status(400).json({ error: 'Missing API key' });

    // 5. CARICA CORSI — solo se domanda riguarda video/studio/elementi specifici
    let corsiContext = '';
    const corsiKeywords = ['studi', 'corso', 'corsi', 'lezione', 'lezioni', 'impara', 'imparare',
      'playlist', 'video', 'youtube', 'tutorial', 'formazione', 'hai un video',
      'spieg', 'mostr', 'guarda', 'dove imparo', 'come faccio', 'come si fa',
      'popup', 'pop up', 'tasti', 'tasto', 'testo', 'testi', 'colonne', 'blocchi',
      'automazione', 'checkout', 'webinar', 'sito', 'funnel', 'blog', 'email'];
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

    // 6. STORICO CONVERSAZIONI — passato come contesto nel prompt, NON come messaggi separati
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=4`,
      { headers: SB_GET }
    );
    const convHistory = await convRes.json();
    console.log('HISTORY — righe:', Array.isArray(convHistory) ? convHistory.length : 'errore');

    let historySummary = '';
    if (Array.isArray(convHistory) && convHistory.length > 0) {
      const prev = convHistory.map(r => r.domanda).filter(Boolean);
      if (prev.length > 0) {
        historySummary = `\n\nSTORICO domande precedenti (solo contesto, NON rispondere a queste):\n- ${prev.join('\n- ')}`;
      }
    }

    // 7. MESSAGGIO FINALE — domanda attuale chiaramente separata
    const finalPrompt = SYSTEM_PROMPT + corsiContext + historySummary;
    const contents = [
      { role: 'user', parts: [{ text: `DOMANDA ATTUALE: ${message}` }] }
    ];

    // 8. CHIAMATA GEMINI
    console.log('GEMINI — chiamata singola, prompt length:', finalPrompt.length);
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: finalPrompt }] },
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

    // 9. INCREMENTA CONTATORE
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        { method: 'PATCH', headers: SB_WRITE, body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 }) }
      );
    }

    // 10. SALVA CONVERSAZIONE
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
