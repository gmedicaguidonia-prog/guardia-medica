/**
 * gmailCheck — «Check invio»: verifica che si possano inviare email COME il
 * mittente indicato, chiedendo a Google l'autorizzazione reale (OAuth, scope
 * gmail.send) sull'account Gmail scelto e controllando che coincida col mittente.
 *
 * Tutto client-side (Google Identity Services): nessun segreto nel codice.
 * Richiede il Client ID web in VITE_GOOGLE_OAUTH_CLIENT_ID (secret di build):
 * finché manca, il check fallisce con le istruzioni per configurarlo.
 */

export const GMAIL_SCOPE = 'https://www.googleapis.com/auth/gmail.send'

export type EsitoCheck =
  | { ok: true; email: string }
  | { ok: false; codice: string; messaggio: string; consigli: string[] }

const errore = (codice: string, messaggio: string, consigli: string[]): EsitoCheck => ({ ok: false, codice, messaggio, consigli })

// ── Google Identity Services: caricamento on-demand ──
let gisPromise: Promise<void> | null = null
function caricaGis(): Promise<void> {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    const w = window as unknown as { google?: { accounts?: { oauth2?: unknown } } }
    if (w.google?.accounts?.oauth2) { resolve(); return }
    const s = document.createElement('script')
    s.src = 'https://accounts.google.com/gsi/client'
    s.async = true
    s.onload = () => resolve()
    s.onerror = () => { gisPromise = null; reject(new Error('script GIS non caricato')) }
    document.head.appendChild(s)
  })
  return gisPromise
}

interface TokenResponse { access_token?: string; scope?: string; error?: string; error_description?: string }
interface TokenClient { requestAccessToken: (cfg?: { prompt?: string }) => void }
interface Oauth2Ns {
  initTokenClient: (cfg: {
    client_id: string; scope: string; hint?: string;
    callback: (r: TokenResponse) => void;
    error_callback?: (e: { type?: string; message?: string }) => void;
  }) => TokenClient
}

/** Esegue il check completo: autorizzazione Google + verifica che l'account
 *  autorizzato sia proprio `mittente`. */
export async function checkInvioGmail(mittente: string): Promise<EsitoCheck> {
  const email = mittente.trim().toLowerCase()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return errore('mittente_non_valido', 'L’indirizzo mittente non sembra un indirizzo email valido.',
      ['Controlla che sia scritto per intero, es. nomereparto@gmail.com.'])
  }

  const clientId = (import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID as string | undefined) ?? ''
  if (!clientId) {
    return errore('configurazione_mancante', 'La configurazione Google di questa app non è ancora stata completata (manca il Client ID OAuth).',
      [
        'Su Google Cloud Console crea un progetto con la Gmail API abilitata.',
        'Configura la schermata di consenso OAuth e crea un «ID client OAuth per applicazione web» aggiungendo l’origine di questo sito.',
        'Aggiungi l’ID come secret VITE_GOOGLE_OAUTH_CLIENT_ID su GitHub e ripubblica l’app.',
        'Nel frattempo puoi usare «Apri bozza email» per inviare dal tuo programma di posta.',
      ])
  }

  try { await caricaGis() } catch {
    return errore('rete', 'Impossibile caricare il servizio di accesso Google.',
      ['Controlla la connessione a internet e riprova.', 'Se usi estensioni che bloccano gli script (adblock), consenti accounts.google.com.'])
  }

  // Richiesta token (apre la finestra Google sull'account suggerito)
  const oauth2 = (window as unknown as { google: { accounts: { oauth2: Oauth2Ns } } }).google.accounts.oauth2
  const risposta = await new Promise<TokenResponse | { gisError: string }>((resolve) => {
    let chiuso = false
    const fine = (v: TokenResponse | { gisError: string }) => { if (!chiuso) { chiuso = true; resolve(v) } }
    try {
      const tc = oauth2.initTokenClient({
        client_id: clientId,
        scope: GMAIL_SCOPE,
        hint: email,
        callback: r => fine(r),
        error_callback: e => fine({ gisError: e?.type ?? e?.message ?? 'sconosciuto' }),
      })
      tc.requestAccessToken()
      setTimeout(() => fine({ gisError: 'timeout' }), 120_000)
    } catch (e) { fine({ gisError: (e as Error).message }) }
  })

  if ('gisError' in risposta) {
    const t = risposta.gisError
    if (t.includes('popup_closed')) return errore('popup_chiuso', 'La finestra di Google è stata chiusa prima di completare l’autorizzazione.',
      ['Riprova e completa l’accesso scegliendo l’account del mittente.'])
    if (t.includes('popup')) return errore('popup_bloccato', 'Il browser ha bloccato la finestra di Google.',
      ['Consenti i popup per questo sito (icona nella barra dell’indirizzo) e riprova.'])
    if (t === 'timeout') return errore('timeout', 'Nessuna risposta da Google entro 2 minuti.',
      ['Riprova: se la finestra non si apre, controlla il blocco popup.'])
    return errore('gis', `Errore del servizio Google: ${t}.`, ['Riprova tra qualche istante.'])
  }
  if (risposta.error) {
    if (risposta.error === 'access_denied') return errore('accesso_negato', 'Hai negato l’autorizzazione a inviare email.',
      ['Riprova e concedi il permesso «Inviare email per tuo conto»: serve solo per spedire il calendario.',
       'Se compare «app non verificata»: clicca Avanzate → Procedi (finché l’app Google è in modalità test, l’account va aggiunto tra i tester).'])
    return errore('oauth', `Google ha risposto con un errore: ${risposta.error_description ?? risposta.error}.`, ['Riprova tra qualche istante.'])
  }
  const token = risposta.access_token
  if (!token) return errore('token_mancante', 'Google non ha rilasciato l’autorizzazione.', ['Riprova.'])
  if (risposta.scope && !risposta.scope.includes(GMAIL_SCOPE)) {
    return errore('permesso_mancante', 'L’autorizzazione è stata data senza il permesso di invio email.',
      ['Riprova e lascia spuntata la casella «Inviare email per tuo conto» nella schermata Google.'])
  }

  // Con il token: chi è DAVVERO l'account autorizzato?
  let autorizzato = ''
  try {
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', { headers: { Authorization: `Bearer ${token}` } })
    if (!res.ok) {
      if (res.status === 403) return errore('gmail_api', 'L’account è autorizzato ma la Gmail API risponde «accesso negato».',
        ['Verifica su Google Cloud Console che la Gmail API sia ABILITATA per il progetto.',
         'Se l’account è Google Workspace, l’amministratore potrebbe aver limitato le app di terze parti.'])
      return errore('gmail_api', `La Gmail API ha risposto HTTP ${res.status}.`, ['Riprova tra qualche istante.'])
    }
    const dati = await res.json() as { emailAddress?: string }
    autorizzato = (dati.emailAddress ?? '').toLowerCase()
  } catch {
    return errore('rete', 'Autorizzazione ottenuta ma verifica dell’account non riuscita (rete).', ['Controlla la connessione e riprova il check.'])
  }

  if (autorizzato !== email) {
    return errore('account_diverso', `Hai autorizzato «${autorizzato}», ma il mittente indicato è «${email}».`,
      ['Rifai il check e nella finestra Google scegli proprio l’account del mittente.',
       'Oppure correggi il campo mittente con l’indirizzo che hai autorizzato.'])
  }
  return { ok: true, email: autorizzato }
}
