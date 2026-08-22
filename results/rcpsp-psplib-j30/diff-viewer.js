(function () {
  const figure = document.querySelector("[data-diff-source]");
  const code = document.getElementById("rcpsp-full-diff-code");
  if (!figure || !code) return;

  const source = figure.getAttribute("data-diff-source");
  if (!source) return;

  fetch(source)
    .then((response) => {
      if (!response.ok) throw new Error(`Could not load diff (${response.status})`);
      return response.text();
    })
    .then((diff) => {
      const fragment = document.createDocumentFragment();
      for (const line of diff.replace(/\n$/, "").split("\n")) {
        const row = document.createElement("span");
        row.className = "rcpsp-diff-line";
        if (line.startsWith("+++ ") || line.startsWith("--- ")) row.classList.add("rcpsp-diff-file");
        else if (line.startsWith("@@")) row.classList.add("rcpsp-diff-hunk");
        else if (line.startsWith("+")) row.classList.add("rcpsp-diff-add");
        else if (line.startsWith("-")) row.classList.add("rcpsp-diff-remove");
        else row.classList.add("rcpsp-diff-context");
        row.textContent = line || " ";
        fragment.appendChild(row);
      }
      code.replaceChildren(fragment);
    })
    .catch(() => {
      code.textContent = "The complete diff could not be loaded. Open the raw diff from the caption below.";
    });
})();
