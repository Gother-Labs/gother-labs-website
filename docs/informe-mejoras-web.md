# Informe consolidado de críticas y puntos de mejora de la web de Göther Labs

Fecha de revisión: 11 de julio de 2026

Estado evaluado: workspace local actual, incluyendo los cambios todavía no confirmados en Git

Alcance: arquitectura, publicación, contenido, propuesta comercial, confianza, resultados técnicos, fuentes, SEO, accesibilidad, rendimiento, seguridad y control de calidad

Este documento reúne todos los puntos detectados durante la auditoría. No es una hoja de ruta, no propone fases ni asigna plazos. Cada apartado describe qué se ha observado, por qué importa y qué aspecto debe trabajarse.

## 1. Conclusión general

La web tiene una identidad visual fuerte, una base estática rápida y una forma de demostrar capacidad técnica poco habitual: resultados públicos, contratos de evaluación, replays y artefactos inspeccionables. Esa combinación es el principal activo del sitio.

El problema central no es estético. La web todavía funciona mejor como laboratorio técnico público que como superficie comercial completa. La evidencia existe, pero la propuesta, la confianza corporativa, la trazabilidad de fuentes y la conversión no están resueltas con el mismo rigor.

También existe una regresión concreta en el estado local que impide recomendar su despliegue tal como está: la página de Qubit Routing contiene Markdown sin renderizar y ha perdido sus figuras.

## 2. Estado de publicación y control de versiones

### 2.1. El workspace local y la web publicada no representan el mismo producto

- La home publicada todavía presenta el posicionamiento anterior: “AI R&D for governed optimization”.
- La home local ya presenta “AI challengers for optimization teams”.
- La biblioteca publicada incluye el resultado BESS, pero todavía con la presentación anterior y sin el tratamiento destacado del workspace local.
- Esto dificulta saber qué versión es la fuente real de verdad para comunicación, ventas y SEO.

Debe existir una distinción explícita entre:

- contenido en producción;
- contenido aprobado para publicar;
- contenido experimental;
- contenido generado que todavía requiere revisión.

### 2.2. Hay una cantidad grande de cambios locales sin confirmar

Durante la auditoría había 32 archivos modificados, con aproximadamente 3.579 inserciones y 1.147 eliminaciones. El cambio mezcla:

- reposicionamiento de la home;
- nueva jerarquía comercial BESS;
- cambios en resultados generados;
- cambios de estilos globales;
- cambios del generador;
- cambios de replays y artefactos.

Este volumen incrementa el riesgo de que una regresión editorial o visual quede oculta dentro de una modificación técnicamente válida.

### 2.3. No existe automatización de publicación o validación visible en `.github/workflows`

El repositorio depende de comprobaciones manuales. No hay una barrera automática que impida publicar:

- HTML con Markdown residual;
- páginas sin figuras esperadas;
- enlaces rotos;
- cambios generados no confirmados;
- diferencias entre el repositorio de resultados y la web;
- regresiones Lighthouse;
- errores de jerarquía de encabezados;
- URLs indexables ausentes del sitemap.

## 3. Regresión crítica de Qubit Routing

### 3.1. La página local contiene Markdown literal

En `results/qubit-routing-lightsabre/index.html` aparecen textos como:

```text
See [evaluation_contract.md](artifacts/evaluation_contract.md).
![Objective trace](assets/objective-curve.svg)
![Per-topology added-CNOT comparison](assets/target-comparison.svg)
```

El navegador los muestra como texto, no como enlaces ni imágenes.

### 3.2. La página ha perdido las figuras y buena parte de la presentación anterior

La versión local auditada tiene:

- cero elementos `figure`;
- cero imágenes;
- seis párrafos con sintaxis Markdown sin convertir;
- una reducción del documento desde cientos de líneas de visualizaciones a unas 127 líneas.

El resultado técnico sigue siendo legible parcialmente, pero la promesa de evidencia visual y replayable queda rota.

### 3.3. El conversor Markdown artesanal no cubre el formato real de los artículos

`tools/sync-results.mjs` implementa un parser propio. Actualmente no resuelve de forma completa:

- imágenes Markdown;
- tablas Markdown;
- listas;
- enlaces relativos como `artifacts/file.json` sin `./`;
- bloques editoriales más complejos;
- validación de inserts visuales ausentes.

El contenido fuente y el generador han dejado de compartir un contrato de formato suficientemente estricto.

### 3.4. El checker actual da un falso positivo

`node tools/check-site-shell.mjs` pasa para los 17 HTML controlados porque comprueba principalmente:

- shell;
- navegación;
- assets compartidos;
- metadatos;
- footer.

No comprueba:

- contenido Markdown residual;
- figuras esperadas;
- tablas o enlaces de artefactos;
- integridad semántica del artículo;
- presencia de fuentes;
- diferencias destructivas de longitud o estructura.

La cobertura del checker es demasiado estrecha para usarse como señal de que una página generada está lista para producción.

