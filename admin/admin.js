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
    let camposCache = [];
    let editandoCampo = null;
    let camposOrden = [];

    /* ===== GESTOR DE IMÁGENES DEL FORM ===== */
    const MAX_IMAGENES = 5;
    let imagenesForm = []; /* { url, principal, file } — file solo en fotos nuevas no subidas */

    function renderGaleriaImagenes() {
        const cont = $("#galeria-imagenes");
        if (!cont) return;

        cont.innerHTML = imagenesForm.length ? imagenesForm.map((img, idx) => `
            <div class="gal-item${img.principal ? " principal" : ""}">
                <img src="${img.url}" alt="Foto ${idx + 1}">
                <div class="gal-badge">${img.principal ? "★ Principal" : "Foto " + (idx + 1)}</div>
                <div class="gal-acciones">
                    <button type="button" class="gal-btn prio ${img.principal ? "activo" : ""}" data-gal-prio="${idx}" title="Marcar como foto principal">★</button>
                    <button type="button" class="gal-btn up" data-gal-up="${idx}" title="Subir" ${idx === 0 ? "disabled" : ""}>▲</button>
                    <button type="button" class="gal-btn down" data-gal-down="${idx}" title="Bajar" ${idx === imagenesForm.length - 1 ? "disabled" : ""}>▼</button>
                    <button type="button" class="gal-btn del" data-gal-del="${idx}" title="Eliminar foto">✕</button>
                </div>
            </div>
        `).join("") : '<p class="galeria-vacia">Sin fotos. Sube una o varias imágenes.</p>';
    }

    function agregarImagenesAlForm(files) {
        let n = 0;
        [...files].forEach(f => {
            if (!prepararImagen(f)) {
                toast("Archivo no soportado. Usa PNG, JPG o SVG.", false);
                return;
            }
            if (imagenesForm.length + n >= MAX_IMAGENES) {
                toast("Máximo " + MAX_IMAGENES + " fotos por producto.", false);
                return;
            }
            imagenesForm.push({ url: URL.createObjectURL(f), principal: false, file: f });
            n++;
        });
        if (!imagenesForm.some(i => i.principal)) imagenesForm[0].principal = true;
        renderGaleriaImagenes();
    }

    function marcarPrincipalImg(idx) {
        if (idx < 0 || idx >= imagenesForm.length) return;
        imagenesForm.forEach((i, k) => i.principal = (k === idx));
        renderGaleriaImagenes();
    }

    function moverImagen(idx, dir) {
        const j = idx + dir;
        if (idx < 0 || j < 0 || j >= imagenesForm.length) return;
        [imagenesForm[idx], imagenesForm[j]] = [imagenesForm[j], imagenesForm[idx]];
        renderGaleriaImagenes();
    }

    function eliminarImagen(idx) {
        if (idx < 0 || idx >= imagenesForm.length) return;
        if (imagenesForm[idx].file) URL.revokeObjectURL(imagenesForm[idx].url);
        imagenesForm.splice(idx, 1);
        if (imagenesForm.length && !imagenesForm.some(i => i.principal)) imagenesForm[0].principal = true;
        renderGaleriaImagenes();
    }

    document.addEventListener("click", (e) => {
        const gal = $("#galeria-imagenes");
        if (!gal || !gal.contains(e.target)) return;
        const prio = e.target.closest("[data-gal-prio]");
        const up = e.target.closest("[data-gal-up]");
        const down = e.target.closest("[data-gal-down]");
        const del = e.target.closest("[data-gal-del]");
        if (prio) marcarPrincipalImg(Number(prio.dataset.galPrio));
        if (up) moverImagen(Number(up.dataset.galUp), -1);
        if (down) moverImagen(Number(down.dataset.galDown), 1);
        if (del) eliminarImagen(Number(del.dataset.galDel));
    });

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
            const activa = sesionToken ? await verificarSesionActiva() : null;
            if (activa === false) {
                await cerrarSesion(false, "Tu sesión ya no es válida. Inicia sesión de nuevo.");
            } else {
                iniciarVigilancia();
                refrescarVista();
            }
        });

        sb.auth.onAuthStateChange((_evt, s) => {
            sesion = s;
            if (s) {
                iniciarVigilancia();
            } else {
                detenerVigilancia();
            }
            if (_evt === "SIGNED_IN") refrescarVista();
            if (_evt === "SIGNED_OUT") refrescarVista();
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
        campos: cargarCampos,
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
        const [p, c, co, camp, wa] = await Promise.allSettled([
            sb.from("productos").select("id", { count: "exact", head: true }),
            sb.from("categorias").select("id", { count: "exact", head: true }),
            sb.from("colores").select("id", { count: "exact", head: true }),
            sb.from("campos_personalizacion").select("id", { count: "exact", head: true }),
            sb.from("configuracion").select("valor").eq("clave", "whatsapp").maybeSingle()
        ]);
        const count = (r) => (r.status === "fulfilled" && r.value && !r.value.error) ? r.value.count : 0;
        $("#cnt-productos").textContent = count(p);
        $("#cnt-categorias").textContent = count(c);
        $("#cnt-colores").textContent = count(co);
        const cntCamp = $("#cnt-campos");
        if (cntCamp) cntCamp.textContent = count(camp);

        const est = $("#home-wa-estado");
        if (est) {
            const valor = (wa.status === "fulfilled" && wa.value && wa.value.data && wa.value.data.valor) ? wa.value.data.valor : "";
            const on = /^\d{10,15}$/.test(valor || "");
            est.textContent = on ? "● WhatsApp configurado" : "● WhatsApp no configurado";
            est.className = "home-status " + (on ? "on" : "off");
        }
    }

    document.addEventListener("click", (e) => {
        const nav = e.target.closest("[data-nav]");
        if (!nav) return;
        irVista(nav.dataset.nav);
    });

    /* ===== SESIÓN: una sola activa (sin cierre por inactividad) ===== */
    const SESSION_KEY = "elrojo3d_sesion_token";
    const HEARTBEAT_MS = 30 * 1000;

    let sesionToken = localStorage.getItem(SESSION_KEY) || null;
    let heartbeatTimer = null;
    let cerrando = false;

    function generarToken() {
        if (window.crypto && window.crypto.randomUUID) return crypto.randomUUID();
        return "t-" + Math.random().toString(36).slice(2) + Date.now().toString(36);
    }

    /**
     * Devuelve:
     *  true  -> la sesión en BD coincide con la local (válida)
     *  false -> hay una sesión DIFERENTE confirmada en otro dispositivo
     *  null  -> no se pudo confirmar (error/ausencia de fila); NO se cierra
     */
    async function verificarSesionActiva() {
        if (!sesion) return false;
        const { data, error } = await sb.from("sesiones_activas")
            .select("token")
            .eq("user_id", sesion.user.id)
            .maybeSingle();
        if (error || !data) return null;
        return data.token === sesionToken;
    }

    function detenerVigilancia() {
        if (heartbeatTimer) clearInterval(heartbeatTimer);
        heartbeatTimer = null;
    }

    function iniciarVigilancia() {
        detenerVigilancia();
        if (cerrando) return;
        heartbeatTimer = setInterval(async () => {
            if (cerrando || !sesion || !sesionToken) return;
            if ((await verificarSesionActiva()) === false) {
                cerrarSesion(false, "Tu sesión se cerró: iniciaste sesión desde otro dispositivo.");
            }
        }, HEARTBEAT_MS);
    }

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
    function llenarSelectCategorias(cats) {
        const sel = $("#p-categoria");
        if (sel) sel.innerHTML = cats.map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");
    }

    async function cargarCategorias() {
        const { data } = await sb.from("categorias").select("*").order("orden");
        const cats = data || [];

        const { data: prods } = await sb.from("productos").select("categoria");
        const uso = {};
        (prods || []).forEach(p => { if (p.categoria) uso[p.categoria] = (uso[p.categoria] || 0) + 1; });

        const cnt = $("#cnt-categorias-seccion");
        if (cnt) cnt.textContent = cats.length;

        llenarSelectCategorias(cats);

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

    /* ===== CAMPOS DE PERSONALIZACIÓN ===== */
    function filtrarCamposSegunTipo() {
        const tipo = $("#campo-tipo").value;
        $$(".card-form [data-rel]").forEach(g => {
            g.hidden = g.dataset.rel !== tipo;
        });
    }

    $("#campo-tipo").addEventListener("change", filtrarCamposSegunTipo);
    filtrarCamposSegunTipo();

    async function cargarCampos() {
        const { data, error } = await sb.from("campos_personalizacion").select("*").order("orden");
        const campos = error ? [] : (data || []);

        const cnt = $("#cnt-campos-seccion");
        if (cnt) cnt.textContent = campos.length;

        $("#lista-campos").innerHTML = campos.length ? campos.map(c => `
            <li class="mini-item" data-campo-id="${c.id}">
                <span class="mini-main">${c.nombre}</span>
                <span class="mini-meta">${c.tipo === "opciones" ? "Opciones" : c.tipo === "color" ? "Color" : "Texto"}</span>
                <div class="mini-acciones">
                    <button type="button" class="edit" data-edit-campo="${c.id}" title="Editar">✏️</button>
                    <button type="button" data-del-campo="${c.id}" title="Eliminar">✕</button>
                </div>
            </li>
        `).join("") : '<li class="vacio mini-vacio">Sin campos</li>';
    }

    function pintarEstadoFormCampo() {
        const nota = $("#nota-campo-edicion");
        const btnCancel = $("#btn-cancelar-campo");
        const btnGuardar = $("#btn-guardar-campo");
        if (editandoCampo) {
            btnGuardar.textContent = "Guardar cambios";
            btnCancel.hidden = false;
            nota.hidden = false;
            nota.textContent = "Editando el campo: " + editandoCampo.nombre;
        } else {
            btnGuardar.textContent = "+ Agregar";
            btnCancel.hidden = true;
            nota.hidden = true;
            nota.textContent = "";
        }
    }

    function rellenarFormCampo(c) {
        editandoCampo = c;
        $$("#lista-campos .mini-item").forEach(li => li.classList.remove("editando"));
        const li = document.querySelector(`#lista-campos [data-campo-id="${c.id}"]`);
        if (li) li.classList.add("editando");
        $("#campo-nombre").value = c.nombre;
        $("#campo-tipo").value = c.tipo;
        $("#campo-opciones").value = (Array.isArray(c.opciones) ? c.opciones : []).join(", ");
        $("#campo-maxlength").value = c.maxlength || "";
        filtrarCamposSegunTipo();
        pintarEstadoFormCampo();
        $("#form-campo").scrollIntoView({ behavior: "smooth", block: "center" });
        $("#campo-nombre").focus();
    }

    function cancelarEdicionCampo() {
        editandoCampo = null;
        $$("#lista-campos .mini-item").forEach(li => li.classList.remove("editando"));
        ["#campo-nombre", "#campo-opciones", "#campo-maxlength"].forEach(s => $(s).value = "");
        $("#campo-tipo").value = "texto";
        filtrarCamposSegunTipo();
        pintarEstadoFormCampo();
    }

    $("#btn-cancelar-campo").addEventListener("click", cancelarEdicionCampo);

    $("#form-campo").addEventListener("submit", async (e) => {
        e.preventDefault();
        const nombre = $("#campo-nombre").value.trim();
        if (!nombre) return;
        const fueEdicion = !!editandoCampo;
        const tipo = $("#campo-tipo").value;
        const opciones = $("#campo-opciones").value.split(",").map(s => s.trim()).filter(Boolean);
        const maxInp = $("#campo-maxlength").value.trim();
        const maxlength = maxInp === "" ? null : Number(maxInp);

        const payload = { nombre, tipo };
        if (tipo === "opciones") payload.opciones = opciones;
        if (tipo === "texto" && maxlength !== null) payload.maxlength = maxlength;

        let error;
        if (fueEdicion) {
            ({ error } = await sb.from("campos_personalizacion").update(payload).eq("id", editandoCampo.id));
        } else {
            payload.id = slugify(nombre);
            payload.orden = 0;
            ({ error } = await sb.from("campos_personalizacion").insert(payload));
        }
        if (error) { toast("Error: " + error.message, false); return; }
        cancelarEdicionCampo();
        cargarCampos();
        toast(fueEdicion ? "Campo actualizado" : "Campo agregado");
    });

    document.addEventListener("click", async (e) => {
        const btnEdit = e.target.closest("[data-edit-campo]");
        if (btnEdit) {
            const { data, error } = await sb.from("campos_personalizacion")
                .select("*").eq("id", btnEdit.dataset.editCampo).single();
            if (error || !data) { toast("Error: " + (error ? error.message : "Campo no encontrado"), false); return; }
            rellenarFormCampo(data);
            return;
        }
        const btn = e.target.closest("[data-del-campo]");
        if (!btn) return;
        if (!confirm("¿Eliminar este campo?")) return;
        const { error } = await sb.from("campos_personalizacion").delete().eq("id", btn.dataset.delCampo);
        if (error) { toast("Error: " + error.message, false); return; }
        if (editandoCampo && editandoCampo.id === btn.dataset.delCampo) cancelarEdicionCampo();
        cargarCampos();
        toast("Campo eliminado");
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

    async function renderChecksCampos() {
        const cont = $("#p-campos");
        if (!cont) return;
        const { data, error } = await sb.from("campos_personalizacion").select("id,nombre,tipo").order("orden");
        if (error) { cont.innerHTML = '<p class="galeria-vacia">Ejecuta la migración del personalizador para crear campos.</p>'; return; }
        const campos = data || [];
        camposCache = campos;
        cont.innerHTML = campos.length ? campos.map(c => `
            <label class="check-campo">
                <input type="checkbox" value="${c.id}" data-campo-nombre="${c.nombre}" ${camposOrden.includes(c.id) ? "checked" : ""}> ${c.nombre}
            </label>
        `).join("") : '<p class="galeria-vacia">Sin campos creados. Agrégalos en la pestaña "Campos".</p>';
        renderOrdenCampos();
    }

    function renderOrdenCampos() {
        const wrap = $("#p-campos-orden-wrap");
        const cont = $("#p-campos-orden");
        if (!wrap || !cont) return;
        wrap.hidden = !camposOrden.length;
        cont.innerHTML = camposOrden.length ? camposOrden.map((cid, i) => {
            const c = camposCache.find(x => x.id === cid);
            const nombre = c ? c.nombre : cid;
            return `
                <div class="orden-chip">
                    <span class="orden-nombre">${i + 1}. ${nombre}</span>
                    <span class="orden-btns">
                        <button type="button" data-orden-up="${cid}" ${i === 0 ? "disabled" : ""} title="Subir">▲</button>
                        <button type="button" data-orden-down="${cid}" ${i === camposOrden.length - 1 ? "disabled" : ""} title="Bajar">▼</button>
                        <button type="button" data-orden-del="${cid}" title="Quitar">✕</button>
                    </span>
                </div>`;
        }).join("") : "";
    }

    $("#p-campos").addEventListener("change", (e) => {
        const box = e.target;
        if (box.type !== "checkbox") return;
        const cid = box.value;
        if (box.checked) {
            if (!camposOrden.includes(cid)) camposOrden.push(cid);
        } else {
            camposOrden = camposOrden.filter(x => x !== cid);
        }
        renderOrdenCampos();
    });

    document.addEventListener("click", (e) => {
        const up = e.target.closest("[data-orden-up]");
        const down = e.target.closest("[data-orden-down]");
        const del = e.target.closest("[data-orden-del]");
        if (!up && !down && !del) return;

        const cid = (up || down || del).dataset[up ? "ordenUp" : down ? "ordenDown" : "ordenDel"];
        const i = camposOrden.indexOf(cid);

        if (up && i > 0) {
            [camposOrden[i - 1], camposOrden[i]] = [camposOrden[i], camposOrden[i - 1]];
        } else if (down && i >= 0 && i < camposOrden.length - 1) {
            [camposOrden[i], camposOrden[i + 1]] = [camposOrden[i + 1], camposOrden[i]];
        } else if (del) {
            camposOrden = camposOrden.filter(x => x !== cid);
            const box = document.querySelector(`#p-campos input[value="${cid}"]`);
            if (box) box.checked = false;
        }
        renderOrdenCampos();
    });

    async function abrirFormulario(id) {
        ocultarTodo();
        $("#vista-form").hidden = false;

        $("#p-imagen").value = "";
        imagenesForm = [];
        renderGaleriaImagenes();
        $("#p-disponible").checked = true;
        $("#p-personalizable").checked = false;
        camposOrden = [];

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
            $("#p-personalizable").checked = !!data.personalizable;
            camposOrden = (Array.isArray(data.campos) ? data.campos : [])
                .map(c => (typeof c === "string" ? c : c.id));
            const imgsRaw = (Array.isArray(data.imgs) && data.imgs.length)
                ? data.imgs
                : (data.img ? [{ url: data.img, principal: true }] : []);
            imagenesForm = imgsRaw.map(i => ({ url: i.url, principal: !!i.principal, file: null }));
            renderGaleriaImagenes();
        } else {
            editando = null;
            $("#form-titulo").textContent = "Nuevo producto";
            ["#p-nombre", "#p-slug", "#p-precio", "#p-desc-corta", "#p-desc", "#p-feats"].forEach(s => $(s).value = "");
        }

        await renderChecksCampos();
        const { data: cats } = await sb.from("categorias").select("id,nombre").order("orden");
        llenarSelectCategorias(cats || []);

        window.scrollTo(0, 0);
    }

    $("#p-nombre").addEventListener("input", (e) => {
        if (!editando) $("#p-slug").value = slugify(e.target.value);
    });

    $("#p-imagen").addEventListener("change", (e) => {
        agregarImagenesAlForm(e.target.files);
        e.target.value = "";
    });

    $("#form-producto").addEventListener("submit", async (e) => {
        e.preventDefault();

        const nombre = $("#p-nombre").value.trim();
        let slug = $("#p-slug").value.trim();
        if (!nombre || !slug) { toast("Nombre y slug son obligatorios", false); return; }

        const feats = $("#p-feats").value.split("\n").map(s => s.trim()).filter(Boolean);

        const imgsSubidas = [];
        for (let i = 0; i < imagenesForm.length; i++) {
            const item = imagenesForm[i];
            let url = item.url;
            if (item.file) {
                const archivo = prepararImagen(item.file);
                if (!archivo) { toast("Formato no soportado. Usa PNG, JPG o SVG.", false); return; }
                const ext = archivo.name.split(".").pop().toLowerCase();
                const ruta = slug + "-" + Date.now() + "-" + i + "." + ext;
                const { error: upErr } = await sb.storage.from("productos").upload(ruta, archivo, { upsert: true });
                if (upErr) { toast("Error subiendo imagen: " + upErr.message, false); return; }
                url = sb.storage.from("productos").getPublicUrl(ruta).data.publicUrl;
            }
            imgsSubidas.push({ url, principal: !!item.principal });
            if (item.file) URL.revokeObjectURL(item.url);
        }

        const principal = imgsSubidas.find(i => i.principal) || imgsSubidas[0];
        const img = principal ? principal.url : "";

        const personalizable = $("#p-personalizable").checked;
        const camposSel = camposOrden.filter(cid => camposCache.some(x => x.id === cid));
        if (personalizable && !camposSel.length) {
            toast("Si el producto es personalizable, marca al menos un campo.", false);
            const d = $("#p-campos").closest(".campo");
            if (d) d.scrollIntoView({ behavior: "smooth", block: "center" });
            return;
        }

        const payload = {
            slug,
            nombre,
            descripcion: $("#p-desc").value.trim(),
            descripcion_corta: $("#p-desc-corta").value.trim(),
            precio: Number($("#p-precio").value) || 0,
            categoria: $("#p-categoria").value || null,
            disponible: $("#p-disponible").checked,
            personalizable,
            campos: camposSel,
            feats,
            img,
            imgs: imgsSubidas
        };

        const tbl = sb.from("productos");
        const { error } = editando
            ? await tbl.update(payload).eq("id", editando.id)
            : await tbl.insert(payload);

        if (error) { toast("Error: " + error.message, false); return; }

        toast(editando ? "Producto actualizado" : "Producto creado");
        editando = null;
        imagenesForm = [];
        mostrarDash();
    });

    function mostrarDash() {
        irVista("productos");
    }

    iniciar();

})();