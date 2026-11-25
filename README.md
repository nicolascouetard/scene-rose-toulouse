# Scène Rose — Tous les concerts à Toulouse (PWA mobile)

Application web (PWA installable, mobile & desktop) agrégeant les concerts de **17 salles de Toulouse et sa métropole** (*Le Bikini, Zénith, Le Metronum, Interference, Le Rex, La Cabane, Halle aux Grains / ONCT, Opéra National du Capitole, Auditorium Saint-Pierre-des-Cuisines, Péniche Le Cri de la Mouette, Le Taquin, Le Bijou, Salle Nougaro, Odyssud, Casino Barrière, Le Labo des Arts, L'Arena*) ainsi que les **grands festivals d'Occitanie**, avec synchronisation automatique 4×/jour.

## Démarrage local

```bash
npm install
npm run dev
```

## Synchronisation automatique (4× / jour)

- **Exécution immédiate** : `npm run sync` (met à jour `public/data/concerts.json` : découverte de nouvelles dates, statuts *Complet / Dernières places / Annulé*, suppression des dates passées).
- **Démon serveur (06h · 11h30 · 17h30 · 21h Europe/Paris)** : `npm run sync:daemon`.
- **GitHub Actions** : le workflow `.github/workflows/daily-sync.yml` tourne automatiquement **4 fois par jour** (`06h00`, `11h30`, `17h30`, `21h00`) et pousse les mises à jour dans le dépôt.

## Affiches (rapatriement & compression)

Les scrapeurs récupèrent parfois l'URL distante d'origine (lemetronum.fr, openagenda…), dont les images pèsent ~785 Ko en moyenne (jusqu'à 3,6 Mo). Le pipeline les rapatrie, les redimensionne (max 800 px) et les convertit en **WebP q78** (~50 Ko), puis réécrit `poster` vers le fichier local (`sourcePosterUrl` reste en filet de sécurité côté client).

```bash
npm run posters              # rapatrie + compresse + supprime les orphelines
npm run posters -- --limit 20 # test sur un échantillon
npm run posters -- --force    # re-télécharge même les affiches déjà locales
```

- La localisation est **idempotente** : les affiches déjà locales ne sont jamais re-téléchargées.
- Le sync (`npm run sync`) localise automatiquement les affiches des nouvelles dates, puis traite jusqu'à 80 affiches encore distantes par passage.
- Les affiches orphelines (concert annulé ou passé) sont supprimées automatiquement.

**Gain mesuré** : 254,7 Mo d'images distantes → **16,4 Mo** de WebP locaux (×22 plus léger), 475 affiches disponibles hors-ligne.

## Salles protégées par un mur anti-robot

Deux salles vendent via **Shotgun**, dont les pages sont protégées par un « Vercel Security Checkpoint » : elles répondent **HTTP 429 même à un vrai navigateur** (« Failed to verify your browser »). Aucun scraping classique n'y fonctionne, et aucune API publique n'est ouverte.

Trois niveaux de parade sont en place :

1. **Source de secours** (`FALLBACK_SOURCES` dans `scripts/sync-concerts.mjs`)
   Pour le Cri de la Mouette, les dates à venir sont lues sur JamBase, qui publie ses événements en **JSON-LD schema.org**. Comme JamBase refuse le client `fetch` de Node (empreinte TLS) tout en acceptant `curl`, la requête passe par `curl` avec repli automatique sur `fetch`.
   *Limite assumée* : cette source donne la **date et l'artiste**, jamais le statut billetterie. Les concerts ainsi ajoutés portent `statusSource: 'fallback'` et affichent un **« ? »** dans l'interface, pour ne pas laisser croire que le statut est connu.

2. **Affiche de repli générée**
   Une date sans affiche reçoit un visuel sobre généré en SVG→WebP (titre, salle, mention « Affiche non communiquée », couleur d'accent selon le genre). Plus aucune carte ne reste vide, et le contrôle qualité ne bloque plus.

3. **Alerte d'échecs consécutifs**
   `syncMeta.failureStreaks` compte les cycles manqués par salle. Au 3ᵉ échec consécutif, la salle apparaît dans `syncMeta.venuesNeedingAttention` et le sync affiche un avertissement explicite.

### Accès opportuniste à Shotgun (L'Arena, Le Cri de la Mouette)

Le défi anti-robot n'est **pas permanent** : selon l'heure et la charge, une requête HTTP normale passe (c'est ainsi que deux dates de L'Arena ont pu être enregistrées le 23/11/2026).

Le sync **tente donc sa chance à chaque cycle** (`fetchShotgunAgenda`), sans jamais en dépendre :

| Cas | Comportement |
|---|---|
| Le défi laisse passer | Les dates sont lues avec **titre, date, heure, prix, genres et affiche**, puis rapatriées en WebP local |
| Le défi bloque | Rien n'est modifié, le catalogue est conservé et le rapport l'indique : *« Shotgun indisponible (Défi anti-robot actif) »* |

**Règles de prudence intégrées :**

- **Attribution stricte de la salle** — sur une page « ville », Shotgun mélange toutes les salles et affiche parfois seulement « Toulouse » : une date n'est retenue que si la salle est nommée ou si son nom figure dans le titre. Mieux vaut manquer une date que l'attribuer à tort.
- **Retrait après 3 passages concordants** — une soirée absente de l'agenda n'est supprimée qu'après trois cycles (~18 h), pour ne pas effacer une date sur une page tronquée.
- **Aucun contournement** — pas de faux cookies, pas de proxy, pas de résolution de challenge. On retente simplement une requête normale, comme un visiteur.
- **Aucune dépendance** — si Shotgun bloque définitivement, le site continue de fonctionner avec les dates déjà connues.

**Mode test** (rejouer une page enregistrée, sans dépendre du direct) :

```bash
SHOTGUN_LOCAL_HTML=/chemin/vers/page.html npm run sync
```

### Quand Shotgun bloque

L'Arena n'est référencée sur aucune autre source accessible. Quand le mur anti-robot
est actif, ses dates restent celles déjà connues : rien n'est effacé, rien n'est inventé.
Le lecteur retente à chaque synchronisation, sans jamais essayer de contourner le défi.

## Surveillance automatique : comment le site prévient qu'il est cassé

Le vrai danger n'est pas la panne, c'est **le silence** : une salle qui change la
structure de son site renvoie « page lue, 0 date » et le rapport affiche fièrement
« agenda complet » pendant que les concerts se figent. Trois garde-fous transforment
ce cas en alerte visible.

### 1. Détection de chute anormale

À chaque synchronisation, le script compare pour chaque salle :

- **le nombre de dates réellement lues à la source** (`venueReadCounts`) ;
- **le nombre de dates au catalogue** (`venueConcertCounts`).

Si une salle qui rendait au moins 5 dates n'en rend plus qu'un tiers ou moins,
elle est marquée « à réparer ». Le compte effondré n'est **pas** mémorisé : sinon la
comparaison suivante se ferait contre une valeur déjà faussée et l'alerte
disparaîtrait d'elle-même.

**Une baisse revue deux fois de suite, avec au moins une date quand même lue,
est considérée comme réelle** (la salle a réduit son programme) et validée
définitivement : elle figure dans `confirmedDrops` et n'alerte plus.
En revanche, **zéro date lue deux fois de suite ne se valide jamais** : c'est un
lecteur cassé, on continue d'alerter. Ce cas est celui qui compte.

### 2. Échec explicite du job

Le script réunit les problèmes bloquants (`blockingProblems`) et sort en **erreur
(exit 1)** si la liste n'est pas vide :

- au moins une chute anormale,
- 3 salles à surveiller ou plus,
- moins de la moitié des salles joignables.

Les données sont écrites **avant** la sortie : un échec de job ne laisse jamais le
site sans mise à jour. GitHub Actions envoie alors automatiquement un e-mail au
propriétaire du dépôt. Aucun service payant, aucune configuration supplémentaire.

### 3. Tableau de bord `ETAT-DU-SITE.md`

Régénéré à chaque synchronisation : nombre de concerts, salles joignables, affiches
hébergées, état salle par salle, échecs consécutifs, et la marche à suivre en cas
d'alerte. C'est le premier fichier à ouvrir quand quelque chose semble anormal.

### 4. Bandeau « agenda non actualisé » sur le site

Si `syncMeta.lastSyncedAt` date de 3 jours ou plus, le site affiche lui-même un
bandeau : *« Agenda non actualisé depuis X jours »*. L'utilisateur sait ainsi que ce
qu'il voit vient de la dernière synchronisation réussie, au lieu de croire à une
panne de sa part.

### 5. Catalogue de secours auto-généré

`src/data/concertsFallback.ts` est réécrit à chaque synchronisation (200 prochaines
dates avec affiche). Si `concerts.json` devient inaccessible, le site affiche encore
un agenda au lieu d'une page vide. **Ce fichier est généré : ne pas l'éditer à la
main**, il serait écrasé.

## Contrôle qualité des données

```bash
npm run check:data
```

Vérifie l'intégrité de `public/data/concerts.json` : identifiants uniques, dates ISO, salles connues, genre appartenant aux **12 catégories** et **présence effective du fichier d'affiche** sur le disque. Code de sortie 1 en cas d'erreur bloquante — utilisé comme garde-fou dans le workflow GitHub Actions.

## Performances & accessibilité

- **Code-splitting** : la carte (Leaflet, 162 Ko) et les feuilles (Calendrier, Festival) sont chargées à la demande via `React.lazy` + `Suspense`, avec prefetch au survol et à l'inactivité.
- **Bundle initial** : 184 Ko → **119 Ko gzip**.
- **CLS ≈ 0** : dimensions intrinsèques sur toutes les images (`PosterImage`) et squelette de chargement de l'agenda pendant l'hydratation du JSON.
- **Polices auto-hébergées** (`public/fonts/`) : plus aucun appel à Google Fonts — vitesse et conformité RGPD.
- **Accessibilité** : `role="dialog"` + `aria-modal` + piège de focus clavier (`useDialogA11y`), lien d'évitement, `aria-label` sur les liens d'écoute, toasts annoncés en `aria-live`, `prefers-reduced-motion` respecté.
- **Affiches** : `PosterImage` gère la bascule `poster` → `sourcePosterUrl` → placeholder, avec `decoding="async"` et `referrerPolicy="no-referrer"`.

## SEO

- **JSON-LD schema.org** généré au build (`scripts/vite-plugin-jsonld.ts`) : `WebSite` + `SearchAction` + `ItemList` de 40 `MusicEvent` à venir (lieu, dates, prix, affiche, statut Complet/dispo).
- Fuseau réel `Europe/Paris` calculé par date (été `+02:00` / hiver `+01:00`).
- `sitemap.xml`, `robots.txt`, Open Graph et Twitter Cards.

## Déploiement gratuit (Cloudflare Pages ou Vercel)

1. Pousser le dossier sur un dépôt GitHub.
2. Importer le dépôt sur **Cloudflare Pages** (`npm run build`, dossier `dist`, avec `public/_headers` et `public/_redirects` prêts) ou **Vercel** (`vercel.json` déjà configuré).
3. Dans les réglages GitHub du dépôt (*Settings → Actions → General → Workflow permissions*), activer **Read and write permissions** : 4 fois par jour, GitHub Actions rafraîchit `public/data/concerts.json` et le site se redéploie automatiquement sans aucune coupure.