## 4. Arquitectura y mantenibilidad

### 4.1. La decisión de mantener una web estática sigue siendo razonable

No hay una necesidad clara de introducir React, Next.js u otro framework pesado. El problema no es la ausencia de framework, sino que la complejidad ya se está acumulando en ficheros monolíticos y procesos manuales.

### 4.2. `styles.css` se ha convertido en un archivo global demasiado amplio

El archivo tiene alrededor de 5.710 líneas y contiene estilos para:

- shell general;
- home;
- Company;
- Contact;
- índice de resultados;
- todos los whitepapers;
- BESS;
- RCPSP;
- quadrature;
- circle packing;
- qubit routing;
- componentes de código y gráficas.

Lighthouse estimó aproximadamente 101 KiB de CSS no utilizado en la home, cerca del 89% del archivo descargado.

Esto no está destruyendo el rendimiento actual, pero provoca:

- mayor coste de mantenimiento;
- riesgo de colisiones de selectores;
- dificultad para eliminar estilos obsoletos;
- carga innecesaria en páginas simples;
- revisiones de diff difíciles.

### 4.3. `scripts.js` concentra comportamientos no necesarios en todas las páginas

El JavaScript global tiene unas 1.166 líneas. Incluye:

- año del footer;
- animación física del logotipo;
- simulación de tres cuerpos;
- comportamiento de una demo evolutiva;
- estado persistido de animación.

Lighthouse estimó aproximadamente un 59% de JavaScript no utilizado en la home.

Los comportamientos deberían cargarse únicamente cuando la página contiene el componente correspondiente.

### 4.4. La animación del logotipo tiene un coste desproporcionado respecto a su función

La animación:

- permanece activa hasta 200 segundos;
- utiliza `requestAnimationFrame` de forma continua;
- emplea un integrador interno con paso de 1/240 segundos;
- se inicializa en todas las páginas que contienen el wordmark animado;
- mantiene historial y estado en sesión.

Respeta `prefers-reduced-motion` y Lighthouse no detectó bloqueo del hilo principal durante la carga. Aun así, el coste energético y de CPU debe justificarse para un elemento decorativo tan pequeño. Debe pausarse cuando no es visible y finalizar mucho antes.

### 4.5. El generador de resultados es demasiado monolítico

`tools/sync-results.mjs` tiene alrededor de 3.589 líneas y combina:

- lectura de datos;
- copia de artefactos;
- parser Markdown;
- shell HTML;
- renderizadores de dominio;
- SVGs complejos;
- tablas;
- sitemap;
- normalización de run pages.

Esta concentración hace que un cambio en contenido, generación o presentación pueda afectar dominios no relacionados. También dificulta escribir pruebas unitarias sobre cada responsabilidad.

### 4.6. El shell compartido solo es parcialmente compartido

`tools/site-shell.mjs` gobierna las páginas generadas, pero las páginas manuales siguen duplicando:

- header;
- wordmark SVG;
- navegación;
- footer;
- referencias a CSS y JavaScript;
- versión de cache busting.

La documentación reconoce esta duplicación y confía en disciplina manual. El sistema funciona con pocas páginas, pero ya muestra señales de deriva potencial.

### 4.7. El versionado de assets depende de una cadena manual

El valor `home-sales-v1` debe mantenerse sincronizado entre:

- páginas manuales;
- generador;
- run pages copiadas;
- `SITE_SHELL_VERSION`.

El nombre mezcla versión técnica y campaña editorial. Una versión basada en hash o en un único punto de generación reduciría errores.

## 5. Propuesta de valor y posicionamiento

### 5.1. “AI challenger” no se define

Es el concepto central de la nueva home, pero no es una categoría que el comprador conozca de antemano. El visitante debe deducir su significado a partir de varios párrafos.

Debe explicarse de forma directa:

- qué es un challenger;
- qué recibe como entrada;
- qué modifica o busca;
- contra qué se compara;
- qué entrega;
- qué no hace;
- en qué se diferencia de un solver, consultor, optimizador o sistema de trading.

### 5.2. “Policy” puede interpretarse de varias formas

Para un perfil técnico significa política de decisión. Para otros visitantes puede significar política pública, normativa o política corporativa. La home debería introducir “optimization policy” o “decision policy” antes de utilizar “policy” sin contexto.

### 5.3. La home mezcla un posicionamiento horizontal con una demostración vertical

El titular habla a todos los equipos de optimización. Sin embargo, la prueba, oferta y CTAs principales se concentran en BESS.

Esto genera dos posibles lecturas:

- Göther es una empresa especializada en optimización BESS;
- Göther es una plataforma horizontal y BESS es solo el primer caso.

La web debe hacer explícita cuál es la lectura correcta. La biblioteca de routing, scheduling, packing y quadrature demuestra amplitud técnica, pero también puede distraer a un comprador energético si no se presenta como prueba de método.

### 5.4. La frase “The website should let buyers self-serve before a call” es lenguaje interno

