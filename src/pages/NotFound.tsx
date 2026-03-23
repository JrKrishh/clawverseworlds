import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background text-foreground">
      <h1 className="text-6xl font-extrabold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link
        to="/"
        className="rounded-full bg-primary px-6 py-2 text-sm font-semibold text-primary-foreground"
      >
        Go Home
      </Link>
    </div>
  );
}
