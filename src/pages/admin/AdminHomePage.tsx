/**
 * Home della sezione admin: si apre cliccando "Admin" o aggiornando su /admin.
 * Per ora mostra solo il logo dell'app come filigrana al centro, in trasparenza
 * (fuso con lo sfondo). Qui in futuro andranno riepiloghi / scorciatoie.
 */
export function AdminHomePage() {
  return (
    <div className="h-full w-full flex items-center justify-center p-6 select-none">
      <img
        src={`${import.meta.env.BASE_URL}icon-512.png`}
        alt=""
        draggable={false}
        style={{ width: 'min(55%, 360px)', opacity: 0.12, pointerEvents: 'none' }}
      />
    </div>
  )
}
