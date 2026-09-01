function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function fail(sourceName, lineNumber, message) {
  throw new Error(`${sourceName}:${lineNumber}: ${message}`);
}

function targetKind(target, sourceName, lineNumber, { image = false } = {}) {
  if (!target || /[\u0000-\u0020<>"'`\\]/.test(target)) {
    fail(sourceName, lineNumber, `unsafe or malformed Markdown target: ${target || "<empty>"}`);
  }
  if (/^https?:\/\//i.test(target)) {
    if (image) {
      fail(sourceName, lineNumber, "remote Markdown images are not supported; publish a local result asset");
    }
    return "external";
  }
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("//")) {
    fail(sourceName, lineNumber, `unsupported Markdown target scheme: ${target}`);
  }
  return "local";
}

function staticMathHtml(value) {
  return escapeHtml(value)
    .replace(/\\mathbb\{R\}/g, "ℝ")
    .replace(/\\sum/g, "∑")
    .replace(/\\tau/g, "τ")
    .replace(/\\geq/g, "≥")
    .replace(/\\times/g, "×")
    .replace(/\\to/g, "→")
    .replace(/\\in/g, "∈")
    .replace(/\\ldots/g, "…")
    .replace(/\^\{([^}]+)\}/g, "<sup>$1</sup>")
    .replace(/_\{([^}]+)\}/g, "<sub>$1</sub>")
    .replace(/\^([0-9*])/g, "<sup>$1</sup>")
    .replace(/_([a-zA-Z0-9*])/g, "<sub>$1</sub>")
    .replace(/[{}]/g, "");
}

function inlineMarkdown(value, sourceName, lineNumber, { staticMath = false } = {}) {
  if (value.includes("![")) fail(sourceName, lineNumber, "images must occupy their own line");

  const formulas = [];
  const marked = staticMath
    ? value.replace(/\\\((.+?)\\\)/g, (_match, formula) => {
        const token = `MATHPLACEHOLDER${formulas.length}END`;
        formulas.push(formula);
        return token;
      })
    : value;
  const tokenPattern = /`([^`\n]+)`|\*\*([^*\n]+)\*\*|\[([^\]\n]+)\]\(([^)\s]+)\)/g;
  let cursor = 0;
  let output = "";
  let match;

  while ((match = tokenPattern.exec(marked)) !== null) {
    output += escapeHtml(marked.slice(cursor, match.index));
    if (match[1] !== undefined) {
      output += `<code>${escapeHtml(match[1])}</code>`;
    } else if (match[2] !== undefined) {
      output += `<strong>${escapeHtml(match[2])}</strong>`;
    } else {
      const [, , , label, target] = match;
      const kind = targetKind(target, sourceName, lineNumber);
      const attributes = kind === "external" ? ' target="_blank" rel="noreferrer"' : "";
      output += `<a href="${escapeHtml(target)}"${attributes}>${escapeHtml(label)}</a>`;
    }
    cursor = tokenPattern.lastIndex;
  }

  output += escapeHtml(marked.slice(cursor));
  const unparsed = marked.replace(tokenPattern, "");
  if (/`|\*\*|\[[^\]]*\]\(/.test(unparsed)) {
    fail(sourceName, lineNumber, "malformed or unsupported inline Markdown");
  }
  formulas.forEach((formula, index) => {
    output = output.replace(
      `MATHPLACEHOLDER${index}END`,
      `<span class="static-math" role="math">${staticMathHtml(formula)}</span>`,
    );
  });
  return output;
}

function tableCells(line) {
  return line.trim().slice(1, -1).split("|").map((cell) => cell.trim());
}

function isTableSeparator(line) {
  if (!/^\|.*\|$/.test(line.trim())) return false;
  const cells = tableCells(line);
  return cells.length > 0 && cells.every((cell) => /^:?-{3,}:?$/.test(cell));
}

