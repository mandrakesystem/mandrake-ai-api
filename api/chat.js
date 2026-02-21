// api/chat.js
export default async function handler(req, res) {

  // ── CORS ──────────────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // ── PARSE BODY ─────────────────────────────────────────────────────────────
  let rawBody = '';
  for await (const chunk of req) rawBody += chunk;
  let parsed;
  try { parsed = JSON.parse(rawBody); }
  catch { return res.status(400).json({ error: 'Invalid JSON' }); }

  const { email, message, apiKey: userKey } = parsed;
  const apiKey = userKey || process.env.GOOGLE_API_KEY;
  if (!email || !message || !apiKey) {
    return res.status(400).json({ error: 'Missing email, message, or API key' });
  }

  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_KEY;
  const SB_HEADERS = {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    'Content-Type': 'application/json'
  };

  // ── SYSTEM PROMPT CON AFFILIAZIONI ────────────────────────────────────────
  const SYSTEM_PROMPT = `Sei Mandrake AI, l'assistente intelligente dell'Academy Mandrake System.
Sei esperto di marketing digitale, funnels, Systeme.io, Facebook Ads, Google Ads, affiliazioni, automazioni, landing page, email marketing e corsi online.

REGOLE FONDAMENTALI:
1. Rispondi SEMPRE in italiano in modo professionale ma amichevole.
2. Quando una funzionalità richiede un piano Systeme.io specifico, indicalo chiaramente e inserisci il link affiliato corretto.
3. Per funnel webinar → piano Webinar: https://systeme.io/ba639220?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53 (annuale) o https://systeme.io/d3250724?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53 (mensile)
4. Per funnel illimitati, blog, regole illimitate → piano Illimitato: https://systeme.io/7bc37f29?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53 (annuale) o https://systeme.io/130b0725?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53 (mensile)
5. Per chi inizia → piano StartUp: https://systeme.io/8f1a2908?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53 (annuale, 30% sconto) o https://systeme.io/7d3baa4?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53 (mensile)
6. Per confronto piani → https://systeme.io/it/pricing?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53
7. Account gratuito → https://systeme.io/it?sa=sa0062809703b34ea45ddc8cbc961c2f263023ee53
8. Corsi disponibili nell'Academy: Systeme Tutorial (105 lezioni), Digitalizzo - Funnel Marketing, Landing Page Efficace, Facebook A-Z, YouTube Marketing, Social Media Advertiser, Google Ads, Chrome Facile, Affiliate Marketing, Metamask.
9. Per supporto personalizzato suggerisci la consulenza Zoom: https://www.mandrakesystem.com/prenotazione-consulenza
10. Magic Tool disponibile su: https://www.mandrakesystem.com/magic-tools
11. Software consigliati: https://www.mandrakesystem.com/software-consigliati
12. Per dubbi su Systeme rimanda alla guida ufficiale: https://help-it.systeme.io/
13. Usa **grassetto** per i punti chiave. Struttura le risposte con paragrafi chiari.`;

  try {
    // ── 1. VERIFICA UTENTE IN SUPABASE ────────────────────────────────────
    const userRes = await fetch(
      `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}&select=*`,
      { headers: SB_HEADERS }
    );
    const users = await userRes.json();
    if (!users.length) {
      return res.status(403).json({ reply: '__NOT_REGISTERED__' });
    }
    const user = users[0];

    // ── 2. RESET GIORNALIERO MESSAGGI ─────────────────────────────────────
    const oggi = new Date().toISOString().split('T')[0]; // "2025-01-15"
    const ultimoReset = user.ultimo_reset ? user.ultimo_reset.split('T')[0] : null;

    let messaggiUsati = user.messaggi_usati || 0;
    if (ultimoReset !== oggi) {
      // Nuovo giorno → azzera contatore
      messaggiUsati = 0;
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: SB_HEADERS,
          body: JSON.stringify({ messaggi_usati: 0, ultimo_reset: oggi })
        }
      );
    }

    // ── 3. CONTROLLA LIMITE (solo se non usa propria API key) ─────────────
    if (!userKey && messaggiUsati >= 5) {
      return res.status(200).json({ reply: '__LIMIT_REACHED__' });
    }

    // ── 4. CARICA STORICO CONVERSAZIONE DA SUPABASE ───────────────────────
    const convRes = await fetch(
      `${SUPABASE_URL}/rest/v1/conversations?email=eq.${encodeURIComponent(email)}&order=created_at.asc&limit=20&select=domanda,risposta`,
      { headers: SB_HEADERS }
    );
    const convHistory = await convRes.json();

    // Costruisci history per Gemini (formato contents)
    const historyContents = [];
    convHistory.forEach(row => {
      if (row.domanda) historyContents.push({ role: 'user', parts: [{ text: row.domanda }] });
      if (row.risposta) historyContents.push({ role: 'model', parts: [{ text: row.risposta }] });
    });
    // Aggiungi il messaggio corrente
    historyContents.push({ role: 'user', parts: [{ text: message }] });

    // ── 5. CHIAMATA GOOGLE GEMINI ─────────────────────────────────────────
    const aiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: SYSTEM_PROMPT }] },
          contents: historyContents
        })
      }
    );
    const aiData = await aiRes.json();
    if (!aiRes.ok) {
      console.error('GOOGLE ERROR:', aiData);
      return res.status(500).json({ error: 'Errore Google AI', detail: aiData });
    }
    const reply = aiData.candidates?.[0]?.content?.parts?.[0]?.text || 'Errore nella generazione risposta.';

    // ── 6. INCREMENTA CONTATORE (solo se usa credenziali server) ──────────
    if (!userKey) {
      await fetch(
        `${SUPABASE_URL}/rest/v1/users?email=eq.${encodeURIComponent(email)}`,
        {
          method: 'PATCH',
          headers: SB_HEADERS,
          body: JSON.stringify({ messaggi_usati: messaggiUsati + 1 })
        }
      );
    }

    // ── 7. SALVA CONVERSAZIONE COMPLETA (domanda + risposta) ──────────────
    await fetch(
      `${SUPABASE_URL}/rest/v1/conversations`,
      {
        method: 'POST',
        headers: SB_HEADERS,
        body: JSON.stringify({
          email,
          domanda: message,
          risposta: reply,
          categoria: 'generale',
          usa_propria_key: !!userKey
        })
      }
    );

    return res.status(200).json({ reply, messaggi_rimasti: userKey ? 999 : (4 - messaggiUsati) });

  } catch (error) {
    console.error('SERVER ERROR:', error);
    return res.status(500).json({ error: 'Errore server', detail: error.message });
  }
}
