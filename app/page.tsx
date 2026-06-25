export default function Home() {
  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center px-6">
      <section className="w-full max-w-3xl rounded-3xl border border-slate-800 bg-slate-900/80 p-10 shadow-2xl shadow-black/30">
        <p className="text-sm uppercase tracking-[0.25em] text-emerald-300">SSU Starter App</p>
        <h1 className="mt-4 text-4xl font-semibold">Professor Brockenbrough's Next Starter App</h1>
        <p className="mt-4 max-w-2xl text-slate-300">
          This starter includes login and register routes, Tailwind styling, and backend tests ready for students to clone and extend.
        </p>
        <div className="mt-8 flex flex-wrap gap-4 text-sm text-slate-200">
          <a href="/login" className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 hover:border-emerald-400 hover:text-emerald-200">Go to login</a>
          <a href="/register" className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 hover:border-emerald-400 hover:text-emerald-200">Go to register</a>
          <a href="/profile" className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2 hover:border-emerald-400 hover:text-emerald-200">Go to profile</a>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2">Tailwind CSS</span>
          <span className="rounded-full border border-slate-700 bg-slate-800 px-4 py-2">Supabase auth routes</span>
        </div>
      </section>
    </main>
  );
}
