// Languages: English by default, French when the phone or browser prefers French.
// The page is written in English; `localizePage()` swaps its texts, and `tx()` translates
// the texts set from JavaScript. Keys are the English strings ({n}-style placeholders).

const first = ((navigator.languages && navigator.languages[0]) || navigator.language || 'en').toLowerCase();
export const LANG = first.startsWith('fr') ? 'fr' : 'en';

const FR = {
  // Page
  'Recreate the sound of your tinnitus and let your loved ones hear it.': 'Recréez le son de vos acouphènes et faites-le écouter à vos proches.',
  'What does your tinnitus sound like?': 'À quoi ressemble votre acouphène ?',
  'Tap a sound to hear it, then pick the one that comes closest.': 'Touchez un son pour l’écouter, puis choisissez celui qui s’en rapproche le plus.',
  'Start with a low volume.': 'Commencez avec un volume bas.',
  'Continue with my sound': 'Reprendre mon son',
  'Your latest composition': 'Votre dernière composition',
  'Start from scratch': 'Partir de zéro',
  'Choose a sound': 'Choisissez un son',
  'Fine-tune this sound': 'Affiner ce son',
  'Back to sounds': 'Retour aux sons',
  'Fine-tune your sound': 'Affinez votre son',
  'Spectrum: drag horizontally for a lower or higher sound, vertically for a purer or more diffuse sound':
    'Spectre : glissez horizontalement pour un son plus grave ou plus aigu, verticalement pour un son plus pur ou plus diffus',
  'Pure': 'Son pur', 'Diffuse': 'Son diffus', 'Lower': 'Plus grave', 'Higher': 'Plus aigu',
  'Mute this sound': 'Couper ce son', 'Unmute this sound': 'Réactiver ce son', 'Remove': 'Supprimer',
  'Loudness': 'Intensité', 'Quiet': 'Douce', 'Loud': 'Forte',
  'Pulse': 'Battement', 'Steady': 'Continu', 'Pulsing': 'Pulsant',
  'Grain': 'Grain', 'Smooth': 'Lisse', 'Grainy': 'Granuleux',
  'Listen': 'Écouter', 'Stop': 'Arrêter', 'Listen to this sound': 'Écouter ce son',
  'Listen for {n} min': 'Écouter {n} min',
  'Stop · {t} left': 'Arrêter · encore {t}',
  'Preparing…': 'Préparation…',
  'Keeps playing with the screen locked': 'Continue même écran verrouillé',
  'Keep the volume comfortable and stop if the sound becomes unpleasant.': 'Gardez un volume confortable et arrêtez si le son devient gênant.',
  'Share my tinnitus': 'Partager mon acouphène',
  'More settings': 'Réglages supplémentaires',
  'Ear': 'Oreille', 'Left': 'Gauche', 'Both': 'Les deux', 'Right': 'Droite',
  'Tone': 'Timbre', 'Soft': 'Doux', 'Round': 'Rond', 'Rich': 'Riche', 'Bell': 'Cloche',
  'Pulse shape': 'Forme du battement', 'Gentle': 'Douce', 'Chirping': 'Grésillante', 'Buzzing': 'Crissante',
  'Pulse speed': 'Vitesse du battement', 'Slow': 'Lente', 'Fast': 'Rapide',
  'Sound width': 'Largeur du son', 'Narrow': 'Étroit', 'Wide': 'Large',
  'Frequency': 'Fréquence', 'Lower frequency': 'Fréquence plus grave', 'Higher frequency': 'Fréquence plus aiguë', 'Frequency in hertz': 'Fréquence en hertz',
  'Very high sounds fade with age. Don’t turn the volume up to hear them.': 'Les sons très aigus deviennent inaudibles avec l’âge. N’augmentez pas le volume pour les entendre.',
  'Very low sounds need headphones: phone speakers can’t play them.': 'Les sons très graves demandent des écouteurs\u00a0: le haut-parleur du téléphone ne les reproduit pas.',
  'Hear what I hear': 'Écoutez ce que j’entends',
  'This sound was recreated by someone living with tinnitus, to help you understand what they hear.':
    'Ce son a été recréé par une personne qui vit avec des acouphènes, pour vous faire comprendre ce qu’elle perçoit.',
  'Turn the volume down a little before listening.': 'Baissez un peu le volume avant d’écouter.',
  'Edit this sound': 'Modifier ce son',
  'Recreate my own tinnitus': 'Recréer mes propres acouphènes',
  'Tinnitus Studio helps others hear what you perceive. It is not a medical tool: it does not diagnose or treat anything. Everything stays on your device.':
    'Tinnitus Studio aide à faire entendre ce que vous percevez. Ce n’est pas un outil médical : il ne diagnostique ni ne soigne. Tout reste sur votre appareil.',
  'Close': 'Fermer',
  'Send a link': 'Envoyer un lien',
  'Your loved ones listen in their browser, with no account or install.': 'Vos proches l’écoutent dans leur navigateur, sans compte ni installation.',
  'Share link': 'Partager le lien', 'Copy link': 'Copier le lien',
  'Download the sound': 'Télécharger le son',
  'A 15-second audio file, created on your device.': 'Un fichier audio de 15 secondes, créé sur votre appareil.',
  'Create the audio file': 'Créer le fichier audio', 'Creating the file…': 'Création du fichier…',
  'Save': 'Enregistrer', 'Share file': 'Partager le fichier',
  'Changes will apply next time you start the loop.': 'Les changements s’appliqueront au prochain lancement de la boucle.',
  'Loop': 'Boucle',
  'Share': 'Partager',
  'Night mode': 'Mode nuit',
  'Sound actions': 'Actions sur le son',
  'tinytus helps others hear what you perceive. It is not a medical tool: it does not diagnose or treat anything. Everything stays on your device.':
    'tinytus aide à faire entendre ce que vous percevez. Ce n’est pas un outil médical\u00a0: il ne diagnostique ni ne soigne. Tout reste sur votre appareil.',
  'I have a code: paste it here': 'J’ai un code : collez-le ici',
  'Paste or type the code': 'Collez ou tapez le code',
  'Sound code': 'Code du son',
  'Open': 'Ouvrir',
  'Load a code': 'Charger un code',
  'My code': 'Mon code',
  'Keep this code to find your sound again. Enter it in tinytus to reopen it.': 'Gardez ce code pour retrouver votre son. Saisissez-le dans tinytus pour le rouvrir.',
  'Copy': 'Copier',
  'Save code': 'Enregistrer le code',
  'Code copied.': 'Code copié.',
  'Select the code to copy it.': 'Sélectionnez le code pour le copier.',
  'tinytus-code.txt': 'tinytus-code.txt',
  'Sound loaded.': 'Son chargé.',
  'This code is incomplete or damaged.': 'Ce code est incomplet ou abîmé.',
  'Report for my doctor': 'Rapport pour mon médecin',
  'A summary of your sound’s characteristics, to save as PDF or print.': 'Un résumé des caractéristiques de votre son, à enregistrer en PDF ou à imprimer.',
  'Create the report (PDF)': 'Créer le rapport (PDF)',
  'report': 'rapport',
  'Pure tone (tonal)': 'Son pur (tonal)',
  'Slightly diffuse tone': 'Son légèrement diffus',
  'Diffuse sound, close to a noise': 'Son diffus, proche d’un bruit',
  'diffusion': 'diffusion',
  'Noise band about {bw} Hz wide around {f} Hz': 'Bande de bruit d’environ {bw} Hz de large autour de {f} Hz',
  'Character': 'Caractère',
  'Soft (sine wave)': 'Doux (onde sinusoïdale)',
  'Round (triangle wave)': 'Rond (onde triangulaire)',
  'Rich (sawtooth wave, many harmonics)': 'Riche (onde en dents de scie, nombreuses harmoniques)',
  'Bell (inharmonic partials)': 'Cloche (partiels inharmoniques)',
  'Steady (no pulsation)': 'Continu (pas de pulsation)',
  'Regular buzzing: {r} clicks per second, depth {d}': 'Crissement régulier : {r} clics par seconde, profondeur {d}',
  'Chirping: {r} chirps per second, depth {d}': 'Grésillant : {r} chants par seconde, profondeur {d}',
  'Pulsing: {r} beats per second, depth {d}': 'Pulsant : {r} battements par seconde, profondeur {d}',
  'Grainy, irregular texture — {g}': 'Granuleux, texture irrégulière — {g}',
  'Both ears': 'Les deux oreilles',
  'Left ear': 'Oreille gauche',
  'Right ear': 'Oreille droite',
  '{l} of the app maximum (depends on the device volume)': '{l} du maximum de l’app (dépend du volume de l’appareil)',
  'muted in the composition': 'coupé dans la composition',
  'Frequencies on the hearing range': 'Fréquences sur l’échelle de l’audition',
  'My tinnitus — sound description': 'Mon acouphène — description du son',
  'Created on {d}': 'Créé le {d}',
  '1 sound': '1 son',
  'This report describes the sound I recreated to match my tinnitus. It is a subjective reproduction made by ear, not a medical measurement.': 'Ce rapport décrit le son que j’ai recréé pour qu’il ressemble à mon acouphène. Il s’agit d’une reproduction subjective, faite à l’oreille, et non d’une mesure médicale.',
  'Details': 'Détails',
  'Listen again': 'Réécouter',
  'Code': 'Code',
  'Notes': 'Notes',
  'Since when?': 'Depuis quand ?',
  'Constant or intermittent?': 'Permanent ou intermittent ?',
  'Discomfort (0 to 10)': 'Gêne (de 0 à 10)',
  'Other remarks': 'Autres remarques',
  'tinytus is not a medical tool: it does not diagnose or treat anything. The levels and frequencies depend on the device and headphones used.': 'tinytus n’est pas un outil médical : il ne diagnostique ni ne soigne. Les niveaux et fréquences dépendent de l’appareil et des écouteurs utilisés.',
  // Dynamic texts
  'Sound {n}': 'Son {n}',
  'Sound {n}: {f}': 'Son {n} : {f}',
  '+ Add another sound': '+ Ajouter un autre son',
  '{n} layered sounds': '{n} sons superposés',
  'My tinnitus': 'Mon acouphène',
  'my-tinnitus.wav': 'mon-acouphene.wav',
  'This is what I hear all the time. Turn the volume down a little before listening.':
    'Voici ce que j’entends en permanence. Baisse un peu le volume avant d’écouter.',
  'Your browser cannot generate sound.': 'Votre navigateur ne permet pas de générer du son.',
  'All sounds are muted. Turn at least one back on.': 'Tous les sons sont coupés. Réactivez-en au moins un.',
  'The sound won’t start. Tap “Listen” again, check the volume and, on iPhone, make sure silent mode is off.':
    'Le son ne démarre pas. Touchez à nouveau « Écouter », vérifiez le volume et, sur iPhone, que le mode silencieux est désactivé.',
  'The sound was interrupted. Tap “Listen” to resume.': 'Le son a été interrompu. Touchez « Écouter » pour reprendre.',
  'Long listening could not start on this device.': 'L’écoute longue n’a pas pu démarrer sur cet appareil.',
  'Changes will apply next time you start the 30-minute listening.': 'Les changements s’appliqueront au prochain lancement de l’écoute de 30 minutes.',
  'Tap “Listen” to hear your changes live.': 'Touchez « Écouter » pour entendre vos réglages en direct.',
  'Link copied. Paste it into a message.': 'Lien copié. Collez-le dans un message.',
  'Select the link to copy it.': 'Sélectionnez le lien pour le copier.',
  'Sharing didn’t work. Use “Copy link”.': 'Le partage n’a pas abouti. Utilisez « Copier le lien ».',
  'Sharing didn’t work. Use “Save”.': 'Le partage n’a pas abouti. Utilisez « Enregistrer ».',
  'Unable to create the file on this device.': 'Impossible de créer le fichier sur cet appareil.',
  'This share link is incomplete or damaged.': 'Ce lien de partage est incomplet ou abîmé.',
};

/** Translates an English string, filling {placeholders}. */
export function tx(s, vars = {}) {
  const out = (LANG === 'fr' && FR[s]) || s;
  return out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? vars[k] : m));
}

/** Translates the static texts and labels of the page (run once at startup). */
export function localizePage() {
  if (LANG === 'en') return;
  document.documentElement.lang = 'fr';
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const key = n.nodeValue.trim().replace(/\s+/g, ' ');
    if (key && FR[key]) n.nodeValue = n.nodeValue.replace(n.nodeValue.trim(), FR[key]);
  }
  for (const el of document.querySelectorAll('[aria-label]')) el.setAttribute('aria-label', tx(el.getAttribute('aria-label')));
  for (const el of document.querySelectorAll('[placeholder]')) el.setAttribute('placeholder', tx(el.getAttribute('placeholder')));
  for (const el of document.querySelectorAll('[download]')) el.setAttribute('download', tx(el.getAttribute('download')));
  const meta = document.querySelector('meta[name=description]');
  if (meta) meta.content = tx(meta.content);
}