export function articleWithoutTitle(markdown) {
  return markdown.replace(/\r\n/g, "\n").replace(/^#\s+.+\n+/, "");
}

export function markdownToHtml(markdown, inserts = {}, options = {}) {
  const sourceName = options.sourceName ?? "article.md";
  const lines = markdown.replace(/\r\n/g, "\n").split("\n");
  const chunks = [];
  let paragraph = [];
  let paragraphStart = 1;
  let code = [];
  let codeLanguage = "";
  let codeStart = 1;
  let formula = [];
  let formulaStart = 1;
  let inCode = false;
  let inFormula = false;
  let equationIndex = 0;

  const renderInline = (value, lineNumber) =>
    inlineMarkdown(value, sourceName, lineNumber, { staticMath: options.staticMath });
  const flushParagraph = () => {
    if (!paragraph.length) return;
    chunks.push(`<p>${renderInline(paragraph.join(" "), paragraphStart)}</p>`);
    paragraph = [];
  };
  const flushCode = () => {
    const languageClass = codeLanguage ? ` class="language-${escapeHtml(codeLanguage)}"` : "";
    chunks.push(`<pre><code${languageClass}>${escapeHtml(code.join("\n"))}</code></pre>`);
    code = [];
    codeLanguage = "";
  };
  const flushFormula = () => {
    if (!formula.some((line) => line.trim())) fail(sourceName, formulaStart, "display formula cannot be empty");
    equationIndex += 1;
    const rendered = options.staticMath
      ? staticMathHtml(formula.join("\n"))
      : `\\[\n${escapeHtml(formula.join("\n"))}\n\\]`;
    chunks.push(`<div class="formula-block" id="eq-${equationIndex}">
  <div class="formula-math" role="math">${rendered}</div>
  <span class="equation-number">(${equationIndex})</span>
</div>`);
    formula = [];
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const lineNumber = index + 1;

    if (line.startsWith("```")) {
      const fence = line.match(/^```([a-zA-Z0-9_-]*)\s*$/);
      if (!fence) fail(sourceName, lineNumber, "malformed fenced-code delimiter");
      if (inFormula) fail(sourceName, lineNumber, "code fence cannot appear inside a display formula");
      if (inCode) {
        flushCode();
        inCode = false;
      } else {
        flushParagraph();
        inCode = true;
        codeLanguage = fence[1];
        codeStart = lineNumber;
      }
      continue;
    }
    if (line.trim() === "$$") {
      if (inCode) {
        code.push(line);
      } else if (inFormula) {
        flushFormula();
        inFormula = false;
      } else {
        flushParagraph();
        inFormula = true;
        formulaStart = lineNumber;
      }
      continue;
    }
    if (inCode) {
      code.push(line);
      continue;
    }
    if (inFormula) {
      formula.push(line);
      continue;
    }
    if (!line.trim()) {
      flushParagraph();
      continue;
    }

    const visual = line.trim().match(/^\{\{visual:([a-z0-9-]+)\}\}$/);
    if (visual) {
      flushParagraph();
      if (!Object.hasOwn(inserts, visual[1]) || !inserts[visual[1]]) {
        fail(sourceName, lineNumber, `missing renderer for visual insert: ${visual[1]}`);
      }
      chunks.push(inserts[visual[1]]);
      continue;
    }
    if (line.includes("{{visual:")) fail(sourceName, lineNumber, "malformed visual insert");

    const image = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
    if (image) {
      flushParagraph();
      const [, alt, target] = image;
      targetKind(target, sourceName, lineNumber, { image: true });
      const caption = alt ? `\n  <figcaption>${escapeHtml(alt)}</figcaption>` : "";
      chunks.push(`<figure class="result-paper-asset result-markdown-image">
  <img src="${escapeHtml(target)}" alt="${escapeHtml(alt)}">${caption}
</figure>`);
      continue;
    }
    if (line.trim().startsWith("![")) fail(sourceName, lineNumber, "malformed Markdown image");

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      const level = heading[1].length;
      chunks.push(`<h${level}>${renderInline(heading[2], lineNumber)}</h${level}>`);
      continue;
    }
    if (/^#{4,}\s|^>\s?|^ {4}\S|^<\/?[a-zA-Z]|^---+$/.test(line)) {
      fail(sourceName, lineNumber, "unsupported block Markdown syntax");
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (unordered || ordered) {
      flushParagraph();
      const tag = ordered ? "ol" : "ul";
      const items = [];
      let listCursor = index;
      while (listCursor < lines.length) {
        const candidate = ordered
          ? lines[listCursor].match(/^\d+\.\s+(.+)$/)
          : lines[listCursor].match(/^[-*]\s+(.+)$/);
        if (!candidate) break;
        items.push(`<li>${renderInline(candidate[1], listCursor + 1)}</li>`);
        listCursor += 1;
      }
      chunks.push(`<${tag}>\n${items.join("\n")}\n</${tag}>`);
      index = listCursor - 1;
      continue;
    }
    if (/^\s+[-*]\s|^\s+\d+\.\s/.test(line)) fail(sourceName, lineNumber, "nested lists are not supported");

    if (/^\|.*\|$/.test(line.trim())) {
      flushParagraph();
      if (!isTableSeparator(lines[index + 1] ?? "")) {
        fail(sourceName, lineNumber, "table header must be followed by a Markdown separator row");
      }
      const headers = tableCells(line);
      const separator = tableCells(lines[index + 1]);
      if (headers.length !== separator.length) fail(sourceName, lineNumber, "table header and separator column counts differ");
      const rows = [];
      let tableCursor = index + 2;
      while (tableCursor < lines.length && /^\|.*\|$/.test(lines[tableCursor].trim())) {
        const cells = tableCells(lines[tableCursor]);
        if (cells.length !== headers.length) fail(sourceName, tableCursor + 1, "table row column count differs from the header");
        rows.push({ cells, lineNumber: tableCursor + 1 });
        tableCursor += 1;
      }
      chunks.push(`<table>
  <thead><tr>${headers.map((cell) => `<th>${renderInline(cell, lineNumber)}</th>`).join("")}</tr></thead>
  <tbody>${rows.map((row) => `<tr>${row.cells.map((cell) => `<td>${renderInline(cell, row.lineNumber)}</td>`).join("")}</tr>`).join("")}</tbody>
</table>`);
      index = tableCursor - 1;
      continue;
    }

    if (!paragraph.length) paragraphStart = lineNumber;
    paragraph.push(line.trim());
  }

  if (inCode) fail(sourceName, codeStart, "unclosed fenced-code block");
  if (inFormula) fail(sourceName, formulaStart, "unclosed display-formula block");
  flushParagraph();
  return chunks.join("\n");
}
