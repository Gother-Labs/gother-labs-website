const forbiddenGitModes = new Map([
  ["120000", "symbolic-link"],
  ["160000", "gitlink"],
]);

export function assertNoSpecialGitEntries(indexOutput, label = "results source") {
  const found = new Set();
  for (const record of String(indexOutput ?? "").split("\0")) {
    if (!record) continue;
    const mode = record.slice(0, 6);
    if (forbiddenGitModes.has(mode)) found.add(forbiddenGitModes.get(mode));
  }
  if (found.size > 0) {
    throw new Error(
      `${label} contains forbidden tracked object types: ${[...found].sort().join(", ")}.`,
    );
  }
}
