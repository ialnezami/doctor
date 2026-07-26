# Conformité RGPD — MediConnect

> Document interne de référence. Dernière mise à jour : 2026-06-28.

---

## 1. Responsable du traitement

| Champ | Valeur |
|---|---|
| Nom de l'application | MediConnect |
| Rôle | Responsable du traitement |
| Contact DPO | ibrahim.alnezami@gmail.com |
| Pays d'établissement | À préciser selon déploiement |

---

## 2. Données personnelles collectées

### 2.1 Données de compte (tous les utilisateurs)

| Donnée | Finalité | Base légale |
|---|---|---|
| Nom complet | Identification, affichage | Exécution du contrat (Art. 6.1.b) |
| Adresse e-mail | Authentification, notifications | Exécution du contrat (Art. 6.1.b) |
| Mot de passe (haché bcrypt, 12 rounds) | Authentification | Exécution du contrat (Art. 6.1.b) |
| Rôle (doctor / patient / laboratory) | Contrôle d'accès | Exécution du contrat (Art. 6.1.b) |
| Token FCM | Notifications push | Consentement (Art. 6.1.a) |
| Préférences de notification | Personnalisation | Exécution du contrat (Art. 6.1.b) |

### 2.2 Données de santé — **catégorie particulière (Art. 9 RGPD)**

| Donnée | Collectée par | Base légale |
|---|---|---|
| Groupe sanguin, allergies, antécédents médicaux | Patient (profil) | Consentement explicite (Art. 9.2.a) |
| Date de naissance | Patient (profil) | Consentement explicite (Art. 9.2.a) |
| Notes de consultation | Médecin | Soins de santé (Art. 9.2.h) |
| Ordonnances et médicaments | Médecin | Soins de santé (Art. 9.2.h) |
| Résultats d'analyses | Laboratoire / Médecin | Soins de santé (Art. 9.2.h) |
| Description de symptômes (pré-consultation) | Patient | Consentement explicite (Art. 9.2.a) |
| Analyse de triage IA (urgence + catégorie) | Système (Claude Haiku) | Soins de santé (Art. 9.2.h) |

### 2.3 Données de relation médicale

| Donnée | Base légale |
|---|---|
| Rendez-vous (date, créneau, statut, type de visite) | Exécution du contrat (Art. 6.1.b) |
| Messages de chat liés au rendez-vous | Exécution du contrat (Art. 6.1.b) |
| Avis et notes de patients sur les médecins | Intérêt légitime (Art. 6.1.f) |
| Lien de partage de dossier tokenisé | Consentement (Art. 6.1.a) |

### 2.4 Données techniques

| Donnée | Durée de conservation | Base légale |
|---|---|---|
| Journaux de connexion (logs serveur) | 30 jours | Obligation légale (Art. 6.1.c) |
| Notifications en base | 30 jours (TTL automatique MongoDB) | Intérêt légitime (Art. 6.1.f) |
| Sessions JWT | Durée du token (7 jours par défaut) | Exécution du contrat (Art. 6.1.b) |

---

## 3. Sous-traitants (Art. 28 RGPD)

| Sous-traitant | Service | Pays | Données transmises | Accord signé |
|---|---|---|---|---|
| **MongoDB Atlas** (si hébergé) | Base de données | Variable | Toutes les données | À établir |
| **Firebase (Google)** | Notifications push FCM | USA | Token FCM, payload notif | DPA Google disponible |
| **Resend** | E-mails transactionnels | USA | Nom, e-mail, contenu notif | DPA Resend disponible |
| **Anthropic** | Analyse IA des symptômes | USA | Texte symptômes (anonymisé) | DPA Anthropic disponible |
| **Daily.co** | Visioconférence | USA | Métadonnées de session | DPA Daily.co disponible |
| **Cloudinary** | Stockage de fichiers | USA | Fichiers uploadés (PDF, images) | DPA Cloudinary disponible |

> **Action requise :** Signer un DPA (Data Processing Agreement) avec chaque sous-traitant avant mise en production.

> **Transferts hors UE :** Les sous-traitants américains doivent être couverts par les clauses contractuelles types (CCT) de la Commission européenne ou une décision d'adéquation (DPF UE-USA).

---

## 4. Droits des personnes concernées

| Droit | Article RGPD | État d'implémentation | Action requise |
|---|---|---|---|
| Accès | Art. 15 | ✅ `GET /api/patients/me`, `GET /api/appointments` | — |
| Rectification | Art. 16 | ✅ `PATCH /api/users/me` (partiel) | Compléter pour profil médecin |
| Effacement ("droit à l'oubli") | Art. 17 | ❌ Non implémenté | **Créer endpoint `DELETE /api/users/me`** |
| Portabilité | Art. 20 | ❌ Non implémenté | **Créer export JSON/CSV des données** |
| Opposition | Art. 21 | Partiel (préférences notif) | Étendre aux traitements IA |
| Limitation du traitement | Art. 18 | ❌ Non implémenté | À planifier |
| Retrait du consentement | Art. 7.3 | Partiel | Mécanisme explicite à ajouter |

---

## 5. Durées de conservation

