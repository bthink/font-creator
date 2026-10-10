export async function requestJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error(
      'Brak połączenia z aplikacją. Sprawdź, czy serwer działa, i spróbuj ponownie.',
    );
  }
  const body = await response.json().catch(() => null);
  if (!response.ok)
    throw new Error(
      body?.error ?? 'Nie udało się wykonać operacji. Spróbuj ponownie.',
    );
  return body as T;
}
export function errorMessage(error: unknown): string {
  return error instanceof Error
    ? error.message
    : 'Coś poszło nie tak. Spróbuj ponownie.';
}
export function formatDate(value: string): string {
  return new Intl.DateTimeFormat('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Warsaw',
  }).format(
    new Date(value.includes('T') ? value : value.replace(' ', 'T') + 'Z'),
  );
}
