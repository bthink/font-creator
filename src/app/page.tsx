import Link from 'next/link';
import { listProjects } from '@/lib/db/projects';

export default function HomePage(): React.JSX.Element {
  const projects = listProjects();
  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="text-2xl font-bold">Font Creator</h1>
      <Link href="/projects/new" className="mt-4 inline-block rounded bg-blue-600 px-4 py-2 text-white">
        New project
      </Link>
      <ul className="mt-6 space-y-2">
        {projects.map((project) => (
          <li key={project.id}>
            <Link href={`/projects/${project.id}`} className="text-blue-600 underline">
              {project.name}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  );
}
