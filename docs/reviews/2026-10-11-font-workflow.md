# Font workflow review - 2026-10-11

## Findings addressed

- Scan instructions promised automatic page ordering, while files were assigned to the next free page without recognizing their content. The upload screen now explains manual verification, shows local previews that open at full size, and the PDF prints its page numbers.
- More files than free pages silently fell back to page 1. Unassigned files now require an explicit page choice, and duplicate page assignments block a batch upload. Rescanning an existing page is identified before sending.
- Deleting scans and generating templates left client-side upload progress and scan history stale. Those views now use refreshed server data; a different template version clears its staging queue.
- Downloading the same template created a new version and erased its apparent upload progress. Identical layouts now reuse the latest version.
- Scan progress was inferred solely from character sort order, which may contain gaps. New scans use their stored page index, with the legacy inference retained for older records.
- A scan without extracted handwriting could be reported as successful. Empty extraction now fails with actionable feedback and does not count as an uploaded page.
- Upload feedback now identifies the current file and preserves failed files for retry. Review has one footer action which requires all pages to be uploaded. Steps and scan deletion are disabled while a batch is processing.
- Individual glyph approval did not refresh the approved count consumed by the build panel. Successful saves now refresh the project data.

## GitHub issues

- #16: Browser back skipped project steps. Step changes now push history entries, and the active step derives from the URL using Next.js useSearchParams, including back/forward navigation.
- #17: No full-page scan preview. Added a project-scoped PNG endpoint and a preview link in scan history. The endpoint checks the scan's project and resolves filesystem paths inside DATA_DIR, including symlink resolution.
- Open tasks #2-#10 describe features already present in the repository: project storage, glyph sets, template generation, alignment, extraction, review, font building/export, and integration tests/documentation. They do not require rebuilding these features. Manual Font Book installation remains outside this verification.

Changes are local; GitHub issues have not been closed.

## Validation

- 74 Node/Vitest tests, including new regressions for blank scans, stored page indexes, deletion, repeat template downloads, and scan-preview ownership/path checks.
- 17 Python tests for alignment, extraction, geometry, and font compilation.
- ESLint and TypeScript checks.
- Next.js production build.
- Browser checks on an isolated test database: current page count after template generation, local previews, duplicate-assignment rejection, valid-assignment acceptance, scan history links, and browser back restoring the active step.
