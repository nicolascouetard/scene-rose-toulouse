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

## Déploiement gratuit (Cloudflare Pages ou Vercel)

1. Pousser le dossier sur un dépôt GitHub.
2. Importer le dépôt sur **Cloudflare Pages** (`npm run build`, dossier `dist`, avec `public/_headers` et `public/_redirects` prêts) ou **Vercel** (`vercel.json` déjà configuré).
3. Dans les réglages GitHub du dépôt (*Settings → Actions → General → Workflow permissions*), activer **Read and write permissions** : 4 fois par jour, GitHub Actions rafraîchit `public/data/concerts.json` et le site se redéploie automatiquement sans aucune coupure.