Es una observación sobre la estrategia de la propia web, no un beneficio formulado para el visitante. En una página pública debería sustituirse por una promesa dirigida al usuario, por ejemplo la posibilidad de inspeccionar la evidencia antes de hablar con la empresa.

### 5.5. “Evidence first, sales second” es atractivo, pero puede sonar defensivo

La frase encaja con la identidad de Göther, aunque sitúa “sales” dentro del mensaje principal. Conviene comprobar si fortalece confianza o si recuerda al visitante que está atravesando un proceso comercial.

### 5.6. Falta explicar para quién no es el servicio

La web describe casos de uso, pero no define con suficiente precisión:

- tamaño o madurez mínima del equipo;
- necesidad de una baseline existente;
- disponibilidad de escenarios replayables;
- tipos de restricciones aceptables;
- situaciones donde Göther no puede aportar valor;
- requisitos de datos y propiedad del evaluador.

Esta información ayudaría a cualificar mejor las conversaciones.

## 6. Home y experiencia de primera visita

### 6.1. La prueba cuantitativa principal carece de contexto inmediato

El `33.714%` es visualmente poderoso, pero “score reduction” no explica por sí solo:

- cuál era el score original;
- qué significa el score;
- si menor es mejor;
- contra qué baseline se calcula;
- sobre cuántos escenarios;
- bajo qué contrato de batería;
- si es porcentaje relativo o diferencia absoluta.

El número puede parecer más comercial de lo que realmente pretende una prueba metodológica de ocho escenarios.

### 6.2. El bloque de prueba queda inicialmente fuera de vista en móvil

En 390 × 844, el hero de la home ocupa alrededor de 1.061 píxeles. La tarjeta con el `33.714%` comienza después de los textos y CTAs, por lo que el principal elemento de prueba no aparece completo en la primera pantalla.

### 6.3. Hay demasiadas repeticiones de la misma idea

La home repite en distintas secciones:

- public proof;
- replay;
- constraints;
- artifacts;
- private challenge;
- frozen rules.

La repetición ayuda a fijar el concepto, pero algunas secciones no añaden información suficiente para justificar su longitud total de más de 3.500 píxeles en escritorio y más de 4.700 en móvil.

### 6.4. Los CTAs tienen el mismo peso visual

“Start a private challenge”, “Review public proof”, “Open BESS policy challenger”, “See the BESS offer” y otros enlaces se presentan con un tratamiento parecido. No siempre queda claro cuál es la siguiente acción principal y cuál es una acción de apoyo.

### 6.5. La home no muestra señales corporativas

No aparecen:

- equipo;
- ubicación;
- entidad jurídica;
- partners;
- clientes;
- validadores externos;
- presencia profesional;
- fecha de actualización del resultado.

Si todavía no existen clientes o partners publicables, no deben inventarse logos. La carencia puede compensarse con identidad legal, equipo, fuentes primarias y una explicación transparente del estado de la empresa.

## 7. Oferta BESS Policy Challenger

### 7.1. La estructura de la oferta es buena, pero todavía incompleta comercialmente

La página explica:

- qué envía el cliente;
- qué se congela;
- qué se devuelve;
- qué no se afirma;
- qué evidencia forma parte del pack.

Falta explicar:

- duración típica del engagement;
- forma de colaboración;
- criterio para aceptar un challenge;
- criterio de éxito;
- propiedad intelectual del candidato;
- tratamiento de datos y fixtures;
- proceso de NDA;
- canal seguro de intercambio;
- qué ocurre si no se encuentra mejora;
- formato de la decisión final;
- expectativas de precio o, al menos, modelo de contratación.

### 7.2. La oferta no resuelve objeciones habituales

Sería útil responder de forma explícita:

- ¿Göther necesita acceso a producción?
- ¿Puede trabajar con datos anonimizados?
- ¿Se modifica el optimizador existente?
- ¿Quién valida las restricciones?
- ¿Cómo se evita overfitting a los escenarios?
- ¿Qué sucede con los casos donde el challenger empeora?
- ¿Cómo se comparan policies comerciales confidenciales?
- ¿Se puede ejecutar el replay en infraestructura del cliente?

### 7.3. La prueba pública puede parecer demasiado pequeña para sostener la promesa comercial

El resultado usa ocho escenarios OMIE. La propia página delimita correctamente la afirmación, pero la home puede hacer que el porcentaje domine sobre el tamaño de muestra.

Debe presentarse como prueba de disciplina de evaluación, no como estimación de rendimiento esperado para un cliente.

### 7.4. Falta una muestra compacta del entregable final

Los artefactos y el replay existen, pero un comprador comercial puede no saber qué recibirá al finalizar. Sería útil mostrar una miniatura o índice real de un “decision pack” con:

- executive summary;
- baseline comparison;
- weak cases;
- constraints;
- replay status;
- recommendation;
- next-step decision.

## 8. Conversión y contacto

### 8.1. Toda la conversión depende del cliente de correo

