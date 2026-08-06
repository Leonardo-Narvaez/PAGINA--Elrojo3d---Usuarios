console.log("PANEL ELROJO 3D iniciado.");

(function () {

    const $ = (s) => document.querySelector(s);
    const $$ = (s) => document.querySelectorAll(s);

    const toast = (msg, ok = true) => {
        const t = $("#toast");
        t.style.background = ok ? "#ff3131" : "#b02020";
        t.textContent = msg;
        t.classList.add("show");
        clearTimeout(t._timer);
        t._timer = setTimeout(() => t.classList.remove("show"), 2600);
    };

    const slugify = (s) => String(s).toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    const IMG_OK = /\.(png|jpg|jpeg|svg)$/i;
    const esImagenOk = (f) => IMG_OK.test(f.name) || /^image\/(png|jpeg|svg\+xml)$/.test(f.type || "");

    function prepararImagen(file) {
        return esImagenOk(file) ? file : null;
    }

    let sb = null;
    let sesion = null;
    let editando = null;

    const cfg = (window.ELROJO_CONFIG || {});

    function iniciar() {
        if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) {
            document.querySelectorAll(".vista").forEach(v => v.hidden = true);
            toast("Configura tu URL y key de Supabase en js/config.js", false);
            throw new Error("Supabase sin configurar");
        }
        try {
            sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
        } catch (e) {
            document.querySelectorAll(".vista").forEach(v => v.hidden = true);
            toast("Revisa la URL de Supabase en js/config.js", false);
            throw e;
        }

        sb.auth.getSession().then(async ({ data }) => {
            sesion = data.session;
            if (!sesion) { refrescarVista(); return; }
            if (sesionToken && await verificarSesionActiva()) {
                iniciarVigilancia();
                refrescarVista();
            } else {
                await cerrarSesion(false, "Tu sesión ya no es válida. Inicia sesión de nuevo.");
            }
        });

        sb.auth.onAuthStateChange((_evt, s) => {
            sesion = s;
            if (s) {
                iniciarVigilancia();
            } else {
                detenerVigilancia();
            }
            refrescarVista();
        });
    }

    function refrescarVista() {
        ocultarTodo();
        if (sesion) {
            mostrarHome();
        } else {
            $("#vista-login").hidden = false;
        }
    }

    function ocultarTodo() {
        $$(".vista").forEach(v => v.hidden = true);
    }

    /* ===== NAVEGACIÓN: home + secciones ===== */
    const cargadores = {
        productos: cargarProductos,
        categorias: cargarCategorias,
        colores: cargarColores,
        ajustes: cargarConfiguracion
    };

    function irVista(nombre) {
        ocultarTodo();
        $("#vista-" + nombre).hidden = false;
        window.scrollTo(0, 0);
        if (nombre === "home") cargarHome();
        else if (cargadores[nombre]) cargadores[nombre]();
    }

    function mostrarHome() {
        irVista("home");
    }

    async function cargarHome() {
        const [p, c, co, wa] = await Promise.all([
            sb.from("productos").select("id", { count: "exact", head: true }),
            sb.from("categorias").select("id", { count: "exact", head: true }),
            sb.from("colores").select("id", { count: "exact", head: true }),
            sb.from("configuracion").select("valor").eq("clave", "whatsapp").maybeSingle()
        ]);
        $("#cnt-productos").textContent = p.count ?? 0;
        $("#cnt-categorias").textContent = c.count ?? 0;
        $("#cnt-colores").textContent = co.count ?? 0;

        const est = $("#home-wa-estado");
        if (est) {
            const val = wa && wa.data ? wa.data.valor : "";
            const on = /^\d{10,15}$/.test(val || "");
            est.textContent = on ? "● WhatsApp configurado" : "● WhatsApp no configurado";
            est.className = "home-status " + (on ? "on" : "off");
        }
    }

    document.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-nav]");
        if (!nav) return;
        irVista(nav.dataset.nav);
    });

    /* ===== SESIÓN: una sola activa + cierre por inactividad ===== */
    const SESSION_KEY = "elrojo3d_sesion_token";
    const INACTIVIDAD_MS = 10 * 60 * 1000;
    const HEARTBEAT_MS = 30 * 1000;

    let sesionToken = localStorage.getItem(SESSION_KEY) || null;
    let inactividadTimer = null;
    let heartbeatTimer = null;
    let cerrando = false;

    function generarToken() {
        if (window.crypto && window.crypto.randomUUID) return crypto.randomUUID();
        return "t-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    async function verificarSesionActiva() {
        if (!sesion) return false;
        const { data } = await sb.from("sesiones_activas")
            .select("token")
            .eq("user_id", sesion.user.id)
            .maybeSingle();
        return !!(sesionToken && data && data.token === sesionToken);
    }

    function detenerVigilancia() {
        if (inactividadTimer) clearTimeout(inactividadTimer);
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        inactividadTimer = null;
        heartbeatTimer = null;
    }

    function iniciarVigilancia() {
        detenerVigilancia();
        if (cerrando) return;
        inactividadTimer = setTimeout(() => cerrarSesion(true, "Sesión cerrada por inactividad."), INACTIVIDAD_MS);
        heartbeatTimer = setInterval(async () => {
            if (cerrando || !sesion || !sesionToken) return;
            if (!(await verificarSesionActiva())) {
                cerrarSesion(false, "Tu sesión se cerró: iniciaste sesión desde otro dispositivo.");
            }
        }, HEARTBEAT_MS);
    }

    function reiniciarInactividad() {
        if (cerrando || !sesion) return;
        if (inactividadTimer) clearTimeout(inactividadTimer);
        inactividadTimer = setTimeout(() => cerrarSesion(true, "Sesión cerrada por inactividad."), INACTIVIDAD_MS);
    }

    ["mousemove", "mousedown", "keydown", "scroll", "touchstart"].forEach(ev =>
        document.addEventListener(ev, reiniciarInactividad, { passive: true })
    );

    async function cerrarSesion(eliminarFila, msg) {
        if (cerrando) return;
        cerrando = true;
        detenerVigilancia();
        try {
            if (eliminarFila && sesion) {
                await sb.from("sesiones_activas").delete().eq("user_id", sesion.user.id);
            }
        } catch (e) {}
        sesionToken = null;
        localStorage.removeItem(SESSION_KEY);
        try {
            if (sesion) await sb.auth.signOut();
        } catch (e) {}
        sesion = null;
        cerrando = false;
        if (msg) toast(msg, false);
        refrescarVista();
    }

    /* ===== AUTH ===== */
    $("#form-login").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!sb) return;
        const err = $("#login-error");
        err.hidden = true;
        const email = $("#login-email").value.trim();
        const pass = $("#login-pass").value;

        const token = generarToken();
        sesionToken = token;
        localStorage.setItem(SESSION_KEY, token);

        const r = await sb.auth.signInWithPassword({ email, password: pass });
        if (r.error) {
            sesionToken = null;
            localStorage.removeItem(SESSION_KEY);
            err.textContent = "Error: " + r.error.message;
            err.hidden = false;
        } else {
            const { error: sesErr } = await sb.from("sesiones_activas")
                .upsert({ user_id: r.data.user.id, token }, { onConflict: "user_id" });
            if (sesErr) {
                await sb.auth.signOut();
                err.textContent = "Error: " + sesErr.message;
                err.hidden = false;
            }
        }
        $("#login-pass").value = "";
    });

    $("#btn-salir").addEventListener("click", () => cerrarSesion(true, "Sesión cerrada."));

    /* ===== CATEGORÍAS ===== */
    async function cargarCategorias() {
        const { data } = await sb.from("categorias").select("*").order("orden");
        const cats = data || [];

        const { data: prods } = await sb.from("productos").select("categoria");
        const uso = {};
        (prods || []).forEach(p => { if (p.categoria) uso[p.categoria] = (uso[p.categoria] || 0) + 1; });

        const cnt = $("#cnt-categorias-seccion");
        if (cnt) cnt.textContent = cats.length;

        const sel = $("#p-categoria");
        sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");

        $("#lista-categorias").innerHTML = cats.length ? cats.map(c => `
            <li class="mini-item">
                <span class="mini-main">${c.nombre}</span>
                <span class="mini-meta">${uso[c.id] || 0} productos</span>
                <button type="button" data-del-cat="${c.id}" title="Eliminar">✕</button>
            </li>
        `).join("") : '<li class="vacio mini-vacio">Sin categorías</li>';
    }

    $("#form-categoria").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nombre = $("#cat-nombre").value.trim();
        if (!nombre) return;
        const id = slugify(nombre);
        const { error } = await sb.from("categorias").insert({ id, nombre, orden: 0 });
        if (error) { toast("Error: " + error.message, false); return; }
        $("#cat-nombre").value = "";
        cargarCategorias();
        toast("Categoría agregada");
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-del-cat]");
        if (!btn) return;
        if (!confirm("¿Eliminar esta categoría?")) return;
        const { error } = await sb.from("categorias").delete().eq("id", btn.dataset.delCat);
        if (error) { toast("Error: " + error.message, false); return; }
        cargarCategorias();
        toast("Categoría eliminada");
    });

    /* ===== COLORES ===== */
    async function cargarColores() {
        const { data } = await sb.from("colores").select("*").order("orden");
        const cols = data || [];

        const cnt = $("#cnt-colores-seccion");
        if (cnt) cnt.textContent = cols.length;

        $("#lista-colores").innerHTML = cols.length ? cols.map(c => `
            <li class="mini-item">
                <span class="swatch" style="background:${c.hex}"></span>
                <span class="mini-main">${c.nombre}</span>
                <span class="mini-meta">${c.hex}</span>
                <button type="button" data-del-color="${c.id}" title="Eliminar">✕</button>
            </li>
        `).join("") : '<li class="vacio mini-vacio">Sin colores</li>';
    }

    $("#form-color").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nombre = $("#color-nombre").value.trim();
        const hex = $("#color-hex").value;
        if (!nombre) return;
        const { error } = await sb.from("colores").insert({ nombre, hex, orden: 0 });
        if (error) { toast("Error: " + error.message, false); return; }
        $("#color-nombre").value = "";
        cargarColores();
        toast("Color agregado");
    });

    document.addEventListener("click", async (e) => {
        const btn = e.target.closest("[data-del-color]");
        if (!btn) return;
        if (!confirm("¿Eliminar este color?")) return;
        const { error } = await sb.from("colores").delete().eq("id", btn.dataset.delColor);
        if (error) { toast("Error: " + error.message, false); return; }
        cargarColores();
        toast("Color eliminado");
    });

    /* ===== CONFIGURACIÓN ===== */
    function pintarMantenimiento(valor) {
        const on = valor === "1";
        const sw = $("#cfg-mantenimiento");
        const est = $("#mant-estado");
        const txt = $("#mant-texto");
        if (sw) sw.checked = on;
        if (est) {
            est.textContent = on ? "Mantenimiento ACTIVO" : "Mantenimiento desactivado";
            est.className = "mant-estado " + (on ? "on" : "off");
        }
        if (txt) {
            txt.textContent = on
                ? "El catálogo está oculto. Los clientes solo ven el aviso de mantenimiento."
                : "El catálogo está visible para los clientes.";
        }
    }

    function pintarWhatsApp() {
        const valor = $("#cfg-whatsapp").value.trim();
        const badge = $("#cfg-whatsapp-estado");
        if (!badge) return;
        const on = /^\d{10,15}$/.test(valor);
        badge.textContent = on ? "Configurado" : "No configurado";
        badge.className = "estado-badge " + (on ? "on" : "off");
    }

    document.addEventListener("click", (e) => {
        const btn = e.target.closest("#btn-toggle-wa");
        if (!btn) return;
        const inp = $("#cfg-whatsapp");
        inp.type = inp.type === "password" ? "tel" : "password";
        btn.textContent = inp.type === "password" ? "👁" : "🙈";
    });

    async function cargarConfiguracion() {
        const { data, error } = await sb.from("configuracion")
            .select("clave,valor")
            .eq("clave", "whatsapp")
            .maybeSingle();
        if (!error) $("#cfg-whatsapp").value = data ? data.valor : "";
        pintarWhatsApp();

        const { data: m, error: me } = await sb.from("configuracion")
            .select("clave,valor")
            .eq("clave", "mantenimiento")
            .maybeSingle();
        if (!me) pintarMantenimiento(m ? m.valor : "0");
    }

    $("#cfg-whatsapp").addEventListener("input", pintarWhatsApp);

    $("#form-config").addEventListener("submit", async (e) => {
        e.preventDefault();
        const valor = $("#cfg-whatsapp").value.trim();
        const { error } = await sb.from("configuracion")
            .upsert({ clave: "whatsapp", valor }, { onConflict: "clave" });
        if (error) { toast("Error: " + error.message, false); return; }
        pintarWhatsApp();
        toast("Número de WhatsApp guardado");
    });

    $("#cfg-mantenimiento").addEventListener("change", async (e) => {
        const activar = e.target.checked;
        if (activar) {
            const ok = confirm("¿Activar el mantenimiento? El catálogo se ocultará para los clientes mientras actualizas productos.");
            if (!ok) { e.target.checked = false; return; }
        }
        const valor = activar ? "1" : "0";
        const { error } = await sb.from("configuracion")
            .upsert({ clave: "mantenimiento", valor }, { onConflict: "clave" });
        if (error) {
            toast("Error: " + error.message, false);
            e.target.checked = !activar;
            return;
        }
        pintarMantenimiento(valor);
        toast(activar ? "Mantenimiento activado" : "Mantenimiento desactivado");
    });

    /* ===== PRODUCTOS ===== */
    let productosCache = [];

    async function cargarProductos() {
        const { data } = await sb.from("productos")
            .select("*")
            .order("actualizado_en", { ascending: false });
        productosCache = data || [];
        renderProductos($("#buscador-productos") ? $("#buscador-productos").value : "");
    }

    function renderProductos(filtro = "") {
        const cont = $("#lista-productos");
        const q = filtro.trim().toLowerCase();
        const lista = q
            ? productosCache.filter(p => (p.nombre || "").toLowerCase().includes(q) || (p.slug || "").toLowerCase().includes(q))
            : productosCache;

        const cnt = $("#cnt-productos-seccion");
        if (cnt) cnt.textContent = lista.length;

        if (!lista.length) {
            cont.innerHTML = `<div class="vacio">${productosCache.length ? "Sin resultados para \"" + filtro.trim() + "\"" : "Aún no hay productos. Crea el primero."}</div>`;
            return;
        }

        cont.innerHTML = `
            <table class="tabla">
                <thead>
                    <tr><th></th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                    ${lista.map(p => `
                        <tr data-id="${p.id}">
                            <td><img class="thumb" src="${p.img || "../images/products/placeholder.png"}" alt=""></td>
                            <td><strong>${p.nombre}</strong><br><small class="slug">/${p.slug}</small></td>
                            <td><span class="tag">${p.categoria || "-"}</span></td>
                            <td>$${Number(p.precio).toLocaleString("es-CO")}</td>
                            <td><span class="badge ${p.disponible ? "on" : "off"}">${p.disponible ? "Activo" : "Oculto"}</span></td>
                            <td>
                                <div class="fila-acciones">
                                    <button class="mini-btn toggle" data-toggle="${p.id}" title="${p.disponible ? "Ocultar" : "Mostrar"}">${p.disponible ? "👁 Ocultar" : "👁 Mostrar"}</button>
                                    <button class="mini-btn edit" data-edit="${p.id}" title="Editar">✏️ Editar</button>
                                    <button class="mini-btn del" data-del="${p.id}" title="Eliminar">🗑 Eliminar</button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

    $("#buscador-productos").addEventListener("input", (e) => renderProductos(e.target.value));

    document.addEventListener("click", async (e) => {
        const toggle = e.target.closest("[data-toggle]");
        const edit = e.target.closest("[data-edit]");
        const del = e.target.closest("[data-del]");
        if (!toggle && !edit && !del) return;

        const id = (toggle || edit || del).dataset[toggle ? "toggle" : edit ? "edit" : "del"];

        if (toggle) {
            const fila = e.target.closest("tr");
            const act = fila ? fila.querySelector(".badge").textContent === "Activo" : true;
            const { error } = await sb.from("productos").update({ disponible: !act }).eq("id", id);
            if (error) { toast("Error: " + error.message, false); return; }
            cargarProductos();
            return;
        }

        if (del) {
            if (!confirm("¿Eliminar este producto?")) return;
            const { error } = await sb.from("productos").delete().eq("id", id);
            if (error) { toast("Error: " + error.message, false); return; }
            toast("Producto eliminado");
            cargarProductos();
            return;
        }

        if (edit) {
            abrirFormulario(id);
        }
    });

    /* ===== FORM PRODUCTO ===== */
    $("#btn-nuevo-producto").addEventListener("click", () => abrirFormulario(null));

    $("#btn-cancelar").addEventListener("click", () => { editando = null; mostrarDash(); });

    async function abrirFormulario(id) {
        ocultarTodo();
        $("#vista-form").hidden = false;

        $("#p-imagen").value = "";
        $("#p-img-preview").hidden = true;
        $("#p-disponible").checked = true;

        if (id) {
            const { data } = await sb.from("productos").select("*").eq("id", id).single();
            if (!data) { mostrarDash(); return; }
            editando = data;
            $("#form-titulo").textContent = "Editar producto";
            $("#p-nombre").value = data.nombre;
            $("#p-slug").value = data.slug;
            $("#p-categoria").value = data.categoria;
            $("#p-precio").value = data.precio;
            $("#p-desc-corta").value = data.descripcion_corta;
            $("#p-desc").value = data.descripcion;
            $("#p-feats").value = (data.feats || []).join("\n");
            $("#p-disponible").checked = data.disponible;
            if (data.img) {
                $("#p-img-preview").src = data.img;
                $("#p-img-preview").hidden = false;
            }
        } else {
            editando = null;
            $("#form-titulo").textContent = "Nuevo producto";
            ["#p-nombre", "#p-slug", "#p-precio", "#p-desc-corta", "#p-desc", "#p-feats"].forEach(s => $(s).value = "");
        }
        window.scrollTo(0, 0);
    }

    $("#p-nombre").addEventListener("input", (e) => {
        if (!editando) $("#p-slug").value = slugify(e.target.value);
    });

    $("#p-imagen").addEventListener("change", (e) => {
        const f = e.target.files[0];
        if (!f) return;
        if (!prepararImagen(f)) {
            alert("Archivo no soportado. Sube una imagen en formato PNG, JPG o SVG.");
            e.target.value = "";
            return;
        }
        const reader = new FileReader();
        reader.onload = (ev) => { $("#p-img-preview").src = ev.target.result; $("#p-img-preview").hidden = false; };
        reader.readAsDataURL(f);
    });

    $("#form-producto").addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = $("#p-nombre").value.trim();
        let slug = $("#p-slug").value.trim();
        if (!nombre || !slug) { toast("Nombre y slug son obligatorios", false); return; }

        const feats = $("#p-feats").value.split("\n").map(s => s.trim()).filter(Boolean);

        let img = (editando && editando.img) || "";
        const file = $("#p-imagen").files[0];
        if (file) {
            const archivo = prepararImagen(file);
            if (!archivo) {
                toast("Formato no soportado. Usa PNG, JPG o SVG.", false);
                return;
            }
            const ext = archivo.name.split(".").pop().toLowerCase();
            const ruta = slug + "." + ext;
            const { error: upErr } = await sb.storage.from("productos").upload(ruta, archivo, { upsert: true });
            if (upErr) { toast("Error subiendo imagen: " + upErr.message, false); return; }
            img = sb.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
        }

        const payload = {
            slug,
            nombre,
            descripcion: $("#p-desc").value.trim(),
            descripcion_corta: $("#p-desc-corta").value.trim(),
            precio: Number($("#p-precio").value) || 0,
            categoria: $("#p-categoria").value || null,
            disponible: $("#p-disponible").checked,
            feats
        };
        if (img) payload.img = img;

        const tbl = sb.from("productos");
        const { error } = editando
            ? await tbl.update(payload).eq("id", editando.id)
            : await tbl.insert(payload);

        if (error) { toast("Error: " + error.message, false); return; }

        toast(editando ? "Producto actualizado" : "Producto creado");
        editando = null;
        mostrarDash();
    });

    function mostrarDash() {
        irVista("productos");
    }

    iniciar();

})();