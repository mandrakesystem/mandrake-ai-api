// 3️⃣ Chiamata Google AI
const aiRes = await fetch(
  `https://generativelanguage.googleapis.com/v1/models/gemini-pro:generateContent?key=${process.env.GOOGLE_API_KEY}`,
  {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
