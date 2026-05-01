// api/generate.js
// Vercel Serverless Function — Lumière App
// Génère des messages personnalisés via Groq (API compatible OpenAI)

const GROQ_CHAT_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';

// ── Catégories de messages ──────────────────────────────
const CATEGORIES = {
  matin:   'Ancrage du matin',
  journee: 'Apaisement en journée',
  soir:    'Clôture de journée',
  crise:   'Réconfort émotionnel'
};

// ── Correspondance état → type de message ──────────────
const ETAT_GUIDANCE = {
  fatigue:      'fatigue physique ou mentale, épuisement',
  stress:       'stress, surcharge, anxiété, pression',
  tristesse:    'tristesse, peine, mélancolie',
  doute:        'doute, incertitude, manque de confiance en soi',
  determination:'élan, motivation, volonté d\'avancer',
  depassee:     'sentiment d\'être dépassée, débordée par les événements',
  reconfort:    'besoin de douceur, de réconfort, d\'être comprise',
  bien:         'état relativement stable, légère fatigue normale'
};

// ── Prompt système ─────────────────────────────────────
const SYSTEM_PROMPT = `Tu es un générateur de messages de soutien émotionnel profondément humain, empathique et bienveillant. Tu crées des messages de réconfort, de motivation et d'encouragement personnalisés.

RÈGLES ABSOLUES :
• Ton : humain, chaleureux, jamais robotique ni clinique ni thérapeutique
• Utilise le prénom de la personne une seule fois maximum, naturellement
• Style : poétique mais ancré, vrai, simple — jamais de clichés vides
• Longueur : 2 à 4 phrases maximum. Chaque mot doit compter.
• Ne pas donner de conseils thérapeutiques, ne pas diagnostiquer
• Toujours en français impeccable
• Tutoiement chaleureux (comme un ami proche bienveillant)
• L'intensité doit guider la profondeur : 1 = très doux et léger, 5 = profond, ancré, très présent
• Si l'état est "fatigue" + intensité 5 → message très doux, lent, qui valide l'épuisement
• Si l'état est "determination" + intensité 4-5 → message qui amplifie l'élan sans pression
• Si moment "crise" → message ultra simple, stabilisant, très humain — pas de grandes phrases

PERSONNALITÉ CIBLE (forte, ambitieuse, sensible mais réservée) :
• Ne jamais infantiliser
• Reconnaître sa force sans exagérer
• Valider sans minimiser ce qu'elle ressent
• La pousser sans pression

STRUCTURE DE RÉPONSE :
Réponds UNIQUEMENT avec un JSON valide, sans commentaire, sans backtick, sans texte autour :
{"message":"Le message ici","category":"matin|journee|soir|crise"}`;

// ── Handler principal ──────────────────────────────────
module.exports = async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    name,
    moment,
    etats = [],
    intensite = 3,
    contexte = '',
    prefs = {},
    daily = false
  } = req.body || {};

  // Validation minimale
  if (!name || !moment) {
    return res.status(400).json({ error: 'Paramètres manquants : name et moment requis' });
  }

  // Construire la description des états
  const etatsDesc = etats.length > 0
    ? etats.map(e => ETAT_GUIDANCE[e] || e).join(', ')
    : 'état général non spécifié';

  // Sélectionner la catégorie intelligente
  const category = selectCategory(moment, etats, intensite);

  // Prompt utilisateur
  const userPrompt = buildPrompt({
    name,
    moment,
    etats,
    etatsDesc,
    intensite,
    contexte,
    category,
    prefs,
    daily
  });

  try {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Configuration serveur manquante: GROQ_API_KEY',
        hint: 'Ajoute GROQ_API_KEY dans les variables d’environnement Vercel (Environment: Production/Preview selon ton URL) puis redeploie.'
      });
    }

    const softness = clampInt(prefs?.softness, 0, 10);
    const concreteness = clampInt(prefs?.concreteness, 0, 10);
    const temperature = daily ? 0.72 : (softness >= 4 ? 0.75 : (concreteness >= 4 ? 0.8 : 0.85));

    const groqRes = await fetch(GROQ_CHAT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        max_tokens: 300,
        temperature,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt }
        ]
      })
    });

    const groqBody = await groqRes.json().catch(() => ({}));
    if (!groqRes.ok) {
      const detail = groqBody.error?.message || JSON.stringify(groqBody).slice(0, 200);
      throw new Error(`Groq ${groqRes.status}: ${detail}`);
    }

    const raw = groqBody.choices?.[0]?.message?.content?.trim() || '';

    // Extraire et parser le JSON
    const jsonStr = raw.match(/\{[\s\S]*?\}/)?.[0];
    if (!jsonStr) throw new Error('JSON non trouvé dans la réponse');

    const parsed = JSON.parse(jsonStr);

    if (!parsed.message) throw new Error('Champ message absent');

    return res.status(200).json({
      message: parsed.message,
      category: parsed.category || category,
      meta: {
        moment,
        intensite,
        etats,
        categoryLabel: CATEGORIES[category]
      }
    });

  } catch (err) {
    console.error('[Lumière API] Erreur:', err.message);

    // Pour éviter de masquer les erreurs en prod, on renvoie une erreur.
    // Le frontend affichera alors son fallback local si besoin.
    return res.status(502).json({
      error: 'Erreur lors de la génération du message',
      detail: String(err.message || err).slice(0, 300)
    });
  }
};

