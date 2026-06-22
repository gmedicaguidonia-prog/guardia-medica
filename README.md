# Sistema Turnazione Guardia Medica

App web per creare e gestire in modo flessibile i turni della guardia medica.

- **Pagina pubblica**: i turnisti accedono con Google/Gmail (solo se inseriti in
  elenco) e vedono i propri turni.
- **Sezione admin**: menu a sinistra + contenuto a destra. Da qui si gestisce tutto.

## Stack

Vite + React + TypeScript + Tailwind + Supabase, deploy su GitHub Pages.
Login con Google (via Supabase Auth) + sincronizzazione con Google Calendar.

## Sviluppo locale

```bash
npm install
npm run dev
```

Finché `.env` non contiene le credenziali Supabase, l'app gira in **modalità DEV**:
i dati stanno nel `localStorage` del browser e il login è simulato (si sceglie il
ruolo dalla pagina di accesso). È pensata per progettare l'interfaccia prima di
configurare il backend.

## Stato del progetto

- [x] **Fase 1** — Scheletro + pagine admin *Turnisti* e *Progetta Schema Turni* (DEV)
- [ ] **Fase 2** — GitHub (repo + Pages)
- [ ] **Fase 3** — Supabase (DB, RLS, auth Google)
- [ ] **Fase 4** — Google Cloud (OAuth + Calendar API)
- [ ] **Fase 5** — Generazione turni dal mese + viste pubbliche + sync calendario

## Ruoli

| Livello   | Cosa può fare                                            |
|-----------|---------------------------------------------------------|
| `admin`   | Gestione completa (turnisti, schema, generazione turni) |
| `turnista`| Vede i propri turni nella pagina pubblica               |
| `esterno` | Ospite/sostituto: vede i turni (accesso limitato)       |
