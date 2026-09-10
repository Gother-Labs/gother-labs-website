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
    function select(index) {
      circles.forEach((circle, i) => circle.classList.toggle('is-selected', i === index));
      centers.forEach((center, i) => center.classList.toggle('is-selected', i === index));
    }
    circles.forEach((circle, index) => {
      circle.addEventListener('pointerenter', event => { if (event.pointerType === 'mouse') select(index); });
      circle.addEventListener('click', () => select(index));
    });
    select(12);
  }

  const study = document.querySelector('[data-rtl-study]');
  if (study) {
    const cases = {
      sha1: { slug: 'sha1', resultAnchor: 'rtl-sha1', pool: '64 certification seeds · SHA-1', reference: 'Relative to the baseline median.' },
      int8: { slug: 'int8-matvec', resultAnchor: 'rtl-matvec', pool: '64 held-out pairs · INT8 MatVec', reference: 'Relative to the baseline geometric aggregate.' },
      mlkem: { slug: 'mlkem-cbd', resultAnchor: 'rtl-mlkem', pool: '64 publication pairs · ML-KEM CBD', reference: 'Relative to the baseline geometric aggregate.' },
    };
    study.querySelector('[data-rtl-controls]').hidden = false;
    study.querySelectorAll('[data-rtl-case]').forEach(button => {
      button.addEventListener('click', () => {
        const result = cases[button.dataset.rtlCase];
        study.querySelectorAll('[data-rtl-case]').forEach(other => other.setAttribute('aria-pressed', String(other === button)));
        const cloud = study.querySelector('[data-rtl-cloud]');
        cloud.src = `./assets/research/rtl-${result.slug}.svg?v=paper-v3`;
        cloud.alt = `${button.textContent}: 64 baseline and optimized measurement pairs across area, timing, active power and composite, with paired estimates and 95% confidence intervals. Right is better.`;
        study.querySelector('[data-rtl-pool]').textContent = result.pool;
        study.querySelector('[data-rtl-normalization]').textContent = result.reference;
        study.closest('.studio-offer').querySelector('[data-rtl-source]').href = `./results/verified-rtl-optimization/#${result.resultAnchor}`;
      });
    });
  }

  const field = document.querySelector('[data-orbit-field]');
  if (field) {
    // Equal-mass three-body choreography, integrated once and replayed slowly.
    // The field is decorative; it is never presented as a research result.
    const system = {
      positions: [{x: -.97000436, y: .24308753}, {x: .97000436, y: -.24308753}, {x: 0, y: 0}],
      velocities: [{x: .466203685, y: .43236573}, {x: .466203685, y: .43236573}, {x: -.93240737, y: -.86473146}],
      masses: [1, 1, 1],
    };
    const count = 1800;
    const orbit = [];
    const project = ({x, y}) => ({x: 800 + (x * .94 - y * .342) * 665, y: 500 + (x * .342 + y * .94) * 665});
    for (let i = 0; i < count; i++) {
      orbit.push(system.positions.map(project));
      stepThreeBodyState(system, 6.32591398 / count, 1, 0);
    }
    let scaleX = 1;
    let scaleY = 1;
    const pathData = points => points.map((p, i) => `${i ? 'L' : 'M'}${(p.x * scaleX).toFixed(2)} ${(p.y * scaleY).toFixed(2)}`).join(' ');
    const bodies = [...field.querySelectorAll('.orbit-bodies circle')];
    const tails = [...field.querySelectorAll('.orbit-tails path')];
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let time = 0;
    let last = 0;
    let frameId = 0;
    function render() {
      const cursor = Math.floor(time / 42000 * count) % count;
      bodies.forEach((body, i) => {
        body.setAttribute('cx', orbit[cursor][i].x * scaleX);
        body.setAttribute('cy', orbit[cursor][i].y * scaleY);
        body.setAttribute('r', field.clientWidth < 720 ? 3 : 5);
        const tail = Array.from({length: 110}, (_, j) => orbit[(cursor - 109 + j + count) % count][i]);
        tails[i].setAttribute('d', pathData(tail));
      });
    }
    function frame(now) {
      time += last ? Math.min(now - last, 60) : 0;
      last = now;
      render();
      frameId = requestAnimationFrame(frame);
    }
    function updateMotion() {
      cancelAnimationFrame(frameId);
      last = 0;
      if (!motion.matches && !document.hidden) frameId = requestAnimationFrame(frame);
    }
    motion.addEventListener('change', updateMotion);
    document.addEventListener('visibilitychange', updateMotion);
    function resizeField() {
      scaleX = field.clientWidth / 1600;
      scaleY = field.clientHeight / 1000;
      field.setAttribute('viewBox', `0 0 ${field.clientWidth} ${field.clientHeight}`);
      field.querySelector('.orbit-path').setAttribute('d', pathData(orbit.map(frame => frame[0])) + 'Z');
      render();
    }
    new ResizeObserver(resizeField).observe(field);
    resizeField();
    updateMotion();
  }
})();
