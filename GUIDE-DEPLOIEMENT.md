# Guide de déploiement HANOA
## Durée estimée : 45–60 minutes, tout via interfaces web

---

## ÉTAPE 1 — Créer le compte Supabase (base de données + fichiers)

1. Allez sur https://supabase.com et cliquez **Start your project**
2. Créez un compte (GitHub ou email)
3. Cliquez **New project**
   - Organization : votre nom
   - Project name : `hanoa`
   - Database Password : choisissez un mot de passe fort, **notez-le**
   - Region : **West EU (Ireland)** — le plus proche de la France
4. Attendez ~2 minutes que le projet se crée

---

## ÉTAPE 2 — Créer la base de données

1. Dans votre projet Supabase, cliquez **SQL Editor** (menu gauche)
2. Cliquez **New query**
3. Copiez-collez **tout le contenu** du fichier `supabase-schema.sql`
4. Cliquez **Run** (ou Ctrl+Entrée)
5. Vous devez voir : "Success. No rows returned"

---

## ÉTAPE 3 — Récupérer vos clés API Supabase

1. Dans Supabase, allez dans **Settings** → **API**
2. Notez ces deux valeurs :
   - **Project URL** → ressemble à `https://abcdefgh.supabase.co`
   - **anon public key** → longue chaîne commençant par `eyJ...`

---

## ÉTAPE 4 — Créer les comptes utilisateurs

1. Dans Supabase, allez dans **Authentication** → **Users**
2. Cliquez **Add user** → **Create new user** pour chaque personne :

   | Nom | Email | Mot de passe |
   |-----|-------|--------------|
   | Benjamin | benjamin@hanoa.fr | (choisir) |
   | Nathalie | nathalie@hanoa.fr | (choisir) |
   | Salarié 1 | ... | ... |
   | Salarié 2 | ... | ... |

3. Après création, allez dans **Table Editor** → **profiles**
   Mettez à jour chaque profil avec le vrai prénom, initiales, et couleur :
   - Benjamin : initials = `BV`, color = `#0f6e56`
   - Nathalie : initials = `NV`, color = `#ba7517`

---

## ÉTAPE 5 — Préparer le code sur GitHub

1. Créez un compte sur https://github.com (si pas déjà fait)
2. Cliquez **New repository**, nommez-le `hanoa-app`, choisissez **Private**
3. Sur votre ordinateur, décompressez le fichier `hanoa-app.zip`
4. Allez sur https://github.com/votre-compte/hanoa-app
5. Cliquez **uploading an existing file** et glissez-déposez **tous les fichiers** du dossier décompressé

   ⚠️ Incluez tous les fichiers et dossiers, **sauf** `node_modules` et `.next`

---

## ÉTAPE 6 — Déployer sur Vercel

1. Allez sur https://vercel.com et créez un compte (connectez avec GitHub)
2. Cliquez **Add New Project**
3. Sélectionnez votre repository `hanoa-app`
4. Dans **Environment Variables**, ajoutez :
   ```
   NEXT_PUBLIC_SUPABASE_URL = (votre Project URL de l'étape 3)
   NEXT_PUBLIC_SUPABASE_ANON_KEY = (votre anon key de l'étape 3)
   ```
5. Cliquez **Deploy**
6. Attendez ~2 minutes

Vercel vous donne une URL comme `https://hanoa-app.vercel.app` — **votre plateforme est en ligne !**

---

## ÉTAPE 7 — Domaine personnalisé (optionnel)

Si vous voulez une URL comme `app.hanoa.fr` :
1. Dans Vercel → votre projet → **Settings** → **Domains**
2. Ajoutez votre domaine
3. Suivez les instructions pour configurer le DNS chez votre registrar

---

## EN CAS DE PROBLÈME

- Page blanche : vérifiez les variables d'environnement dans Vercel
- Erreur de connexion : vérifiez que les users sont bien créés dans Supabase Auth
- Fichiers qui ne s'uploadent pas : vérifiez que le bucket `hanoa-files` existe (Storage dans Supabase)

Contact support : Supabase Discord, Vercel Discord, ou par e-mail
