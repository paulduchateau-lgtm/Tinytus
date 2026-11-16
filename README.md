# Tinnitus Studio

Une application web, en français, pour recréer le son de ses acouphènes et le faire écouter à ses proches.
Elle est 100 % statique : pas de serveur, pas de compte, pas de dépendance. Tout reste sur l’appareil.

> Ce n’est pas un outil médical : il ne diagnostique ni ne soigne. Les sons proposés sont des points de départ synthétiques, pas des références cliniques.

## Parcours

1. **À quoi ressemble votre acouphène ?** Six sons de départ, à écouter d’un toucher (ou « Partir de zéro »).
2. **Affinez votre son**. Un spectre coloré : horizontalement plus grave ↔ plus aigu, verticalement son pur ↔ son diffus. Trois réglages secondaires : Intensité, Battement, Grain. Jusqu’à 4 sons superposés. Le panneau « Réglages supplémentaires » contient l’oreille, le timbre, la vitesse du battement, la largeur et l’affichage des fréquences.
3. **Partager mon acouphène**. Un lien qui contient toute la composition (dans le fragment `#s=…`), ou un fichier WAV de 15 s généré localement.

## Fichiers

| Fichier | Rôle |
|---|---|
| `index.html` | Structure des trois écrans et de la fenêtre de partage |
| `style.css` | Design (mobile d’abord, adapté à l’ordinateur) |
| `audio-engine.js` | Moteur de synthèse Web Audio (écoute en direct + graphe commun) |
| `presets.js` | Modèle et validation des pistes, sons de départ |
| `sharing.js` | Encodage compact et versionné des liens |
| `export.js` | Rendu `OfflineAudioContext` et encodage WAV PCM 16 bits |
| `app.js` | Interface |

L’export WAV utilise exactement la même fonction `createVoice()` que l’écoute en direct.

### Format du lien (v1)

`#s=` suivi de la composition encodée en base64url : un octet de version, le nombre de pistes, puis 9 octets par piste (hauteur sur 16 bits, puis pureté, intensité, battement, grain, vitesse, largeur et drapeaux pour l’activation, l’oreille et le timbre), et enfin une somme de contrôle. Un lien de 4 pistes fait environ 55 caractères. À l’ouverture, la version, la longueur, la somme de contrôle et les valeurs sont toutes vérifiées. Un lien abîmé renvoie à l’accueil avec un message.

## Précautions auditives

- Volume initial bas, aucune lecture automatique (y compris à l’ouverture d’un lien).
- Normalisation selon le nombre de pistes, plus un limiteur (`DynamicsCompressor`) contre la saturation.
- Toutes les modifications sont lissées, ce qui évite les clics. Fondus en début et en fin de lecture et d’export.
- Arrêt automatique quand la page passe en arrière-plan.

## iPhone / Safari

- L’`AudioContext` n’est créé et repris (`resume()`) qu’à l’intérieur d’un geste de l’utilisateur.
- Sur Safari 17 et plus, `navigator.audioSession.type = 'playback'` (API officielle) permet d’entendre le son même en mode silencieux. Sur les versions antérieures, un message rappelle de vérifier ce mode si le son ne démarre pas.
- Les interruptions (appel, autre application) sont détectées : l’interface repasse sur « Écouter » et affiche un message.
- Le spectre utilise `touch-action: none` : glisser le doigt ne fait pas défiler la page.

## Tester en local

```bash
python3 -m http.server 8000
# puis ouvrir http://localhost:8000/
```

Les modules ES ne se chargent pas en `file://`, il faut donc un serveur HTTP statique.

## Publier sur GitHub Pages

1. Pousser ces fichiers sur la branche à publier (par exemple `main`).
2. Sur GitHub : **Settings → Pages → Build and deployment → Source : Deploy from a branch**, choisir la branche, puis le dossier `/ (root)`, et enregistrer.
3. Après une à deux minutes, le site est disponible à `https://UTILISATEUR.github.io/NOM-DU-DEPOT/`.

Tous les chemins sont relatifs, et `.nojekyll` désactive le traitement Jekyll. Les liens de partage reprennent automatiquement le chemin du dépôt.
