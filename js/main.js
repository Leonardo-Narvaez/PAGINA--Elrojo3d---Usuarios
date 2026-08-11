console.log("ELROJO STUDIO iniciado correctamente.");

(function () {

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    /* ===== utilidades ===== */
    const fmt = (n) => "$" + Math.round(n).toLocaleString("es-CO");
    const PLACEHOLDER = "images/products/placeholder.png";
    const toast = (msg) => {
        const t = $("#toast");
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove("show"), 2400);
    };

    /* ===== WHATSAPP (desde la configuración de Supabase) ===== */
    let WHATSAPP = ((window.ELROJO_CONFIG || {}).whatsapp || "").replace(/\D/g, "");
    let mantenimientoActivo = false;

    function abrirWhatsApp(mensaje) {
        if (!WHATSAPP) { toast("Configura tu número de WhatsApp en js/config.js"); return; }
        window.open("https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(mensaje), "_blank");
    }

    function mensajeProducto(p) {
        if (p.precio > 0) {
            return "Hola 👋 Quiero comprar el *" + p.nombre + "* por *" + fmt(p.precio) + "*.\n¿Está disponible?";
        }
        return "Hola 👋 Quiero cotizar el *" + p.nombre + "*.\n¿Me envías el precio?";
    }

    /* ===== CATÁLOGO (Supabase con fallback a data/productos.json) ===== */
    let catalogo = [];
    let categorias = [];
    let camposCatalog = {};
    let coloresLista = [];
    let filtroActual = "todos";
    let textoBusqueda = "";

    const getProducto = (id) => catalogo.find(p => p.id === id);

    function mapearProducto(p) {
        const imgs = Array.isArray(p.imgs) && p.imgs.length
            ? p.imgs
            : (p.img ? [{ url: p.img, principal: true }] : []);
        const principal = imgs.find(i => i.principal) || imgs[0];
        const campos = (Array.isArray(p.campos) ? p.campos : [])
            .map(c => (typeof c === "string" ? c : c.id))
            .filter(c => camposCatalog[c]);
        return {
            id: p.slug,
            nombre: p.nombre,
            desc: p.descripcion || "",
            descCorta: p.descripcion_corta || "",
            precio: Number(p.precio) || 0,
            img: principal ? principal.url : (p.img || ""),
            imgs: imgs.map(i => i.url),
            categoria: p.categoria,
            disponible: p.disponible,
            personalizable: !!p.personalizable,
            campos,
            feats: p.feats || []
        };
    }

    function llenarColores(lista) {
        if (lista && lista.length) coloresLista = lista;
    }

    function transformarSelect(sel) {
        if (!sel || sel.dataset.dropdown) return;

        const cont = document.createElement("div");
        cont.className = "dropdown";

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "dropdown-btn";
        const ico = document.createElement("span");
        ico.className = "dropdown-ico";
        const label = document.createElement("span");
        label.className = "dropdown-label";
        const arrow = document.createElement("span");
        arrow.className = "dropdown-arrow";
        arrow.textContent = "▾";
        btn.append(ico, label, arrow);

        const list = document.createElement("ul");
        list.className = "dropdown-list";
        list.hidden = true;

        const actualizar = () => {
            const opt = sel.options[sel.selectedIndex];
            const nombre = opt ? opt.text : "";
            label.textContent = nombre;
            if (opt && opt.dataset.hex) {
                ico.style.display = "";
                ico.style.background = opt.dataset.hex;
            } else {
                ico.style.display = "none";
            }
        };

        const cerrar = () => { list.hidden = true; };

        [...sel.options].forEach(opt => {
            const li = document.createElement("li");
            if (opt.dataset.hex) {
                const sw = document.createElement("span");
                sw.className = "dropdown-swatch";
                sw.style.background = opt.dataset.hex;
                li.appendChild(sw);
            }
            const txt = document.createElement("span");
            txt.textContent = opt.text;
            li.append(txt);
            li.addEventListener("click", () => {
                sel.value = opt.value;
                actualizar();
                cerrar();
                sel.dispatchEvent(new Event("change", { bubbles: true }));
            });
            list.appendChild(li);
        });

        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            document.querySelectorAll(".dropdown-list:not([hidden])").forEach(l => l.hidden = true);
            list.hidden = !list.hidden;
        });

        document.addEventListener("click", (e) => {
            if (!cont.contains(e.target)) cerrar();
        });

        cont.append(btn, list);
        sel.parentNode.insertBefore(cont, sel);
        cont.appendChild(sel);
        sel.hidden = true;
        sel.dataset.dropdown = "1";

        actualizar();
    }

    function cargarCatalogo() {
        const cfg = window.ELROJO_CONFIG || {};

        return Promise.resolve()
            .then(() => {
                if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
                    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
                    return Promise.all([
                        sb.from("categorias").select("id,nombre,orden").order("orden"),
                        sb.from("productos").select("*").order("actualizado_en", { ascending: false }),
                        sb.from("colores").select("nombre,hex,orden").order("orden"),
                        sb.from("campos_personalizacion").select("id,nombre,tipo,opciones,maxlength").eq("activo", true).order("orden")
                    ]).then(([rc, rp, rcol, rcamp]) => {
                        if (rc.error || rp.error) throw rc.error || rp.error;
                        categorias = (rc.data || []).map(c => ({ id: c.id, nombre: c.nombre }));
                        (rcamp.data || []).forEach(c => { camposCatalog[c.id] = c; });
                        catalogo = (rp.data || []).map(mapearProducto);
                        if (!rcol.error) llenarColores(rcol.data || []);

                        sb.from("configuracion")
                            .select("clave,valor")
                            .then((rcfg) => {
                                if (rcfg.data) {
                                    rcfg.data.forEach(fila => {
                                        if (fila.clave === "whatsapp" && fila.valor) {
                                            WHATSAPP = String(fila.valor).replace(/\D/g, "");
                                        }
                                        if (fila.clave === "mantenimiento") {
                                            mantenimientoActivo = fila.valor === "1";
                                        }
                                    });
                                }
                            })
                            .catch(() => {})
                            .then(() => aplicarMantenimiento());
                    });
                }
                throw new Error("sin supabase");
            })
            .then(() => {
                categorias = categorias.filter(c => c.id !== "todos");
            });
    }

    /* ===== RENDER TARJETAS + FILTROS ===== */
    function productosFiltrados() {
        const term = textoBusqueda.toLowerCase();
        return catalogo.filter(p => {
            if (!p.disponible) return false;
            if (filtroActual !== "todos" && p.categoria !== filtroActual) return false;
            if (term && !(p.nombre + " " + p.desc + " " + (p.descCorta || "")).toLowerCase().includes(term)) return false;
            return true;
        });
    }

    const MAX_PILLS = 10;

    function renderFiltros() {
        const cont = $("#filtro-categorias");
        if (!cont) return;
        let html = `<button class="filtro-btn ${filtroActual === "todos" ? "activo" : ""}" data-filtro="todos">Todos</button>`;
        html += categorias.slice(0, MAX_PILLS).map(c =>
            `<button class="filtro-btn ${filtroActual === c.id ? "activo" : ""}" data-filtro="${c.id}">${c.nombre}</button>`
        ).join("");
        cont.innerHTML = html;

        if (categorias.length > MAX_PILLS) {
            const extra = categorias.slice(MAX_PILLS);
            const sel = document.createElement("select");
            sel.className = "filtro-mas";
            sel.setAttribute("aria-label", "Más categorías");
            sel.innerHTML = '<option value="">Más categorías ▾</option>' +
                extra.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
            if (extra.some(c => c.id === filtroActual)) sel.value = filtroActual;
            cont.appendChild(sel);
        }

        const selMobile = $("#filtro-select");
        if (!selMobile) return;
        selMobile.innerHTML = '<option value="todos">Todos</option>' +
            categorias.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
        selMobile.value = filtroActual;
    }

    function renderTarjetas() {
        const cont = $("#cards-container");
        if (!cont) return;
        const list = productosFiltrados();

        if (!list.length) {
            cont.innerHTML = '<div class="cards-empty">No se encontraron productos.</div>';
            configurarCarrusel();
            observarReveal();
            return;
        }

        cont.innerHTML = list.map((p, i) => `
            <div class="card" data-product="${p.id}" style="--d:${(i % 8) * 70}ms">
                <div class="product-image">
                    <img src="${p.img || PLACEHOLDER}" alt="${p.nombre}" loading="lazy">
                </div>
                <div class="card-content">
                    <h3>${p.nombre}</h3>
                    <p>${p.descCorta || p.desc}</p>
                    <div class="price">${p.precio > 0 ? "Desde " + fmt(p.precio) : "Cotizar"}</div>
                    <div class="card-buttons">
                        <button class="small-btn" data-action="more">Ver más</button>
                        <button class="small-btn red" data-action="buy">Comprar</button>
                    </div>
                </div>
            </div>
        `).join("");

        configurarCarrusel();
        observarReveal();
    }

    /* ===== CARRUSEL DE PRODUCTOS ===== */
    let carruselViewport = null;

    function actualizarBotonesCarrusel() {
        const vp = carruselViewport;
        if (!vp) return;
        const wrap = vp.closest(".carousel-wrap");
        if (!wrap) return;
        const prev = wrap.querySelector("[data-carousel='prev']");
        const next = wrap.querySelector("[data-carousel='next']");
        const max = vp.scrollWidth - vp.clientWidth - 2;
        prev.disabled = vp.scrollLeft <= 2;
        next.disabled = vp.scrollLeft >= max;
    }

    function actualizarDotsCarrusel() {
        const vp = carruselViewport;
        const wrap = vp ? vp.closest(".carousel-wrap") : null;
        const dotsWrap = wrap ? wrap.querySelector(".carousel-dots") : null;
        if (!vp || !dotsWrap) return;
        const cards = Array.from(vp.querySelectorAll(".card"));
        if (!cards.length) {
            dotsWrap.innerHTML = "";
            return;
        }
        dotsWrap.classList.toggle("hidden-dots", cards.length > 24);
        if (dotsWrap.children.length !== cards.length) {
            dotsWrap.innerHTML = cards.map((_, i) =>
                `<button type="button" class="carousel-dot" data-dot="${i}" aria-label="Producto ${i + 1}"></button>`
            ).join("");
        }
        const centro = vp.scrollLeft + vp.clientWidth / 2;
        let idx = 0, mejor = Infinity;
        cards.forEach((c, i) => {
            const medio = c.offsetLeft + c.offsetWidth / 2;
            const d = Math.abs(medio - centro);
            if (d < mejor) { mejor = d; idx = i; }
        });
        dotsWrap.querySelectorAll(".carousel-dot").forEach((b, i) => b.classList.toggle("activo", i === idx));
    }

    function configurarCarrusel() {
        carruselViewport = $("#cards-container");
        const wrap = carruselViewport ? carruselViewport.closest(".carousel-wrap") : null;
        if (!carruselViewport || !wrap) return;

        const prev = wrap.querySelector("[data-carousel='prev']");
        const next = wrap.querySelector("[data-carousel='next']");

        carruselViewport.scrollLeft = 0;

        const easeInOutCubic = (t) => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

        let animando = false;

        /* --- móvil: indicador de progreso + pista "desliza" --- */
        const dotsWrap = wrap.querySelector(".carousel-dots");
        const hint = wrap.querySelector(".carousel-hint");
        let hintOculto = false;

        function ocultarHint() {
            if (hint && !hintOculto) { hintOculto = true; hint.classList.add("oculto"); }
        }

        if (hint) setTimeout(ocultarHint, 5000);

        if (dotsWrap && !dotsWrap.dataset.wired) {
            dotsWrap.dataset.wired = "1";
            dotsWrap.addEventListener("click", (e) => {
                const b = e.target.closest("[data-dot]");
                if (!b) return;
                const card = carruselViewport.querySelectorAll(".card")[Number(b.dataset.dot)];
                if (!card) return;
                const destino = card.offsetLeft - (carruselViewport.clientWidth - card.offsetWidth) / 2;
                carruselViewport.scrollTo({ left: Math.max(0, destino), behavior: "smooth" });
                ocultarHint();
            });
        }

        function resaltarCentral() {
            const cards = carruselViewport.querySelectorAll(".card");
            const centro = carruselViewport.scrollLeft + carruselViewport.clientWidth / 2;
            let mejor = cards[0];
            cards.forEach(c => {
                const medio = c.offsetLeft + c.offsetWidth / 2;
                if (Math.abs(medio - centro) < Math.abs((mejor.offsetLeft + mejor.offsetWidth / 2) - centro)) mejor = c;
            });
            cards.forEach(c => c.classList.toggle("centro", c === mejor));
        }

        function mover(dir) {
            if (animando) return;
            const cards = carruselViewport.querySelectorAll(".card");
            if (!cards.length) return;
            let objetivo;
            if (dir > 0) {
                objetivo = [...cards].find(c => c.offsetLeft > carruselViewport.scrollLeft + 10) || cards[cards.length - 1];
            } else {
                const anteriores = [...cards].filter(c => c.offsetLeft < carruselViewport.scrollLeft - 10);
                objetivo = anteriores.length ? anteriores[anteriores.length - 1] : cards[0];
            }

            const inicioX = carruselViewport.scrollLeft;
            const destinoX = Math.max(0, objetivo.offsetLeft);
            const delta = destinoX - inicioX;
            if (Math.abs(delta) < 2) return;

            animando = true;
            const duracion = 1100;
            const t0 = performance.now();

            function paso(ahora) {
                const t = Math.min((ahora - t0) / duracion, 1);
                carruselViewport.scrollLeft = inicioX + delta * easeInOutCubic(t);
                if (t < 1) {
                    requestAnimationFrame(paso);
                } else {
                    animando = false;
                    actualizarBotonesCarrusel();
                    resaltarCentral();
                }
            }
            requestAnimationFrame(paso);
        }

        prev.onclick = () => mover(-1);
        next.onclick = () => mover(1);
        carruselViewport.onscroll = () => {
            actualizarBotonesCarrusel();
            resaltarCentral();
            actualizarDotsCarrusel();
            ocultarHint();
        };
        if (!carruselViewport.querySelectorAll(".card").length) ocultarHint();
        actualizarBotonesCarrusel();
        actualizarDotsCarrusel();
        resaltarCentral();
    }

    document.addEventListener("click", (e) => {
        const fb = e.target.closest(".filtro-btn");
        if (!fb) return;
        filtroActual = fb.dataset.filtro;
        renderFiltros();
        renderTarjetas();
    });

    $("#buscar").addEventListener("input", (e) => {
        textoBusqueda = e.target.value.trim();
        renderTarjetas();
    });

    $("#filtro-select").addEventListener("change", (e) => {
        filtroActual = e.target.value;
        renderFiltros();
        renderTarjetas();
    });

    document.addEventListener("change", (e) => {
        const t = e.target;
        if (t && t.className === "filtro-mas" && t.value) {
            filtroActual = t.value;
            renderFiltros();
            renderTarjetas();
        }
    });

    function llenarPersonalizador() {
        const sel = $("#op-producto");
        if (!sel) return;
        const lista = catalogo.filter(p => p.disponible && p.personalizable);
        sel.innerHTML = lista.map(p =>
            `<option value="${p.id}">${p.nombre}</option>`
        ).join("");
        const aviso = $("#personalizador-vacio");
        if (aviso) aviso.hidden = lista.length > 0;
    }

    /* ===== NAV: scroll suave + activo ===== */
    document.addEventListener("click", (e) => {
        const t = e.target.closest("[data-scroll], nav a[href^='#']");
        if (!t) return;
        e.preventDefault();
        const target = t.dataset.scroll || t.getAttribute("href");
        const el = $(target);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
    });

    const navLinks = $$("nav a[href^='#']");
    const secciones = [...navLinks].map(a => $(a.getAttribute("href"))).filter(Boolean);

    window.addEventListener("scroll", () => {
        const pos = window.scrollY + 120;
        let actual = secciones[0];
        secciones.forEach(s => { if (s.offsetTop <= pos) actual = s; });
        navLinks.forEach(a => a.classList.toggle("active", a.getAttribute("href") === "#" + actual.id));
    }, { passive: true });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") cerrarModal();
        if (modal.classList.contains("open")) {
            if (e.key === "ArrowLeft") moverGaleria(-1);
            if (e.key === "ArrowRight") moverGaleria(1);
        }
    });

    /* ===== TARJETAS: Ver más / Comprar ===== */
    document.addEventListener("click", (e) => {
        const btn = e.target.closest("[data-action]");
        if (!btn) return;
        const card = btn.closest(".card");
        if (!card) return;
        const id = card.dataset.product;
        if (btn.dataset.action === "more") abrirModal(id);
        if (btn.dataset.action === "buy") {
            const p = getProducto(id);
            if (p) abrirWhatsApp(mensajeProducto(p));
        }
    });

    /* ===== MODAL ===== */
    const modal = $("#modal");
    const modalImg = $("#modal-img");
    const modalDots = $("#modal-dots");
    const modalTitle = $("#modal-title");
    const modalDesc = $("#modal-desc");
    const modalFeats = $("#modal-feats");
    const modalPrice = $("#modal-price");
    const modalPrev = $("#modal-prev");
    const modalNext = $("#modal-next");

    let galeria = [];
    let galeriaIdx = 0;
    const AUTOPLAY_MS = 3500;
    let autoplayTimer = null;

    function renderGaleria() {
        if (!galeria.length) {
            modalPrev.hidden = modalNext.hidden = modalDots.hidden = true;
            return;
        }
        const una = galeria.length === 1;
        modalPrev.hidden = modalNext.hidden = una;
        modalImg.classList.remove("fade-in");
        void modalImg.offsetWidth;
        modalImg.classList.add("fade-in");
        modalImg.src = galeria[galeriaIdx];
        modalImg.alt = modalTitle.textContent;
        modalDots.innerHTML = galeria.map((_, i) =>
            `<button type="button" class="modal-dot${i === galeriaIdx ? " activo" : ""}" data-dot="${i}" aria-label="Foto ${i + 1}"></button>`
        ).join("");
        modalDots.hidden = una;
    }

    function reprogramarAutoplay() {
        detenerAutoplay();
        if (galeria.length > 1 && modal.classList.contains("open")) {
            autoplayTimer = setTimeout(() => moverGaleria(1), AUTOPLAY_MS);
        }
    }

    function detenerAutoplay() {
        if (autoplayTimer) { clearTimeout(autoplayTimer); autoplayTimer = null; }
    }

    function moverGaleria(dir) {
        if (!galeria.length) return;
        galeriaIdx = (galeriaIdx + dir + galeria.length) % galeria.length;
        renderGaleria();
        reprogramarAutoplay();
    }

    function irGaleria(i) {
        if (!galeria.length) return;
        galeriaIdx = (i + galeria.length) % galeria.length;
        renderGaleria();
        reprogramarAutoplay();
    }

    modalPrev.addEventListener("click", () => moverGaleria(-1));
    modalNext.addEventListener("click", () => moverGaleria(1));
    modalDots.addEventListener("click", (e) => {
        const d = e.target.closest("[data-dot]");
        if (d) irGaleria(Number(d.dataset.dot));
    });

    modal.addEventListener("mouseenter", detenerAutoplay);
    modal.addEventListener("mouseleave", reprogramarAutoplay);

    let touchX = null;
    modalImg.addEventListener("touchstart", (e) => { touchX = e.touches[0].clientX; }, { passive: true });
    modalImg.addEventListener("touchend", (e) => {
        if (touchX === null) return;
        const dx = e.changedTouches[0].clientX - touchX;
        touchX = null;
        if (Math.abs(dx) > 40) moverGaleria(dx < 0 ? 1 : -1);
    }, { passive: true });

    function abrirModal(id) {
        const p = getProducto(id);
        if (!p) return;
        galeria = (p.imgs && p.imgs.length) ? p.imgs.slice() : [p.img || PLACEHOLDER];
        galeriaIdx = 0;
        modalTitle.textContent = p.nombre;
        modalDesc.textContent = p.desc;
        modalFeats.innerHTML = (p.feats || []).map(f => `<li>${f}</li>`).join("");
        modalPrice.textContent = p.precio > 0 ? fmt(p.precio) : "Cotizar";
        modal.dataset.product = id;
        renderGaleria();
        modal.classList.add("open");
        reprogramarAutoplay();
        document.body.style.overflow = "hidden";
    }

    function cerrarModal() {
        modal.classList.remove("open");
        detenerAutoplay();
        document.body.style.overflow = "";
    }

    $("#modal-close").addEventListener("click", cerrarModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) cerrarModal(); });
    $("#modal-buy").addEventListener("click", () => {
        const p = getProducto(modal.dataset.product);
        if (!p) return;
        abrirWhatsApp(mensajeProducto(p));
        cerrarModal();
    });

    /* ===== PERSONALIZADOR ===== */
    const previewImg = $("#preview-img");
    const opProducto = $("#op-producto");
    const contCampos = $("#campos-personalizador");
    const precioEstimado = $("#precio-estimado");

    function obtenerCamposProducto() {
        const p = getProducto(opProducto.value);
        return p && p.campos ? p.campos : [];
    }

    function renderCampo(cid) {
        const c = camposCatalog[cid];
        if (!c) return "";
        const div = document.createElement("div");
        const label = document.createElement("label");
        label.textContent = c.nombre;
        div.appendChild(label);

        let input;
        if (c.tipo === "color") {
            input = document.createElement("select");
            input.innerHTML = '<option value="" data-hex="">Elegir</option>' +
                coloresLista.map(co => `<option value="${co.nombre}" data-hex="${co.hex}">${co.nombre}</option>`).join("");
        } else if (c.tipo === "opciones") {
            input = document.createElement("select");
            const opts = Array.isArray(c.opciones) ? c.opciones : [];
            input.innerHTML = '<option value="">Elegir</option>' +
                opts.map(o => `<option value="${o}">${o}</option>`).join("");
        } else {
            input = document.createElement("input");
            input.type = "text";
            if (c.maxlength) input.maxLength = c.maxlength;
            if (c.id === "contacto") input.placeholder = "Tu nombre o @usuario";
            else if (c.id === "texto") input.placeholder = "Tu nombre o frase corta";
        }
        input.dataset.campo = c.id;
        div.appendChild(input);
        return div;
    }

    function renderCamposPersonalizador() {
        const campos = obtenerCamposProducto();
        contCampos.innerHTML = "";
        campos.forEach(cid => {
            const nodo = renderCampo(cid);
            if (nodo) {
                contCampos.appendChild(nodo);
                const sel = nodo.querySelector("select");
                if (sel) transformarSelect(sel);
            }
        });
    }

    function actualizarPreview() {
        const p = getProducto(opProducto.value);
        previewImg.src = (p && p.img) ? p.img : PLACEHOLDER;
    }

    function actualizarPrecio() {
        const p = getProducto(opProducto.value);
        const total = (p ? p.precio : 0);
        precioEstimado.textContent = fmt(total);
        return total;
    }

    opProducto.addEventListener("change", () => {
        renderCamposPersonalizador();
        actualizarPreview();
        actualizarPrecio();
    });

    $("#btn-cotizar").addEventListener("click", () => {
        const p = getProducto(opProducto.value);
        if (!p) { toast("Selecciona un producto"); return; }

        const campos = p.campos || [];
        const valores = {};
        for (const cid of campos) {
            const c = camposCatalog[cid];
            const input = contCampos.querySelector(`[data-campo="${cid}"]`);
            const val = (input ? input.value : "").trim();
            if (!val) {
                toast("Completa: " + (c ? c.nombre : "el campo"));
                const d = input ? input.closest(".dropdown") : null;
                if (d) d.scrollIntoView({ behavior: "smooth", block: "center" });
                else if (input) input.focus();
                return;
            }
            valores[cid] = val;
        }

        const lineas = [
            "Hola 👋 Quiero pedir una cotización personalizada:",
            "• Producto: *" + p.nombre + "*"
        ];
        campos.forEach(cid => {
            const c = camposCatalog[cid];
            lineas.push("• " + (c ? c.nombre : cid) + ": " + valores[cid]);
        });
        lineas.push("• Precio estimado: *" + fmt(actualizarPrecio()) + "*");

        abrirWhatsApp(lineas.join("\n"));
    });

    /* ===== LOGO DE LA PÁGINA (ruta fija) ===== */
    const LOGO_PATH = "images/logo/logo.svg";

    try {
        $("#header-logo img").src = LOGO_PATH;
        $("#footer-logo img").src = LOGO_PATH;
    } catch (e) {
        /* el resto de la página sigue funcionando incluso si falta el logo */
    }

    /* ===== REVEAL ON SCROLL ===== */
    const io = window.IntersectionObserver
        ? new IntersectionObserver((entries) => {
            entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); } });
        }, { threshold: 0.12 })
        : { observe() {}, unobserve() {}, disconnect() {} };

    const enPantalla = (el) => {
        const r = el.getBoundingClientRect();
        const alto = window.innerHeight || document.documentElement.clientHeight;
        return r.top < alto && r.bottom > 0;
    };

    /* Refuerzo: en móvil IntersectionObserver no siempre notifica.
       Cualquier elemento que entre a la pantalla se muestra igualmente. */
    window.addEventListener("scroll", () => {
        document.querySelectorAll(".reveal:not(.visible)").forEach(el => {
            if (enPantalla(el)) { el.classList.add("visible"); io.unobserve(el); }
        });
    }, { passive: true });

    function observarReveal() {
        $$(".section:not(.visible)").forEach(el => {
            if (enPantalla(el)) {
                el.classList.add("visible");
            } else {
                el.classList.add("reveal");
                io.observe(el);
            }
        });
    }

    /* ===== MANTENIMIENTO ===== */
    const TEXTO_MANTENIMIENTO = "Estamos en mantenimiento. Estamos calibrando la impresora para traerte el catálogo al 100%. Vuelve en unos minutos.";

    function aplicarMantenimiento() {
        const b = $("#banner-mantenimiento");
        const wrap = document.querySelector(".carousel-wrap");
        const filtros = document.querySelector(".filtros");
        const nav = document.querySelector("#home-content nav");
        const botones = document.querySelector(".hero .buttons");
        const secciones = ["#productos", "#personalizar", "#testimonios"];

        if (mantenimientoActivo) {
            if (b) { b.textContent = TEXTO_MANTENIMIENTO; b.hidden = false; }
            if (wrap) wrap.hidden = true;
            if (filtros) filtros.hidden = true;
            if (nav) nav.hidden = true;
            if (botones) botones.hidden = true;
            secciones.forEach(s => { const el = document.querySelector(s); if (el) el.hidden = true; });
            ocultarErrorCatalogo();
        } else {
            if (b) b.hidden = true;
            if (wrap) wrap.hidden = false;
            if (filtros) filtros.hidden = false;
            if (nav) nav.hidden = false;
            if (botones) botones.hidden = false;
            secciones.forEach(s => { const el = document.querySelector(s); if (el) el.hidden = false; });
        }
    }

    /* ===== ERROR DE CATÁLOGO ===== */
    function mostrarErrorCatalogo() {
        const wrap = document.querySelector(".carousel-wrap");
        const err = $("#catalog-error");
        if (wrap) wrap.hidden = true;
        if (err) err.hidden = false;
    }

    function ocultarErrorCatalogo() {
        const wrap = document.querySelector(".carousel-wrap");
        const err = $("#catalog-error");
        if (wrap) wrap.hidden = false;
        if (err) err.hidden = true;
    }

    function reintentar() {
        ocultarErrorCatalogo();
        cargarCatalogo()
            .then(() => {
                aplicarMantenimiento();
                renderFiltros();
                renderTarjetas();
            })
            .catch(() => mostrarErrorCatalogo());
    }

    /* ===== init ===== */
    (async function init() {
        observarReveal();

        $("#btn-reintentar").addEventListener("click", reintentar);

        try {
            await cargarCatalogo();
            aplicarMantenimiento();
            renderFiltros();
            renderTarjetas();
            llenarPersonalizador();
            renderCamposPersonalizador();
            window.addEventListener("resize", () => { actualizarBotonesCarrusel(); actualizarDotsCarrusel(); });
            actualizarPreview();
            actualizarPrecio();
        } catch (e) {
            aplicarMantenimiento();
            mostrarErrorCatalogo();
        }
    })();

})();
