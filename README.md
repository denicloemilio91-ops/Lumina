# 🌙 Lumière — Application de messages de soutien émotionnel

> Des messages de réconfort et de motivation générés par IA, personnalisés selon ton état, ton moment de la journée et ton contexte.

---

## ✨ Fonctionnalités

- **Détection automatique du moment** (matin / journée / soir) selon l'heure
- **3 axes de personnalisation** : Moment × État émotionnel × Intensité
- **8 états émotionnels** détectables : fatigue, stress, tristesse, doute, détermination, dépassement, besoin de réconfort, bien dans l'ensemble
- **Slider d'intensité** (1 → 5) pour calibrer la profondeur du message
- **Contexte libre** pour enrichir la génération (examens, pression pro, etc.)
- **Historique de session** : sauvegarde les messages favoris
- **Fallback humain** si l'API est indisponible
- **Interface responsive** (mobile + desktop)

---

## 🏗️ Architecture

```
lumiere-app/
├── public/
│   └── index.html        ← Frontend complet (vanilla JS, Cormorant Garamond)
├── api/
│   └── generate.js       ← Handler Groq (Vercel en prod, dev local via scripts/)
├── scripts/
│   └── dev-server.js     ← Serveur Node minimal (npm run dev, sans CLI Vercel)
├── package.json
├── vercel.json
└── README.md
```

**Flux de données :**
```
Utilisateur → [Input : nom, moment, états, intensité, contexte]
    → fetch POST /api/generate
    → Serverless Function → Groq API (Llama 3.3 70B)
    → JSON { message, category }
    → Affichage dans le message card
```

---

## 🚀 Déploiement sur Vercel

### Étape 1 — Prérequis

- Compte [Vercel](https://vercel.com) (gratuit)
- Clé API Groq (gratuit avec limites) : [console.groq.com](https://console.groq.com)
- Node.js ≥ 18 en local (pour tester)

### Étape 2 — Installation locale

```bash
# Cloner / placer le projet
cd lumiere-app

# Installer les dépendances
npm install

# Créer le fichier .env.local pour les tests locaux
echo "GROQ_API_KEY=gsk_..." > .env.local
```

### Étape 3 — Tester localement

Pas besoin de la CLI Vercel : un petit serveur Node sert le site et `/api/generate`.

```bash
npm run dev
# → http://localhost:3000  (autre port : PORT=8080 npm run dev)
```

Les variables `GROQ_API_KEY` (etc.) sont lues depuis `.env.local` ou `.env` à la racine du projet.

### Étape 4 — Déployer sur Vercel

**Option A — Via CLI (sans installation globale, `npx` utilise le cache npm) :**
```bash
npx vercel login
npm run deploy
```

**Option B — Via interface Vercel :**
1. Aller sur [vercel.com/new](https://vercel.com/new)
2. Importer le projet depuis GitHub (pousser d'abord sur GitHub)
3. Configurer la variable d'environnement

### Étape 5 — Variable d'environnement (OBLIGATOIRE)

Dans le dashboard Vercel :
```
Settings → Environment Variables → Add New

Nom  : GROQ_API_KEY
Valeur : gsk_VOTRE_CLÉ_ICI
Environnements : Production + Preview + Development
```

---

## 🧠 Logique IA — Comment ça fonctionne

### Sélection de catégorie intelligente

```
Moment × État × Intensité → Catégorie de message

matin + fatigue + intensité 5 → Réconfort émotionnel (pas simple ancrage)
matin + determination + 4    → Activation mentale
soir  + tout état            → Clôture de journée
crise + tout                 → Réconfort émotionnel (ultra simplifié)
```

### Prompt Engineering

Le prompt système injecte :
- La personnalité cible (forte, ambitieuse, sensible mais réservée)
- Le calibrage d'intensité (1=léger → 5=profond)
- Les règles de ton (humain, non-robotique, non-thérapeutique)

Le prompt utilisateur croise les 3 axes dynamiquement.

### Température = 0.85

Assez de créativité pour que chaque génération soit unique, sans perdre en cohérence.

---

## 🎨 Design

- **Police display** : Cormorant Garamond (élégante, émotionnelle)
- **Police interface** : Nunito (chaleureuse, lisible)
- **Palette** : Deep navy (#070914) + Gold (#d4a45a) + Moon blue (#7a9ecf)
- **Fond** : Canvas starfield animé (particles JS vanilla)
- **Animations** : CSS keyframes, transitions fluides

---

## 🔧 Personnalisation facile

### Changer le modèle IA

Variable d’environnement **`GROQ_MODEL`** (sinon défaut dans le code). Exemples d’IDs Groq : `llama-3.3-70b-versatile`, `llama-3.1-8b-instant`, `openai/gpt-oss-20b` — liste à jour sur [console.groq.com/docs/models](https://console.groq.com/docs/models).

### Ajouter des états émotionnels

Dans `api/generate.js`, `ETAT_GUIDANCE` :
```javascript
ETAT_GUIDANCE = {
  ...
  burnout: 'épuisement profond, surcharge chronique',
  solitude: 'sentiment d\'isolement, besoin de connexion'
}
```

Et dans `public/index.html`, ajouter le pill :
```html
<div class="e-pill" data-e="burnout" onclick="toggleE(this)">Burnout</div>
```

### Modifier la personnalité cible

Dans `SYSTEM_PROMPT` de `api/generate.js`, section `PERSONNALITÉ CIBLE`.

---

## 💰 Coûts estimés

Avec **Groq** (plan gratuit / tarifs selon compte) : coût et quotas dépendent du modèle et du compte — voir [Groq pricing](https://groq.com/pricing).

---

## 📄 Licence

MIT — Projet libre d'utilisation et de modification.

---

*Construit avec ❤️ et ✦ par Lumière*
