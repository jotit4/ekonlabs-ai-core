export default function DashboardLoading() {
  return (
    <main
      id="main-content"
      className="flex items-center justify-center h-full"
      role="status"
      aria-label="Cargando..."
    >
      <div className="w-8 h-8 rounded-full border-[3px] border-[var(--color-surface)] border-t-[var(--color-interactive)] animate-spin" />
    </main>
  )
}