La página Contact no contiene formulario. El CTA principal abre un `mailto:` con campos predefinidos.

Esto provoca:

- fricción en navegadores sin cliente configurado;
- imposibilidad de medir el envío;
- falta de confirmación dentro de la web;
- abandono invisible;
- dificultad para enrutar diferentes tipos de contacto;
- imposibilidad de validar campos mínimos.

### 8.2. No hay opción directa de agendar una conversación

Para una oferta B2B técnica, una llamada breve de cualificación es una acción esperable. No existe calendario, duración sugerida ni explicación de qué se cubrirá en la primera conversación.

### 8.3. No se indica tiempo de respuesta

El visitante no sabe:

- cuándo recibirá respuesta;
- quién responderá;
- si la conversación inicial es técnica o comercial;
- si se acepta contacto bajo NDA.

### 8.4. Las demás rutas de contacto no tienen acciones específicas

Solo BESS dispone de asunto y cuerpo precompletados. Private collaboration, research, partnership y careers terminan en el mismo correo genérico sin una acción contextual equivalente.

### 8.5. No hay medición de conversión

No se ha detectado analítica ni instrumentación de eventos. Actualmente no se puede saber:

- qué CTA recibe clics;
- qué resultado genera contactos;
- cuántas personas llegan a Contact;
- cuántas abren el `mailto:`;
- qué páginas ayudan en una conversión;
- qué contenido técnico se consulta antes de escribir;
- qué términos de búsqueda atraen compradores cualificados.

## 9. Company, equipo y confianza corporativa

### 9.1. Company explica la tesis, pero no la empresa concreta

La página dedica alrededor de 576 palabras a:

- sistemas importantes;
- progreso gobernado;
- evaluación;
- visión de futuro.

No responde con la misma claridad a:

- quién fundó Göther;
- qué experiencia tiene el equipo;
- dónde opera;
- cuál es su entidad legal;
- qué tamaño tiene;
- qué ha construido;
- cómo contactar con personas concretas;
- qué relación existe entre Göther y Evölther.

### 9.2. El texto es abstracto y repetitivo

Conceptos como “important systems”, “governed improvement”, “judgment”, “rigor” y “technical progress” aparecen repetidamente. La tesis es coherente, pero necesita más hechos observables para no sonar únicamente aspiracional.

### 9.3. Evölther aparece como sistema interno, pero su estado no queda definido

No se sabe si Evölther es:

- producto;
- plataforma interna;
- metodología;
- marca futura;
- sistema de investigación;
- nombre del loop operativo.

La página experimental está `noindex`, pero Company menciona Evölther públicamente. La relación debe explicarse sin obligar al lector a inferirla.

### 9.4. Falta verificación externa o identidad profesional

No hay enlaces visibles a:

- perfiles de fundadores;
- LinkedIn corporativo;
- GitHub corporativo desde el shell general;
- publicaciones;
- ponencias;
- partners;
- registro empresarial.

## 10. Footer, legal y privacidad

### 10.1. El footer es demasiado mínimo

Solo contiene el copyright. No ayuda a navegar ni a verificar la empresa.

Faltan potencialmente:

- Company;
- Results;
- Contact;
- Privacy;
- Terms;
- LinkedIn;
- GitHub;
- entidad legal;
- ubicación o jurisdicción.

### 10.2. No existen Privacy Policy ni Terms

Mientras la web no recoja datos mediante formularios o analítica, el riesgo es menor. Sin embargo, la ausencia resta confianza a una empresa que pide acceso a policies, escenarios y restricciones potencialmente sensibles.

Si se añade formulario, agenda, analítica o subida de archivos, la política de privacidad deja de ser solo una señal comercial y pasa a ser una necesidad operativa.

### 10.3. No hay una explicación pública del tratamiento de material confidencial

La propuesta privada debería aclarar, al menos a alto nivel:

- qué se almacena;
- durante cuánto tiempo;
- qué se excluye de resultados públicos;
- quién conserva derechos sobre los fixtures;
- cómo se destruyen o devuelven los materiales;
- si se usan datos del cliente para mejorar sistemas generales.

## 11. Resultados técnicos y experiencia de lectura

### 11.1. Los resultados son técnicamente ricos, pero no todos tienen una capa ejecutiva

Los whitepapers se dirigen bien a un lector técnico. Un responsable de compra necesita antes una lectura compacta con:

- problema;
- baseline;
- tamaño del benchmark;
- mejora;
- restricciones;
- principal limitación;
- decisión que habilita el resultado.

La página BESS comienza a resolverlo con “Optimizer team readout”, pero el patrón no está normalizado en los demás resultados.

### 11.2. Falta un índice de contenidos en documentos largos

Las alturas aproximadas observadas incluyen:

- BESS: más de 8.100 píxeles;
- Circle packing: más de 1.700 líneas de HTML;
- RCPSP: más de 1.000 líneas;
- Quadrature: más de 880 líneas.

