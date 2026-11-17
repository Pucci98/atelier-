# Atelier

Créer des pièces, des maisons, des scènes et des vêtements en 3D, **au doigt, aux mains (caméra) ou à la voix**, depuis n'importe quel écran qui a un navigateur.

## Ce que fait la V1

- **Espaces** : pièces paramétrables, murs, sols, baies vitrées, portes, escaliers, colonnes, arches, estrades, cimaises.
- **Mobilier** : canapé, fauteuil, tables, chaises, lit, étagère, îlot, tapis, luminaires, plantes…
- **Personnages** : silhouettes articulées (debout, marche, assis, pensif, présente, groupe), taille et carrure réglables.
- **Mode** : buste de couture, portant, robe, jupe, haut, manteau, pantalon, ajustés sur le personnage sélectionné.
- **Matières** : 33 matières générées sur l'appareil (bois, marbres, béton, travertin, terrazzo, zellige, lin, velours, cuir, métaux, verres…) avec aperçu de la texture, plus des peintures.
- **Styles** : 6 palettes complètes (Japandi, Loft, Riviera, Galerie, Club privé, Médina) et 4 modèles prêts (salon, chambre, showroom mode, galerie).
- **Lumière** : 5 ambiances (jour, heure dorée, soir, studio, galerie), spots, néons, lampes.
- **Mains** : suivi des mains par la caméra (MediaPipe, calcul local). Pincer pour attraper, deux mains pour agrandir et pivoter, pincer un bouton pour cliquer.
- **Voix** : « crée une pièce de 6 sur 4 », « ajoute un canapé en velours vert », « le sol en marbre noir », « ambiance soir », « visite »…
- **Visite** à hauteur d'yeux, avec joystick.
- **Export** : USDZ (réalité augmentée iPhone), GLB (Blender et logiciels 3D), projet `.atelier`, photo.
- **Écran lié** : l'iPhone crée, un ordinateur ou une TV affiche en direct (ouvrir l'adresse suivie de `#ecran`).

## Lancer en local

```
python3 -m http.server 8000
```
puis ouvrir http://localhost:8000. La caméra demande une connexion sécurisée (https ou localhost).

## Technique

Site statique, sans serveur : three.js, MediaPipe Tasks Vision, PeerJS, fournis dans `lib/`.

© 2026 Annoh Aboidje Chris Fabius. Tous droits réservés. Les bibliothèques tierces restent sous leurs licences respectives (MIT, Apache 2.0, SIL OFL).
