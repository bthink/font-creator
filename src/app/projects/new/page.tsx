'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewProjectPage(): React.JSX.Element {
  const router = useRouter();
  const [name, setName] = useState('');

  async function handleSubmit(event: React.FormEvent): Promise<void> {
    event.preventDefault();
    const response = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const project = (await response.json()) as { id: number };
    router.push(`/projects/${project.id}`);
  }

  return (
    <main className="mx-auto max-w-md p-8">
      <h1 className="text-2xl font-bold">New project</h1>
      <form onSubmit={handleSubmit} className="mt-4 space-y-4">
        <label htmlFor="project-name" className="block text-sm font-medium">
          Project name
        </label>
        <input
          id="project-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          className="w-full rounded border px-3 py-2"
          required
        />
        <button type="submit" className="rounded bg-blue-600 px-4 py-2 text-white">
          Create
        </button>
      </form>
    </main>
  );
}