No hay navegación interna persistente o tabla de contenidos que permita saltar entre Abstract, Contract, Results, Limitations y Reproducibility.

### 11.3. La jerarquía de encabezados salta de `h1` a `h3`

Los cinco resultados usan `h1` para el título y `h3` para las secciones principales. El nivel `h2` queda vacío.

Esto debilita:

- estructura semántica;
- navegación con lectores de pantalla;
- claridad del outline;
- consistencia del generador.

### 11.4. Los artículos mezclan paper, documentación y CTA comercial

La mezcla puede funcionar, pero debe quedar visualmente diferenciada. En BESS, el bloque de private challenge aparece como sección 9 del whitepaper. Conviene evitar que la parte comercial parezca una conclusión científica o que la evidencia parezca marketing.

### 11.5. Las tarjetas del índice no muestran fecha ni versión

Los resultados son artefactos evaluados y versionados, pero el visitante no puede ver desde el índice:

- fecha de publicación;
- versión del benchmark;
- última actualización;
- estado del replay;
- si el resultado fue reemplazado por otro.

### 11.6. La biblioteca mezcla dominios sin explicar el objetivo de esa amplitud

Energy, scientific computing, scheduling, geometry y quantum compilation conviven en el mismo nivel. Para un visitante puede demostrar generalidad o falta de foco.

Debe explicarse que estos resultados prueban una capacidad transversal de mejora gobernada y distinguir claramente los casos comerciales activos de las pruebas metodológicas.

### 11.7. Algunos porcentajes dependen de baselines débiles o muy específicos

Por ejemplo, “+174.64% improvement from baseline” en circle packing puede ser matemáticamente correcto y, al mismo tiempo, poco representativo del standing absoluto si la baseline era deliberadamente pobre.

La interfaz debería priorizar:

- valor absoluto validado;
- referencia externa comparable;
- gap frente al mejor conocido;
- naturaleza de la baseline.

## 12. Consistencia y definición de métricas BESS

### 12.1. “Score reduction” representa dos cantidades distintas

La home y la oferta muestran:

- `33.714%`: reducción relativa.

El replay muestra:

- `24.46`: diferencia absoluta entre score inicial y aceptado.

Ambas se etiquetan como “Score reduction”. Deben distinguirse como:

- baseline score;
- accepted score;
- absolute score delta;
- relative score reduction.

### 12.2. El score no es autoexplicativo

El comprador entiende mejor:

- uplift diario;
- downside;
- regret;
- oracle capture;
- margin after degradation;
- constraint breaches.

El score gobernado puede seguir siendo la métrica de aceptación, pero no debería dominar la comunicación sin una definición cercana.

### 12.3. El uplift económico necesita contexto de escala

`€20.20/day` debe aparecer siempre asociado a:

- batería 1 MW / 4 MWh;
- ocho escenarios congelados;
- baseline cuantílica;
- precios históricos seleccionados;
- alcance offline;
- costes incluidos y excluidos.

### 12.4. La comparación comercial no equivale a validación de producción

La web ya incluye disclaimers, pero el diseño visual enfatiza los números mucho más que las limitaciones. La proporción entre claim y contexto debe revisarse para evitar una lectura exagerada.

## 13. Fuentes, citas y procedencia

### 13.1. La procedencia existe, pero está escondida en artefactos

Los JSON de provenance y evaluation contract contienen información útil, pero el visitante medio no debería tener que inspeccionar archivos JSON para descubrir:

- origen del dataset;
- fecha de extracción;
- versión;
- licencia;
- reglas de selección;
- hash o commit;
- dependencia externa;
- alcance de sanitización.

Cada artículo necesita una sección visible de “Sources and provenance”.

### 13.2. BESS no enlaza de forma prominente a la fuente oficial de OMIE

El artículo menciona OMIE, pero debe enlazar directamente a la fuente primaria y explicar:

- qué fichero o endpoint se utilizó;
- qué fechas se seleccionaron;
- zona de precio;
- resolución temporal;
- tratamiento horario y zona horaria;
- transformaciones realizadas;
- licencia o condiciones de reutilización;
- hash de la muestra publicada.

