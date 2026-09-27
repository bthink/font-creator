'use client';

import { useState } from 'react';

type Build = { id: number; createdAt: string; otfPath: string | null; ttfPath: string | null };

export function FontBuildPanel({
  projectId,
  initialBuilds,
}: {
  projectId: number;
  initialBuilds: Build[];
}): React.JSX.Element {
  const [builds, setBuilds] = useState(initialBuilds);
  const [error, setError] = useState<string | null>(null);

  async function handleBuild(): Promise<void> {
    setError(null);
    const response = await fetch(`/api/projects/${projectId}/builds`, { method: 'POST' });
    if (!response.ok) {
      const body = (await response.json()) as { error: string };
      setError(body.error);
      return;
    }
    const build = (await response.json()) as Build;
    setBuilds([build, ...builds]);
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Build font</h2>
      <button
        type="button"
        onClick={handleBuild}
        className="rounded bg-purple-600 px-4 py-2 text-white"
      >
        Build font from approved glyphs
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      <ul className="mt-4 space-y-1">
        {builds.map((build) => (
          <li key={build.id}>
            {build.createdAt} —{' '}
            <a href={`/api/builds/${build.id}/download?format=otf`} className="text-blue-600 underline">
              Download .otf
            </a>{' '}
            <a href={`/api/builds/${build.id}/download?format=ttf`} className="text-blue-600 underline">
              Download .ttf
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
