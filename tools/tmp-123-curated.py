from pathlib import Path
import re

CURATED = [
    Path("results/iberian-bess-policy-challenge/index.html"),
    Path("results/quadrature-rule-optimization/index.html"),
    Path("results/qubit-routing-lightsabre/index.html"),
    Path("results/rcpsp-psplib-j30/index.html"),
]

figure_re = re.compile(
    r'(<figure\b(?=[^>]*\bclass="[^"]*\bresult-paper-table\b[^"]*")(?=[^>]*\bid="([^"]+)")[^>]*>)([\s\S]*?)(</figure>)'
)

def add_attr(tag, name, value):
    if re.search(rf'\s{name}=', tag):
        return tag
    return tag[:-1] + f' {name}="{value}">'


def normalize_figure(match):
    opening, figure_id, body, closing = match.groups()
    caption_id = f"{figure_id}-caption"

    wrap_match = re.search(r'<div class="result-table-wrap"[^>]*>', body)
    if not wrap_match:
        raise SystemExit(f"{figure_id}: missing result-table-wrap")
    wrap = wrap_match.group(0)
    wrap = add_attr(wrap, "role", "region")
    wrap = add_attr(wrap, "aria-labelledby", caption_id)
    wrap = add_attr(wrap, "tabindex", "0")
    body = body[: wrap_match.start()] + wrap + body[wrap_match.end() :]

    table_match = re.search(r'<table class="result-table"[^>]*>', body)
    if not table_match:
        raise SystemExit(f"{figure_id}: missing result-table")
    table = add_attr(table_match.group(0), "aria-labelledby", caption_id)
    body = body[: table_match.start()] + table + body[table_match.end() :]

    head_match = re.search(r'<thead>([\s\S]*?)</thead>', body)
    if not head_match:
        raise SystemExit(f"{figure_id}: missing thead")
    head = head_match.group(1)
    row_match = re.search(r'<tr>([\s\S]*?)</tr>', head)
    if not row_match:
        raise SystemExit(f"{figure_id}: missing header row")
    raw_headers = re.findall(r'<th(?:\s[^>]*)?>([\s\S]*?)</th>', row_match.group(1))
    if not raw_headers:
        raise SystemExit(f"{figure_id}: missing column headers")
    rendered_headers = "".join(
        f'<th scope="col" id="{figure_id}-col-{index + 1}">{content}</th>'
        for index, content in enumerate(raw_headers)
    )
    new_header_row = f"<tr>{rendered_headers}</tr>"
    head = head[: row_match.start()] + new_header_row + head[row_match.end() :]
    body = body[: head_match.start()] + f"<thead>{head}</thead>" + body[head_match.end() :]

    tbody_match = re.search(r'<tbody>([\s\S]*?)</tbody>', body)
    if not tbody_match:
        raise SystemExit(f"{figure_id}: missing tbody")
    tbody = tbody_match.group(1)
    row_counter = 0

    def normalize_row(row_match):
        nonlocal row_counter
        row_counter += 1
        row_inner = row_match.group(1)
        cells = re.findall(r'<td(?:\s[^>]*)?>([\s\S]*?)</td>', row_inner)
        if not cells:
            if 'scope="row"' in row_inner:
                return row_match.group(0)
            raise SystemExit(f"{figure_id}: body row {row_counter} has no data cells")
        if len(cells) != len(raw_headers):
            raise SystemExit(
                f"{figure_id}: body row {row_counter} has {len(cells)} cells; expected {len(raw_headers)}"
            )
        row_header_id = f"{figure_id}-row-{row_counter}"
        rendered = [
            f'<th class="result-row-header" scope="row" id="{row_header_id}" headers="{figure_id}-col-1">{cells[0]}</th>'
        ]
        for index, content in enumerate(cells[1:], start=2):
            rendered.append(
                f'<td headers="{row_header_id} {figure_id}-col-{index}">{content}</td>'
            )
        return "<tr>" + "".join(rendered) + "</tr>"

    tbody = re.sub(r'<tr>([\s\S]*?)</tr>', normalize_row, tbody)
    body = body[: tbody_match.start()] + f"<tbody>{tbody}</tbody>" + body[tbody_match.end() :]

    caption_match = re.search(r'<figcaption(?:\s[^>]*)?>', body)
    if not caption_match:
        raise SystemExit(f"{figure_id}: missing figcaption")
    caption = add_attr(caption_match.group(0), "id", caption_id)
    body = body[: caption_match.start()] + caption + body[caption_match.end() :]

    return opening + body + closing


for path in CURATED:
    text = path.read_text()
    matches = list(figure_re.finditer(text))
    if not matches:
        raise SystemExit(f"{path}: no curated result tables found")
    normalized, count = figure_re.subn(normalize_figure, text)
    if count != len(matches):
        raise SystemExit(f"{path}: normalized {count} of {len(matches)} tables")
    path.write_text(normalized)
    print(f"{path}: normalized {count} table(s)")
