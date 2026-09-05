// Interactions expose published data; there is no simulated search or live feed.
(() => {
  const path = location.pathname.replace(/index\.html$/, '');
  document.querySelectorAll('.nav-links a').forEach(link => {
    if (new URL(link.href).pathname === path) link.setAttribute('aria-current', 'page');
  });

  const figure = document.querySelector('[data-packing-figure]');
  if (figure) {
    const circles = [...figure.querySelectorAll('[data-circle]')];
    const centers = [...figure.querySelectorAll('[data-center]')];
    const readout = figure.querySelector('[data-circle-readout]');
    let selected = 12;
    figure.querySelectorAll('[data-packing-control]').forEach(el => { el.hidden = false; });
    function select(index) {
      selected = (index + circles.length) % circles.length;
      circles.forEach((circle, i) => circle.classList.toggle('is-selected', i === selected));
      centers.forEach((center, i) => center.classList.toggle('is-selected', i === selected));
      const circle = circles[selected];
      readout.textContent = `Circle ${String(selected).padStart(2, '0')} / r = ${Number(circle.dataset.radius).toFixed(6)}`;
    }
    circles.forEach((circle, index) => {
      circle.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') select(index); });
      circle.addEventListener('click', () => select(index));
    });
    figure.querySelector('[data-circle-prev]').addEventListener('click', () => select(selected - 1));
    figure.querySelector('[data-circle-next]').addEventListener('click', () => select(selected + 1));
    figure.querySelectorAll('[data-packing-view]').forEach(button => {
      button.addEventListener('click', () => {
        figure.dataset.view = button.dataset.packingView;
        figure.querySelectorAll('[data-packing-view]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        figure.querySelector('[data-packing-description]').textContent = button.dataset.packingView === 'contacts'
          ? 'The published contact graph: 58 circle contacts and 20 wall contacts.'
          : '26 circles inside a unit square. All 455 certificate conditions passed.';
      });
    });
    select(selected);
  }

  const study = document.querySelector('[data-rtl-study]');
  if (study) {
    const cases = {
      sha1: { gain: '2.27', score: '97.7300', slug: 'sha1' },
      int8: { gain: '8.3230', score: '91.6770', slug: 'int8-matvec' },
      mlkem: { gain: '9.7338', score: '90.2662', slug: 'mlkem-cbd' },
    };
    study.querySelector('[data-rtl-controls]').hidden = false;
    study.querySelectorAll('[data-rtl-case]').forEach(button => {
      button.addEventListener('click', () => {
        const result = cases[button.dataset.rtlCase];
        study.querySelectorAll('[data-rtl-case]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        study.querySelector('[data-rtl-gain]').textContent = `−${result.gain}%`;
        study.querySelector('[data-rtl-score]').textContent = result.score;
        study.querySelector('[data-rtl-bar]').style.width = `${result.score}%`;
        study.querySelector('[data-rtl-source]').href = `https://github.com/juan-fernandez-gotherlabs/rtl-optimization-case-study/tree/v2.2.2/cases/${result.slug}`;
        study.querySelector('[data-rtl-case-name]').textContent = button.textContent;
      });
    });
  }
})();
