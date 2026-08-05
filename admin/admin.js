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

    const MAX_IMG = 1400;

    async function prepararImagen(file) {
        if (!file || !file.type.startsWith("image/") || file.type === "image/svg+xml") return file;

        const leer = (f) => new Promise((res, rej) => {
            const r = new FileReader();
            r.onload = () => res(r.result);
            r.onerror = rej;
            r.readAsDataURL(f);
        });

        const cargar = (src) => new Promise((res, rej) => {
            const i = new Image();
            i.onload = () => res(i);
            i.onerror = rej;
            i.src = src;
        });

        try {
            const img = await cargar(await leer(file));
            const escala = Math.min(1, MAX_IMG / Math.max(img.width, img.height));
            if (escala >= 1) return file;

            const w = Math.round(img.width * escala);
            const h = Math.round(img.height * escala);
            const canvas = document.createElement("canvas");
            canvas.width = w;
            canvas.height = h;
            canvas.getContext("2d").drawImage(img, 0, 0, w, h);

            const esPng = file.type === "image/png";
            const blob = await new Promise(res => canvas.toBlob(res, esPng ? "image/png" : "image/jpeg", 0.85));
            const nombre = file.name.replace(/\.[^.]+$/, esPng ? ".png" : ".jpg");
            return new File([blob], nombre, { type: blob.type });
        } catch (e) {
            return file;
        }
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

        sb.auth.getSession().then(({ data }) => {
            sesion = data.session;
            refrescarVista();
        });

        sb.auth.onAuthStateChange((_evt, s) => {
            sesion = s;
            refrescarVista();
        });
    }

    function refrescarVista() {
        ocultarTodo();
        if (sesion) {
            $("#vista-dash").hidden = false;
            cargarCategorias();
            cargarProductos();
            cargarConfiguracion();
        } else {
            $("#vista-login").hidden = false;
        }
    }

    function ocultarTodo() {
        $$(".vista").forEach(v => v.hidden = true);
    }

    /* ===== AUTH ===== */
    let modoRegistro = false;
    $("#btn-modo-registro").addEventListener("click", () => {
        modoRegistro = !modoRegistro;
        $("#btn-modo-registro").textContent = modoRegistro ? "Ya tengo cuenta" : "Crear cuenta";
    });

    $("#form-login").addEventListener("submit", async (e) => {
        e.preventDefault();
        if (!sb) return;
        const err = $("#login-error");
        err.hidden = true;
        const email = $("#login-email").value.trim();
        const pass = $("#login-pass").value;

        let error;
        if (modoRegistro) {
            const r = await sb.auth.signUp({ email, password: pass });
            error = r.error;
            if (!r.error) toast("Cuenta creada. Revisa tu correo para confirmarla.");
        } else {
            const r = await sb.auth.signInWithPassword({ email, password: pass });
            error = r.error;
        }

        if (error) { err.textContent = "Error: " + error.message; err.hidden = false; }
        $("#login-pass").value = "";
    });

    $("#btn-salir").addEventListener("click", () => { sb.auth.signOut(); });

    /* ===== CATEGORÍAS ===== */
    async function cargarCategorias() {
        const { data } = await sb.from("categorias").select("*").order("orden");
        const sel = $("#p-categoria");
        sel.innerHTML = (data || []).map(c => `<option value="${c.id}">${c.nombre}</option>`).join("");

        $("#lista-categorias").innerHTML = (data || []).map(c => `
            <li class="chip">
                ${c.nombre}
                <button type="button" data-del-cat="${c.id}" title="Eliminar">✕</button>
            </li>
        `).join("") || '<li class="chip">Sin categorías</li>';
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

    /* ===== CONFIGURACIÓN ===== */
    async function cargarConfiguracion() {
        const { data, error } = await sb.from("configuracion")
            .select("clave,valor")
            .eq("clave", "whatsapp")
            .maybeSingle();
        if (!error && data) $("#cfg-whatsapp").value = data.valor;
    }

    $("#form-config").addEventListener("submit", async (e) => {
        e.preventDefault();
        const valor = $("#cfg-whatsapp").value.trim();
        const { error } = await sb.from("configuracion")
            .upsert({ clave: "whatsapp", valor }, { onConflict: "clave" });
        if (error) { toast("Error: " + error.message, false); return; }
        toast("Número de WhatsApp guardado");
    });

    /* ===== PRODUCTOS ===== */
    async function cargarProductos() {
        const { data } = await sb.from("productos")
            .select("*")
            .order("actualizado_en", { ascending: false });

        const cont = $("#lista-productos");
        if (!data || !data.length) {
            cont.innerHTML = '<p class="vacio">Aún no hay productos. Crea el primero.</p>';
            return;
        }

        cont.innerHTML = `
            <table class="tabla">
                <thead>
                    <tr><th></th><th>Nombre</th><th>Categoría</th><th>Precio</th><th>Estado</th><th></th></tr>
                </thead>
                <tbody>
                    ${data.map(p => `
                        <tr data-id="${p.id}">
                            <td><img class="thumb" src="${p.img || "../images/products/placeholder.png"}" alt=""></td>
                            <td><strong>${p.nombre}</strong><br><small style="color:#888">/${p.slug}</small></td>
                            <td>${p.categoria || "-"}</td>
                            <td>$${Number(p.precio).toLocaleString("es-CO")}</td>
                            <td><span class="badge ${p.disponible ? "on" : "off"}">${p.disponible ? "Activo" : "Oculto"}</span></td>
                            <td>
                                <div class="fila-acciones">
                                    <button class="mini-btn toggle" data-toggle="${p.id}">${p.disponible ? "Ocultar" : "Mostrar"}</button>
                                    <button class="mini-btn edit" data-edit="${p.id}">Editar</button>
                                    <button class="mini-btn del" data-del="${p.id}">Eliminar</button>
                                </div>
                            </td>
                        </tr>
                    `).join("")}
                </tbody>
            </table>
        `;
    }

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
            const archivo = await prepararImagen(file);
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
        ocultarTodo();
        $("#vista-dash").hidden = false;
        cargarCategorias();
        cargarProductos();
        cargarConfiguracion();
    }

    iniciar();

})();