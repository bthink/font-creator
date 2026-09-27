'use client';

export function TemplateGenerator({ projectId }: { projectId: number }): React.JSX.Element {
  async function handleGenerate(): Promise<void> {
    const response = await fetch(`/api/projects/${projectId}/templates`, { method: 'POST' });
    if (!response.ok) {
      const error = (await response.json()) as { error: string };
      window.alert(error.error);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'template.pdf';
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <button type="button" onClick={handleGenerate} className="rounded bg-green-600 px-4 py-2 text-white">
      Generate PDF template
    </button>
  );
}