| Catégorie de données | Durée | Mécanisme |
|---|---|---|
| Données de compte actif | Durée de la relation | Suppression manuelle (à automatiser) |
| Données médicales (dossier patient) | 10 ans (obligation légale santé) | Archivage à implémenter |
| Notes de consultation | 10 ans | Idem |
| Rendez-vous et prescriptions | 10 ans | Idem |
| Notifications | 30 jours | TTL index MongoDB (`expireAt`) ✅ |
| Logs serveur | 30 jours | Rotation à configurer |
| Tokens de partage révoqués | Suppression immédiate à révocation | ✅ |
| Données IA (symptômes analysés) | Durée du dossier patient | Lié à l'Appointment |

---

## 6. Sécurité des données (Art. 32 RGPD)

| Mesure | État |
|---|---|
| Mots de passe hachés (bcrypt, 12 rounds) | ✅ |
| Authentification par JWT (expiration 7j) | ✅ |
| HTTPS obligatoire en production | À configurer (certificat TLS) |
| Contrôle d'accès basé sur les rôles (RBAC) | ✅ |
| Vérification de propriété côté serveur | ✅ (patientId, appointmentId) |
| `ANTHROPIC_API_KEY` côté serveur uniquement | ✅ |
| Clés API jamais exposées au client | ✅ |
| Chiffrement des champs sensibles au repos | ❌ À implémenter (Phase 5.2) |
| Protection XSS (échappement HTML e-mails) | ✅ (`esc()` dans emailTemplates.js) |
| Limitation de débit (rate limiting) | ❌ À implémenter (Phase 5.3) |
| Journalisation des accès aux données | ❌ À implémenter (Phase 5.2) |

---

## 7. Analyse d'impact (AIPD / DPIA) — Art. 35 RGPD

Une AIPD est **obligatoire** car MediConnect traite :
- Des données de santé à grande échelle (catégorie particulière, Art. 9)
- Des décisions automatisées assistées par IA (triage des symptômes)

**Actions requises avant mise en production à grande échelle :**
1. Réaliser une AIPD documentée
2. Consulter l'autorité de contrôle compétente si le risque résiduel est élevé
3. Documenter les mesures de mitigation

---

## 8. Violations de données (Art. 33-34 RGPD)

**Procédure en cas de violation :**
1. Détecter et contenir la violation (équipe technique)
2. Notifier l'autorité de contrôle (CNIL ou équivalent) **dans les 72 heures**
3. Si risque élevé pour les personnes : notifier les personnes concernées sans délai
4. Documenter la violation dans le registre des violations

**Contact d'urgence :** ibrahim.alnezami@gmail.com

---

## 9. Registre des activités de traitement (Art. 30 RGPD)

| N° | Activité | Finalité | Données | Base légale | Sous-traitants |
|---|---|---|---|---|---|
| 1 | Gestion des comptes utilisateurs | Authentification et accès | Nom, e-mail, mot de passe, rôle | Contrat | MongoDB |
| 2 | Prise de rendez-vous médicaux | Coordination des soins | Profil, disponibilités, statuts | Contrat | MongoDB |
| 3 | Dossier médical patient | Suivi de santé | Antécédents, allergies, résultats | Consentement / Soins | MongoDB, Cloudinary |
| 4 | Consultation médicale (notes, ordonnances) | Soins de santé | Notes, médicaments, diagnostic | Soins (Art. 9.2.h) | MongoDB |
| 5 | Analyse IA des symptômes | Aide au triage pré-consultation | Texte symptômes, urgence, catégorie | Consentement / Soins | Anthropic, MongoDB |
| 6 | Notifications (push + e-mail) | Communication médicale | Nom, e-mail, token FCM | Contrat + Consentement | Firebase, Resend |
| 7 | Visioconférence médicale | Téléconsultation | Métadonnées session | Contrat | Daily.co |
| 8 | Avis sur les médecins | Qualité des soins | Note, commentaire, identité | Intérêt légitime | MongoDB |

---

## 10. Actions prioritaires avant mise en production

| Priorité | Action | Responsable |
|---|---|---|
| 🔴 Critique | Implémenter `DELETE /api/users/me` (droit à l'effacement) | Équipe dev |
| 🔴 Critique | Signer les DPA avec Firebase, Resend, Anthropic, Daily.co, Cloudinary | Direction |
| 🔴 Critique | Configurer HTTPS / TLS en production | Ops |
| 🔴 Critique | Réaliser l'AIPD (données de santé + IA) | DPO + Juridique |
| 🟠 Important | Implémenter l'export des données (portabilité Art. 20) | Équipe dev |
| 🟠 Important | Chiffrement des champs sensibles au repos | Équipe dev |
| 🟠 Important | Rate limiting sur toutes les routes publiques | Équipe dev |
| 🟠 Important | Journalisation des accès aux dossiers médicaux | Équipe dev |
| 🟡 Moyen | Mécanisme de retrait du consentement explicite | Équipe dev |
| 🟡 Moyen | Politique de rétention automatisée (10 ans → archivage) | Équipe dev |
| 🟡 Moyen | Page de politique de confidentialité dans l'app | Équipe dev |