Fuente primaria recomendada: [OMIE — Day-ahead price](https://www.omie.es/en/market-results/daily/daily-market/day-ahead-price?scope=daily).

### 13.3. RCPSP debe enlazar PSPLIB desde el artículo, no solo desde provenance

La fuente oficial aparece dentro de `provenance.json`, pero no está presentada como referencia primaria visible.

Fuente recomendada: [Project Scheduling Problem Library — TUM](https://www.om-db.wi.tum.de/psplib/).

### 13.4. Qubit Routing necesita citar LightSABRE y definir el origen de circuitos y topologías

El resultado compara contra LightSABRE, pero debe indicar:

- versión exacta de LightSABRE/Qiskit;
- configuración y semillas;
- origen de los 24 circuitos;
- origen o definición de Q20, Willow y Heron-FEZ;
- pesos por caso;
- condiciones de replay;
- paper primario.

Fuente primaria recomendada: [LightSABRE: A Lightweight and Enhanced SABRE Algorithm](https://arxiv.org/abs/2409.08368).

### 13.5. Circle packing menciona un benchmark externo sin enlazarlo

El texto afirma que una página de terceros lista LoongFlow, SkyDiscover y ASI-Evolve, pero no proporciona enlace ni cita. Una comparación de standing público no debe depender de una referencia imposible de verificar desde el propio artículo.

### 13.6. Quadrature reconoce pesos no publicados

El artículo indica que los pesos numéricos `alpha_j` del objetivo no son públicos. Aunque separa correctamente los residuals del score de aceptación, esta ausencia limita la reproducibilidad independiente del objetivo completo.

Debe quedar inequívocamente claro qué parte puede reproducirse y qué parte solo puede verificarse mediante los artefactos publicados.

### 13.7. Falta declarar licencias de datasets, código y artefactos

Los bundles son descargables, pero no se ha identificado una licencia visible que explique:

- si pueden reutilizarse;
- si pueden modificarse;
- cómo deben citarse;
- qué licencias heredan de fuentes externas;
- qué material permanece propietario.

### 13.8. Falta distinguir evidencia propia de validación independiente

Los replays demuestran consistencia interna. No equivalen automáticamente a:

- revisión por pares;
- benchmark independiente;
- validación de cliente;
- auditoría externa;
- resultado de producción.

La web debe mantener esta distinción explícita para que su rigor no parezca autopublicación presentada como validación externa.

## 14. SEO técnico y descubrimiento

### 14.1. No hay datos estructurados JSON-LD

No se ha detectado `Organization`, `Article`, `Dataset`, `DataDownload` ni `BreadcrumbList`.

Esto limita la capacidad de buscadores para entender:

- quién publica;
- qué entidad es Göther Labs;
- qué páginas describen datasets;
- qué artefactos pueden descargarse;
- qué fecha y versión tiene un resultado;
- qué páginas forman una jerarquía.

Referencias oficiales:

- [Organization structured data](https://developers.google.com/search/docs/appearance/structured-data/organization)
- [Dataset structured data](https://developers.google.com/search/docs/appearance/structured-data/dataset)

### 14.2. La oferta BESS es indexable pero no aparece en el sitemap local

`evolther/bess-policy-challenger/` tiene:

- canonical;
- Open Graph;
- descripción;
- ausencia de `noindex`.

Sin embargo, no aparece en `sitemap.xml`. Hay una contradicción entre la intención aparente de indexación y la señal enviada por el sitemap.

### 14.3. `/careers/` aparece indexado como “Redirecting”

La producción utiliza meta refresh. Google puede interpretar un refresh de cero segundos como redirección permanente, pero la URL todavía ha aparecido en resultados de búsqueda.

Una redirección HTTP 301/308 sería más limpia. Si GitHub Pages no permite resolverla directamente, debe revisarse la infraestructura o reforzarse la señal canónica/noindex.

Referencia: [Google — Redirects and Search](https://developers.google.com/search/docs/crawling-indexing/301-redirects).

### 14.4. Varias meta descriptions son excesivamente largas

Se detectaron descripciones de aproximadamente:

- 196 caracteres en BESS;
- 236–242 en Quadrature, RCPSP y Circle Packing;
- 276 en Qubit Routing.

Google puede generar sus propios snippets, pero estos textos probablemente se truncarán y diluyen la propuesta principal.

### 14.5. Todas las páginas comparten la misma imagen social

`assets/og-image.png` es un wordmark genérico de 1200 × 630. Los resultados técnicos deberían tener una imagen específica con:

- título;
- dominio;
- métrica principal;
- identidad Göther;
- visual del resultado.

Esto mejoraría reconocimiento y contexto al compartir enlaces.

### 14.6. El sitemap no incluye `lastmod`

No es obligatorio, pero los resultados son documentos versionados y se beneficiarían de una fecha de modificación fiable cuando el generador pueda garantizarla.

### 14.7. No hay evidencia de Search Console o monitorización de indexación

Sin datos de Search Console no se puede evaluar:

- consultas de marca y no marca;
- páginas descubiertas pero no indexadas;
- canonical elegida por Google;
- rendimiento de resultados técnicos;
- snippets reales;
- problemas de sitemap;
- Core Web Vitals de campo.

## 15. Accesibilidad

### 15.1. Lighthouse no sustituye una auditoría WCAG manual

La home obtuvo 100/100 en accesibilidad automatizada. Es una señal positiva, pero no demuestra conformidad WCAG 2.2 AA.

Debe revisarse manualmente:

- navegación completa por teclado;
- foco en todos los CTAs;
- orden de lectura;
- jerarquía de encabezados;
- zoom al 200% y 400%;
- contraste en estados hover/focus;
- modo oscuro;
- reflow de tablas y código;
- comprensión de gráficas sin color;
- anuncios dinámicos del replay;
- experiencia con VoiceOver/NVDA.

Referencia normativa: [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

### 15.2. Algunos tokens de color quedan por debajo de 4,5:1 sobre blanco

Los cálculos aproximados son:

- `#7a7a7a` sobre blanco: 4,29:1;
- `#0a84ff` sobre blanco: 3,65:1.

El resultado depende de tamaño y peso del texto. Lighthouse no marcó instancias concretas, pero los tokens se usan en párrafos y enlaces de tamaño normal, por lo que deben revisarse en contexto.

### 15.3. Los estilos de foco no cubren de forma explícita todos los componentes

Hay estilos de foco para navegación y varios CTAs, pero el sistema está definido por grupos de selectores específicos. A medida que aparecen componentes nuevos, es fácil olvidar su estado de foco.

Debe existir una regla base consistente para enlaces, botones, selects y controles personalizados.

### 15.4. Las gráficas dependen mucho de color y densidad visual

Las figuras usan azul, gris y trazos con distintos niveles de opacidad. Debe comprobarse que:

- cada serie tiene etiqueta textual;
- los patrones se distinguen sin color;
- el contraste se mantiene en dark mode;
- las leyendas siguen siendo legibles en móvil;
- el SVG incluye nombre accesible útil cuando transmite información.

### 15.5. Las tablas responsive transformadas en tarjetas necesitan validación con lector de pantalla

En BESS, varias tablas pasan a `display: block` y ocultan `thead` en móvil. Visualmente funciona, pero debe comprobarse si la asociación entre cabecera y dato sigue siendo comprensible para tecnologías de asistencia.

### 15.6. El selector del replay está correctamente envuelto en un `label`, pero los cambios dinámicos necesitan anuncio

Al seleccionar escenario cambian:

- título;
- uplift;
- baseline;
- regret;
- SVG de dispatch.

No está claro que un lector de pantalla sea informado de forma suficiente sobre el cambio o pueda acceder a una alternativa textual completa de la gráfica.

## 16. Rendimiento

### 16.1. La puntuación de laboratorio es buena, pero falta rendimiento real

La home obtuvo:

- Performance: 98;
- LCP: 2,1 s;
- TBT: 0 ms;
- CLS: 0;
- Speed Index: 1,7 s.

Son resultados locales con throttling de laboratorio. No sustituyen datos del percentil 75 de usuarios móviles y de escritorio.

Referencia: [Web Vitals](https://web.dev/articles/vitals).

### 16.2. `font-display: block` puede ocultar texto

La fuente Inter está precargada y alojada localmente, lo cual es positivo. Sin embargo, `font-display: block` puede producir un periodo de texto invisible. `swap` u `optional` suele ser más seguro para contenido editorial.

### 16.3. Algunas run surfaces cargan datasets grandes al inicio

Tamaños aproximados detectados:

- Circle packing `surface-data.js`: 1,2 MB;
- Quadrature `surface-data.js`: 476 KB;
- BESS `surface-data.js`: 116 KB;
- RCPSP `surface-data.js`: 116 KB.

Las run pages son experiencias especializadas y están en `noindex`, pero la carga inicial puede optimizarse mediante:

- JSON separado;
- compresión;
- carga bajo demanda;
- partición por escenario;
- reducción de precisión donde no afecte al replay.

### 16.4. MathJax se carga desde CDN en varios resultados

Se utiliza:

```html
https://cdn.jsdelivr.net/npm/mathjax@3/es5/tex-chtml.js
```

Problemas:

- versión mayor fijada, pero no versión exacta;
- dependencia externa en tiempo de lectura;
- ausencia de SRI;
- potencial cambio de contenido dentro de la rama `@3`;
- impacto en privacidad, disponibilidad y CSP.

Debe fijarse una versión exacta y valorar self-hosting o integridad verificable.

## 17. Seguridad y dependencias externas

### 17.1. No se observaron cabeceras CSP o HSTS en la respuesta revisada

La web se sirve desde GitHub Pages y la respuesta observada no incluía una política CSP ni HSTS explícita. Al ser un sitio estático sin autenticación ni formularios, el riesgo actual es limitado, pero aumentará si se incorporan:

- formularios;
- analítica;
- calendarios;
- uploads;
- scripts de terceros.

### 17.2. La futura recopilación de datos no debe apoyarse en un formulario inseguro o genérico

Los fixtures pueden contener lógica comercial sensible. No debería habilitarse subida directa de archivos sin:

- autenticación o enlaces seguros;
- cifrado;
- límites de tamaño y tipo;
- antivirus;
- retención definida;
- registro de consentimiento;
- política de acceso interno.

La primera toma de contacto debería recopilar metadatos mínimos y trasladar el material sensible a un canal acordado después.

### 17.3. Los enlaces externos y recursos deberían formar una allowlist explícita

Actualmente los artículos pueden incorporar enlaces y scripts externos desde contenido generado. El generador debería controlar:

- protocolos permitidos;
- hosts de scripts;
- atributos `rel`;
- apertura en nueva pestaña;
- sanitización;
- recursos descargables.

## 18. Analítica, aprendizaje y medición

### 18.1. No existe una definición verificable de éxito de la web

La web afirma que debe permitir self-service antes de una llamada, pero no mide:

- profundidad de lectura;
- aperturas de resultados;
- visitas a replays;
- descargas de artefactos;
- paso de resultado a oferta;
- paso de oferta a contacto;
- conversiones cualificadas.

### 18.2. No se pueden comparar los dos posicionamientos de home

Se está pasando de una home institucional/minimalista a una home comercial BESS. Sin analítica no podrá saberse si la nueva versión mejora:

- comprensión;
- engagement;
- consultas cualificadas;
- consumo de evidencia;
- rebote móvil.

### 18.3. Debe preservarse la privacidad al medir

La medición puede ser ligera y respetuosa. No es necesario adoptar una pila publicitaria. Los eventos importantes son:

- CTA principal;
- apertura de prueba;
- apertura de replay;
- descarga de artefacto;
- visita a Contact;
- comienzo y envío de brief;
- reserva de llamada.

## 19. Idioma y mercado

### 19.1. Todo el sitio está en inglés

Esto es coherente si el mercado objetivo es internacional y el comprador trabaja en inglés. Sin embargo, Göther opera desde España y el caso principal se basa en OMIE.

Debe existir una decisión explícita de mercado:

- inglés como único idioma comercial;
- español e inglés;
- páginas verticales localizadas.

No conviene añadir traducción parcial sin mantener:

- canonical por idioma;
- `hreflang`;
- sitemap localizado;
- consistencia de claims y metadatos;
- revisión humana del vocabulario energético.

## 20. Referentes de diseño y arquitectura de información

### 20.1. Gurobi

[Gurobi](https://www.gurobi.com/) muestra:

- resultado empresarial en el hero;
- explicación sencilla de optimización;
- productos;
- industrias;
- casos de cliente;
- métricas de confianza;
- discovery call;
- equipo y capa legal.

La lección útil no es copiar su densidad, sino conectar tecnología, sector, prueba y siguiente acción.

### 20.2. Applied Intuition

[Applied Intuition](https://www.appliedintuition.com/) separa claramente:

- visión;
- productos;
- industrias;
- investigación;
- partners;
- noticias;
- compañía.

Es una referencia para mostrar profundidad técnica sin obligar al visitante a entrar primero en un paper.

### 20.3. GridBeyond

[GridBeyond](https://gridbeyond.com/) es la referencia comercial más cercana al caso BESS por:

- segmentación por tipo de activo;
- lenguaje de outcomes;
- escala operativa;
- casos;
- equipo;
- CTA de evaluación de 20 minutos;
- contenido energético actualizado.

Göther no debe imitar sus claims de escala si todavía no existen, pero sí su claridad para cualificar al comprador.

### 20.4. Aster

[Aster](https://www.asterlab.ai/) demuestra que una empresa de investigación puede mantener una web extremadamente mínima e incluir al mismo tiempo:

- misión concreta;
- resultados;
- entidad corporativa;
- contacto;
- términos;
- privacidad;
- presencia pública.

Es el referente más útil para completar la confianza sin abandonar el minimalismo de Göther.

## 21. Controles de calidad que faltan

El repositorio necesita comprobaciones capaces de detectar, como mínimo:

- Markdown residual en HTML;
- imágenes declaradas pero no renderizadas;
- enlaces internos rotos;
- enlaces a artefactos inexistentes;
- páginas indexables fuera del sitemap;
- páginas `noindex` dentro del sitemap;
- canonical relativos o inconsistentes;
- títulos y descripciones ausentes o duplicados;
- más o menos de un `h1`;
- salto de `h1` a `h3`;
- ausencia de fuentes primarias en resultados que dependen de datasets externos;
- cambios destructivos de número de figuras, tablas o secciones;
- HTML generado diferente después de ejecutar el sync;
- errores de consola;
- overflow horizontal;
- regresiones de contraste;
- regresiones Lighthouse;
- diferencias entre versiones de assets del shell;
- dependencia externa sin versión exacta.

## 22. Aspectos positivos que deben preservarse al trabajar estas críticas

Aunque el documento se centra en problemas, cualquier cambio debe conservar:

- despliegue estático sencillo;
- ausencia de framework innecesario;
- rapidez de carga;
- estética sobria;
- densidad visual controlada;
- claims delimitados;
- publicación de limitaciones;
- artefactos replayables;
- contratos de evaluación;
- respeto por reduced motion;
- navegación sencilla;
- dark mode;
- posibilidad de inspección técnica antes del contacto.

El objetivo no debe ser convertir Göther en una web SaaS genérica. Debe completar la confianza, la trazabilidad y la conversión manteniendo su carácter de laboratorio técnico riguroso.
