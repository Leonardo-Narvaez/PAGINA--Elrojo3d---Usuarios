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

    function abrirWhatsApp(mensaje) {
        if (!WHATSAPP) { toast("Configura tu número de WhatsApp en js/config.js"); return; }
        window.open("https://wa.me/" + WHATSAPP + "?text=" + encodeURIComponent(mensaje), "_blank");
    }

    function mensajeProducto(p) {
        return "Hola 👋 Quiero comprar el *" + p.nombre + "* por *" + fmt(p.precio) + "*.\n¿Está disponible?";
    }

    /* ===== CATÁLOGO (Supabase con fallback a data/productos.json) ===== */
    let catalogo = [];
    let categorias = [];
    let filtroActual = "todos";
    let textoBusqueda = "";

    const getProducto = (id) => catalogo.find(p => p.id === id);

    function mapearProducto(p) {
        return {
            id: p.slug,
            nombre: p.nombre,
            desc: p.descripcion || "",
            descCorta: p.descripcion_corta || "",
            precio: Number(p.precio) || 0,
            img: p.img || "",
            categoria: p.categoria,
            disponible: p.disponible,
            feats: p.feats || []
        };
    }

    function llenarColores(lista) {
        if (!lista || !lista.length) return;
        const opts = '<option value="" data-hex="">Elegir</option>' +
            lista.map(c => `<option value="${c.nombre}" data-hex="${c.hex}">${c.nombre}</option>`).join("");
        const sel = $("#op-color");
        const selTxt = $("#op-color-texto");
        if (sel) { sel.innerHTML = opts; transformarSelect(sel); }
        if (selTxt) { selTxt.innerHTML = opts; transformarSelect(selTxt); }
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
                        sb.from("colores").select("nombre,hex,orden").order("orden")
                    ]).then(([rc, rp, rcol]) => {
                        if (rc.error || rp.error) throw rc.error || rp.error;
                        categorias = (rc.data || []).map(c => ({ id: c.id, nombre: c.nombre }));
                        catalogo = (rp.data || []).map(mapearProducto);
                        if (!rcol.error) llenarColores(rcol.data || []);

                        sb.from("configuracion")
                            .select("clave,valor")
                            .eq("clave", "whatsapp")
                            .maybeSingle()
                            .then((rcfg) => {
                                if (!rcfg.error && rcfg.data && rcfg.data.valor) {
                                    WHATSAPP = String(rcfg.data.valor).replace(/\D/g, "");
                                }
                            })
                            .catch(() => {});
                    });
                }
                throw new Error("sin supabase");
            })
            .catch(() =>
                fetch("data/productos.json").then(r => {
                    if (!r.ok) throw new Error("HTTP " + r.status);
                    return r.json();
                }).then(data => {
                    catalogo = data.productos || [];
                    categorias = data.categorias || [];
                })
            )
            .then(() => {
                categorias = categorias.filter(c => c.id !== "todos");
            })
            .catch(() => {
                $("#cards-container").innerHTML =
                    '<div class="cards-empty">No se pudo cargar el catálogo.<br>Revisa tu conexión o la configuración de Supabase.</div>';
                throw new Error("catálogo no disponible");
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

    function renderFiltros() {
        const cont = $("#filtro-categorias");
        if (!cont) return;
        const todos = `<button class="filtro-btn ${filtroActual === "todos" ? "activo" : ""}" data-filtro="todos">Todos</button>`;
        cont.innerHTML = todos + categorias.map(c =>
            `<button class="filtro-btn ${filtroActual === c.id ? "activo" : ""}" data-filtro="${c.id}">${c.nombre}</button>`
        ).join("");
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

        cont.innerHTML = list.map(p => `
            <div class="card" data-product="${p.id}">
                <div class="product-image">
                    <img src="${p.img || PLACEHOLDER}" alt="${p.nombre}" loading="lazy">
                </div>
                <div class="card-content">
                    <h3>${p.nombre}</h3>
                    <p>${p.descCorta || p.desc}</p>
                    <div class="price">Desde ${fmt(p.precio)}</div>
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

    function configurarCarrusel() {
        carruselViewport = $("#cards-container");
        const wrap = carruselViewport ? carruselViewport.closest(".carousel-wrap") : null;
        if (!carruselViewport || !wrap) return;

        const prev = wrap.querySelector("[data-carousel='prev']");
        const next = wrap.querySelector("[data-carousel='next']");

        carruselViewport.scrollLeft = 0;

        const mover = (dir) => carruselViewport.scrollBy({
            left: dir * Math.max(carruselViewport.clientWidth * 0.85, 300),
            behavior: "smooth"
        });

        prev.onclick = () => mover(-1);
        next.onclick = () => mover(1);
        carruselViewport.onscroll = actualizarBotonesCarrusel;
        actualizarBotonesCarrusel();
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

    function llenarPersonalizador() {
        const sel = $("#op-producto");
        if (!sel) return;
        sel.innerHTML = catalogo.filter(p => p.disponible).map(p =>
            `<option value="${p.id}">${p.nombre}</option>`
        ).join("");
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

    document.addEventListener("keydown", (e) => { if (e.key === "Escape") cerrarModal(); });

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
    const modalTitle = $("#modal-title");
    const modalDesc = $("#modal-desc");
    const modalFeats = $("#modal-feats");
    const modalPrice = $("#modal-price");

    function abrirModal(id) {
        const p = getProducto(id);
        if (!p) return;
        modalImg.src = p.img || PLACEHOLDER;
        modalImg.alt = p.nombre;
        modalTitle.textContent = p.nombre;
        modalDesc.textContent = p.desc;
        modalFeats.innerHTML = (p.feats || []).map(f => `<li>${f}</li>`).join("");
        modalPrice.textContent = fmt(p.precio);
        modal.dataset.product = id;
        modal.classList.add("open");
        document.body.style.overflow = "hidden";
    }

    function cerrarModal() {
        modal.classList.remove("open");
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
    const campoColorTexto = $("#campo-color-texto");
    const opProducto = $("#op-producto");
    const opColor = $("#op-color");
    const opColorTexto = $("#op-color-texto");
    const opTexto = $("#op-texto");
    const opContacto = $("#op-contacto");
    const precioEstimado = $("#precio-estimado");

    const esPlaca = () => {
        const p = getProducto(opProducto.value);
        return (opProducto.value + " " + (p ? p.nombre : "")).toLowerCase().includes("placa");
    };

    function actualizarPreview() {
        const placa = esPlaca();
        const p = getProducto(opProducto.value);
        previewImg.src = (p && p.img) ? p.img : PLACEHOLDER;
        campoColorTexto.hidden = !placa;
        opTexto.placeholder = placa ? "Nombre / Placa / País" : "Nombre o frase corta";
    }

    function actualizarPrecio() {
        const p = getProducto(opProducto.value);
        const total = (p ? p.precio : 0);
        precioEstimado.textContent = fmt(total);
        return total;
    }

    [opProducto, opTexto].forEach(el =>
        el.addEventListener("input", () => { actualizarPreview(); actualizarPrecio(); })
    );

    $("#btn-cotizar").addEventListener("click", () => {
        const texto = opTexto.value.trim();
        const contacto = opContacto.value.trim();
        if (!texto) { toast("Escribe el texto para tu diseño"); opTexto.focus(); return; }
        if (!opColor.value) {
            toast("Elige un color principal");
            const d = opColor.closest(".dropdown");
            if (d) d.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        if (esPlaca() && !opColorTexto.value) {
            toast("Elige el color del texto");
            const d = opColorTexto.closest(".dropdown");
            if (d) d.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }
        if (!contacto) { toast("Deja tu nombre o contacto para la cotización"); opContacto.focus(); return; }

        const p = getProducto(opProducto.value);
        const lineas = [
            "Hola 👋 Quiero pedir una cotización personalizada:",
            "• Producto: *" + (p ? p.nombre : opProducto.value) + "*",
            "• Color: " + opColor.value,
            "• Texto: " + texto,
            "• Contacto: " + contacto,
            "• Precio estimado: *" + fmt(actualizarPrecio()) + "*"
        ];
        if (esPlaca()) {
            lineas.splice(4, 0, "• Color del texto: " + opColorTexto.value);
        }
        const mensaje = lineas.join("\n");

        abrirWhatsApp(mensaje);
    });

    /* ===== LOGO DE LA PÁGINA (ruta fija) ===== */
    const LOGO_PATH = "images/logo/logo.svg";

    try {
        $("#loader-logo").src = LOGO_PATH;
        $("#header-logo img").src = LOGO_PATH;
        $("#footer-logo img").src = LOGO_PATH;
    } catch (e) {
        /* el resto de la página sigue funcionando incluso si falta el logo */
    }

    /* ===== REVEAL ON SCROLL ===== */
    const io = new IntersectionObserver((entries) => {
        entries.forEach(en => { if (en.isIntersecting) { en.target.classList.add("visible"); io.unobserve(en.target); } });
    }, { threshold: 0.12 });

    function observarReveal() {
        $$(".section:not(.visible), .card:not(.visible)").forEach(el => {
            el.classList.add("reveal");
            io.observe(el);
        });
    }

    /* ===== init ===== */
    (async function init() {
        observarReveal();

        await cargarCatalogo();

        renderFiltros();
        renderTarjetas();
        llenarPersonalizador();

        window.addEventListener("resize", actualizarBotonesCarrusel);

        actualizarPreview();
        actualizarPrecio();
    })();

})();
