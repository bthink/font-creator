'use client';

import { useState } from 'react';
import Link from 'next/link';

export function ScanUploader({ projectId }: { projectId: number }): React.JSX.Element {
  const [status, setStatus] = useState<string | null>(null);
  const [reviewScanId, setReviewScanId] = useState<number | null>(null);

  async function handleFileChange(event: React.ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    setStatus('Uploading and aligning...');
    setReviewScanId(null);
    const response = await fetch(`/api/projects/${projectId}/scans`, {
      method: 'POST',
      body: formData,
    });
    const result = (await response.json()) as { id: number; alignmentStatus: string };
    if (result.alignmentStatus === 'aligned') {
      setStatus('Scan aligned successfully.');
      setReviewScanId(result.id);
    } else {
      setStatus('Alignment failed - registration markers not detected. Rescan and try again.');
    }
  }

  return (
    <section>
      <h2 className="text-lg font-semibold">Upload scan</h2>
      <input type="file" accept="image/*" onChange={handleFileChange} aria-label="Upload scan" />
      {status && <p className="mt-2 text-sm">{status}</p>}
      {reviewScanId !== null && (
        <p className="mt-2 text-sm">
          <Link
            className="text-blue-600 underline"
            href={`/projects/${projectId}/review?scanId=${reviewScanId}`}
          >
            Review glyphs
          </Link>
        </p>
      )}
    </section>
  );
}