// ── Sélection intelligente de catégorie ───────────────
function selectCategory(moment, etats, intensite) {
  if (moment === 'crise') return 'crise';
  if (moment === 'soir')  return 'soir';

  // Si intensité haute + état négatif → réconfort
  const etatsNegatifs = ['fatigue','stress','tristesse','doute','depassee','reconfort'];
  const hasNegatif = etats.some(e => etatsNegatifs.includes(e));

  if (hasNegatif && intensite >= 4) return 'crise';

  return moment || 'matin';
}

// ── Construction du prompt ────────────────────────────
function buildPrompt({ name, moment, etats, etatsDesc, intensite, contexte, category, prefs, daily }) {
  const catLabel = CATEGORIES[category] || CATEGORIES[moment];

  const etatsStr = etats.length > 0
    ? etats.join(', ')
    : 'aucun état particulier spécifié';

  const softness = clampInt(prefs?.softness, 0, 10);
  const concreteness = clampInt(prefs?.concreteness, 0, 10);
  const liked = clampInt(prefs?.liked, 0, 50);

  const tuning = [];
  if (softness >= 3) tuning.push('- Style demandé: plus doux, plus léger, moins intense émotionnellement');
  if (concreteness >= 3) tuning.push('- Style demandé: plus concret, plus simple, moins poétique');
  if (liked >= 5) tuning.push('- Conserve ce style global (la personne a indiqué que ça l’aide)');
  if (daily) tuning.push('- Mode "message du jour": une seule pépite, très soignée, intemporelle, pas de répétitions inutiles');

  return `Génère un message de catégorie "${catLabel}" pour :

Prénom : ${name}
Moment de la journée : ${moment}
État(s) émotionnel(s) : ${etatsStr}
Description détaillée des états : ${etatsDesc}
Intensité de l'état (1=très léger → 5=très intense) : ${intensite}/5
Contexte supplémentaire : ${contexte || 'Aucun contexte particulier mentionné'}

Instructions spécifiques :
- Croise le moment "${moment}", l'intensité ${intensite}/5 et l'état "${etatsStr}" pour un message parfaitement calibré
- Si intensité ≥ 4 : message plus profond, plus ancré, plus présent
- Si intensité ≤ 2 : message léger, respirant, doux
- Si contexte mentionné : intègre-le subtilement sans le répéter mot pour mot
- Génère UN SEUL message, le meilleur possible
${tuning.length ? '\nAjustements (préférences) :\n' + tuning.join('\n') : ''}

Rappel format attendu : JSON valide uniquement.`;
}

function clampInt(v, min, max){
  const n = Number.parseInt(v, 10);
  if(Number.isNaN(n)) return min;
  return Math.max(min, Math.min(max, n));
}

// ── Messages de fallback ───────────────────────────────
function getFallbackMessage(name, moment, etats, intensite) {
  const isHigh = intensite >= 4;
  const isTired = etats.includes('fatigue') || etats.includes('depassee');
  const isSad   = etats.includes('tristesse') || etats.includes('reconfort');
  const isStrong = etats.includes('determination');

  const fallbacks = {
    matin: [
      `${name}, commence cette journée doucement. Tu portes déjà en toi ce qu'il faut pour la traverser.`,
      `Bonjour ${name}. Peu importe ce que cette journée apporte, rappelle-toi que tu as déjà traversé des matins plus lourds que celui-ci.`,
      `${name}, avance à ton rythme aujourd'hui. Tu n'as rien à prouver — juste à continuer.`
    ],
    journee: [
      `${name}, si tout va trop vite, ralentis un instant. Respire. Tu n'es pas obligée de tout gérer parfaitement.`,
      `Tu portes beaucoup, ${name}. Mais tu n'as pas à tout porter d'un coup. Un pas à la fois.`,
      `${name}, même dans l'agitation, souviens-toi de ta force. Elle est là, silencieuse mais réelle.`
    ],
    soir: [
      `${name}, tu as tenu jusqu'au bout aujourd'hui. Repose-toi maintenant — tu l'as mérité.`,
      `Cette journée est terminée, ${name}. Quoi qu'elle ait apporté, tu es toujours là. Et ça, c'est déjà beaucoup.`,
      `Laisse cette journée partir, ${name}. Tu as donné ce que tu pouvais. C'est suffisant.`
    ],
    crise: [
      `${name}, reste calme. Ce moment est difficile, mais il ne définit pas tout. Tu vas traverser ça.`,
      `Tu n'es pas seule, ${name}. Même quand ça semble trop lourd, quelque chose en toi tient toujours.`,
      `Respire, ${name}. Ce moment passera. Il passe toujours.`
    ]
  };

  // Choisir selon l'état
  let pool = fallbacks[moment] || fallbacks.matin;

  if (isTired && isHigh) return pool[2] || pool[0];
  if (isSad)             return pool[0];
  if (isStrong)          return pool[1] || pool[0];

  // Aléatoire parmi les fallbacks
  return pool[Math.floor(Math.random() * pool.length)];
}
