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

    function cargarCatalogo() {
        const cfg = window.ELROJO_CONFIG || {};

        return Promise.resolve()
            .then(() => {
                if (cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase) {
                    const sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
                    return Promise.all([
                        sb.from("categorias").select("id,nombre,orden").order("orden"),
                        sb.from("productos").select("*").order("actualizado_en", { ascending: false })
                    ]).then(([rc, rp]) => {
                        if (rc.error || rp.error) throw rc.error || rp.error;
                        categorias = (rc.data || []).map(c => ({ id: c.id, nombre: c.nombre }));
                        catalogo = (rp.data || []).map(mapearProducto);

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

        observarReveal();
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
    const previewTag = $("#preview-tag");
    const opProducto = $("#op-producto");
    const opColor = $("#op-color");
    const opTexto = $("#op-texto");
    const opAcabado = $("#op-acabado");
    const opContacto = $("#op-contacto");
    const precioEstimado = $("#precio-estimado");

    const EXTRA_ACABADO = { "Mate": 0, "Brillante": 4000 };

    function actualizarPreview() {
        const p = getProducto(opProducto.value);
        previewImg.src = (p && p.img) ? p.img : PLACEHOLDER;
        const texto = (opTexto.value || "ELROJO").toUpperCase();
        previewTag.textContent = texto.slice(0, 14);
    }

    function actualizarPrecio() {
        const p = getProducto(opProducto.value);
        const total = (p ? p.precio : 0) + (EXTRA_ACABADO[opAcabado.value] || 0);
        precioEstimado.textContent = fmt(total);
        return total;
    }

    [opProducto, opTexto, opAcabado].forEach(el =>
        el.addEventListener("input", () => { actualizarPreview(); actualizarPrecio(); })
    );

    $("#btn-cotizar").addEventListener("click", () => {
        const texto = opTexto.value.trim();
        const contacto = opContacto.value.trim();
        if (!texto) { toast("Escribe el texto para tu diseño"); opTexto.focus(); return; }
        if (!contacto) { toast("Deja tu nombre o contacto para la cotización"); opContacto.focus(); return; }

        const p = getProducto(opProducto.value);
        const mensaje = [
            "Hola 👋 Quiero pedir una cotización personalizada:",
            "• Producto: *" + (p ? p.nombre : opProducto.value) + "*",
            "• Color: " + opColor.value,
            "• Texto: " + texto,
            "• Acabado: " + opAcabado.value,
            "• Contacto: " + contacto,
            "• Precio estimado: *" + fmt(actualizarPrecio()) + "*"
        ].join("\n");

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

        actualizarPreview();
        actualizarPrecio();
    })();

})();
