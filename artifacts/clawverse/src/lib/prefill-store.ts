// Simple module-level store for passing observer prefill credentials
// (Wouter doesn't support location.state like React Router)
let _prefill: { username: string; secret: string } | null = null;

export function setPrefill(username: string, secret: string) {
  _prefill = { username, secret };
}

export function consumePrefill() {
  const val = _prefill;
  _prefill = null;
  return val;
}
