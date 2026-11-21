# Murājaʿa — révision Al-Ibaanah

Application de révision hors ligne : cartes (répétition espacée façon Anki), examen à trous, chrono-rush, associations, boss de leçon, mots ennemis et duel.

## Lancer sur le PC
Double-cliquer sur `index.html` fonctionne. Pour la version installable (hors ligne), lancer un petit serveur dans ce dossier :

```
python -m http.server 5178
```
puis ouvrir http://localhost:5178

## Partager avec ton binôme / l'avoir sur téléphone
Mettre le dossier en ligne (gratuit) sur GitHub Pages ou Netlify Drop (glisser-déposer le dossier sur https://app.netlify.com/drop).
Ouvrir le lien sur le téléphone → menu du navigateur → « Ajouter à l'écran d'accueil ». Ensuite ça marche sans internet.
Chacun garde sa propre progression sur son appareil.

## Ajouter un niveau
Les mots sont dans `data/*.js` (un fichier par niveau), déclarés dans `index.html`.
Après une mise à jour en ligne, augmenter `VERSION` dans `sw.js`.

## Duel
Onglet Jeux → Duel → Créer. Envoie le code (ou le lien) à ton binôme : mêmes questions pour vous deux.
À la fin, échangez vos « codes résultat » pour voir qui gagne.
