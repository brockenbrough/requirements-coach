// A plain string here would normally pick up the root layout's '%s – Requirements Coach'
// template, but that template stops propagating past the intermediate app/instructor/layout.tsx
// (which sets its own plain-string title with no template of its own) — verified by curling this
// route and getting a bare "Question Bank" with no suffix. Writing the full composed title
// directly sidesteps that instead of re-declaring a template object that would only apply to
// (nonexistent) routes nested under this one.
export const metadata = {
  title: 'Question Bank – Requirements Coach',
};

export default function InstructorQuestionsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
